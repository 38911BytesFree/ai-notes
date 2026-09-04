package chatgpt

import (
	"os"
	"strings"
	"testing"
)

func TestParseChatGPTHTML(t *testing.T) {
	data, err := os.ReadFile("testdata/share.html")
	if err != nil {
		t.Fatalf("failed to read testdata/share.html: %v", err)
	}

	transcript, err := ParseHTML(data)
	if err != nil {
		t.Fatalf("ParseHTML failed: %v", err)
	}

	if transcript.Provider != "chatgpt" {
		t.Errorf("expected provider 'chatgpt', got %q", transcript.Provider)
	}
	if transcript.Model != "gpt-4o" {
		t.Errorf("expected model 'gpt-4o', got %q", transcript.Model)
	}
	if transcript.ConversationDate == nil {
		t.Errorf("expected non-nil ConversationDate")
	}

	if len(transcript.Messages) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(transcript.Messages))
	}

	// First user message assertions
	userMsg := transcript.Messages[0]
	if userMsg.Role != "user" {
		t.Errorf("expected role 'user', got %q", userMsg.Role)
	}
	const expectedPrefix = "C:\\Users\\byaidu> pdf2zh example.pdf"
	if !strings.HasPrefix(userMsg.Content, expectedPrefix) {
		t.Errorf("expected first user message to start with %q, got %q", expectedPrefix, userMsg.Content)
	}

	// Assistant message assertions
	assistantMsg := transcript.Messages[1]
	if assistantMsg.Role != "assistant" {
		t.Errorf("expected role 'assistant', got %q", assistantMsg.Role)
	}
	if !strings.Contains(assistantMsg.Content, "当前工作目录") {
		t.Errorf("expected assistant message to contain '当前工作目录'")
	}
}

func TestParseChatGPTJSON(t *testing.T) {
	data, err := os.ReadFile("testdata/backend_share.json")
	if err != nil {
		t.Fatalf("failed to read testdata/backend_share.json: %v", err)
	}

	transcript, err := ParseJSON(data)
	if err != nil {
		t.Fatalf("ParseJSON failed: %v", err)
	}

	if transcript.Provider != "chatgpt" {
		t.Errorf("expected provider 'chatgpt', got %q", transcript.Provider)
	}
	if transcript.Model != "gpt-4o" {
		t.Errorf("expected model 'gpt-4o', got %q", transcript.Model)
	}
	if len(transcript.Messages) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(transcript.Messages))
	}

	userMsg := transcript.Messages[0]
	if userMsg.Role != "user" {
		t.Errorf("expected role 'user', got %q", userMsg.Role)
	}
	const expectedPrefix = "C:\\Users\\byaidu> pdf2zh example.pdf"
	if !strings.HasPrefix(userMsg.Content, expectedPrefix) {
		t.Errorf("expected first user message to start with %q, got %q", expectedPrefix, userMsg.Content)
	}
}

func TestMatch(t *testing.T) {
	p := New()
	if !p.Match("chatgpt.com") {
		t.Errorf("expected match for chatgpt.com")
	}
	if !p.Match("CHATGPT.COM") {
		t.Errorf("expected case-insensitive match for CHATGPT.COM")
	}
	if !p.Match("chat.openai.com") {
		t.Errorf("expected match for chat.openai.com")
	}
	if p.Match("claude.ai") {
		t.Errorf("expected no match for claude.ai")
	}
	if p.Match("other.chatgpt.com") {
		t.Errorf("expected no match for subdomain other.chatgpt.com")
	}
}
