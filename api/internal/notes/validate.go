package notes

import (
	"strings"
	"unicode/utf8"
)

const (
	MaxTitleChars     = 200
	MaxSummaryChars   = 4000
	MinTakeaways      = 3
	MaxTakeaways      = 8
	MaxTakeawayChars  = 300
	MaxCodeBlocks     = 20
	MaxCodeBlockChars = 8000
	MaxTags           = 10
	MaxTagChars       = 30
)

// TruncateString truncates a UTF-8 string to a maximum number of characters (runes).
func TruncateString(s string, maxChars int) string {
	if utf8.RuneCountInString(s) <= maxChars {
		return s
	}
	runes := []rune(s)
	return string(runes[:maxChars])
}

// CleanAndTruncateNote enforces the schema constraints by truncating and normalising
// rather than rejecting, per the Section 6 and Section 7 specifications.
func CleanAndTruncateNote(n *Note) {
	n.Title = TruncateString(strings.TrimSpace(n.Title), MaxTitleChars)
	n.Summary = TruncateString(strings.TrimSpace(n.Summary), MaxSummaryChars)

	// Clean takeaways
	cleanedTakeaways := make([]string, 0)
	for _, t := range n.Takeaways {
		trimmed := strings.TrimSpace(t)
		if trimmed != "" {
			cleanedTakeaways = append(cleanedTakeaways, TruncateString(trimmed, MaxTakeawayChars))
		}
		if len(cleanedTakeaways) == MaxTakeaways {
			break
		}
	}
	n.Takeaways = cleanedTakeaways

	// Clean code blocks
	cleanedBlocks := make([]CodeBlock, 0)
	for _, cb := range n.CodeBlocks {
		cleanedBlocks = append(cleanedBlocks, CodeBlock{
			Lang: strings.ToLower(strings.TrimSpace(cb.Lang)),
			Code: TruncateString(cb.Code, MaxCodeBlockChars),
		})
		if len(cleanedBlocks) == MaxCodeBlocks {
			break
		}
	}
	n.CodeBlocks = cleanedBlocks

	// Normalise category
	n.Category = Normalise(n.Category)

	// Clean and deduplicate tags (lowercase, max 30 chars, max 10 tags)
	seenTags := make(map[string]struct{})
	cleanedTags := make([]string, 0)
	for _, tag := range n.Tags {
		trimmed := strings.ToLower(strings.TrimSpace(tag))
		if trimmed != "" {
			truncated := TruncateString(trimmed, MaxTagChars)
			if _, exists := seenTags[truncated]; !exists {
				seenTags[truncated] = struct{}{}
				cleanedTags = append(cleanedTags, truncated)
			}
		}
		if len(cleanedTags) == MaxTags {
			break
		}
	}
	n.Tags = cleanedTags
}
