package chatgpt

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ainotes/internal/notes"
)

var (
	ErrFetchFailed     = errors.New("fetch failed")
	ErrFetchBlocked    = errors.New("fetch blocked")
	ErrTranscriptEmpty = errors.New("transcript empty")
)

type Provider struct {
	client *http.Client
}

func New() *Provider {
	return &Provider{
		client: http.DefaultClient,
	}
}

func NewWithClient(client *http.Client) *Provider {
	if client == nil {
		client = http.DefaultClient
	}
	return &Provider{client: client}
}

func (p *Provider) Match(host string) bool {
	h := strings.ToLower(host)
	return h == "chatgpt.com" || h == "chat.openai.com"
}

func (p *Provider) Fetch(ctx context.Context, rawURL string) (notes.Transcript, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return notes.Transcript{}, fmt.Errorf("%w: %v", ErrFetchFailed, err)
	}

	// Browser User-Agent header
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := p.client.Do(req)
	if err != nil {
		return notes.Transcript{}, fmt.Errorf("%w: %v", ErrFetchFailed, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusTooManyRequests {
		return notes.Transcript{}, ErrFetchBlocked
	}
	if resp.StatusCode != http.StatusOK {
		return notes.Transcript{}, fmt.Errorf("%w: status %d", ErrFetchFailed, resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return notes.Transcript{}, fmt.Errorf("%w: read body: %v", ErrFetchFailed, err)
	}

	trimmed := strings.TrimSpace(string(body))
	if strings.HasPrefix(trimmed, "{") {
		return ParseJSON(body)
	}

	return ParseHTML(body)
}

// ParseJSON parses a ChatGPT conversation JSON response.
func ParseJSON(body []byte) (notes.Transcript, error) {
	var root struct {
		Title              string     `json:"title"`
		DefaultModelSlug   string     `json:"default_model_slug"`
		CreateTime         float64    `json:"create_time"`
		LinearConversation []struct {
			Message *struct {
				Author struct {
					Role string `json:"role"`
				} `json:"author"`
				Content struct {
					ContentType string   `json:"content_type"`
					Parts       []string `json:"parts"`
				} `json:"content"`
				Metadata struct {
					ModelSlug string `json:"model_slug"`
				} `json:"metadata"`
			} `json:"message"`
		} `json:"linear_conversation"`
	}

	if err := json.Unmarshal(body, &root); err != nil {
		return notes.Transcript{}, fmt.Errorf("%w: %v", ErrFetchFailed, err)
	}

	model := root.DefaultModelSlug
	var messages []notes.TranscriptMessage

	for _, node := range root.LinearConversation {
		if node.Message == nil {
			continue
		}
		role := node.Message.Author.Role
		if role != "user" && role != "assistant" {
			continue
		}
		if node.Message.Metadata.ModelSlug != "" {
			model = node.Message.Metadata.ModelSlug
		}
		joined := strings.Join(node.Message.Content.Parts, "\n")
		if strings.TrimSpace(joined) != "" {
			messages = append(messages, notes.TranscriptMessage{
				Role:    role,
				Content: joined,
			})
		}
	}

	if len(messages) == 0 {
		return notes.Transcript{}, ErrTranscriptEmpty
	}

	var convDate *time.Time
	if root.CreateTime > 0 {
		t := time.Unix(int64(root.CreateTime), 0).UTC()
		convDate = &t
	}

	return notes.Transcript{
		Provider:         "chatgpt",
		Model:            model,
		ConversationDate: convDate,
		Messages:         messages,
	}, nil
}

// ParseHTML parses a ChatGPT shared conversation HTML document, extracting
// the React Router stream payload embedded in the document.
func ParseHTML(body []byte) (notes.Transcript, error) {
	html := string(body)

	const prefix = "window.__reactRouterContext.streamController.enqueue("
	idx := strings.Index(html, prefix)
	if idx == -1 {
		return notes.Transcript{}, fmt.Errorf("%w: stream controller not found", ErrFetchFailed)
	}

	start := idx + len(prefix)
	end := strings.Index(html[start:], ");")
	if end == -1 {
		return notes.Transcript{}, fmt.Errorf("%w: closing of stream payload not found", ErrFetchFailed)
	}

	rawArg := html[start : start+end]
	var payloadStr string
	if err := json.Unmarshal([]byte(rawArg), &payloadStr); err != nil {
		return notes.Transcript{}, fmt.Errorf("%w: unmarshal stream string: %v", ErrFetchFailed, err)
	}

	var elements []any
	if err := json.Unmarshal([]byte(payloadStr), &elements); err != nil {
		return notes.Transcript{}, fmt.Errorf("%w: unmarshal stream elements: %v", ErrFetchFailed, err)
	}

	getElem := func(idx int) any {
		if idx >= 0 && idx < len(elements) {
			return elements[idx]
		}
		return nil
	}

	getMap := func(idx int) map[string]any {
		if m, ok := getElem(idx).(map[string]any); ok {
			return m
		}
		return nil
	}

	getString := func(idx int) string {
		if s, ok := getElem(idx).(string); ok {
			return s
		}
		return ""
	}

	getRef := func(m map[string]any, key string) int {
		if m == nil {
			return -1
		}
		for k, v := range m {
			if strings.HasPrefix(k, "_") {
				kIdx, err := strconv.Atoi(k[1:])
				if err == nil && getString(kIdx) == key {
					if f, ok := v.(float64); ok {
						return int(f)
					}
				}
			}
		}
		return -1
	}

	var convDataRef = -1
	for i, el := range elements {
		if m, ok := el.(map[string]any); ok {
			titleRef := getRef(m, "title")
			linearRef := getRef(m, "linear_conversation")
			if titleRef != -1 && linearRef != -1 {
				convDataRef = i
				break
			}
		}
	}

	if convDataRef == -1 {
		return notes.Transcript{}, fmt.Errorf("%w: conversation data not found", ErrFetchFailed)
	}

	convMap := getMap(convDataRef)
	defaultModel := getString(getRef(convMap, "default_model_slug"))

	var convDate *time.Time
	createTimeRef := getRef(convMap, "create_time")
	if createTimeRef != -1 {
		if ctFloat, ok := getElem(createTimeRef).(float64); ok && ctFloat > 0 {
			t := time.Unix(int64(ctFloat), 0).UTC()
			convDate = &t
		}
	}

	linearRef := getRef(convMap, "linear_conversation")
	linearArr, ok := getElem(linearRef).([]any)
	if !ok {
		return notes.Transcript{}, fmt.Errorf("%w: linear_conversation array not found", ErrFetchFailed)
	}

	var messages []notes.TranscriptMessage
	model := defaultModel

	for _, nodeRefAny := range linearArr {
		nodeRefFloat, ok := nodeRefAny.(float64)
		if !ok {
			continue
		}
		nodeMap := getMap(int(nodeRefFloat))
		if nodeMap == nil {
			continue
		}

		msgRef := getRef(nodeMap, "message")
		if msgRef == -1 {
			continue
		}
		msgMap := getMap(msgRef)
		if msgMap == nil {
			continue
		}

		authorRef := getRef(msgMap, "author")
		authorMap := getMap(authorRef)
		role := getString(getRef(authorMap, "role"))
		if role != "user" && role != "assistant" {
			continue
		}

		metaRef := getRef(msgMap, "metadata")
		if metaRef != -1 {
			metaMap := getMap(metaRef)
			if mSlug := getString(getRef(metaMap, "model_slug")); mSlug != "" {
				model = mSlug
			}
		}

		contentRef := getRef(msgMap, "content")
		contentMap := getMap(contentRef)
		partsRef := getRef(contentMap, "parts")
		partsArr, ok := getElem(partsRef).([]any)
		if !ok {
			continue
		}

		var textParts []string
		for _, partRefAny := range partsArr {
			if partRefFloat, ok := partRefAny.(float64); ok {
				text := getString(int(partRefFloat))
				if text != "" {
					textParts = append(textParts, text)
				}
			}
		}

		joined := strings.Join(textParts, "\n")
		if strings.TrimSpace(joined) != "" {
			messages = append(messages, notes.TranscriptMessage{
				Role:    role,
				Content: joined,
			})
		}
	}

	if len(messages) == 0 {
		return notes.Transcript{}, ErrTranscriptEmpty
	}

	return notes.Transcript{
		Provider:         "chatgpt",
		Model:            model,
		ConversationDate: convDate,
		Messages:         messages,
	}, nil
}
