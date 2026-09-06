package grok

import (
	"context"
	"errors"
	"testing"
)

func TestGrokProvider_Match(t *testing.T) {
	p := New()
	tests := []struct {
		host string
		want bool
	}{
		{"grok.com", true},
		{"GROK.COM", true},
		{"x.com", false},
		{"twitter.com", false},
		{"chatgpt.com", false},
	}

	for _, tc := range tests {
		if got := p.Match(tc.host); got != tc.want {
			t.Errorf("Match(%q) = %v, want %v", tc.host, got, tc.want)
		}
	}
}

func TestGrokProvider_Fetch(t *testing.T) {
	p := New()
	_, err := p.Fetch(context.Background(), "https://grok.com/share/test12345")
	if !errors.Is(err, ErrFetchBlocked) {
		t.Fatalf("expected ErrFetchBlocked, got: %v", err)
	}
}
