package store

import (
	"context"
	"math"
	"sort"
	"sync"
	"time"

	"ainotes/internal/notes"
)

type MemoryStore struct {
	mu           sync.RWMutex
	users        map[string]User
	notes        map[string]*notes.Note
	oauthClients map[string]*OAuthClient
	oauthCodes   map[string]*OAuthCode
	oauthTokens  map[string]*OAuthToken
	patTokens    map[string]*PATToken
	Clock        func() time.Time
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		users:        make(map[string]User),
		notes:        make(map[string]*notes.Note),
		oauthClients: make(map[string]*OAuthClient),
		oauthCodes:   make(map[string]*OAuthCode),
		oauthTokens:  make(map[string]*OAuthToken),
		patTokens:    make(map[string]*PATToken),
		Clock:        func() time.Time { return time.Now().UTC() },
	}
}

func (m *MemoryStore) now() time.Time {
	if m.Clock != nil {
		return m.Clock()
	}
	return time.Now().UTC()
}

func (m *MemoryStore) UpsertUser(ctx context.Context, u User) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := m.now()
	existing, ok := m.users[u.UID]
	if !ok {
		if u.CreatedAt.IsZero() {
			u.CreatedAt = now
		}
		u.LastSeenAt = now
		u.DefaultKeepTranscript = true
		m.users[u.UID] = u
		return nil
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
			m.users[u.UID] = existing
		}
		return nil
	}

	u.CreatedAt = existing.CreatedAt
	u.LastSeenAt = now
	u.DefaultKeepTranscript = existing.DefaultKeepTranscript
	u.IngestPeriod = existing.IngestPeriod
	u.IngestCount = existing.IngestCount
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

func (m *MemoryStore) UpdateUserSettings(ctx context.Context, uid string, defaultKeepTranscript bool) (*User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	user, ok := m.users[uid]
	if !ok {
		return nil, ErrNotFound
	}

	user.DefaultKeepTranscript = defaultKeepTranscript
	m.users[uid] = user
	cp := user
	return &cp, nil
}

func (m *MemoryStore) ReserveIngest(ctx context.Context, uid, period string, limit int) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	user, ok := m.users[uid]
	if !ok {
		user = User{
			UID:                   uid,
			CreatedAt:             time.Now().UTC(),
			LastSeenAt:            time.Now().UTC(),
			DefaultKeepTranscript: true,
			IngestPeriod:          period,
			IngestCount:           1,
		}
		m.users[uid] = user
		return nil
	}

	if user.IngestPeriod != period {
		user.IngestPeriod = period
		user.IngestCount = 0
	}

	if user.IngestCount >= limit {
		return ErrIngestLimitReached
	}

	user.IngestCount++
	m.users[uid] = user
	return nil
}

func (m *MemoryStore) ReleaseIngest(ctx context.Context, uid string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	user, ok := m.users[uid]
	if !ok {
		return ErrNotFound
	}

	if user.IngestCount > 0 {
		user.IngestCount--
		m.users[uid] = user
	}
	return nil
}

func (m *MemoryStore) DeleteAllForUser(ctx context.Context, uid string) ([]string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	var deletedIDs []string
	for id, note := range m.notes {
		if note.OwnerUID == uid {
			deletedIDs = append(deletedIDs, id)
			delete(m.notes, id)
		}
	}

	delete(m.users, uid)
	return deletedIDs, nil
}

func (m *MemoryStore) CreateNote(ctx context.Context, note *notes.Note) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := m.now()
	if note.CreatedAt.IsZero() {
		note.CreatedAt = now
	}
	if note.UpdatedAt.IsZero() {
		note.UpdatedAt = now
	}
	if note.Visibility == "" {
		note.Visibility = "private"
	}

	cp := *note
	m.notes[note.ID] = &cp
	return nil
}

func (m *MemoryStore) GetNote(ctx context.Context, uid, id string) (*notes.Note, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	note, ok := m.notes[id]
	if !ok || note.OwnerUID != uid {
		return nil, ErrNotFound
	}
	cp := *note
	return &cp, nil
}

