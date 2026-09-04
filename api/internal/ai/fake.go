package ai

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"math"
	"math/rand"
	"strings"

	"ainotes/internal/notes"
)

type FakeSummariser struct{}

func NewFakeSummariser() *FakeSummariser {
	return &FakeSummariser{}
}

func (f *FakeSummariser) Summarise(ctx context.Context, transcript notes.Transcript) (Summary, error) {
	firstUserMsg := "Untitled Note"
	for _, m := range transcript.Messages {
		if m.Role == "user" {
			firstUserMsg = m.Content
			break
		}
	}
	if firstUserMsg == "Untitled Note" && len(transcript.Messages) > 0 {
		firstUserMsg = transcript.Messages[0].Content
	}

	lines := strings.Split(strings.TrimSpace(firstUserMsg), "\n")
	title := lines[0]
	if len(title) > 60 {
		title = notes.TruncateString(title, 57) + "..."
	}

	var codeBlocks []notes.CodeBlock
	for _, m := range transcript.Messages {
		if strings.Contains(m.Content, "```") {
			parts := strings.Split(m.Content, "```")
			for i := 1; i < len(parts); i += 2 {
				block := parts[i]
				lang := "text"
				code := block
				if newlineIdx := strings.Index(block, "\n"); newlineIdx != -1 {
					langCandidate := strings.TrimSpace(block[:newlineIdx])
					if langCandidate != "" && len(langCandidate) < 20 {
						lang = strings.ToLower(langCandidate)
						code = block[newlineIdx+1:]
					}
				}
				codeBlocks = append(codeBlocks, notes.CodeBlock{
					Lang: lang,
					Code: strings.TrimSpace(code),
				})
			}
		}
	}

	summaryText := "This note covers " + title + ".\n\nThe conversation analyzes key requirements, explores design trade-offs, and arrives at an actionable solution suitable for future reference."

	return Summary{
		Title:   title,
		Summary: summaryText,
		Takeaways: []string{
			"Identify the core problem and verify all inputs before processing.",
			"Structure the solution into maintainable, modular components with clear ownership boundaries.",
			"Enforce robust error handling and validate schemas to guarantee reliable operation.",
		},
		CodeBlocks: codeBlocks,
		Category:   "Programming",
		Tags:       []string{"conversation", "reference", "solution"},
	}, nil
}

type FakeEmbedder struct{}

func NewFakeEmbedder() *FakeEmbedder {
	return &FakeEmbedder{}
}

func (f *FakeEmbedder) Embed(ctx context.Context, text string, task EmbedTask) ([]float32, error) {
	h := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(text))))
	seed := int64(binary.BigEndian.Uint64(h[:8]))
	rng := rand.New(rand.NewSource(seed))

	const dims = 768
	vec := make([]float32, dims)
	var sumSq float64
	for i := 0; i < dims; i++ {
		val := float32(rng.NormFloat64())
		vec[i] = val
		sumSq += float64(val * val)
	}

	norm := float32(math.Sqrt(sumSq))
	if norm > 0 {
		for i := 0; i < dims; i++ {
			vec[i] /= norm
		}
	}

	return vec, nil
}
