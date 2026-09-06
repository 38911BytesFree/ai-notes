package grok

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
	return strings.EqualFold(host, "grok.com")
}

func (p *Provider) Fetch(ctx context.Context, rawURL string) (notes.Transcript, error) {
	// Grok is protected behind Cloudflare bot challenges;
	// automated fetch from serverless datacenter IP is blocked.
	return notes.Transcript{}, ErrFetchBlocked
}
