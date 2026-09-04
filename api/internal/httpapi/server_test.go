package httpapi

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"ainotes/internal/ai"
	"ainotes/internal/config"
	"ainotes/internal/ingest"
	"ainotes/internal/notes"
	"ainotes/internal/store"

	"firebase.google.com/go/v4/auth"
)

type testContext struct {
	srv        *Server
	memStore   *store.MemoryStore
	blobStore  *store.MemoryBlobStore
	pipeline   *ingest.Pipeline
	embedder   *ai.FakeEmbedder
	authClient *TestAuthUserDeleter
	token      string
	uid        string
	otherToken string
	otherUID   string
}

type mockFetcher struct {
	t   notes.Transcript
	err error
}

func (m *mockFetcher) Match(host string) bool { return true }
func (m *mockFetcher) Fetch(ctx context.Context, rawURL string) (notes.Transcript, error) {
	return m.t, m.err
}

func setupTestContext(t *testing.T) *testContext {
	t.Helper()
	memStore := store.NewMemoryStore()
	blobStore := store.NewMemoryBlobStore()
	fakeSummariser := ai.NewFakeSummariser()
	fakeEmbedder := ai.NewFakeEmbedder()
	authClient := &TestAuthUserDeleter{}

	pipe := ingest.NewPipeline(
		ingest.PipelineConfig{
			MaxSummariserChars: 200000,
			MonthlyLimit:       30,
		},
		memStore,
		blobStore,
		fakeSummariser,
		fakeEmbedder,
		nil,
	)

	pipe.SetFetcherResolver(func(rawURL string) (ingest.Fetcher, error) {
		if strings.Contains(rawURL, "unsupported") {
			return nil, ingest.ErrUnsupportedProvider
		}
		return &mockFetcher{
			t: notes.Transcript{
				Provider: "chatgpt",
				Model:    "gpt-5",
				Messages: []notes.TranscriptMessage{
					{Role: "user", Content: "How do I use Go generics?"},
					{Role: "assistant", Content: "Go generics were introduced in Go 1.18."},
				},
			},
		}, nil
	})

	uid := "test-uid-123"
	tokenStr := "valid-test-token"
	otherUID := "other-uid-456"
	otherTokenStr := "other-test-token"

	verifier := &TestTokenVerifier{
		Tokens: map[string]*auth.Token{
			tokenStr: {
				UID: uid,
				Claims: map[string]interface{}{
					"email": "test@example.com",
					"name":  "Test User",
				},
			},
			otherTokenStr: {
				UID: otherUID,
				Claims: map[string]interface{}{
					"email": "other@example.com",
					"name":  "Other User",
				},
			},
		},
	}

	cfg := &config.Config{
		BindAddress:        "0.0.0.0:8000",
		GoogleCloudProject: "test-project",
		IngestMonthlyLimit: 30,
		SummariserMaxChars: 200000,
		UseFakeAI:          true,
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	srv := NewServer(ServerDeps{
		Config:     cfg,
		Store:      memStore,
		BlobStore:  blobStore,
		Verifier:   verifier,
		Pipeline:   pipe,
		Embedder:   fakeEmbedder,
		AuthClient: authClient,
		Logger:     logger,
	})

	return &testContext{
		srv:        srv,
		memStore:   memStore,
		blobStore:  blobStore,
		pipeline:   pipe,
		embedder:   fakeEmbedder,
		authClient: authClient,
		token:      tokenStr,
		uid:        uid,
		otherToken: otherTokenStr,
		otherUID:   otherUID,
	}
}

func setupTestServer() (*Server, *store.MemoryStore, string) {
	tc := setupTestContext(&testing.T{})
	return tc.srv, tc.memStore, tc.token
}

func TestHealthz(t *testing.T) {
	tc := setupTestContext(t)

	req := httptest.NewRequest("GET", "/healthz", nil)
	rec := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if body["status"] != "ok" {
		t.Errorf("expected status 'ok', got %q", body["status"])
	}
}

func TestMeUnauthenticated(t *testing.T) {
	tc := setupTestContext(t)

	// 1. Missing Authorization header
	req := httptest.NewRequest("GET", "/v1/me", nil)
	rec := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", rec.Code)
	}

	var body map[string]string
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if body["code"] != "unauthenticated" {
		t.Errorf("expected code 'unauthenticated', got %q", body["code"])
	}

	// 2. Invalid token
	req2 := httptest.NewRequest("GET", "/v1/me", nil)
	req2.Header.Set("Authorization", "Bearer invalid-token")
	rec2 := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401 for invalid token, got %d", rec2.Code)
	}

	var body2 map[string]string
	if err := json.NewDecoder(rec2.Body).Decode(&body2); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if body2["code"] != "unauthenticated" {
		t.Errorf("expected code 'unauthenticated', got %q", body2["code"])
	}
}

