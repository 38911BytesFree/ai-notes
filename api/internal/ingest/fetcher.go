package ingest

import (
	"context"
	"errors"
	"net/url"
	"strings"

	"ainotes/internal/ingest/providers/chatgpt"
	"ainotes/internal/ingest/providers/claude"
	"ainotes/internal/notes"
)

var (
	ErrFetchFailed       = errors.New("fetch failed")
	ErrFetchBlocked      = errors.New("fetch blocked")
	ErrTranscriptEmpty   = errors.New("transcript empty")
	ErrTranscriptTooLong = errors.New("transcript too long")
)

// Fetcher defines the contract for conversation ingestion providers.
type Fetcher interface {
	Match(host string) bool
	Fetch(ctx context.Context, rawURL string) (notes.Transcript, error)
}

// Registry of supported providers. Every provider that makes network calls
// must use the SSRF-safe client (allowlist, redirect check, public-IP dialer,
// body cap, timeout); never http.DefaultClient.
var providers = []Fetcher{
	chatgpt.NewWithClient(NewClient(DefaultAllowlist)),
	claude.New(),
}

// ProviderFor returns the matching Fetcher for the given URL, or ErrUnsupportedProvider.
func ProviderFor(rawURL string) (Fetcher, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, ErrUnsupportedProvider
	}

	host := strings.ToLower(u.Hostname())
	for _, p := range providers {
		if p.Match(host) {
			return p, nil
		}
	}

	return nil, ErrUnsupportedProvider
}
