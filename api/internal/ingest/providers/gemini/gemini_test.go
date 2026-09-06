package gemini

import (
	"context"
	"errors"
	"testing"
)

func TestGeminiProvider_Match(t *testing.T) {
	p := New()
	tests := []struct {
		host string
		want bool
	}{
		{"gemini.google.com", true},
		{"GEMINI.GOOGLE.COM", true},
		{"google.com", false},
		{"bard.google.com", false},
		{"chatgpt.com", false},
	}

	for _, tc := range tests {
		if got := p.Match(tc.host); got != tc.want {
			t.Errorf("Match(%q) = %v, want %v", tc.host, got, tc.want)
		}
	}
}

func TestGeminiProvider_Fetch(t *testing.T) {
	p := New()
	_, err := p.Fetch(context.Background(), "https://gemini.google.com/share/test12345")
	if !errors.Is(err, ErrFetchBlocked) {
		t.Fatalf("expected ErrFetchBlocked, got: %v", err)
	}
}