func (m *MemoryStore) UpdateNote(ctx context.Context, uid string, updated *notes.Note) (*notes.Note, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	existing, ok := m.notes[updated.ID]
	if !ok || existing.OwnerUID != uid {
		return nil, ErrNotFound
	}

	existing.Title = updated.Title
	existing.Summary = updated.Summary
	existing.Takeaways = updated.Takeaways
	if updated.CodeBlocks != nil {
		existing.CodeBlocks = updated.CodeBlocks
	}
	existing.Category = updated.Category
	existing.Tags = updated.Tags
	if len(updated.Embedding) > 0 {
		existing.Embedding = updated.Embedding
		existing.EmbeddingModel = updated.EmbeddingModel
		existing.EmbeddingTextHash = updated.EmbeddingTextHash
	}
	existing.HasTranscript = updated.HasTranscript
	existing.TranscriptBytes = updated.TranscriptBytes
	existing.UpdatedAt = m.now()

	cp := *existing
	return &cp, nil
}

func (m *MemoryStore) DeleteNote(ctx context.Context, uid, id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	existing, ok := m.notes[id]
	if !ok || existing.OwnerUID != uid {
		return ErrNotFound
	}

	delete(m.notes, id)
	return nil
}

func (m *MemoryStore) ListNotes(ctx context.Context, uid, category, cursor string, limit int) ([]*notes.Note, string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var matched []*notes.Note
	for _, n := range m.notes {
		if n.OwnerUID != uid {
			continue
		}
		if category != "" && n.Category != category {
			continue
		}
		cp := *n
		matched = append(matched, &cp)
	}

	// Sort newest first: created_at DESC, then ID DESC
	sort.Slice(matched, func(i, j int) bool {
		if matched[i].CreatedAt.Equal(matched[j].CreatedAt) {
			return matched[i].ID > matched[j].ID
		}
		return matched[i].CreatedAt.After(matched[j].CreatedAt)
	})

	startIndex := 0
	if cursor != "" {
		cursorTime, err := time.Parse(time.RFC3339Nano, cursor)
		if err == nil {
			for i, n := range matched {
				if n.CreatedAt.Before(cursorTime) {
					startIndex = i
					break
				}
				if i == len(matched)-1 {
					startIndex = len(matched)
				}
			}
		}
	}

	matched = matched[startIndex:]
	if limit <= 0 {
		limit = 30
	}

	nextCursor := ""
	if len(matched) > limit {
		page := matched[:limit]
		nextCursor = page[len(page)-1].CreatedAt.Format(time.RFC3339Nano)
		return page, nextCursor, nil
	}

	return matched, "", nil
}

func (m *MemoryStore) SearchNotes(ctx context.Context, uid, category string, vector []float32, limit int) ([]*notes.SearchResult, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var results []*notes.SearchResult
	for _, n := range m.notes {
		if n.OwnerUID != uid {
			continue
		}
		if category != "" && n.Category != category {
			continue
		}
		if len(n.Embedding) == 0 {
			continue
		}

		dist := cosineDistance(vector, n.Embedding)
		cp := *n
		cp.Distance = &dist
		results = append(results, &notes.SearchResult{
			Note:     &cp,
			Distance: dist,
		})
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Distance < results[j].Distance
	})

	if limit <= 0 {
		limit = 10
	}
	if len(results) > limit {
		results = results[:limit]
	}

	return results, nil
}

func (m *MemoryStore) GetNotesForExport(ctx context.Context, uid string) ([]*notes.Note, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var userNotes []*notes.Note
	for _, n := range m.notes {
		if n.OwnerUID == uid {
			cp := *n
			userNotes = append(userNotes, &cp)
		}
	}

	sort.Slice(userNotes, func(i, j int) bool {
		return userNotes[i].CreatedAt.After(userNotes[j].CreatedAt)
	})

	return userNotes, nil
}

