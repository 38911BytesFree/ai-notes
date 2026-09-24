package ai

import (
	"context"
	"math"
	"strings"
	"testing"

	"ainotes/internal/notes"
)

func TestFakeSummariser(t *testing.T) {
	ctx := context.Background()
	summariser := NewFakeSummariser()

	transcript := notes.Transcript{
		Provider: "chatgpt",
		Messages: []notes.TranscriptMessage{
			{
				Role:    "user",
				Content: "How do I implement a rate limiter in Go?",
			},
			{
				Role:    "assistant",
				Content: "Here is an implementation using token bucket:\n\n```go\nfunc NewLimiter() {\n}\n```\n\nHope this helps!",
			},
		},
	}

	summary, err := summariser.Summarise(ctx, transcript)
	if err != nil {
		t.Fatalf("Summarise failed: %v", err)
	}

	if !strings.Contains(summary.Title, "rate limiter in Go") {
		t.Errorf("expected title to reflect user prompt, got %q", summary.Title)
	}
	if len(summary.Takeaways) < 3 {
		t.Errorf("expected at least 3 takeaways, got %d", len(summary.Takeaways))
	}
	if summary.Category != "Programming" {
		t.Errorf("expected category 'Programming', got %q", summary.Category)
	}
	if len(summary.CodeBlocks) != 1 {
		t.Fatalf("expected 1 extracted code block, got %d", len(summary.CodeBlocks))
	}
	if summary.CodeBlocks[0].Lang != "go" {
		t.Errorf("expected code block lang 'go', got %q", summary.CodeBlocks[0].Lang)
	}
}

func TestFakeEmbedder(t *testing.T) {
	ctx := context.Background()
	embedder := NewFakeEmbedder()

	text1 := "golang microservices architecture"
	text2 := "python machine learning models"

	v1, err := embedder.Embed(ctx, text1, TaskRetrievalDocument)
	if err != nil {
		t.Fatalf("Embed failed: %v", err)
	}
	if len(v1) != 768 {
		t.Fatalf("expected 768 dimensions, got %d", len(v1))
	}

	// Verify unit norm
	var sumSq float64
	for _, val := range v1 {
		sumSq += float64(val * val)
	}
	norm := math.Sqrt(sumSq)
	if math.Abs(norm-1.0) > 1e-4 {
		t.Errorf("expected unit norm (~1.0), got %f", norm)
	}

	// Determinism check
	v1Again, err := embedder.Embed(ctx, text1, TaskRetrievalDocument)
	if err != nil {
		t.Fatalf("Embed 2 failed: %v", err)
	}
	for i := range v1 {
		if v1[i] != v1Again[i] {
			t.Fatalf("expected deterministic vector at index %d (%f != %f)", i, v1[i], v1Again[i])
		}
	}

	// Different text produces different vector
	v2, err := embedder.Embed(ctx, text2, TaskRetrievalDocument)
	if err != nil {
		t.Fatalf("Embed text2 failed: %v", err)
	}
	var diffCount int
	for i := range v1 {
		if v1[i] != v2[i] {
			diffCount++
		}
	}
	if diffCount < 700 {
		t.Errorf("expected distinct vectors for different inputs, matching too many components: %d", 768-diffCount)
	}
}

func TestFakeSummariser_Integrate(t *testing.T) {
	ctx := context.Background()
	summariser := NewFakeSummariser()

	initialNote := &notes.Note{
		Title:   "Original Title",
		Summary: "Original Summary",
		Takeaways: []string{
			"Takeaway 1",
			"Takeaway 2",
		},
		Category: "Programming",
		Tags:     []string{"initial"},
		CodeBlocks: []notes.CodeBlock{
			{Lang: "go", Code: "func main() {}"},
		},
	}

	newTranscript := notes.Transcript{
		Provider: "claude",
		Messages: []notes.TranscriptMessage{
			{
				Role:    "user",
				Content: "Can you provide a helper function in python?",
			},
			{
				Role:    "assistant",
				Content: "Sure, here it is:\n\n```python\ndef helper():\n    return True\n```",
			},
		},
	}

	summary, err := summariser.Integrate(ctx, initialNote, newTranscript)
	if err != nil {
		t.Fatalf("Integrate failed: %v", err)
	}

	if summary.Title != "Original Title" {
		t.Errorf("expected title to be preserved, got %q", summary.Title)
	}
	if !strings.Contains(summary.Summary, "Original Summary") || !strings.Contains(summary.Summary, "[Integrated new information") {
		t.Errorf("expected summary to contain original summary and integration marker, got %q", summary.Summary)
	}
	if len(summary.CodeBlocks) != 2 {
		t.Fatalf("expected 2 code blocks (1 original + 1 integrated), got %d", len(summary.CodeBlocks))
	}
	if summary.CodeBlocks[0].Lang != "go" || summary.CodeBlocks[1].Lang != "python" {
		t.Errorf("unexpected code block languages: %v", summary.CodeBlocks)
	}
	if len(summary.Takeaways) != 3 {
		t.Errorf("expected 3 takeaways, got %d", len(summary.Takeaways))
	}
}
