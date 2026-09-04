package notes

import (
	"crypto/rand"
	"encoding/base32"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
)

// Note represents a structured note in the library.
type Note struct {
	ID                string             `json:"id" firestore:"id"`
	OwnerUID          string             `json:"owner_uid" firestore:"owner_uid"`
	Visibility        string             `json:"visibility" firestore:"visibility"` // always "private"
	Title             string             `json:"title" firestore:"title"`
	Summary           string             `json:"summary" firestore:"summary"`
	Takeaways         []string           `json:"takeaways" firestore:"takeaways"`
	CodeBlocks        []CodeBlock        `json:"code_blocks,omitempty" firestore:"code_blocks"`
	Category          string             `json:"category" firestore:"category"`
	Tags              []string           `json:"tags" firestore:"tags"`
	Source            Source             `json:"source" firestore:"source"`
	Embedding         firestore.Vector32 `json:"-" firestore:"embedding,omitempty"`
	EmbeddingModel    string             `json:"embedding_model,omitempty" firestore:"embedding_model"`
	EmbeddingTextHash string             `json:"embedding_text_hash,omitempty" firestore:"embedding_text_hash"`
	HasTranscript     bool               `json:"has_transcript" firestore:"has_transcript"`
	TranscriptBytes   int                `json:"transcript_bytes,omitempty" firestore:"transcript_bytes"`
	CreatedAt         time.Time          `json:"created_at" firestore:"created_at"`
	UpdatedAt         time.Time          `json:"updated_at" firestore:"updated_at"`
	Distance          *float64           `json:"distance,omitempty" firestore:"-"`
}

// CodeBlock represents an extracted snippet with language tag.
type CodeBlock struct {
	Lang string `json:"lang" firestore:"lang"`
	Code string `json:"code" firestore:"code"`
}

// Source records provenance of the conversation.
type Source struct {
	Provider         string     `json:"provider" firestore:"provider"` // chatgpt | claude | manual
	ShareURL         string     `json:"share_url,omitempty" firestore:"share_url"`
	Model            string     `json:"model,omitempty" firestore:"model"`
	ConversationDate *time.Time `json:"conversation_date,omitempty" firestore:"conversation_date"`
	FetchedAt        time.Time  `json:"fetched_at" firestore:"fetched_at"`
}

// Transcript represents the full normalised conversation history.
type Transcript struct {
	Provider         string              `json:"provider"`
	Model            string              `json:"model,omitempty"`
	ConversationDate *time.Time          `json:"conversation_date,omitempty"`
	Messages         []TranscriptMessage `json:"messages"`
}

// TranscriptMessage is a single message turn.
type TranscriptMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// SearchResult pairs a Note with its cosine distance from the query vector.
type SearchResult struct {
	Note     *Note
	Distance float64
}

// NewNoteID generates a 20-character random base32 identifier.
func NewNoteID() (string, error) {
	bytes := make([]byte, 15)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	enc := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(bytes)
	return strings.ToLower(enc[:20]), nil
}
