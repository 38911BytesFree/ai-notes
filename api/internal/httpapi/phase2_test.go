package httpapi

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ainotes/internal/ai"
	"ainotes/internal/config"
	"ainotes/internal/ingest"
	"ainotes/internal/notes"
	"ainotes/internal/store"

	"firebase.google.com/go/v4/auth"
)

type phase2TestContext struct {
	srv           *Server
	memStore      *store.MemoryStore
	userToken     string
	noEmailToken  string
	uid           string
	serviceToken  string
	devToken      string
	webServiceAcc string
}

func setupPhase2Context(t *testing.T) *phase2TestContext {
	t.Helper()
	memStore := store.NewMemoryStore()
	blobStore := store.NewMemoryBlobStore()
	fakeEmbedder := ai.NewFakeEmbedder()
	fakeSummariser := ai.NewFakeSummariser()

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

	uid := "phase2-user-1"
	userToken := "phase2-user-token"
	noEmailToken := "phase2-no-email-token"
	serviceToken := "phase2-service-token"
	devToken := "dev-token-secret"
	webServiceAcc := "sa-ai-notes-web@test-project.iam.gserviceaccount.com"

	userVerifier := &TestTokenVerifier{
		Tokens: map[string]*auth.Token{
			userToken: {
				UID: uid,
				Claims: map[string]interface{}{
					"email": "user@example.com",
					"name":  "User One",
				},
			},
			noEmailToken: {
				UID: uid,
				Claims: map[string]interface{}{
					// No email or name claim
				},
			},
		},
	}

	serviceValidator := &TestServiceTokenValidator{
		Tokens: map[string]string{
			serviceToken:        webServiceAcc,
			"forbidden-service": "attacker@other-project.iam.gserviceaccount.com",
		},
	}

	cfg := &config.Config{
		BindAddress:        "0.0.0.0:8000",
		GoogleCloudProject: "test-project",
		IngestMonthlyLimit: 30,
		SummariserMaxChars: 200000,
		UseFakeAI:          true,
		ServiceAudience:    "https://ai-notes-api-test.run.app",
		WebServiceAccount:  webServiceAcc,
		ServiceDevToken:    devToken,
	}

	logger := slog.New(slog.NewTextHandler(io.Discard, nil))

	srv := NewServer(ServerDeps{
		Config:           cfg,
		Store:            memStore,
		BlobStore:        blobStore,
		Verifier:         userVerifier,
		ServiceValidator: serviceValidator,
		Pipeline:         pipe,
		Embedder:         fakeEmbedder,
		Logger:           logger,
	})

	return &phase2TestContext{
		srv:           srv,
		memStore:      memStore,
		userToken:     userToken,
		noEmailToken:  noEmailToken,
		uid:           uid,
		serviceToken:  serviceToken,
		devToken:      devToken,
		webServiceAcc: webServiceAcc,
	}
}

func TestOAuthConsumeSingleUse(t *testing.T) {
	tc := setupPhase2Context(t)
	codeHash := "code-hash-single-use"

	// 1. Create code
	createReq := CreateOAuthCodeRequest{
		CodeHash:            codeHash,
		ClientID:            "client-1",
		UID:                 tc.uid,
		Scopes:              []string{"notes:read", "notes:write"},
		CodeChallenge:       "challenge-abc",
		CodeChallengeMethod: "S256",
		RedirectURI:         "https://example.com/callback",
		Resource:            "https://ai-notes-web.run.app/mcp",
		ExpiresAt:           time.Now().UTC().Add(10 * time.Minute),
	}
	body, _ := json.Marshal(createReq)
	req := httptest.NewRequest(http.MethodPost, "/v1/oauth/codes", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tc.serviceToken)
	w := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 on create code, got %d: %s", w.Code, w.Body.String())
	}

	// 2. First consume -> 200
	consumeReq := httptest.NewRequest(http.MethodPost, "/v1/oauth/codes/"+codeHash+"/consume", nil)
	consumeReq.Header.Set("Authorization", "Bearer "+tc.serviceToken)
	w1 := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(w1, consumeReq)
	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200 on first consume, got %d: %s", w1.Code, w1.Body.String())
	}
	var c store.OAuthCode
	if err := json.NewDecoder(w1.Body).Decode(&c); err != nil {
		t.Fatalf("failed to decode consumed code: %v", err)
	}
	if !c.Consumed {
		t.Errorf("expected code to be marked consumed")
	}

	// 3. Second consume -> 404 (single use)
	consumeReq2 := httptest.NewRequest(http.MethodPost, "/v1/oauth/codes/"+codeHash+"/consume", nil)
	consumeReq2.Header.Set("Authorization", "Bearer "+tc.serviceToken)
	w2 := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(w2, consumeReq2)
	if w2.Code != http.StatusNotFound {
		t.Fatalf("expected 404 on second consume, got %d: %s", w2.Code, w2.Body.String())
	}
}

