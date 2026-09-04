package store

import (
	"context"
	"errors"
	"io"

	"cloud.google.com/go/storage"
)

type GCSBlobStore struct {
	client *storage.Client
	bucket string
}

func NewGCSBlobStore(client *storage.Client, bucket string) *GCSBlobStore {
	return &GCSBlobStore{
		client: client,
		bucket: bucket,
	}
}

func (g *GCSBlobStore) Put(ctx context.Context, key string, data []byte) error {
	w := g.client.Bucket(g.bucket).Object(key).NewWriter(ctx)
	if _, err := w.Write(data); err != nil {
		_ = w.Close()
		return err
	}
	return w.Close()
}

func (g *GCSBlobStore) Get(ctx context.Context, key string) ([]byte, error) {
	r, err := g.client.Bucket(g.bucket).Object(key).NewReader(ctx)
	if err != nil {
		if errors.Is(err, storage.ErrObjectNotExist) {
			return nil, ErrBlobNotFound
		}
		return nil, err
	}
	defer r.Close()

	return io.ReadAll(r)
}

func (g *GCSBlobStore) Delete(ctx context.Context, key string) error {
	err := g.client.Bucket(g.bucket).Object(key).Delete(ctx)
	if err != nil && !errors.Is(err, storage.ErrObjectNotExist) {
		return err
	}
	return nil
}
