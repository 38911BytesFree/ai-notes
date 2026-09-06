package store

import (
	"context"
	"os"
	"testing"
	"time"

	"ainotes/internal/notes"

	"cloud.google.com/go/firestore"
)

func TestMemoryStoreNoteCRUD(t *testing.T) {
	ctx := context.Background()
	s := NewMemoryStore()
	uid := "user-123"

	// Create user
	err := s.UpsertUser(ctx, User{UID: uid, Email: "user@example.com"})
	if err != nil {
		t.Fatalf("UpsertUser failed: %v", err)
	}

	// Create Note
	note := &notes.Note{
		ID:        "test-note-1",
		OwnerUID:  uid,
		Title:     "First Note",
		Summary:   "Summary of first note",
		Takeaways: []string{"Point 1", "Point 2", "Point 3"},
		Category:  "Programming",
		Tags:      []string{"go", "testing"},
		Embedding: firestore.Vector32{0.1, 0.2, 0.3},
		CreatedAt: time.Now().UTC().Add(-10 * time.Minute),
	}
	if err := s.CreateNote(ctx, note); err != nil {
		t.Fatalf("CreateNote failed: %v", err)
	}

	// Get Note
	got, err := s.GetNote(ctx, uid, "test-note-1")
	if err != nil {
		t.Fatalf("GetNote failed: %v", err)
	}
	if got.Title != "First Note" {
		t.Errorf("expected title 'First Note', got %q", got.Title)
	}

	// Cross-user read should fail with ErrNotFound
	_, err = s.GetNote(ctx, "another-user", "test-note-1")
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound for cross-user get, got %v", err)
	}

	// Update Note
	got.Title = "Updated Note Title"
	updated, err := s.UpdateNote(ctx, uid, got)
	if err != nil {
		t.Fatalf("UpdateNote failed: %v", err)
	}
	if updated.Title != "Updated Note Title" {
		t.Errorf("expected updated title, got %q", updated.Title)
	}

	// Cross-user update should fail
	_, err = s.UpdateNote(ctx, "another-user", got)
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound for cross-user update, got %v", err)
	}

	// Delete Note
	if err := s.DeleteNote(ctx, uid, "test-note-1"); err != nil {
		t.Fatalf("DeleteNote failed: %v", err)
	}

	// Get deleted Note
	_, err = s.GetNote(ctx, uid, "test-note-1")
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound after delete, got %v", err)
	}
}

func TestMemoryStoreListAndPagination(t *testing.T) {
	ctx := context.Background()
	s := NewMemoryStore()
	uid := "user-list"

	baseTime := time.Date(2026, 9, 4, 10, 0, 0, 0, time.UTC)
	for i := 1; i <= 5; i++ {
		cat := "Programming"
		if i%2 == 0 {
			cat = "Design"
		}
		note := &notes.Note{
			ID:        notes.TruncateString(string(rune('a'+i)), 10) + "-id",
			OwnerUID:  uid,
			Title:     "Note",
			Category:  cat,
			CreatedAt: baseTime.Add(time.Duration(i) * time.Minute),
		}
		_ = s.CreateNote(ctx, note)
	}

	// List all, limit 2
	page1, nextCursor, err := s.ListNotes(ctx, uid, "", "", 2)
	if err != nil {
		t.Fatalf("ListNotes failed: %v", err)
	}
	if len(page1) != 2 {
		t.Fatalf("expected 2 notes on page 1, got %d", len(page1))
	}
	if nextCursor == "" {
		t.Errorf("expected non-empty nextCursor")
	}

	// Page 2
	page2, nextCursor2, err := s.ListNotes(ctx, uid, "", nextCursor, 2)
	if err != nil {
		t.Fatalf("ListNotes page 2 failed: %v", err)
	}
	if len(page2) != 2 {
		t.Fatalf("expected 2 notes on page 2, got %d", len(page2))
	}
	if nextCursor2 == "" {
		t.Errorf("expected non-empty nextCursor2")
	}

	// Page 3 (remaining 1 item)
	page3, nextCursor3, err := s.ListNotes(ctx, uid, "", nextCursor2, 2)
	if err != nil {
		t.Fatalf("ListNotes page 3 failed: %v", err)
	}
	if len(page3) != 1 {
		t.Fatalf("expected 1 note on page 3, got %d", len(page3))
	}
	if nextCursor3 != "" {
		t.Errorf("expected empty nextCursor3 on last page, got %q", nextCursor3)
	}

	// Filter by category
	designNotes, _, err := s.ListNotes(ctx, uid, "Design", "", 10)
	if err != nil {
		t.Fatalf("ListNotes category filter failed: %v", err)
	}
	if len(designNotes) != 2 {
		t.Fatalf("expected 2 Design notes, got %d", len(designNotes))
	}
}