func TestOAuthRotateRefusesSecondUse(t *testing.T) {
	tc := setupPhase2Context(t)
	refreshHash := "refresh-hash-123"

	// 1. Create refresh token
	createReq := CreateOAuthTokenRequest{
		TokenHash: refreshHash,
		Kind:      "refresh",
		ClientID:  "client-1",
		UID:       tc.uid,
		Scopes:    []string{"notes:read", "notes:write"},
		Resource:  "https://ai-notes-web.run.app/mcp",
		ExpiresAt: time.Now().UTC().Add(30 * 24 * time.Hour),
	}
	body, _ := json.Marshal(createReq)
	req := httptest.NewRequest(http.MethodPost, "/v1/oauth/tokens", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tc.serviceToken)
	w := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 on create token, got %d: %s", w.Code, w.Body.String())
	}

	// 2. First rotate -> 200
	rotReq := httptest.NewRequest(http.MethodPost, "/v1/oauth/tokens/"+refreshHash+"/rotate", nil)
	rotReq.Header.Set("Authorization", "Bearer "+tc.serviceToken)
	w1 := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(w1, rotReq)
	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200 on first rotate, got %d: %s", w1.Code, w1.Body.String())
	}

	// 3. Second rotate -> 404
	rotReq2 := httptest.NewRequest(http.MethodPost, "/v1/oauth/tokens/"+refreshHash+"/rotate", nil)
	rotReq2.Header.Set("Authorization", "Bearer "+tc.serviceToken)
	w2 := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(w2, rotReq2)
	if w2.Code != http.StatusNotFound {
		t.Fatalf("expected 404 on second rotate, got %d: %s", w2.Code, w2.Body.String())
	}
}

func TestOAuthTokenLookupNotFoundWhenRevokedOrExpired(t *testing.T) {
	tc := setupPhase2Context(t)
	tokenHash := "access-hash-lookup"

	// 1. Create active token
	createReq := CreateOAuthTokenRequest{
		TokenHash: tokenHash,
		Kind:      "access",
		ClientID:  "client-1",
		UID:       tc.uid,
		Scopes:    []string{"notes:read"},
		Resource:  "https://ai-notes-web.run.app/mcp",
		ExpiresAt: time.Now().UTC().Add(1 * time.Hour),
	}
	body, _ := json.Marshal(createReq)
	req := httptest.NewRequest(http.MethodPost, "/v1/oauth/tokens", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tc.serviceToken)
	w := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 on create token, got %d: %s", w.Code, w.Body.String())
	}

	// Lookup -> 200
	getReq := httptest.NewRequest(http.MethodGet, "/v1/oauth/tokens/"+tokenHash, nil)
	getReq.Header.Set("Authorization", "Bearer "+tc.serviceToken)
	wGet := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(wGet, getReq)
	if wGet.Code != http.StatusOK {
		t.Fatalf("expected 200 on lookup, got %d", wGet.Code)
	}

	// Revoke -> 204
	delReq := httptest.NewRequest(http.MethodDelete, "/v1/oauth/tokens/"+tokenHash, nil)
	delReq.Header.Set("Authorization", "Bearer "+tc.serviceToken)
	wDel := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(wDel, delReq)
	if wDel.Code != http.StatusNoContent {
		t.Fatalf("expected 204 on revoke, got %d", wDel.Code)
	}

	// Lookup after revoke -> 404
	wGet2 := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(wGet2, getReq)
	if wGet2.Code != http.StatusNotFound {
		t.Fatalf("expected 404 after revoke, got %d", wGet2.Code)
	}

	// Expired token lookup -> 404
	expHash := "expired-token-hash"
	createExpReq := CreateOAuthTokenRequest{
		TokenHash: expHash,
		Kind:      "access",
		ClientID:  "client-1",
		UID:       tc.uid,
		Scopes:    []string{"notes:read"},
		Resource:  "https://ai-notes-web.run.app/mcp",
		ExpiresAt: time.Now().UTC().Add(-1 * time.Minute),
	}
	expBody, _ := json.Marshal(createExpReq)
	reqExp := httptest.NewRequest(http.MethodPost, "/v1/oauth/tokens", bytes.NewReader(expBody))
	reqExp.Header.Set("Authorization", "Bearer "+tc.serviceToken)
	wExp := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(wExp, reqExp)
	if wExp.Code != http.StatusCreated {
		t.Fatalf("expected 201 on create expired token, got %d", wExp.Code)
	}

	getExpReq := httptest.NewRequest(http.MethodGet, "/v1/oauth/tokens/"+expHash, nil)
	getExpReq.Header.Set("Authorization", "Bearer "+tc.serviceToken)
	wExpGet := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(wExpGet, getExpReq)
	if wExpGet.Code != http.StatusNotFound {
		t.Fatalf("expected 404 on expired token lookup, got %d", wExpGet.Code)
	}
}