func TestMeAuthenticatedAndUpsert(t *testing.T) {
	tc := setupTestContext(t)

	currentTime := time.Date(2026, 9, 4, 12, 0, 0, 0, time.UTC)
	tc.memStore.Clock = func() time.Time { return currentTime }

	// First call to /v1/me
	req := httptest.NewRequest("GET", "/v1/me", nil)
	req.Header.Set("Authorization", "Bearer "+tc.token)
	rec := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d; body: %s", rec.Code, rec.Body.String())
	}

	var resp MeResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.UID != tc.uid {
		t.Errorf("expected uid %q, got %q", tc.uid, resp.UID)
	}
	if resp.Email != "test@example.com" {
		t.Errorf("expected email 'test@example.com', got %q", resp.Email)
	}
	if resp.DisplayName != "Test User" {
		t.Errorf("expected display_name 'Test User', got %q", resp.DisplayName)
	}
	if resp.IngestLimit != 30 {
		t.Errorf("expected ingest_limit 30, got %d", resp.IngestLimit)
	}
	if !resp.DefaultKeepTranscript {
		t.Errorf("expected default_keep_transcript true by default")
	}

	u1, err := tc.memStore.GetUser(req.Context(), tc.uid)
	if err != nil {
		t.Fatalf("user not found in store: %v", err)
	}
	if u1.CreatedAt.IsZero() {
		t.Errorf("expected CreatedAt to be set, was zero")
	}
	if u1.LastSeenAt.IsZero() {
		t.Errorf("expected LastSeenAt to be set, was zero")
	}

	firstCreatedAt := u1.CreatedAt
	firstLastSeenAt := u1.LastSeenAt

	// Advance clock by less than 1 hour (15 minutes) - last_seen_at should NOT update
	currentTime = currentTime.Add(15 * time.Minute)

	// Second call to /v1/me
	req2 := httptest.NewRequest("GET", "/v1/me", nil)
	req2.Header.Set("Authorization", "Bearer "+tc.token)
	rec2 := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusOK {
		t.Fatalf("expected status 200 on second call, got %d", rec2.Code)
	}

	u2, err := tc.memStore.GetUser(req2.Context(), tc.uid)
	if err != nil {
		t.Fatalf("user not found in store on second call: %v", err)
	}

	if !u2.CreatedAt.Equal(firstCreatedAt) {
		t.Errorf("expected CreatedAt to remain %v, got %v", firstCreatedAt, u2.CreatedAt)
	}
	if !u2.LastSeenAt.Equal(firstLastSeenAt) {
		t.Errorf("expected LastSeenAt to remain %v within 1 hour, got %v", firstLastSeenAt, u2.LastSeenAt)
	}

	// Advance clock past 1 hour (55 minutes more, 70 minutes total) - last_seen_at SHOULD update
	currentTime = currentTime.Add(55 * time.Minute)

	// Third call to /v1/me
	req3 := httptest.NewRequest("GET", "/v1/me", nil)
	req3.Header.Set("Authorization", "Bearer "+tc.token)
	rec3 := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(rec3, req3)

	if rec3.Code != http.StatusOK {
		t.Fatalf("expected status 200 on third call, got %d", rec3.Code)
	}

	u3, err := tc.memStore.GetUser(req3.Context(), tc.uid)
	if err != nil {
		t.Fatalf("user not found in store on third call: %v", err)
	}

	if !u3.CreatedAt.Equal(firstCreatedAt) {
		t.Errorf("expected CreatedAt to remain %v, got %v", firstCreatedAt, u3.CreatedAt)
	}
	if !u3.LastSeenAt.After(firstLastSeenAt) {
		t.Errorf("expected LastSeenAt to advance past %v, got %v", firstLastSeenAt, u3.LastSeenAt)
	}
	if !u3.LastSeenAt.Equal(currentTime) {
		t.Errorf("expected LastSeenAt to be %v, got %v", currentTime, u3.LastSeenAt)
	}
}

