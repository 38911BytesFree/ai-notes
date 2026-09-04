package store

import (
	"context"
	"errors"
)

var ErrBlobNotFound = errors.New("blob not found")

// BlobStore abstracts object storage for note transcripts.
type BlobStore interface {
	Put(ctx context.Context, key string, data []byte) error
	Get(ctx context.Context, key string) ([]byte, error)
	Delete(ctx context.Context, key string) error
}