func TestPATCreateReturnsTokenOnceAndListNever(t *testing.T) {
	tc := setupPhase2Context(t)

	// 1. Create PAT via user endpoint
	body, _ := json.Marshal(map[string]string{"label": "Claude Code Token"})
	req := httptest.NewRequest(http.MethodPost, "/v1/me/pats", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tc.userToken)
	w := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 on create PAT, got %d: %s", w.Code, w.Body.String())
	}

	var created CreatePATResponse
	if err := json.NewDecoder(w.Body).Decode(&created); err != nil {
		t.Fatalf("failed to decode create PAT response: %v", err)
	}
	if created.Token == "" || len(created.Token) < 40 {
		t.Fatalf("expected full token in create response, got %q", created.Token)
	}
	if created.Prefix != created.Token[:12] {
		t.Fatalf("expected prefix %q to match start of token, got %q", created.Prefix, created.Token[:12])
	}

	// 2. List PATs via user endpoint -> returns prefix and label, NEVER token
	listReq := httptest.NewRequest(http.MethodGet, "/v1/me/pats", nil)
	listReq.Header.Set("Authorization", "Bearer "+tc.userToken)
	wList := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(wList, listReq)
	if wList.Code != http.StatusOK {
		t.Fatalf("expected 200 on list PATs, got %d", wList.Code)
	}

	var listResp ListPATsResponse
	if err := json.NewDecoder(wList.Body).Decode(&listResp); err != nil {
		t.Fatalf("failed to decode list PATs response: %v", err)
	}
	if len(listResp.PATs) != 1 {
		t.Fatalf("expected 1 PAT in list, got %d", len(listResp.PATs))
	}
	if listResp.PATs[0].Prefix != created.Prefix {
		t.Errorf("expected prefix %q, got %q", created.Prefix, listResp.PATs[0].Prefix)
	}

	rawListJSON := wList.Body.String()
	if bytes.Contains([]byte(rawListJSON), []byte(created.Token)) {
		t.Fatalf("SECURITY VIOLATION: full PAT token leaked in list endpoint: %s", rawListJSON)
	}

	// 3. Service endpoint looks up by hash
	h := sha256.Sum256([]byte(created.Token))
	tokenHash := hex.EncodeToString(h[:])
	svcReq := httptest.NewRequest(http.MethodGet, "/v1/oauth/pats/"+tokenHash, nil)
	svcReq.Header.Set("Authorization", "Bearer "+tc.serviceToken)
	wSvc := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(wSvc, svcReq)
	if wSvc.Code != http.StatusOK {
		t.Fatalf("expected 200 on service PAT lookup, got %d: %s", wSvc.Code, wSvc.Body.String())
	}

	// 4. Revoke PAT
	delReq := httptest.NewRequest(http.MethodDelete, "/v1/me/pats/"+created.ID, nil)
	delReq.Header.Set("Authorization", "Bearer "+tc.userToken)
	wDel := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(wDel, delReq)
	if wDel.Code != http.StatusNoContent {
		t.Fatalf("expected 204 on revoke PAT, got %d", wDel.Code)
	}

	// 5. Service lookup after revoke -> 404
	wSvc2 := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(wSvc2, svcReq)
	if wSvc2.Code != http.StatusNotFound {
		t.Fatalf("expected 404 on revoked PAT lookup, got %d", wSvc2.Code)
	}
}

func TestCreateNoteDirectQuotaImmunity(t *testing.T) {
	tc := setupPhase2Context(t)

	// Ensure user exists with IngestCount = 0
	_ = tc.memStore.UpsertUser(context.Background(), store.User{
		UID:          tc.uid,
		Email:        "user@example.com",
		IngestPeriod: "2026-09",
		IngestCount:  0,
	})

	createNotePayload := CreateNoteRequest{
		Title:     "Direct MCP Saved Note",
		Summary:   "This is a note saved directly from an MCP client.",
		Takeaways: []string{"Point 1", "Point 2"},
		Category:  "AI & ML",
		Tags:      []string{"mcp", "fast"},
		Source: notes.Source{
			Provider: "chatgpt",
			Model:    "gpt-5",
		},
	}
	body, _ := json.Marshal(createNotePayload)
	req := httptest.NewRequest(http.MethodPost, "/v1/notes", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tc.userToken)
	w := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 on direct note create, got %d: %s", w.Code, w.Body.String())
	}

	var created notes.Note
	if err := json.NewDecoder(w.Body).Decode(&created); err != nil {
		t.Fatalf("failed to decode created note: %v", err)
	}
	if created.Title != "Direct MCP Saved Note" {
		t.Errorf("expected title 'Direct MCP Saved Note', got %q", created.Title)
	}
	storedNote, err := tc.memStore.GetNote(context.Background(), tc.uid, created.ID)
	if err != nil {
		t.Fatalf("failed to get stored note: %v", err)
	}
	if len(storedNote.Embedding) == 0 {
		t.Errorf("expected stored note to have embedding populated")
	}

	// Verify ingest quota was NOT consumed
	user, err := tc.memStore.GetUser(context.Background(), tc.uid)
	if err != nil {
		t.Fatalf("failed to get user: %v", err)
	}
	if user.IngestCount != 0 {
		t.Errorf("expected IngestCount to remain 0, got %d", user.IngestCount)
	}
}

