package notes

import (
	"strings"
	"testing"
)

func TestCleanAndTruncateNote(t *testing.T) {
	longTitle := strings.Repeat("A", 250)
	longSummary := strings.Repeat("B", 5000)
	longTakeaway := strings.Repeat("C", 400)
	longCode := strings.Repeat("D", 9000)

	n := &Note{
		Title:   longTitle,
		Summary: longSummary,
		Takeaways: []string{
			longTakeaway,
			"Takeaway 2",
			"Takeaway 3",
			"Takeaway 4",
			"Takeaway 5",
			"Takeaway 6",
			"Takeaway 7",
			"Takeaway 8",
			"Takeaway 9 (should be dropped)",
		},
		CodeBlocks: []CodeBlock{
			{Lang: "GO", Code: longCode},
		},
		Category: "programming",
		Tags: []string{
			"TAG1",
			"tag1", // duplicate
			"  TAG2  ",
			strings.Repeat("e", 50),
		},
	}

	CleanAndTruncateNote(n)

	if len(n.Title) != MaxTitleChars {
		t.Errorf("expected title length %d, got %d", MaxTitleChars, len(n.Title))
	}
	if len(n.Summary) != MaxSummaryChars {
		t.Errorf("expected summary length %d, got %d", MaxSummaryChars, len(n.Summary))
	}
	if len(n.Takeaways) != MaxTakeaways {
		t.Errorf("expected %d takeaways, got %d", MaxTakeaways, len(n.Takeaways))
	}
	if len(n.Takeaways[0]) != MaxTakeawayChars {
		t.Errorf("expected first takeaway length %d, got %d", MaxTakeawayChars, len(n.Takeaways[0]))
	}
	if len(n.CodeBlocks) != 1 {
		t.Fatalf("expected 1 code block, got %d", len(n.CodeBlocks))
	}
	if n.CodeBlocks[0].Lang != "go" {
		t.Errorf("expected lang 'go', got %q", n.CodeBlocks[0].Lang)
	}
	if len(n.CodeBlocks[0].Code) != MaxCodeBlockChars {
		t.Errorf("expected code length %d, got %d", MaxCodeBlockChars, len(n.CodeBlocks[0].Code))
	}
	if n.Category != "Programming" {
		t.Errorf("expected category 'Programming', got %q", n.Category)
	}
	if len(n.Tags) != 3 {
		t.Fatalf("expected 3 deduplicated tags, got %d: %v", len(n.Tags), n.Tags)
	}
	if n.Tags[0] != "tag1" || n.Tags[1] != "tag2" {
		t.Errorf("expected tags [tag1, tag2], got %v", n.Tags)
	}
	if len(n.Tags[2]) != MaxTagChars {
		t.Errorf("expected tag 3 length %d, got %d", MaxTagChars, len(n.Tags[2]))
	}
}