func TestMe_SettingsPatch(t *testing.T) {
	tc := setupTestContext(t)

	// Create user first
	_ = tc.memStore.UpsertUser(context.Background(), store.User{
		UID:                   tc.uid,
		Email:                 "test@example.com",
		DefaultKeepTranscript: true,
	})

	patchBody := `{"default_keep_transcript": false}`
	req := httptest.NewRequest("PATCH", "/v1/me", strings.NewReader(patchBody))
	req.Header.Set("Authorization", "Bearer "+tc.token)
	rec := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d; body: %s", rec.Code, rec.Body.String())
	}

	var resp MeResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.DefaultKeepTranscript {
		t.Errorf("expected default_keep_transcript false after patch")
	}
}

func TestIngest_ShareURL(t *testing.T) {
	tc := setupTestContext(t)

	body := `{"share_url": "https://chatgpt.com/share/mock-1", "keep_transcript": true}`
	req := httptest.NewRequest("POST", "/v1/ingest", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tc.token)
	rec := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d; body: %s", rec.Code, rec.Body.String())
	}

	var note notes.Note
	if err := json.NewDecoder(rec.Body).Decode(&note); err != nil {
		t.Fatalf("failed to decode note response: %v", err)
	}

	if note.ID == "" {
		t.Errorf("expected non-empty ID")
	}
	if note.OwnerUID != tc.uid {
		t.Errorf("expected owner %q, got %q", tc.uid, note.OwnerUID)
	}
	if !note.HasTranscript {
		t.Errorf("expected HasTranscript true")
	}

	// Verify transcript was stored in blobStore
	blobKey := "transcripts/" + note.ID + ".json.gz"
	if _, err := tc.blobStore.Get(context.Background(), blobKey); err != nil {
		t.Errorf("expected blob to exist at %s: %v", blobKey, err)
	}
}

func TestIngest_Text(t *testing.T) {
	tc := setupTestContext(t)

	body := `{"text": "Pasted conversation contents here.", "provider": "manual"}`
	req := httptest.NewRequest("POST", "/v1/ingest", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tc.token)
	rec := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected status 201, got %d; body: %s", rec.Code, rec.Body.String())
	}

	var note notes.Note
	if err := json.NewDecoder(rec.Body).Decode(&note); err != nil {
		t.Fatalf("failed to decode note response: %v", err)
	}

	if note.Source.Provider != "manual" {
		t.Errorf("expected provider manual, got %q", note.Source.Provider)
	}
}

func TestIngest_UnsupportedHost(t *testing.T) {
	tc := setupTestContext(t)

	body := `{"share_url": "https://unsupported.com/share/1"}`
	req := httptest.NewRequest("POST", "/v1/ingest", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tc.token)
	rec := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400, got %d", rec.Code)
	}

	var resp map[string]string
	_ = json.NewDecoder(rec.Body).Decode(&resp)
	if resp["code"] != "unsupported_provider" {
		t.Errorf("expected code unsupported_provider, got %q", resp["code"])
	}
}