func cosineDistance(a []float32, b []float32) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 1.0
	}
	var dot, normA, normB float64
	for i := range a {
		ai := float64(a[i])
		bi := float64(b[i])
		dot += ai * bi
		normA += ai * ai
		normB += bi * bi
	}
	if normA <= 0 || normB <= 0 {
		return 1.0
	}
	sim := dot / (math.Sqrt(normA) * math.Sqrt(normB))
	// Clamp similarity to [-1.0, 1.0] to prevent floating point inaccuracies
	if sim > 1.0 {
		sim = 1.0
	} else if sim < -1.0 {
		sim = -1.0
	}
	return 1.0 - sim
}

func (m *MemoryStore) CreateOAuthClient(ctx context.Context, client *OAuthClient) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	cp := *client
	m.oauthClients[client.ClientID] = &cp
	return nil
}

func (m *MemoryStore) GetOAuthClient(ctx context.Context, clientID string) (*OAuthClient, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	client, ok := m.oauthClients[clientID]
	if !ok {
		return nil, ErrNotFound
	}
	cp := *client
	return &cp, nil
}

func (m *MemoryStore) CreateOAuthCode(ctx context.Context, codeHash string, code *OAuthCode) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	cp := *code
	m.oauthCodes[codeHash] = &cp
	return nil
}

func (m *MemoryStore) ConsumeOAuthCode(ctx context.Context, codeHash string) (*OAuthCode, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	code, ok := m.oauthCodes[codeHash]
	if !ok || code.Consumed || m.now().After(code.ExpiresAt) {
		return nil, ErrNotFound
	}

	code.Consumed = true
	cp := *code
	return &cp, nil
}

func (m *MemoryStore) CreateOAuthToken(ctx context.Context, tokenHash string, token *OAuthToken) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	cp := *token
	m.oauthTokens[tokenHash] = &cp
	return nil
}

func (m *MemoryStore) GetOAuthToken(ctx context.Context, tokenHash string) (*OAuthToken, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	token, ok := m.oauthTokens[tokenHash]
	if !ok || token.Revoked || m.now().After(token.ExpiresAt) {
		return nil, ErrNotFound
	}
	cp := *token
	return &cp, nil
}

func (m *MemoryStore) RotateOAuthToken(ctx context.Context, refreshHash string) (*OAuthToken, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	token, ok := m.oauthTokens[refreshHash]
	if !ok || token.Kind != "refresh" || token.Revoked || m.now().After(token.ExpiresAt) {
		return nil, ErrNotFound
	}

	token.Revoked = true
	cp := *token
	return &cp, nil
}

func (m *MemoryStore) RevokeOAuthToken(ctx context.Context, tokenHash string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if token, ok := m.oauthTokens[tokenHash]; ok {
		token.Revoked = true
	}
	return nil
}

func (m *MemoryStore) CreatePAT(ctx context.Context, tokenHash string, pat *PATToken) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	cp := *pat
	m.patTokens[tokenHash] = &cp
	return nil
}

func (m *MemoryStore) ListPATs(ctx context.Context, uid string) ([]*PATToken, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*PATToken
	for _, p := range m.patTokens {
		if p.UID == uid && p.RevokedAt == nil {
			cp := *p
			cp.TokenHash = ""
			result = append(result, &cp)
		}
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].CreatedAt.After(result[j].CreatedAt)
	})

	return result, nil
}

func (m *MemoryStore) RevokePAT(ctx context.Context, uid, patID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, p := range m.patTokens {
		if p.UID == uid && p.ID == patID && p.RevokedAt == nil {
			now := m.now()
			p.RevokedAt = &now
			return nil
		}
	}
	return ErrNotFound
}

func (m *MemoryStore) GetPATByHash(ctx context.Context, tokenHash string) (*PATToken, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	pat, ok := m.patTokens[tokenHash]
	if !ok || pat.RevokedAt != nil {
		return nil, ErrNotFound
	}

	now := m.now()
	if pat.LastUsedAt == nil || now.Sub(*pat.LastUsedAt) >= time.Hour {
		pat.LastUsedAt = &now
	}

	cp := *pat
	cp.TokenHash = ""
	return &cp, nil
}
