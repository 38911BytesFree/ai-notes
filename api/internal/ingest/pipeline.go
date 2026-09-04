package ingest

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"ainotes/internal/ai"
	"ainotes/internal/notes"
	"ainotes/internal/store"

	"cloud.google.com/go/firestore"
)

type PipelineConfig struct {
	MaxSummariserChars int
	MonthlyLimit       int
}

type Pipeline struct {
	cfg        PipelineConfig
	store      store.Store
	blobStore  store.BlobStore
	summariser ai.Summariser
	embedder   ai.Embedder
	logger     *slog.Logger
	Clock           func() time.Time
	fetcherResolver func(rawURL string) (Fetcher, error)
}

func (p *Pipeline) SetFetcherResolver(resolver func(rawURL string) (Fetcher, error)) {
	p.fetcherResolver = resolver
}

func NewPipeline(
	cfg PipelineConfig,
	st store.Store,
	bs store.BlobStore,
	sum ai.Summariser,
	emb ai.Embedder,
	logger *slog.Logger,
) *Pipeline {
	if cfg.MaxSummariserChars <= 0 {
		cfg.MaxSummariserChars = 200000
	}
	if cfg.MonthlyLimit <= 0 {
		cfg.MonthlyLimit = 30
	}
	if logger == nil {
		logger = slog.Default()
	}
	return &Pipeline{
		cfg:        cfg,
		store:      st,
		blobStore:  bs,
		summariser: sum,
		embedder:   emb,
		logger:     logger,
		Clock:      func() time.Time { return time.Now().UTC() },
	}
}

type IngestRequest struct {
	UID            string `json:"-"`
	ShareURL       string `json:"share_url,omitempty"`
	Text           string `json:"text,omitempty"`
	Provider       string `json:"provider,omitempty"` // "manual" when Text is provided
	KeepTranscript *bool  `json:"keep_transcript,omitempty"`
}

func (p *Pipeline) now() time.Time {
	if p.Clock != nil {
		return p.Clock()
	}
	return time.Now().UTC()
}

// Ingest executes the 7-step pipeline specified in Section 7.
func (p *Pipeline) Ingest(ctx context.Context, req IngestRequest) (*notes.Note, error) {
	now := p.now()
	period := now.Format("2006-01")

	// 1. Provider resolution
	var fetcher Fetcher
	providerName := req.Provider
	var shareURL string

	if strings.TrimSpace(req.ShareURL) != "" {
		shareURL = strings.TrimSpace(req.ShareURL)
		resolver := p.fetcherResolver
		if resolver == nil {
			resolver = ProviderFor
		}
		f, err := resolver(shareURL)
		if err != nil {
			return nil, ErrUnsupportedProvider
		}
		fetcher = f
	} else if strings.TrimSpace(req.Text) != "" && req.Provider == "manual" {
		providerName = "manual"
	} else {
		return nil, ErrUnsupportedProvider
	}

	// 2. Reserve quota before fetch
	if err := p.store.ReserveIngest(ctx, req.UID, period, p.cfg.MonthlyLimit); err != nil {
		return nil, err
	}

	// Helper to rollback quota on fetch-related errors
	rollbackQuota := func() {
		if err := p.store.ReleaseIngest(ctx, req.UID); err != nil {
			p.logger.Error("failed to rollback ingest quota", slog.String("uid", req.UID), slog.String("error", err.Error()))
		}
	}

	// 3. Fetch -> Transcript
	var transcript notes.Transcript
	if fetcher != nil {
		t, err := fetcher.Fetch(ctx, shareURL)
		if err != nil {
			rollbackQuota()
			if errors.Is(err, ErrFetchBlocked) {
				return nil, ErrFetchBlocked
			}
			if errors.Is(err, ErrTranscriptEmpty) {
				return nil, ErrTranscriptEmpty
			}
			return nil, ErrFetchFailed
		}
		transcript = t
		providerName = transcript.Provider
	} else {
		// Manual paste
		transcript = notes.Transcript{
			Provider: "manual",
			Messages: []notes.TranscriptMessage{
				{
					Role:    "user",
					Content: strings.TrimSpace(req.Text),
				},
			},
		}
	}

	if len(transcript.Messages) == 0 {
		rollbackQuota()
		return nil, ErrTranscriptEmpty
	}

	// Check raw size: over 2 MB raw -> transcript_too_long
	var rawSize int
	for _, m := range transcript.Messages {
		rawSize += len(m.Content)
	}
	if rawSize > 2*1024*1024 {
		rollbackQuota()
		return nil, ErrTranscriptTooLong
	}

	// 4. Truncate transcript if necessary
	truncatedTranscript := p.truncateTranscript(transcript)

	// 5. Summarise with structured output
	summary, err := p.summariser.Summarise(ctx, truncatedTranscript)
	if err != nil {
		p.logger.Error("summarisation failed", slog.String("error", err.Error()))
		return nil, ai.ErrSummariseFailed
	}

	// Determine keep transcript setting
	keepTranscript := true
	if req.KeepTranscript != nil {
		keepTranscript = *req.KeepTranscript
	} else {
		if user, err := p.store.GetUser(ctx, req.UID); err == nil {
			keepTranscript = user.DefaultKeepTranscript
		}
	}

	noteID, err := notes.NewNoteID()
	if err != nil {
		return nil, fmt.Errorf("generate note id: %w", err)
	}

	note := &notes.Note{
		ID:         noteID,
		OwnerUID:   req.UID,
		Visibility: "private",
		Title:      summary.Title,
		Summary:    summary.Summary,
		Takeaways:  summary.Takeaways,
		CodeBlocks: summary.CodeBlocks,
		Category:   summary.Category,
		Tags:       summary.Tags,
		Source: notes.Source{
			Provider:         providerName,
			ShareURL:         shareURL,
			Model:            transcript.Model,
			ConversationDate: transcript.ConversationDate,
			FetchedAt:        now,
		},
		CreatedAt: now,
		UpdatedAt: now,
	}

	// Clean and truncate note to enforce Section 6 limits
	notes.CleanAndTruncateNote(note)

	// 6. Embed title + "\n" + summary + "\n" + takeaways joined
	embedText := note.Title + "\n" + note.Summary + "\n" + strings.Join(note.Takeaways, "\n")
	h := sha256.Sum256([]byte(embedText))
	note.EmbeddingTextHash = hex.EncodeToString(h[:])
	note.EmbeddingModel = "gemini-embedding-001"

	vec, err := p.embedder.Embed(ctx, embedText, ai.TaskRetrievalDocument)
	if err != nil {
		p.logger.Error("embedding failed", slog.String("error", err.Error()))
		return nil, ai.ErrEmbedFailed
	}
	note.Embedding = firestore.Vector32(vec)

	// 7. Store transcript object if keepTranscript is true
	if keepTranscript && p.blobStore != nil {
		gzData, err := gzipTranscript(transcript)
		if err == nil {
			blobKey := fmt.Sprintf("transcripts/%s.json.gz", note.ID)
			if putErr := p.blobStore.Put(ctx, blobKey, gzData); putErr != nil {
				p.logger.Error("failed to write transcript to blob store", slog.String("error", putErr.Error()))
				note.HasTranscript = false
				note.TranscriptBytes = 0
			} else {
				note.HasTranscript = true
				note.TranscriptBytes = len(gzData)
			}
		} else {
			p.logger.Error("failed to gzip transcript", slog.String("error", err.Error()))
		}
	}

	// Save note document in store. If this fails, remove the transcript object
	// so nothing is left behind that no note refers to.
	if err := p.store.CreateNote(ctx, note); err != nil {
		p.logger.Error("failed to store note", slog.String("error", err.Error()))
		if note.HasTranscript && p.blobStore != nil {
			blobKey := fmt.Sprintf("transcripts/%s.json.gz", note.ID)
			if delErr := p.blobStore.Delete(ctx, blobKey); delErr != nil {
				p.logger.Error("failed to remove orphan transcript", slog.String("key", blobKey), slog.String("error", delErr.Error()))
			}
		}
		return nil, err
	}

	return note, nil
}

