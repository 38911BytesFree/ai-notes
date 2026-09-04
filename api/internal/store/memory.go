package store

import (
	"context"
	"sync"
	"time"
)

type MemoryStore struct {
	mu    sync.RWMutex
	users map[string]User
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		users: make(map[string]User),
	}
}

func (m *MemoryStore) UpsertUser(ctx context.Context, u User) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now().UTC()
	existing, ok := m.users[u.UID]
	if !ok {
		if u.CreatedAt.IsZero() {
			u.CreatedAt = now
		}
		u.LastSeenAt = now
		m.users[u.UID] = u
		return nil
	}

	u.CreatedAt = existing.CreatedAt
	u.LastSeenAt = now
	m.users[u.UID] = u
	return nil
}

func (m *MemoryStore) GetUser(ctx context.Context, uid string) (User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	user, ok := m.users[uid]
	if !ok {
		return User{}, ErrNotFound
	}
	return user, nil
}
