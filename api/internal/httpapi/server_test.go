package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ainotes/internal/config"
	"ainotes/internal/store"

	"firebase.google.com/go/v4/auth"
)

func setupTestServer() (*Server, *store.MemoryStore, string) {
	memStore := store.NewMemoryStore()
	testTokenStr := "valid-test-token"
	testToken := &auth.Token{
		UID: "test-uid-123",
		Claims: map[string]interface{}{
			"email": "test@example.com",
			"name":  "Test User",
		},
	}
	verifier := NewTestTokenVerifier(testTokenStr, testToken)
	cfg := &config.Config{
		BindAddress:        "0.0.0.0:8000",
		GoogleCloudProject: "test-project",
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := NewServer(cfg, memStore, verifier, logger)
	return srv, memStore, testTokenStr
}

func TestHealthz(t *testing.T) {
	srv, _, _ := setupTestServer()

	req := httptest.NewRequest("GET", "/healthz", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

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
	srv, _, _ := setupTestServer()

	// 1. Missing Authorization header
	req := httptest.NewRequest("GET", "/v1/me", nil)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

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
	srv.Handler().ServeHTTP(rec2, req2)

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
	srv, memStore, validToken := setupTestServer()

	currentTime := time.Date(2026, 9, 4, 12, 0, 0, 0, time.UTC)
	memStore.Clock = func() time.Time { return currentTime }

	// First call to /v1/me
	req := httptest.NewRequest("GET", "/v1/me", nil)
	req.Header.Set("Authorization", "Bearer "+validToken)
	rec := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d; body: %s", rec.Code, rec.Body.String())
	}

	var resp MeResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.UID != "test-uid-123" {
		t.Errorf("expected uid 'test-uid-123', got %q", resp.UID)
	}
	if resp.Email != "test@example.com" {
		t.Errorf("expected email 'test@example.com', got %q", resp.Email)
	}
	if resp.DisplayName != "Test User" {
		t.Errorf("expected display_name 'Test User', got %q", resp.DisplayName)
	}

	u1, err := memStore.GetUser(req.Context(), "test-uid-123")
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
	req2.Header.Set("Authorization", "Bearer "+validToken)
	rec2 := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusOK {
		t.Fatalf("expected status 200 on second call, got %d", rec2.Code)
	}

	u2, err := memStore.GetUser(req2.Context(), "test-uid-123")
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
	req3.Header.Set("Authorization", "Bearer "+validToken)
	rec3 := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rec3, req3)

	if rec3.Code != http.StatusOK {
		t.Fatalf("expected status 200 on third call, got %d", rec3.Code)
	}

	u3, err := memStore.GetUser(req3.Context(), "test-uid-123")
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
