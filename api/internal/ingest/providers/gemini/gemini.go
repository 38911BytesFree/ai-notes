package gemini

import (
	"context"
	"errors"
	"strings"

	"ainotes/internal/notes"
)

var ErrFetchBlocked = errors.New("fetch blocked")

type Provider struct{}

func New() *Provider {
	return &Provider{}
}

func (p *Provider) Match(host string) bool {
	return strings.EqualFold(host, "gemini.google.com")
}

func (p *Provider) Fetch(ctx context.Context, rawURL string) (notes.Transcript, error) {
	// Gemini requires authenticated Google Account session RPCs (batchexecute);
	// automated fetch from serverless datacenter IP is blocked.
	return notes.Transcript{}, ErrFetchBlocked
}
