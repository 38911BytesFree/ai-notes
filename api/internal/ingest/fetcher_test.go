package ingest

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"ainotes/internal/ingest/providers/gemini"
	"ainotes/internal/ingest/providers/grok"
)

func TestProviderFor(t *testing.T) {
	tests := []struct {
		url       string
		wantMatch bool
	}{
		{"https://chatgpt.com/share/6745ed36-9acc-800e-8a90-59204bd13444", true},
		{"https://chat.openai.com/share/6745ed36-9acc-800e-8a90-59204bd13444", true},
		{"https://claude.ai/share/8807c67a-750f-4ba7-a719-7d57df697456", true},
		{"https://gemini.google.com/share/test-gemini-id", true},
		{"https://grok.com/share/test-grok-id", true},
		{"https://example.com/share/123", false},
		{"https://subdomain.chatgpt.com/share/123", false},
		{"invalid-url://", false},
	}

	for _, tc := range tests {
		t.Run(tc.url, func(t *testing.T) {
			p, err := ProviderFor(tc.url)
			if tc.wantMatch {
				if err != nil {
					t.Fatalf("expected match for %s, got error: %v", tc.url, err)
				}
				if p == nil {
					t.Fatalf("expected non-nil provider for %s", tc.url)
				}
			} else {
				if err != ErrUnsupportedProvider {
					t.Fatalf("expected ErrUnsupportedProvider for %s, got %v", tc.url, err)
				}
			}
		})
	}
}

func TestGeminiAndGrokReturnFetchBlocked(t *testing.T) {
	geminiFetcher, err := ProviderFor("https://gemini.google.com/share/test123")
	if err != nil {
		t.Fatalf("ProviderFor(gemini): %v", err)
	}
	if _, err := geminiFetcher.Fetch(context.Background(), "https://gemini.google.com/share/test123"); !errors.Is(err, gemini.ErrFetchBlocked) {
		t.Fatalf("expected gemini.ErrFetchBlocked for Gemini, got: %v", err)
	}

	grokFetcher, err := ProviderFor("https://grok.com/share/test123")
	if err != nil {
		t.Fatalf("ProviderFor(grok): %v", err)
	}
	if _, err := grokFetcher.Fetch(context.Background(), "https://grok.com/share/test123"); !errors.Is(err, grok.ErrFetchBlocked) {
		t.Fatalf("expected grok.ErrFetchBlocked for Grok, got: %v", err)
	}
}

// TestChatGPTProviderUsesSafeClient proves the registered ChatGPT provider goes
// through the SSRF-safe client: a fetch to an off-allowlist host is refused
// before any connection is made.
func TestChatGPTProviderUsesSafeClient(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("provider connected to a non-allowlisted host: %s", r.Host)
	}))
	defer srv.Close()

	f, err := ProviderFor("https://chatgpt.com/share/abc")
	if err != nil {
		t.Fatalf("ProviderFor: %v", err)
	}
	if _, err := f.Fetch(context.Background(), srv.URL+"/share/abc"); err == nil {
		t.Fatal("expected error fetching an off-allowlist host through the ChatGPT provider")
	}
}