func TestIngest_QuotaAtLimit(t *testing.T) {
	tc := setupTestContext(t)

	// Pre-set user quota to 30
	period := time.Now().UTC().Format("2006-01")
	_ = tc.memStore.UpsertUser(context.Background(), store.User{
		UID:          tc.uid,
		Email:        "test@example.com",
		IngestPeriod: period,
		IngestCount:  30,
	})

	body := `{"text": "Another conversation", "provider": "manual"}`
	req := httptest.NewRequest("POST", "/v1/ingest", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tc.token)
	rec := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected status 429, got %d; body: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]string
	_ = json.NewDecoder(rec.Body).Decode(&resp)
	if resp["code"] != "ingest_limit_reached" {
		t.Errorf("expected code ingest_limit_reached, got %q", resp["code"])
	}
}

func TestNotes_ListWithCategoryAndCursor(t *testing.T) {
	tc := setupTestContext(t)
	ctx := context.Background()

	t1 := time.Date(2026, 9, 1, 10, 0, 0, 0, time.UTC)
	t2 := time.Date(2026, 9, 2, 10, 0, 0, 0, time.UTC)
	t3 := time.Date(2026, 9, 3, 10, 0, 0, 0, time.UTC)

	_ = tc.memStore.CreateNote(ctx, &notes.Note{
		ID:         "note1",
		OwnerUID:   tc.uid,
		Title:      "Go Note 1",
		Summary:    strings.Repeat("a", 350), // should be truncated to 300
		Category:   "Go",
		CreatedAt:  t1,
		UpdatedAt:  t1,
		CodeBlocks: []notes.CodeBlock{{Lang: "go", Code: "func main() {}"}}, // omitted in list
	})

	_ = tc.memStore.CreateNote(ctx, &notes.Note{
		ID:        "note2",
		OwnerUID:  tc.uid,
		Title:     "Go Note 2",
		Summary:   "Summary 2",
		Category:  "Go",
		CreatedAt: t2,
		UpdatedAt: t2,
	})

	_ = tc.memStore.CreateNote(ctx, &notes.Note{
		ID:        "note3",
		OwnerUID:  tc.uid,
		Title:     "Python Note 3",
		Summary:   "Summary 3",
		Category:  "Python",
		CreatedAt: t3,
		UpdatedAt: t3,
	})

	// 1. List with category filter = Go and limit = 1
	req := httptest.NewRequest("GET", "/v1/notes?category=Go&limit=1", nil)
	req.Header.Set("Authorization", "Bearer "+tc.token)
	rec := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d; body: %s", rec.Code, rec.Body.String())
	}

	var page1 ListNotesResponse
	if err := json.NewDecoder(rec.Body).Decode(&page1); err != nil {
		t.Fatalf("failed to decode page1: %v", err)
	}

	if len(page1.Notes) != 1 {
		t.Fatalf("expected 1 note, got %d", len(page1.Notes))
	}
	if page1.Notes[0].ID != "note2" { // newest first
		t.Errorf("expected note2, got %q", page1.Notes[0].ID)
	}
	if page1.NextCursor == "" {
		t.Errorf("expected non-empty next_cursor")
	}

	// 2. Fetch page 2 with cursor
	req2 := httptest.NewRequest("GET", "/v1/notes?category=Go&limit=1&cursor="+page1.NextCursor, nil)
	req2.Header.Set("Authorization", "Bearer "+tc.token)
	rec2 := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusOK {
		t.Fatalf("expected status 200 on page 2, got %d", rec2.Code)
	}

	var page2 ListNotesResponse
	if err := json.NewDecoder(rec2.Body).Decode(&page2); err != nil {
		t.Fatalf("failed to decode page2: %v", err)
	}
	if len(page2.Notes) != 1 {
		t.Fatalf("expected 1 note on page 2, got %d", len(page2.Notes))
	}
	if page2.Notes[0].ID != "note1" {
		t.Errorf("expected note1 on page 2, got %q", page2.Notes[0].ID)
	}
	// Check that summary was truncated to 300
	if len(page2.Notes[0].Summary) > 303 { // 300 + "..."
		t.Errorf("expected summary truncated to <= 303 chars, got %d", len(page2.Notes[0].Summary))
	}
}

