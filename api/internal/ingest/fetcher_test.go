package ingest

import (
	"testing"
)

func TestProviderFor(t *testing.T) {
	tests := []struct {
		url       string
		wantMatch bool
	}{
		{"https://chatgpt.com/share/6745ed36-9acc-800e-8a90-59204bd13444", true},
		{"https://chat.openai.com/share/6745ed36-9acc-800e-8a90-59204bd13444", true},
		{"https://claude.ai/share/8807c67a-750f-4ba7-a719-7d57df697456", true},
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