func TestMemoryStoreVectorSearch(t *testing.T) {
	ctx := context.Background()
	s := NewMemoryStore()
	uid := "user-search"

	// Nearer note
	nearNote := &notes.Note{
		ID:        "near-note",
		OwnerUID:  uid,
		Title:     "Near Note",
		Category:  "AI & ML",
		Embedding: firestore.Vector32{1.0, 0.0, 0.0},
	}
	// Farther note
	farNote := &notes.Note{
		ID:        "far-note",
		OwnerUID:  uid,
		Title:     "Far Note",
		Category:  "AI & ML",
		Embedding: firestore.Vector32{0.0, 1.0, 0.0},
	}

	_ = s.CreateNote(ctx, nearNote)
	_ = s.CreateNote(ctx, farNote)

	// Query vector aligned with nearNote (1.0, 0.0, 0.0)
	queryVector := []float32{0.9, 0.1, 0.0}
	results, err := s.SearchNotes(ctx, uid, "", queryVector, 10)
	if err != nil {
		t.Fatalf("SearchNotes failed: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 search results, got %d", len(results))
	}

	if results[0].Note.ID != "near-note" {
		t.Errorf("expected first result to be 'near-note', got %q", results[0].Note.ID)
	}
	if results[0].Distance >= results[1].Distance {
		t.Errorf("expected result[0].Distance (%f) < result[1].Distance (%f)", results[0].Distance, results[1].Distance)
	}
}

func TestMemoryStoreIngestQuota(t *testing.T) {
	ctx := context.Background()
	s := NewMemoryStore()
	uid := "quota-user"

	_ = s.UpsertUser(ctx, User{UID: uid, Email: "quota@example.com"})

	// Reserve up to limit 2
	period := "2026-09"
	limit := 2

	if err := s.ReserveIngest(ctx, uid, period, limit); err != nil {
		t.Fatalf("first reserve failed: %v", err)
	}
	if err := s.ReserveIngest(ctx, uid, period, limit); err != nil {
		t.Fatalf("second reserve failed: %v", err)
	}

	// Third reserve should hit limit
	err := s.ReserveIngest(ctx, uid, period, limit)
	if err != ErrIngestLimitReached {
		t.Fatalf("expected ErrIngestLimitReached on 3rd reserve, got %v", err)
	}

	// Release 1
	if err := s.ReleaseIngest(ctx, uid); err != nil {
		t.Fatalf("release failed: %v", err)
	}

	// Now reserve should succeed again
	if err := s.ReserveIngest(ctx, uid, period, limit); err != nil {
		t.Fatalf("reserve after release failed: %v", err)
	}

	// Changing period should reset count
	newPeriod := "2026-10"
	if err := s.ReserveIngest(ctx, uid, newPeriod, limit); err != nil {
		t.Fatalf("reserve in new period failed: %v", err)
	}
}

func TestMemoryStoreDeleteAllForUser(t *testing.T) {
	ctx := context.Background()
	s := NewMemoryStore()
	uid := "delete-user"

	_ = s.UpsertUser(ctx, User{UID: uid, Email: "del@example.com"})
	_ = s.CreateNote(ctx, &notes.Note{ID: "n1", OwnerUID: uid, Title: "N1"})
	_ = s.CreateNote(ctx, &notes.Note{ID: "n2", OwnerUID: uid, Title: "N2"})
	_ = s.CreateNote(ctx, &notes.Note{ID: "other-n", OwnerUID: "other", Title: "Other"})

	deletedIDs, err := s.DeleteAllForUser(ctx, uid)
	if err != nil {
		t.Fatalf("DeleteAllForUser failed: %v", err)
	}
	if len(deletedIDs) != 2 {
		t.Errorf("expected 2 deleted note IDs, got %d", len(deletedIDs))
	}

	// User doc should be gone
	_, err = s.GetUser(ctx, uid)
	if err != ErrNotFound {
		t.Errorf("expected user to be deleted, got %v", err)
	}

	// Other user's note should still exist
	otherNote, err := s.GetNote(ctx, "other", "other-n")
	if err != nil || otherNote.Title != "Other" {
		t.Errorf("expected other user note to exist, got %v", err)
	}
}

