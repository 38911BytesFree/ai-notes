package claude

import (
	"context"
	"os"
	"strings"
	"testing"
)

func TestClaudeFetchBlocked(t *testing.T) {
	p := New()
	_, err := p.Fetch(context.Background(), "https://claude.ai/share/test-uuid")
	if err != ErrFetchBlocked {
		t.Fatalf("expected ErrFetchBlocked, got %v", err)
	}
}

func TestClaudeMatch(t *testing.T) {
	p := New()
	if !p.Match("claude.ai") {
		t.Errorf("expected match for claude.ai")
	}
	if !p.Match("CLAUDE.AI") {
		t.Errorf("expected case-insensitive match for CLAUDE.AI")
	}
	if p.Match("chatgpt.com") {
		t.Errorf("expected no match for chatgpt.com")
	}
	if p.Match("api.claude.ai") {
		t.Errorf("expected no match for subdomain api.claude.ai")
	}
}

func TestParseClaudeJSON(t *testing.T) {
	data, err := os.ReadFile("testdata/chat_snapshot.json")
	if err != nil {
		t.Fatalf("failed to read testdata/chat_snapshot.json: %v", err)
	}

	transcript, err := ParseJSON(data)
	if err != nil {
		t.Fatalf("ParseJSON failed: %v", err)
	}

	if transcript.Provider != "claude" {
		t.Errorf("expected provider 'claude', got %q", transcript.Provider)
	}
	if transcript.Model != "claude-3-5-sonnet" {
		t.Errorf("expected model 'claude-3-5-sonnet', got %q", transcript.Model)
	}
	if len(transcript.Messages) != 6 {
		t.Fatalf("expected 6 messages, got %d", len(transcript.Messages))
	}

	userMsg := transcript.Messages[0]
	if userMsg.Role != "user" {
		t.Errorf("expected role 'user', got %q", userMsg.Role)
	}
	const expectedPrefix = "I suspect the future of AI is that AI Agents will be talking to each other"
	if !strings.HasPrefix(userMsg.Content, expectedPrefix) {
		t.Errorf("expected first user message to start with %q, got %q", expectedPrefix, userMsg.Content)
	}

	assistantMsg := transcript.Messages[1]
	if assistantMsg.Role != "assistant" {
		t.Errorf("expected role 'assistant', got %q", assistantMsg.Role)
	}
}