func TestNotes_Search_NearerFirst(t *testing.T) {
	tc := setupTestContext(t)
	ctx := context.Background()

	// Using fake embedder which hashes text to vector
	q := "Kubernetes pod configuration"
	qVec, _ := tc.embedder.Embed(ctx, q, ai.TaskRetrievalQuery)

	// Note A matches q text closer
	_ = tc.memStore.CreateNote(ctx, &notes.Note{
		ID:        "noteA",
		OwnerUID:  tc.uid,
		Title:     "Kubernetes pod configuration",
		Summary:   "All about k8s pods",
		Embedding: qVec,
		CreatedAt: time.Now().UTC(),
	})

	otherVec, _ := tc.embedder.Embed(ctx, "Unrelated topic cooking recipes", ai.TaskRetrievalDocument)
	_ = tc.memStore.CreateNote(ctx, &notes.Note{
		ID:        "noteB",
		OwnerUID:  tc.uid,
		Title:     "Cooking recipes",
		Summary:   "How to cook pasta",
		Embedding: otherVec,
		CreatedAt: time.Now().UTC(),
	})

	req := httptest.NewRequest("GET", "/v1/notes/search?q=Kubernetes+pod+configuration", nil)
	req.Header.Set("Authorization", "Bearer "+tc.token)
	rec := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d; body: %s", rec.Code, rec.Body.String())
	}

	var searchResp SearchNotesResponse
	if err := json.NewDecoder(rec.Body).Decode(&searchResp); err != nil {
		t.Fatalf("failed to decode search response: %v", err)
	}

	if len(searchResp.Notes) < 2 {
		t.Fatalf("expected at least 2 notes, got %d", len(searchResp.Notes))
	}

	if searchResp.Notes[0].ID != "noteA" {
		t.Errorf("expected noteA to be first, got %q", searchResp.Notes[0].ID)
	}
	if searchResp.Notes[0].Distance == nil {
		t.Errorf("expected distance to be populated")
	}
}

func TestNotes_GetPatchDelete_AnotherUserNote_NotFound(t *testing.T) {
	tc := setupTestContext(t)
	ctx := context.Background()

	_ = tc.memStore.CreateNote(ctx, &notes.Note{
		ID:        "userA-note",
		OwnerUID:  tc.uid,
		Title:     "Private Note",
		Summary:   "Only for User A",
		CreatedAt: time.Now().UTC(),
	})

	// User B tries to GET
	getReq := httptest.NewRequest("GET", "/v1/notes/userA-note", nil)
	getReq.Header.Set("Authorization", "Bearer "+tc.otherToken)
	getRec := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusNotFound {
		t.Errorf("expected 404 for GET other user note, got %d", getRec.Code)
	}

	// User B tries to PATCH
	patchReq := httptest.NewRequest("PATCH", "/v1/notes/userA-note", strings.NewReader(`{"title":"Hacked"}`))
	patchReq.Header.Set("Authorization", "Bearer "+tc.otherToken)
	patchRec := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(patchRec, patchReq)
	if patchRec.Code != http.StatusNotFound {
		t.Errorf("expected 404 for PATCH other user note, got %d", patchRec.Code)
	}

	// User B tries to DELETE
	delReq := httptest.NewRequest("DELETE", "/v1/notes/userA-note", nil)
	delReq.Header.Set("Authorization", "Bearer "+tc.otherToken)
	delRec := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(delRec, delReq)
	if delRec.Code != http.StatusNotFound {
		t.Errorf("expected 404 for DELETE other user note, got %d", delRec.Code)
	}
}