func gzipTranscript(t notes.Transcript) ([]byte, error) {
	data, err := json.Marshal(t)
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	gw := gzip.NewWriter(&buf)
	if _, err := gw.Write(data); err != nil {
		_ = gw.Close()
		return nil, err
	}
	if err := gw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func (p *Pipeline) truncateTranscript(t notes.Transcript) notes.Transcript {
	maxChars := p.cfg.MaxSummariserChars
	var totalChars int
	for _, m := range t.Messages {
		totalChars += len(m.Content)
	}

	if totalChars <= maxChars {
		return t
	}

	// Keep head and tail with a marker in the middle
	budget := maxChars - 100 // reserve for marker
	half := budget / 2

	var headMessages []notes.TranscriptMessage
	var headChars int
	for _, m := range t.Messages {
		if headChars+len(m.Content) <= half {
			headMessages = append(headMessages, m)
			headChars += len(m.Content)
		} else {
			remaining := half - headChars
			if remaining > 50 {
				headMessages = append(headMessages, notes.TranscriptMessage{
					Role:    m.Role,
					Content: notes.TruncateString(m.Content, remaining),
				})
			}
			break
		}
	}

	var tailMessages []notes.TranscriptMessage
	var tailChars int
	for i := len(t.Messages) - 1; i >= 0; i-- {
		m := t.Messages[i]
		if tailChars+len(m.Content) <= half {
			tailMessages = append([]notes.TranscriptMessage{m}, tailMessages...)
			tailChars += len(m.Content)
		} else {
			remaining := half - tailChars
			if remaining > 50 {
				tailMessages = append([]notes.TranscriptMessage{{
					Role:    m.Role,
					Content: m.Content[len(m.Content)-remaining:],
				}}, tailMessages...)
			}
			break
		}
	}

	marker := notes.TranscriptMessage{
		Role:    "system",
		Content: "\n\n[... middle of conversation truncated for summarisation ...]\n\n",
	}

	var combined []notes.TranscriptMessage
	combined = append(combined, headMessages...)
	combined = append(combined, marker)
	combined = append(combined, tailMessages...)

	cp := t
	cp.Messages = combined
	return cp
}
