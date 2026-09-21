package httpapi

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	"ainotes/internal/notes"

	"cloud.google.com/go/firestore"
)

func TestPublicNoteProjectionKeySet(t *testing.T) {
	convDate := time.Date(2026, 9, 2, 14, 0, 0, 0, time.UTC)
	fetchedAt := time.Date(2026, 9, 2, 14, 5, 0, 0, time.UTC)
	pubDate := time.Date(2026, 9, 3, 10, 0, 0, 0, time.UTC)
	dist := 0.123

	// Populate every single field in notes.Note, including all private / internal fields
	fullNote := &notes.Note{
		ID:         "full-note-id",
		OwnerUID:   "secret-owner-uid-123",
		Visibility: "public",
		Title:      "Complete Note",
		Summary:    "Detailed summary",
		Takeaways:  []string{"T1", "T2"},
		CodeBlocks: []notes.CodeBlock{
			{Lang: "go", Code: "package main"},
		},
		Category: "AI & ML",
		Tags:     []string{"tag1", "tag2"},
		Source: notes.Source{
			Provider:         "chatgpt",
			ShareURL:         "https://chatgpt.com/share/example",
			Model:            "gpt-5",
			ConversationDate: &convDate,
			FetchedAt:        fetchedAt,
		},
		Embedding:         firestore.Vector32{0.1, 0.2, 0.3},
		EmbeddingModel:    "gemini-embedding-001",
		EmbeddingTextHash: "secret-text-hash",
		HasTranscript:     true,
		TranscriptBytes:   54321,
		PIIFlags:          []string{"email", "api_key"},
		PIIScannedHash:    "scanned-hash-xyz",
		PIIAckHash:        "ack-hash-xyz",
		PublishedAt:       &pubDate,
		CreatedAt:         time.Date(2026, 9, 2, 14, 10, 0, 0, time.UTC),
		UpdatedAt:         time.Date(2026, 9, 3, 10, 0, 0, 0, time.UTC),
		Distance:          &dist,
	}

	proj := toPublicNote(fullNote)
	data, err := json.Marshal(proj)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("json.Unmarshal failed: %v", err)
	}

	// 1. Verify exact top-level keys
	var topKeys []string
	for k := range raw {
		topKeys = append(topKeys, k)
	}
	sort.Strings(topKeys)

	expectedTopKeys := []string{
		"category",
		"code_blocks",
		"created_at",
		"id",
		"published_at",
		"source",
		"summary",
		"tags",
		"takeaways",
		"title",
		"updated_at",
		"visibility",
	}
	sort.Strings(expectedTopKeys)

	if !reflect.DeepEqual(topKeys, expectedTopKeys) {
		t.Errorf("top-level JSON keys mismatch:\n got:  %v\n want: %v", topKeys, expectedTopKeys)
	}

	// 2. Verify exact source keys
	sourceRaw, ok := raw["source"].(map[string]interface{})
	if !ok {
		t.Fatalf("source field is not a map: %T", raw["source"])
	}

	var sourceKeys []string
	for k := range sourceRaw {
		sourceKeys = append(sourceKeys, k)
	}
	sort.Strings(sourceKeys)

	expectedSourceKeys := []string{
		"conversation_date",
		"model",
		"provider",
		"share_url",
	}
	sort.Strings(expectedSourceKeys)

	if !reflect.DeepEqual(sourceKeys, expectedSourceKeys) {
		t.Errorf("source JSON keys mismatch:\n got:  %v\n want: %v", sourceKeys, expectedSourceKeys)
	}

	// 3. Explicit check that forbidden fields are absent
	forbiddenFields := []string{
		"owner_uid",
		"embedding",
		"embedding_model",
		"embedding_text_hash",
		"has_transcript",
		"transcript_bytes",
		"pii_flags",
		"pii_scanned_hash",
		"pii_ack_hash",
		"distance",
	}
	for _, f := range forbiddenFields {
		if _, exists := raw[f]; exists {
			t.Errorf("forbidden field %q leaked in public projection!", f)
		}
	}
	if _, exists := sourceRaw["fetched_at"]; exists {
		t.Errorf("forbidden field source.fetched_at leaked in public projection!")
	}
}