func TestMemoryBlobStore(t *testing.T) {
	ctx := context.Background()
	bs := NewMemoryBlobStore()
	key := "transcripts/test-123.json.gz"
	data := []byte("gzipped-transcript-data")

	// Get non-existent
	_, err := bs.Get(ctx, key)
	if err != ErrBlobNotFound {
		t.Fatalf("expected ErrBlobNotFound, got %v", err)
	}

	// Put
	if err := bs.Put(ctx, key, data); err != nil {
		t.Fatalf("Put failed: %v", err)
	}

	// Get
	got, err := bs.Get(ctx, key)
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	if string(got) != string(data) {
		t.Errorf("expected %q, got %q", string(data), string(got))
	}

	// Delete
	if err := bs.Delete(ctx, key); err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	// Verify deleted
	_, err = bs.Get(ctx, key)
	if err != ErrBlobNotFound {
		t.Errorf("expected ErrBlobNotFound after delete, got %v", err)
	}
}

func TestUpsertUserPreservesFields(t *testing.T) {
	ctx := context.Background()
	now := time.Date(2026, 9, 5, 10, 0, 0, 0, time.UTC)
	s := NewMemoryStore()
	s.Clock = func() time.Time { return now }

	uid := "preserve-user"

	// 1. Initial upsert with email and display name
	err := s.UpsertUser(ctx, User{
		UID:         uid,
		Email:       "original@example.com",
		DisplayName: "Original Name",
	})
	if err != nil {
		t.Fatalf("initial UpsertUser failed: %v", err)
	}

	u, err := s.GetUser(ctx, uid)
	if err != nil {
		t.Fatalf("GetUser failed: %v", err)
	}
	if u.Email != "original@example.com" || u.DisplayName != "Original Name" {
		t.Fatalf("expected original fields, got email=%q, name=%q", u.Email, u.DisplayName)
	}

	// 2. Upsert within 1 hour with empty email and display name (e.g. from custom token)
	now = now.Add(10 * time.Minute)
	err = s.UpsertUser(ctx, User{
		UID:         uid,
		Email:       "",
		DisplayName: "",
	})
	if err != nil {
		t.Fatalf("second UpsertUser failed: %v", err)
	}

	u, err = s.GetUser(ctx, uid)
	if err != nil {
		t.Fatalf("GetUser failed: %v", err)
	}
	if u.Email != "original@example.com" || u.DisplayName != "Original Name" {
		t.Fatalf("expected preserved fields within 1 hour, got email=%q, name=%q", u.Email, u.DisplayName)
	}

	// 3. Upsert after > 1 hour with empty email and display name
	now = now.Add(2 * time.Hour)
	err = s.UpsertUser(ctx, User{
		UID:         uid,
		Email:       "",
		DisplayName: "",
	})
	if err != nil {
		t.Fatalf("third UpsertUser failed: %v", err)
	}

	u, err = s.GetUser(ctx, uid)
	if err != nil {
		t.Fatalf("GetUser failed: %v", err)
	}
	if u.Email != "original@example.com" || u.DisplayName != "Original Name" {
		t.Fatalf("expected preserved fields after 2 hours, got email=%q, name=%q", u.Email, u.DisplayName)
	}

	// 4. Upsert with new display name but empty email -> only display name updates
	now = now.Add(2 * time.Hour)
	err = s.UpsertUser(ctx, User{
		UID:         uid,
		Email:       "",
		DisplayName: "Updated Name",
	})
	if err != nil {
		t.Fatalf("fourth UpsertUser failed: %v", err)
	}

	u, err = s.GetUser(ctx, uid)
	if err != nil {
		t.Fatalf("GetUser failed: %v", err)
	}
	if u.Email != "original@example.com" || u.DisplayName != "Updated Name" {
		t.Fatalf("expected preserved email and updated name, got email=%q, name=%q", u.Email, u.DisplayName)
	}
}

