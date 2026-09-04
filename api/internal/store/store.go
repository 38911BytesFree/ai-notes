package store

import (
	"context"
	"errors"
	"time"

	"ainotes/internal/notes"
)

var (
	ErrNotFound           = errors.New("not found")
	ErrIngestLimitReached = errors.New("ingest limit reached")
)

type User struct {
	UID                   string    `firestore:"uid" json:"uid"`
	Email                 string    `firestore:"email" json:"email"`
	DisplayName           string    `firestore:"display_name" json:"display_name"`
	CreatedAt             time.Time `firestore:"created_at" json:"created_at"`
	LastSeenAt            time.Time `firestore:"last_seen_at" json:"last_seen_at"`
	DefaultKeepTranscript bool      `firestore:"default_keep_transcript" json:"default_keep_transcript"`
	IngestPeriod          string    `firestore:"ingest_period" json:"ingest_period"`
	IngestCount           int       `firestore:"ingest_count" json:"ingest_count"`
}

type Store interface {
	// User operations
	UpsertUser(ctx context.Context, u User) error
	GetUser(ctx context.Context, uid string) (User, error)
	UpdateUserSettings(ctx context.Context, uid string, defaultKeepTranscript bool) (*User, error)
	ReserveIngest(ctx context.Context, uid, period string, limit int) error
	ReleaseIngest(ctx context.Context, uid string) error
	DeleteAllForUser(ctx context.Context, uid string) ([]string, error)

	// Note operations
	CreateNote(ctx context.Context, note *notes.Note) error
	GetNote(ctx context.Context, uid, id string) (*notes.Note, error)
	UpdateNote(ctx context.Context, uid string, note *notes.Note) (*notes.Note, error)
	DeleteNote(ctx context.Context, uid, id string) error
	ListNotes(ctx context.Context, uid, category, cursor string, limit int) ([]*notes.Note, string, error)
	SearchNotes(ctx context.Context, uid, category string, vector []float32, limit int) ([]*notes.SearchResult, error)
	GetNotesForExport(ctx context.Context, uid string) ([]*notes.Note, error)
}