func TestPublicEndpointsVisibilityExclusion(t *testing.T) {
	tc := setupTestContext(t)
	ctx := context.Background()

	now := time.Now().UTC()

	// Create private note
	privNote := &notes.Note{
		ID:         "priv-note-1",
		OwnerUID:   tc.uid,
		Visibility: "private",
		Title:      "Private Note",
		Summary:    "Private Summary",
		Takeaways:  []string{"Private T1"},
		Category:   "Programming",
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	_ = tc.memStore.CreateNote(ctx, privNote)

	// Create unlisted note
	unlistedNote := &notes.Note{
		ID:         "unlisted-note-1",
		OwnerUID:   tc.uid,
		Visibility: "unlisted",
		Title:      "Unlisted Note",
		Summary:    "Unlisted Summary",
		Takeaways:  []string{"Unlisted T1"},
		Category:   "Programming",
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	_ = tc.memStore.CreateNote(ctx, unlistedNote)

	// Create public note
	pubNote := &notes.Note{
		ID:          "pub-note-1",
		OwnerUID:    tc.uid,
		Visibility:  "public",
		Title:       "Public Note",
		Summary:     "Public Summary",
		Takeaways:   []string{"Public T1"},
		Category:    "Programming",
		PublishedAt: &now,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	_ = tc.memStore.CreateNote(ctx, pubNote)

	// 1. Private note GET /v1/public/notes/{id} returns 404
	t.Run("private note returns 404 on public route", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/v1/public/notes/priv-note-1", nil)
		w := httptest.NewRecorder()
		tc.srv.Handler().ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Errorf("expected 404 for private note, got %d", w.Code)
		}
		if cc := w.Header().Get("Cache-Control"); cc != "" {
			// error responses shouldn't cache
		}
	})

	// 2. Unlisted note GET /v1/public/notes/{id} returns 200
	t.Run("unlisted note returns 200 by id on public route", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/v1/public/notes/unlisted-note-1", nil)
		w := httptest.NewRecorder()
		tc.srv.Handler().ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected 200 for unlisted note, got %d", w.Code)
		}
		if cc := w.Header().Get("Cache-Control"); cc != "public, max-age=60" {
			t.Errorf("expected Cache-Control 'public, max-age=60', got %q", cc)
		}
		var p PublicNote
		if err := json.NewDecoder(w.Body).Decode(&p); err != nil {
			t.Fatalf("failed to decode json: %v", err)
		}
		if p.ID != "unlisted-note-1" {
			t.Errorf("expected id unlisted-note-1, got %q", p.ID)
		}
	})

	// 3. Unlisted note absent from public list GET /v1/public/notes
	t.Run("unlisted note absent from public list", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/v1/public/notes", nil)
		w := httptest.NewRecorder()
		tc.srv.Handler().ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected 200, got %d", w.Code)
		}
		if cc := w.Header().Get("Cache-Control"); cc != "public, max-age=60" {
			t.Errorf("expected Cache-Control 'public, max-age=60', got %q", cc)
		}
		var resp ListPublicNotesResponse
		if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
			t.Fatalf("failed to decode json: %v", err)
		}

		for _, item := range resp.Notes {
			if item.ID == "priv-note-1" {
				t.Errorf("private note appeared in public list!")
			}
			if item.ID == "unlisted-note-1" {
				t.Errorf("unlisted note appeared in public list!")
			}
		}

		foundPub := false
		for _, item := range resp.Notes {
			if item.ID == "pub-note-1" {
				foundPub = true
				break
			}
		}
		if !foundPub {
			t.Errorf("expected pub-note-1 in public list, not found")
		}
	})
}