func TestFirestoreStoreIntegration(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("skipping firestore integration test: FIRESTORE_EMULATOR_HOST not set")
	}

	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "test-project")
	if err != nil {
		t.Fatalf("failed to connect to firestore emulator: %v", err)
	}
	defer client.Close()

	s := NewFirestoreStore(client)
	uid := "emu-user-" + time.Now().Format("150405")

	err = s.UpsertUser(ctx, User{UID: uid, Email: "emu@example.com"})
	if err != nil {
		t.Fatalf("UpsertUser failed: %v", err)
	}

	note := &notes.Note{
		ID:        "emu-note-" + time.Now().Format("150405"),
		OwnerUID:  uid,
		Title:     "Emu Note",
		Summary:   "Summary",
		Takeaways: []string{"T1", "T2", "T3"},
		Category:  "Writing",
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}

	if err := s.CreateNote(ctx, note); err != nil {
		t.Fatalf("CreateNote on emulator failed: %v", err)
	}

	got, err := s.GetNote(ctx, uid, note.ID)
	if err != nil {
		t.Fatalf("GetNote on emulator failed: %v", err)
	}
	if got.Title != "Emu Note" {
		t.Errorf("expected 'Emu Note', got %q", got.Title)
	}
}

func TestFirestoreFindNearestIntegration(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("skipping firestore integration test: FIRESTORE_EMULATOR_HOST not set")
	}

	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "test-project")
	if err != nil {
		t.Fatalf("failed to connect to firestore emulator: %v", err)
	}
	defer client.Close()

	s := NewFirestoreStore(client)
	uid := "emu-vec-user-" + time.Now().Format("150405")

	note := &notes.Note{
		ID:        "emu-vec-note-" + time.Now().Format("150405"),
		OwnerUID:  uid,
		Title:     "Emu Vector Note",
		Summary:   "Summary",
		Takeaways: []string{"T1", "T2"},
		Category:  "AI & ML",
		Embedding: firestore.Vector32{1.0, 0.0, 0.0},
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}

	if err := s.CreateNote(ctx, note); err != nil {
		t.Fatalf("CreateNote on emulator failed: %v", err)
	}

	queryVector := []float32{1.0, 0.0, 0.0}
	results, err := s.SearchNotes(ctx, uid, "", queryVector, 5)
	if err != nil {
		t.Fatalf("SearchNotes (FindNearest) failed on emulator: %v", err)
	}
	if len(results) == 0 {
		t.Fatalf("expected at least 1 result from SearchNotes on emulator, got 0")
	}
	t.Logf("SearchNotes returned %d results", len(results))
}

func TestStoreNoteRoundTrip(t *testing.T) {
	ctx := context.Background()
	runTest := func(t *testing.T, s Store) {
		uid := "user-roundtrip"
		convDate := time.Date(2026, 9, 2, 14, 0, 0, 0, time.UTC)
		fetchedAt := time.Date(2026, 9, 2, 14, 5, 0, 0, time.UTC)
		pubDate := time.Date(2026, 9, 3, 10, 0, 0, 0, time.UTC)
		createdAt := time.Date(2026, 9, 2, 14, 10, 0, 0, time.UTC)
		updatedAt := time.Date(2026, 9, 2, 14, 10, 0, 0, time.UTC)

		original := &notes.Note{
			ID:         "note-roundtrip-1",
			OwnerUID:   uid,
			Visibility: "unlisted",
			Title:      "Original Title",
			Summary:    "Original Summary",
			Takeaways:  []string{"T1", "T2"},
			CodeBlocks: []notes.CodeBlock{
				{Lang: "go", Code: "fmt.Println(\"hello\")"},
			},
			Category: "Programming",
			Tags:     []string{"go", "concurrency"},
			Source: notes.Source{
				Provider:         "chatgpt",
				ShareURL:         "https://chatgpt.com/share/test-1",
				Model:            "gpt-4o",
				ConversationDate: &convDate,
				FetchedAt:        fetchedAt,
			},
			Embedding:         firestore.Vector32{0.1, 0.2, 0.3},
			EmbeddingModel:    "gemini-embedding-001",
			EmbeddingTextHash: "hash-original",
			HasTranscript:     true,
			TranscriptBytes:   1024,
			PIIFlags:          []string{"email"},
			PIIScannedHash:    "scanned-hash-1",
			PIIAckHash:        "ack-hash-1",
			PublishedAt:       &pubDate,
			CreatedAt:         createdAt,
			UpdatedAt:         updatedAt,
		}

		if err := s.CreateNote(ctx, original); err != nil {
			t.Fatalf("CreateNote failed: %v", err)
		}

		got, err := s.GetNote(ctx, uid, original.ID)
		if err != nil {
			t.Fatalf("GetNote failed: %v", err)
		}

		assertNoteFieldsEqual(t, "after CreateNote", original, got, false)

		// Mutate all mutable fields and call UpdateNote
		newPubDate := time.Date(2026, 9, 4, 12, 0, 0, 0, time.UTC)
		toUpdate := &notes.Note{
			ID:         original.ID,
			OwnerUID:   uid,
			Visibility: "public",
			Title:      "Updated Title",
			Summary:    "Updated Summary",
			Takeaways:  []string{"T1-updated", "T3"},
			CodeBlocks: []notes.CodeBlock{
				{Lang: "python", Code: "print('updated')"},
			},
			Category:          "AI & ML",
			Tags:              []string{"ai", "agents"},
			Source:            original.Source, // source is preserved
			Embedding:         firestore.Vector32{0.4, 0.5, 0.6},
			EmbeddingModel:    "gemini-embedding-002",
			EmbeddingTextHash: "hash-updated",
			HasTranscript:     false,
			TranscriptBytes:   0,
			PIIFlags:          []string{"phone", "api_key"},
			PIIScannedHash:    "scanned-hash-2",
			PIIAckHash:        "ack-hash-2",
			PublishedAt:       &newPubDate,
			CreatedAt:         original.CreatedAt,
		}

		updated, err := s.UpdateNote(ctx, uid, toUpdate)
		if err != nil {
			t.Fatalf("UpdateNote failed: %v", err)
		}

		assertNoteFieldsEqual(t, "return from UpdateNote", toUpdate, updated, true)

		gotUpdated, err := s.GetNote(ctx, uid, original.ID)
		if err != nil {
			t.Fatalf("GetNote after update failed: %v", err)
		}

		assertNoteFieldsEqual(t, "GetNote after UpdateNote", toUpdate, gotUpdated, true)
	}

	t.Run("MemoryStore", func(t *testing.T) {
		s := NewMemoryStore()
		runTest(t, s)
	})

	t.Run("FirestoreStore", func(t *testing.T) {
		if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
			t.Skip("skipping firestore emulator test: FIRESTORE_EMULATOR_HOST not set")
		}
		client, err := firestore.NewClient(ctx, "test-project")
		if err != nil {
			t.Fatalf("failed to connect to firestore emulator: %v", err)
		}
		defer client.Close()
		s := NewFirestoreStore(client)
		runTest(t, s)
	})
}

