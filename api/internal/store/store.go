package store

import (
	"context"
	"errors"
	"time"
)

var ErrNotFound = errors.New("not found")

type User struct {
	UID         string    `firestore:"uid" json:"uid"`
	Email       string    `firestore:"email" json:"email"`
	DisplayName string    `firestore:"display_name" json:"display_name"`
	CreatedAt   time.Time `firestore:"created_at" json:"created_at"`
	LastSeenAt  time.Time `firestore:"last_seen_at" json:"last_seen_at"`
}

type Store interface {
	UpsertUser(ctx context.Context, u User) error
	GetUser(ctx context.Context, uid string) (User, error)
}
