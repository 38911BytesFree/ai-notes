package store

import (
	"context"
	"time"

	"ainotes/internal/notes"

	"cloud.google.com/go/firestore"
	"google.golang.org/api/iterator"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type FirestoreStore struct {
	client *firestore.Client
	Clock  func() time.Time
}

func NewFirestoreStore(client *firestore.Client) *FirestoreStore {
	return &FirestoreStore{
		client: client,
		Clock:  func() time.Time { return time.Now().UTC() },
	}
}

func (s *FirestoreStore) now() time.Time {
	if s.Clock != nil {
		return s.Clock()
	}
	return time.Now().UTC()
}

func (s *FirestoreStore) UpsertUser(ctx context.Context, u User) error {
	docRef := s.client.Collection("users").Doc(u.UID)
	now := s.now()

	return s.client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		doc, err := tx.Get(docRef)
		if err != nil && status.Code(err) != codes.NotFound {
			return err
		}

		if !doc.Exists() {
			if u.CreatedAt.IsZero() {
				u.CreatedAt = now
			}
			u.LastSeenAt = now
			u.DefaultKeepTranscript = true
			return tx.Set(docRef, u)
		}

		var existing User
		if err := doc.DataTo(&existing); err != nil {
			return err
		}

		if u.Email == "" {
			u.Email = existing.Email
		}
		if u.DisplayName == "" {
			u.DisplayName = existing.DisplayName
		}

		if now.Sub(existing.LastSeenAt) < time.Hour {
			if existing.Email != u.Email || existing.DisplayName != u.DisplayName {
				existing.Email = u.Email
				existing.DisplayName = u.DisplayName
				return tx.Set(docRef, existing)
			}
			return nil
		}

		u.CreatedAt = existing.CreatedAt
		u.LastSeenAt = now
		u.DefaultKeepTranscript = existing.DefaultKeepTranscript
		u.IngestPeriod = existing.IngestPeriod
		u.IngestCount = existing.IngestCount
		return tx.Set(docRef, u)
	})
}

func (s *FirestoreStore) GetUser(ctx context.Context, uid string) (User, error) {
	doc, err := s.client.Collection("users").Doc(uid).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return User{}, ErrNotFound
		}
		return User{}, err
	}

	var u User
	if err := doc.DataTo(&u); err != nil {
		return User{}, err
	}
	return u, nil
}

func (s *FirestoreStore) UpdateUserSettings(ctx context.Context, uid string, defaultKeepTranscript bool) (*User, error) {
	docRef := s.client.Collection("users").Doc(uid)

	var updated User
	err := s.client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		doc, err := tx.Get(docRef)
		if err != nil {
			if status.Code(err) == codes.NotFound {
				return ErrNotFound
			}
			return err
		}

		if err := doc.DataTo(&updated); err != nil {
			return err
		}

		updated.DefaultKeepTranscript = defaultKeepTranscript
		return tx.Set(docRef, updated)
	})
	if err != nil {
		return nil, err
	}
	return &updated, nil
}

func (s *FirestoreStore) ReserveIngest(ctx context.Context, uid, period string, limit int) error {
	docRef := s.client.Collection("users").Doc(uid)

	return s.client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		doc, err := tx.Get(docRef)
		if err != nil {
			if status.Code(err) == codes.NotFound {
				u := User{
					UID:                   uid,
					CreatedAt:             time.Now().UTC(),
					LastSeenAt:            time.Now().UTC(),
					DefaultKeepTranscript: true,
					IngestPeriod:          period,
					IngestCount:           1,
				}
				return tx.Set(docRef, u)
			}
			return err
		}

		var u User
		if err := doc.DataTo(&u); err != nil {
			return err
		}

		if u.IngestPeriod != period {
			u.IngestPeriod = period
			u.IngestCount = 0
		}

		if u.IngestCount >= limit {
			return ErrIngestLimitReached
		}

		u.IngestCount++
		return tx.Set(docRef, u)
	})
}

func (s *FirestoreStore) ReleaseIngest(ctx context.Context, uid string) error {
	docRef := s.client.Collection("users").Doc(uid)

	return s.client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		doc, err := tx.Get(docRef)
		if err != nil {
			if status.Code(err) == codes.NotFound {
				return ErrNotFound
			}
			return err
		}

		var u User
		if err := doc.DataTo(&u); err != nil {
			return err
		}

		if u.IngestCount > 0 {
			u.IngestCount--
			return tx.Set(docRef, u)
		}
		return nil
	})
}

func (s *FirestoreStore) DeleteAllForUser(ctx context.Context, uid string) ([]string, error) {
	// Query all notes owned by uid
	iter := s.client.Collection("notes").Where("owner_uid", "==", uid).Documents(ctx)
	defer iter.Stop()

	var noteIDs []string
	var noteDocRefs []*firestore.DocumentRef

	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, err
		}
		noteIDs = append(noteIDs, doc.Ref.ID)
		noteDocRefs = append(noteDocRefs, doc.Ref)
	}

	// Delete notes in batches of up to 400 per commit
	const batchSize = 400
	for i := 0; i < len(noteDocRefs); i += batchSize {
		end := i + batchSize
		if end > len(noteDocRefs) {
			end = len(noteDocRefs)
		}
		batch := s.client.Batch()
		for _, ref := range noteDocRefs[i:end] {
			batch.Delete(ref)
		}
		if _, err := batch.Commit(ctx); err != nil {
			return nil, err
		}
	}

	// Delete user doc
	_, err := s.client.Collection("users").Doc(uid).Delete(ctx)
	if err != nil && status.Code(err) != codes.NotFound {
		return nil, err
	}

	return noteIDs, nil
}

