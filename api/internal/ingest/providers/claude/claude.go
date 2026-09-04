package claude

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"ainotes/internal/notes"
)

var (
	ErrFetchBlocked    = errors.New("fetch blocked")
	ErrTranscriptEmpty = errors.New("transcript empty")
)

type Provider struct{}

func New() *Provider {
	return &Provider{}
}

func (p *Provider) Match(host string) bool {
	return strings.EqualFold(host, "claude.ai")
}

// Fetch returns ErrFetchBlocked because Cloudflare challenge blocks plain HTTP
// requests from Cloud Run datacenter IPs to Claude share endpoints, as documented
// in docs/phase1-fetcher-spike.md.
func (p *Provider) Fetch(ctx context.Context, rawURL string) (notes.Transcript, error) {
	return notes.Transcript{}, ErrFetchBlocked
}

// ParseJSON parses a Claude chat snapshot JSON response.
func ParseJSON(body []byte) (notes.Transcript, error) {
	var root struct {
		SnapshotName string `json:"snapshot_name"`
		CreatedAt    string `json:"created_at"`
		ChatMessages []struct {
			Sender string `json:"sender"`
			Text   string `json:"text"`
		} `json:"chat_messages"`
	}

	if err := json.Unmarshal(body, &root); err != nil {
		return notes.Transcript{}, fmt.Errorf("failed to parse claude json: %w", err)
	}

	var convDate *time.Time
	if root.CreatedAt != "" {
		if t, err := time.Parse(time.RFC3339, root.CreatedAt); err == nil {
			convDate = &t
		}
	}

	var messages []notes.TranscriptMessage
	for _, m := range root.ChatMessages {
		role := m.Sender
		if role == "human" {
			role = "user"
		}
		if role != "user" && role != "assistant" {
			continue
		}
		trimmed := strings.TrimSpace(m.Text)
		if trimmed != "" {
			messages = append(messages, notes.TranscriptMessage{
				Role:    role,
				Content: trimmed,
			})
		}
	}

	if len(messages) == 0 {
		return notes.Transcript{}, ErrTranscriptEmpty
	}

	return notes.Transcript{
		Provider:         "claude",
		Model:            "claude-3-5-sonnet",
		ConversationDate: convDate,
		Messages:         messages,
	}, nil
}