func TestRequireServiceMiddleware(t *testing.T) {
	tc := setupPhase2Context(t)

	// 1. User token to service endpoint -> 401 unauthenticated
	req := httptest.NewRequest(http.MethodGet, "/v1/oauth/clients/test-client", nil)
	req.Header.Set("Authorization", "Bearer "+tc.userToken)
	w1 := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(w1, req)
	if w1.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for user token on service route, got %d: %s", w1.Code, w1.Body.String())
	}

	// 2. Invalid bearer token -> 401 unauthenticated
	req2 := httptest.NewRequest(http.MethodGet, "/v1/oauth/clients/test-client", nil)
	req2.Header.Set("Authorization", "Bearer totally-invalid-token")
	w2 := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(w2, req2)
	if w2.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for invalid token, got %d", w2.Code)
	}

	// 3. Token with mismatched email -> 403 forbidden
	req3 := httptest.NewRequest(http.MethodGet, "/v1/oauth/clients/test-client", nil)
	req3.Header.Set("Authorization", "Bearer forbidden-service")
	w3 := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(w3, req3)
	if w3.Code != http.StatusForbidden {
		t.Errorf("expected 403 for wrong caller email, got %d", w3.Code)
	}

	// 4. Dev token -> passes service auth
	req4 := httptest.NewRequest(http.MethodGet, "/v1/oauth/clients/non-existent", nil)
	req4.Header.Set("Authorization", "Bearer "+tc.devToken)
	w4 := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(w4, req4)
	// Passed auth, hit handler logic, client doesn't exist -> 404
	if w4.Code != http.StatusNotFound {
		t.Errorf("expected 404 after passing service auth via dev token, got %d: %s", w4.Code, w4.Body.String())
	}

	// 5. Valid service token -> passes service auth
	req5 := httptest.NewRequest(http.MethodGet, "/v1/oauth/clients/non-existent", nil)
	req5.Header.Set("Authorization", "Bearer "+tc.serviceToken)
	w5 := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(w5, req5)
	if w5.Code != http.StatusNotFound {
		t.Errorf("expected 404 after passing service auth via valid token, got %d: %s", w5.Code, w5.Body.String())
	}
}

func TestCustomTokenIDTokenPreservesUserEmail(t *testing.T) {
	tc := setupPhase2Context(t)

	// 1. First request with normal Google ID token (has email)
	req1 := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	req1.Header.Set("Authorization", "Bearer "+tc.userToken)
	w1 := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(w1, req1)
	if w1.Code != http.StatusOK {
		t.Fatalf("expected 200 on initial /v1/me, got %d", w1.Code)
	}

	user, err := tc.memStore.GetUser(context.Background(), tc.uid)
	if err != nil {
		t.Fatalf("failed to get user: %v", err)
	}
	if user.Email != "user@example.com" {
		t.Fatalf("expected initial email 'user@example.com', got %q", user.Email)
	}

	// Fast forward time by 2 hours
	tc.memStore.Clock = func() time.Time {
		return time.Now().UTC().Add(2 * time.Hour)
	}

	// 2. Second request with custom-token-derived ID token (no email claim)
	req2 := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	req2.Header.Set("Authorization", "Bearer "+tc.noEmailToken)
	w2 := httptest.NewRecorder()
	tc.srv.Handler().ServeHTTP(w2, req2)
	if w2.Code != http.StatusOK {
		t.Fatalf("expected 200 on custom token /v1/me, got %d", w2.Code)
	}

	userAfter, err := tc.memStore.GetUser(context.Background(), tc.uid)
	if err != nil {
		t.Fatalf("failed to get user: %v", err)
	}
	if userAfter.Email != "user@example.com" {
		t.Errorf("SECURITY/DATA INTEGRITY: email was blanked by custom token ID token, got %q", userAfter.Email)
	}
}