func (s *FirestoreStore) CreateNote(ctx context.Context, note *notes.Note) error {
	now := s.now()
	if note.CreatedAt.IsZero() {
		note.CreatedAt = now
	}
	if note.UpdatedAt.IsZero() {
		note.UpdatedAt = now
	}
	if note.Visibility == "" {
		note.Visibility = "private"
	}

	_, err := s.client.Collection("notes").Doc(note.ID).Set(ctx, note)
	return err
}

func (s *FirestoreStore) GetNote(ctx context.Context, uid, id string) (*notes.Note, error) {
	doc, err := s.client.Collection("notes").Doc(id).Get(ctx)
	if err != nil {
		if status.Code(err) == codes.NotFound {
			return nil, ErrNotFound
		}
		return nil, err
	}

	var note notes.Note
	if err := doc.DataTo(&note); err != nil {
		return nil, err
	}

	if note.OwnerUID != uid {
		return nil, ErrNotFound
	}

	return &note, nil
}

func (s *FirestoreStore) UpdateNote(ctx context.Context, uid string, updated *notes.Note) (*notes.Note, error) {
	docRef := s.client.Collection("notes").Doc(updated.ID)

	var current notes.Note
	err := s.client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		doc, err := tx.Get(docRef)
		if err != nil {
			if status.Code(err) == codes.NotFound {
				return ErrNotFound
			}
			return err
		}

		if err := doc.DataTo(&current); err != nil {
			return err
		}

		if current.OwnerUID != uid {
			return ErrNotFound
		}

		current.Title = updated.Title
		current.Summary = updated.Summary
		current.Takeaways = updated.Takeaways
		if updated.CodeBlocks != nil {
			current.CodeBlocks = updated.CodeBlocks
		}
		current.Category = updated.Category
		current.Tags = updated.Tags
		if len(updated.Embedding) > 0 {
			current.Embedding = updated.Embedding
			current.EmbeddingModel = updated.EmbeddingModel
			current.EmbeddingTextHash = updated.EmbeddingTextHash
		}
		current.HasTranscript = updated.HasTranscript
		current.TranscriptBytes = updated.TranscriptBytes
		current.UpdatedAt = s.now()

		return tx.Set(docRef, current)
	})
	if err != nil {
		return nil, err
	}
	return &current, nil
}

func (s *FirestoreStore) DeleteNote(ctx context.Context, uid, id string) error {
	docRef := s.client.Collection("notes").Doc(id)

	return s.client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		doc, err := tx.Get(docRef)
		if err != nil {
			if status.Code(err) == codes.NotFound {
				return ErrNotFound
			}
			return err
		}

		var existing notes.Note
		if err := doc.DataTo(&existing); err != nil {
			return err
		}

		if existing.OwnerUID != uid {
			return ErrNotFound
		}

		return tx.Delete(docRef)
	})
}

func (s *FirestoreStore) ListNotes(ctx context.Context, uid, category, cursor string, limit int) ([]*notes.Note, string, error) {
	if limit <= 0 {
		limit = 30
	}

	q := s.client.Collection("notes").Where("owner_uid", "==", uid)
	if category != "" {
		q = q.Where("category", "==", category)
	}
	q = q.OrderBy("created_at", firestore.Desc)

	if cursor != "" {
		cursorTime, err := time.Parse(time.RFC3339Nano, cursor)
		if err == nil {
			q = q.StartAfter(cursorTime)
		}
	}

	// Fetch limit + 1 to check for next page
	q = q.Limit(limit + 1)

	iter := q.Documents(ctx)
	defer iter.Stop()

	var result []*notes.Note
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, "", err
		}

		var note notes.Note
		if err := doc.DataTo(&note); err != nil {
			return nil, "", err
		}
		result = append(result, &note)
	}

	nextCursor := ""
	if len(result) > limit {
		page := result[:limit]
		nextCursor = page[len(page)-1].CreatedAt.Format(time.RFC3339Nano)
		return page, nextCursor, nil
	}

	return result, "", nil
}

func (s *FirestoreStore) SearchNotes(ctx context.Context, uid, category string, vector []float32, limit int) ([]*notes.SearchResult, error) {
	if limit <= 0 {
		limit = 10
	}

	q := s.client.Collection("notes").Where("owner_uid", "==", uid)
	if category != "" {
		q = q.Where("category", "==", category)
	}

	vectorQuery := q.FindNearest("embedding", firestore.Vector32(vector), limit, firestore.DistanceMeasureCosine, &firestore.FindNearestOptions{
		DistanceResultField: "distance",
	})

	iter := vectorQuery.Documents(ctx)
	defer iter.Stop()

	var results []*notes.SearchResult
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, err
		}

		var note notes.Note
		if err := doc.DataTo(&note); err != nil {
			return nil, err
		}

		distVal := 0.0
		if d, ok := doc.Data()["distance"].(float64); ok {
			distVal = d
		}
		note.Distance = &distVal

		results = append(results, &notes.SearchResult{
			Note:     &note,
			Distance: distVal,
		})
	}

	return results, nil
}

func (s *FirestoreStore) GetNotesForExport(ctx context.Context, uid string) ([]*notes.Note, error) {
	q := s.client.Collection("notes").
		Where("owner_uid", "==", uid).
		OrderBy("created_at", firestore.Desc)

	iter := q.Documents(ctx)
	defer iter.Stop()

	var result []*notes.Note
	for {
		doc, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return nil, err
		}

		var note notes.Note
		if err := doc.DataTo(&note); err != nil {
			return nil, err
		}
		result = append(result, &note)
	}

	return result, nil
}