func TestNotes_DeleteRemovesBlob(t *testing.T) {
	tc := setupTestContext(t)
	ctx := context.Background()

	noteID := "note-with-transcript"
	blobKey := "transcripts/" + noteID + ".json.gz"
	_ = tc.blobStore.Put(ctx, blobKey, []byte("fake gzip data"))

	_ = tc.memStore.CreateNote(ctx, &notes.Note{
		ID:            noteID,
		OwnerUID:      tc.uid,
		Title:         "Note with Blob",
		HasTranscript: true,
		CreatedAt:     time.Now().UTC(),
	})

	delReq := httptest.NewRequest("DELETE", "/v1/notes/"+noteID, nil)
	delReq.Header.Set("Authorization", "Bearer "+tc.token)
	delRec := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(delRec, delReq)

	if delRec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", delRec.Code)
	}

	// Verify blob is removed
	_, err := tc.blobStore.Get(ctx, blobKey)
	if err == nil {
		t.Errorf("expected blob to be deleted from blobStore")
	}

	// Verify note is removed from store
	_, err = tc.memStore.GetNote(ctx, tc.uid, noteID)
	if err == nil {
		t.Errorf("expected note to be deleted from store")
	}
}

func TestMe_Export_IncludesTranscript(t *testing.T) {
	tc := setupTestContext(t)
	ctx := context.Background()

	_ = tc.memStore.UpsertUser(ctx, store.User{
		UID:   tc.uid,
		Email: "test@example.com",
	})

	noteID := "export-note-1"
	blobKey := "transcripts/" + noteID + ".json.gz"

	tr := notes.Transcript{
		Provider: "chatgpt",
		Messages: []notes.TranscriptMessage{
			{Role: "user", Content: "Hello export"},
		},
	}
	trJSON, _ := json.Marshal(tr)
	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	_, _ = gw.Write(trJSON)
	_ = gw.Close()

	_ = tc.blobStore.Put(ctx, blobKey, buf.Bytes())

	_ = tc.memStore.CreateNote(ctx, &notes.Note{
		ID:            noteID,
		OwnerUID:      tc.uid,
		Title:         "Export Note",
		HasTranscript: true,
		CreatedAt:     time.Now().UTC(),
	})

	req := httptest.NewRequest("GET", "/v1/me/export", nil)
	req.Header.Set("Authorization", "Bearer "+tc.token)
	rec := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d; body: %s", rec.Code, rec.Body.String())
	}

	var exportResp ExportResponse
	if err := json.NewDecoder(rec.Body).Decode(&exportResp); err != nil {
		t.Fatalf("failed to decode export response: %v", err)
	}

	if exportResp.User.UID != tc.uid {
		t.Errorf("expected user UID %q, got %q", tc.uid, exportResp.User.UID)
	}
	if len(exportResp.Notes) != 1 {
		t.Fatalf("expected 1 note, got %d", len(exportResp.Notes))
	}
	if exportResp.Notes[0].Transcript == nil {
		t.Fatalf("expected transcript inline in export note")
	}
	if exportResp.Notes[0].Transcript.Messages[0].Content != "Hello export" {
		t.Errorf("expected transcript message 'Hello export', got %q", exportResp.Notes[0].Transcript.Messages[0].Content)
	}
}