func TestRouteAuthMatrix(t *testing.T) {
	tc := setupTestContext(t)

	// Route auth table of every registered route pattern in server.go
	routes := []struct {
		method    string
		path      string
		authClass string // "public", "user", "service"
	}{
		// Health
		{method: "GET", path: "/healthz", authClass: "public"},

		// Public endpoints (unauthenticated)
		{method: "GET", path: "/v1/public/notes/some-id", authClass: "public"},
		{method: "GET", path: "/v1/public/notes", authClass: "public"},

		// User endpoints
		{method: "GET", path: "/v1/me", authClass: "user"},
		{method: "PATCH", path: "/v1/me", authClass: "user"},
		{method: "GET", path: "/v1/me/export", authClass: "user"},
		{method: "DELETE", path: "/v1/me", authClass: "user"},
		{method: "POST", path: "/v1/ingest", authClass: "user"},
		{method: "POST", path: "/v1/notes", authClass: "user"},
		{method: "GET", path: "/v1/notes", authClass: "user"},
		{method: "GET", path: "/v1/notes/search", authClass: "user"},
		{method: "GET", path: "/v1/notes/some-id", authClass: "user"},
		{method: "PATCH", path: "/v1/notes/some-id", authClass: "user"},
		{method: "POST", path: "/v1/notes/some-id/refine", authClass: "user"},
		{method: "PUT", path: "/v1/notes/some-id/visibility", authClass: "user"},
		{method: "DELETE", path: "/v1/notes/some-id", authClass: "user"},
		{method: "GET", path: "/v1/notes/some-id/transcript", authClass: "user"},
		{method: "DELETE", path: "/v1/notes/some-id/transcript", authClass: "user"},
		{method: "GET", path: "/v1/me/pats", authClass: "user"},
		{method: "POST", path: "/v1/me/pats", authClass: "user"},
		{method: "DELETE", path: "/v1/me/pats/some-pat-id", authClass: "user"},

		// Service endpoints
		{method: "GET", path: "/v1/oauth/pats/somehash", authClass: "service"},
		{method: "POST", path: "/v1/oauth/clients", authClass: "service"},
		{method: "GET", path: "/v1/oauth/clients/some-client-id", authClass: "service"},
		{method: "POST", path: "/v1/oauth/codes", authClass: "service"},
		{method: "GET", path: "/v1/oauth/codes/somehash", authClass: "service"},
		{method: "POST", path: "/v1/oauth/codes/somehash/consume", authClass: "service"},
		{method: "POST", path: "/v1/oauth/tokens", authClass: "service"},
		{method: "GET", path: "/v1/oauth/tokens/somehash", authClass: "service"},
		{method: "POST", path: "/v1/oauth/tokens/somehash/rotate", authClass: "service"},
		{method: "DELETE", path: "/v1/oauth/tokens/somehash", authClass: "service"},
	}

	for _, r := range routes {
		t.Run(r.method+" "+r.path, func(t *testing.T) {
			body := strings.NewReader(`{}`)
			req := httptest.NewRequest(r.method, r.path, body)
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			tc.srv.Handler().ServeHTTP(w, req)

			switch r.authClass {
			case "public":
				// Must NOT be 401 or 403
				if w.Code == http.StatusUnauthorized || w.Code == http.StatusForbidden {
					t.Errorf("public route %s %s was refused with status %d", r.method, r.path, w.Code)
				}
			case "user":
				// Must be 401 Unauthenticated without token
				if w.Code != http.StatusUnauthorized {
					t.Errorf("user route %s %s expected 401 without auth, got %d", r.method, r.path, w.Code)
				}
			case "service":
				// Must be 401 or 403 without service token
				if w.Code != http.StatusUnauthorized && w.Code != http.StatusForbidden {
					t.Errorf("service route %s %s expected 401 or 403 without service auth, got %d", r.method, r.path, w.Code)
				}
			}
		})
	}
}

func TestTranscriptEndpointProtectedForPublicNote(t *testing.T) {
	tc := setupTestContext(t)
	ctx := context.Background()

	now := time.Now().UTC()
	pubNote := &notes.Note{
		ID:              "pub-with-transcript",
		OwnerUID:        tc.uid,
		Visibility:      "public",
		Title:           "Public Note With Transcript",
		Summary:         "Summary",
		Takeaways:       []string{"T1"},
		Category:        "Programming",
		HasTranscript:   true,
		TranscriptBytes: 50,
		PublishedAt:     &now,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	_ = tc.memStore.CreateNote(ctx, pubNote)

	// Save transcript in blob store as valid gzip
	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	_, _ = gw.Write([]byte(`{"provider":"chatgpt","messages":[]}`))
	_ = gw.Close()
	_ = tc.blobStore.Put(ctx, "transcripts/pub-with-transcript.json.gz", buf.Bytes())

	// 1. Unauthenticated request -> 401
	t.Run("unauthenticated request refused", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/v1/notes/pub-with-transcript/transcript", nil)
		w := httptest.NewRecorder()
		tc.srv.Handler().ServeHTTP(w, req)

		if w.Code != http.StatusUnauthorized {
			t.Errorf("expected 401, got %d", w.Code)
		}
	})

	// 2. Other user request -> 404
	t.Run("other user request returns 404", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/v1/notes/pub-with-transcript/transcript", nil)
		req.Header.Set("Authorization", "Bearer "+tc.otherToken)
		w := httptest.NewRecorder()
		tc.srv.Handler().ServeHTTP(w, req)

		if w.Code != http.StatusNotFound {
			t.Errorf("expected 404 for non-owner, got %d", w.Code)
		}
	})

	// 3. Owner request -> 200
	t.Run("owner request succeeds", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/v1/notes/pub-with-transcript/transcript", nil)
		req.Header.Set("Authorization", "Bearer "+tc.token)
		w := httptest.NewRecorder()
		tc.srv.Handler().ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Errorf("expected 200 for owner, got %d: %s", w.Code, w.Body.String())
		}
	})
}