func assertNoteFieldsEqual(t *testing.T, phase string, expected, actual *notes.Note, checkUpdatedTimestamp bool) {
	t.Helper()
	if expected.ID != actual.ID {
		t.Errorf("[%s] ID: expected %q, got %q", phase, expected.ID, actual.ID)
	}
	if expected.OwnerUID != actual.OwnerUID {
		t.Errorf("[%s] OwnerUID: expected %q, got %q", phase, expected.OwnerUID, actual.OwnerUID)
	}
	if expected.Visibility != actual.Visibility {
		t.Errorf("[%s] Visibility: expected %q, got %q", phase, expected.Visibility, actual.Visibility)
	}
	if expected.Title != actual.Title {
		t.Errorf("[%s] Title: expected %q, got %q", phase, expected.Title, actual.Title)
	}
	if expected.Summary != actual.Summary {
		t.Errorf("[%s] Summary: expected %q, got %q", phase, expected.Summary, actual.Summary)
	}
	if len(expected.Takeaways) != len(actual.Takeaways) {
		t.Errorf("[%s] Takeaways len: expected %d, got %d", phase, len(expected.Takeaways), len(actual.Takeaways))
	} else {
		for i := range expected.Takeaways {
			if expected.Takeaways[i] != actual.Takeaways[i] {
				t.Errorf("[%s] Takeaways[%d]: expected %q, got %q", phase, i, expected.Takeaways[i], actual.Takeaways[i])
			}
		}
	}
	if len(expected.CodeBlocks) != len(actual.CodeBlocks) {
		t.Errorf("[%s] CodeBlocks len: expected %d, got %d", phase, len(expected.CodeBlocks), len(actual.CodeBlocks))
	} else {
		for i := range expected.CodeBlocks {
			if expected.CodeBlocks[i] != actual.CodeBlocks[i] {
				t.Errorf("[%s] CodeBlocks[%d]: expected %+v, got %+v", phase, i, expected.CodeBlocks[i], actual.CodeBlocks[i])
			}
		}
	}
	if expected.Category != actual.Category {
		t.Errorf("[%s] Category: expected %q, got %q", phase, expected.Category, actual.Category)
	}
	if len(expected.Tags) != len(actual.Tags) {
		t.Errorf("[%s] Tags len: expected %d, got %d", phase, len(expected.Tags), len(actual.Tags))
	} else {
		for i := range expected.Tags {
			if expected.Tags[i] != actual.Tags[i] {
				t.Errorf("[%s] Tags[%d]: expected %q, got %q", phase, i, expected.Tags[i], actual.Tags[i])
			}
		}
	}
	if expected.Source.Provider != actual.Source.Provider {
		t.Errorf("[%s] Source.Provider: expected %q, got %q", phase, expected.Source.Provider, actual.Source.Provider)
	}
	if expected.Source.ShareURL != actual.Source.ShareURL {
		t.Errorf("[%s] Source.ShareURL: expected %q, got %q", phase, expected.Source.ShareURL, actual.Source.ShareURL)
	}
	if expected.Source.Model != actual.Source.Model {
		t.Errorf("[%s] Source.Model: expected %q, got %q", phase, expected.Source.Model, actual.Source.Model)
	}
	if (expected.Source.ConversationDate == nil) != (actual.Source.ConversationDate == nil) {
		t.Errorf("[%s] Source.ConversationDate nil mismatch", phase)
	} else if expected.Source.ConversationDate != nil && !expected.Source.ConversationDate.Equal(*actual.Source.ConversationDate) {
		t.Errorf("[%s] Source.ConversationDate: expected %v, got %v", phase, *expected.Source.ConversationDate, *actual.Source.ConversationDate)
	}
	if len(expected.Embedding) != len(actual.Embedding) {
		t.Errorf("[%s] Embedding len: expected %d, got %d", phase, len(expected.Embedding), len(actual.Embedding))
	} else {
		for i := range expected.Embedding {
			if expected.Embedding[i] != actual.Embedding[i] {
				t.Errorf("[%s] Embedding[%d]: expected %f, got %f", phase, i, expected.Embedding[i], actual.Embedding[i])
			}
		}
	}
	if expected.EmbeddingModel != actual.EmbeddingModel {
		t.Errorf("[%s] EmbeddingModel: expected %q, got %q", phase, expected.EmbeddingModel, actual.EmbeddingModel)
	}
	if expected.EmbeddingTextHash != actual.EmbeddingTextHash {
		t.Errorf("[%s] EmbeddingTextHash: expected %q, got %q", phase, expected.EmbeddingTextHash, actual.EmbeddingTextHash)
	}
	if expected.HasTranscript != actual.HasTranscript {
		t.Errorf("[%s] HasTranscript: expected %v, got %v", phase, expected.HasTranscript, actual.HasTranscript)
	}
	if expected.TranscriptBytes != actual.TranscriptBytes {
		t.Errorf("[%s] TranscriptBytes: expected %d, got %d", phase, expected.TranscriptBytes, actual.TranscriptBytes)
	}
	if len(expected.PIIFlags) != len(actual.PIIFlags) {
		t.Errorf("[%s] PIIFlags len: expected %d, got %d", phase, len(expected.PIIFlags), len(actual.PIIFlags))
	} else {
		for i := range expected.PIIFlags {
			if expected.PIIFlags[i] != actual.PIIFlags[i] {
				t.Errorf("[%s] PIIFlags[%d]: expected %q, got %q", phase, i, expected.PIIFlags[i], actual.PIIFlags[i])
			}
		}
	}
	if expected.PIIScannedHash != actual.PIIScannedHash {
		t.Errorf("[%s] PIIScannedHash: expected %q, got %q", phase, expected.PIIScannedHash, actual.PIIScannedHash)
	}
	if expected.PIIAckHash != actual.PIIAckHash {
		t.Errorf("[%s] PIIAckHash: expected %q, got %q", phase, expected.PIIAckHash, actual.PIIAckHash)
	}
	if (expected.PublishedAt == nil) != (actual.PublishedAt == nil) {
		t.Errorf("[%s] PublishedAt nil mismatch", phase)
	} else if expected.PublishedAt != nil && !expected.PublishedAt.Equal(*actual.PublishedAt) {
		t.Errorf("[%s] PublishedAt: expected %v, got %v", phase, *expected.PublishedAt, *actual.PublishedAt)
	}
	if !expected.CreatedAt.Equal(actual.CreatedAt) {
		t.Errorf("[%s] CreatedAt: expected %v, got %v", phase, expected.CreatedAt, actual.CreatedAt)
	}
	if checkUpdatedTimestamp {
		if !actual.UpdatedAt.After(expected.CreatedAt) && !actual.UpdatedAt.Equal(expected.CreatedAt) {
			t.Errorf("[%s] UpdatedAt expected to be >= CreatedAt, got %v", phase, actual.UpdatedAt)
		}
	}
}
