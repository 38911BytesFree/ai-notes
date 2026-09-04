package ai

import (
	"context"
	"errors"

	"ainotes/internal/notes"
)

var (
	ErrSummariseFailed = errors.New("summarise failed")
	ErrEmbedFailed     = errors.New("embed failed")
)

type EmbedTask string

const (
	TaskRetrievalDocument EmbedTask = "RETRIEVAL_DOCUMENT"
	TaskRetrievalQuery    EmbedTask = "RETRIEVAL_QUERY"
)

// Summary represents the structured output of the summariser.
type Summary struct {
	Title      string            `json:"title"`
	Summary    string            `json:"summary"`
	Takeaways  []string          `json:"takeaways"`
	CodeBlocks []notes.CodeBlock `json:"code_blocks"`
	Category   string            `json:"category"`
	Tags       []string          `json:"tags"`
}

type Summariser interface {
	Summarise(ctx context.Context, transcript notes.Transcript) (Summary, error)
}

type Embedder interface {
	Embed(ctx context.Context, text string, task EmbedTask) ([]float32, error)
}
