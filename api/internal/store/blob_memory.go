package store

import (
	"context"
	"sync"
)

type MemoryBlobStore struct {
	mu    sync.RWMutex
	blobs map[string][]byte
}

func NewMemoryBlobStore() *MemoryBlobStore {
	return &MemoryBlobStore{
		blobs: make(map[string][]byte),
	}
}

func (m *MemoryBlobStore) Put(ctx context.Context, key string, data []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	copied := make([]byte, len(data))
	copy(copied, data)
	m.blobs[key] = copied
	return nil
}

func (m *MemoryBlobStore) Get(ctx context.Context, key string) ([]byte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	data, ok := m.blobs[key]
	if !ok {
		return nil, ErrBlobNotFound
	}
	copied := make([]byte, len(data))
	copy(copied, data)
	return copied, nil
}

func (m *MemoryBlobStore) Delete(ctx context.Context, key string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.blobs, key)
	return nil
}