func TestMe_DeleteAccountEmptiesStore(t *testing.T) {
	tc := setupTestContext(t)
	ctx := context.Background()

	_ = tc.memStore.UpsertUser(ctx, store.User{
		UID:   tc.uid,
		Email: "test@example.com",
	})

	noteID := "del-user-note"
	blobKey := "transcripts/" + noteID + ".json.gz"
	_ = tc.blobStore.Put(ctx, blobKey, []byte("blob data"))

	_ = tc.memStore.CreateNote(ctx, &notes.Note{
		ID:            noteID,
		OwnerUID:      tc.uid,
		Title:         "To Be Deleted",
		HasTranscript: true,
		CreatedAt:     time.Now().UTC(),
	})

	req := httptest.NewRequest("DELETE", "/v1/me", nil)
	req.Header.Set("Authorization", "Bearer "+tc.token)
	rec := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204, got %d", rec.Code)
	}

	// Verify store notes and user are deleted
	notesList, _ := tc.memStore.GetNotesForExport(ctx, tc.uid)
	if len(notesList) != 0 {
		t.Errorf("expected 0 notes in store after account deletion, got %d", len(notesList))
	}
	_, err := tc.memStore.GetUser(ctx, tc.uid)
	if err == nil {
		t.Errorf("expected user to be deleted from store")
	}

	// Verify blob is deleted
	_, err = tc.blobStore.Get(ctx, blobKey)
	if err == nil {
		t.Errorf("expected blob to be deleted")
	}

	// Verify authClient DeleteUser was invoked
	if len(tc.authClient.DeletedUIDs) != 1 || tc.authClient.DeletedUIDs[0] != tc.uid {
		t.Errorf("expected authClient to delete %q, got %v", tc.uid, tc.authClient.DeletedUIDs)
	}
}

func TestTranscript_GetAndDelete(t *testing.T) {
	tc := setupTestContext(t)
	ctx := context.Background()

	noteID := "transcript-test-note"
	blobKey := "transcripts/" + noteID + ".json.gz"

	tr := notes.Transcript{
		Provider: "chatgpt",
		Messages: []notes.TranscriptMessage{
			{Role: "user", Content: "Hello transcript"},
		},
	}
	trJSON, _ := json.Marshal(tr)
	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	_, _ = gw.Write(trJSON)
	_ = gw.Close()

	_ = tc.blobStore.Put(ctx, blobKey, buf.Bytes())

	_ = tc.memStore.CreateNote(ctx, &notes.Note{
		ID:              noteID,
		OwnerUID:        tc.uid,
		Title:           "Note",
		HasTranscript:   true,
		TranscriptBytes: buf.Len(),
		CreatedAt:       time.Now().UTC(),
	})

	// 1. GET /v1/notes/{id}/transcript
	getReq := httptest.NewRequest("GET", "/v1/notes/"+noteID+"/transcript", nil)
	getReq.Header.Set("Authorization", "Bearer "+tc.token)
	getRec := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(getRec, getReq)

	if getRec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d; body: %s", getRec.Code, getRec.Body.String())
	}
	var gotTr notes.Transcript
	if err := json.NewDecoder(getRec.Body).Decode(&gotTr); err != nil {
		t.Fatalf("failed to decode transcript: %v", err)
	}
	if len(gotTr.Messages) != 1 || gotTr.Messages[0].Content != "Hello transcript" {
		t.Errorf("unexpected transcript content: %v", gotTr)
	}

	// 2. DELETE /v1/notes/{id}/transcript
	delReq := httptest.NewRequest("DELETE", "/v1/notes/"+noteID+"/transcript", nil)
	delReq.Header.Set("Authorization", "Bearer "+tc.token)
	delRec := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(delRec, delReq)

	if delRec.Code != http.StatusNoContent {
		t.Fatalf("expected 204 on transcript delete, got %d", delRec.Code)
	}

	// 3. GET again -> expect 404
	getReq2 := httptest.NewRequest("GET", "/v1/notes/"+noteID+"/transcript", nil)
	getReq2.Header.Set("Authorization", "Bearer "+tc.token)
	getRec2 := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(getRec2, getReq2)

	if getRec2.Code != http.StatusNotFound {
		t.Fatalf("expected 404 on transcript after delete, got %d", getRec2.Code)
	}
}
