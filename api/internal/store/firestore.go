package store

import (
	"context"
	"time"

	"cloud.google.com/go/firestore"
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
			return tx.Set(docRef, u)
		}

		var existing User
		if err := doc.DataTo(&existing); err != nil {
			return err
		}

		if now.Sub(existing.LastSeenAt) < time.Hour {
			return nil
		}

		u.CreatedAt = existing.CreatedAt
		u.LastSeenAt = now
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
