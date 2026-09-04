package ingest_test

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"ainotes/internal/ai"
	"ainotes/internal/ingest"
	"ainotes/internal/notes"
	"ainotes/internal/store"
)

type mockFetcher struct {
	t   notes.Transcript
	err error
}

func (m *mockFetcher) Match(host string) bool { return true }
func (m *mockFetcher) Fetch(ctx context.Context, rawURL string) (notes.Transcript, error) {
	return m.t, m.err
}

func setupPipeline(t *testing.T, monthlyLimit int, maxChars int) (*ingest.Pipeline, *store.MemoryStore, *store.MemoryBlobStore) {
	t.Helper()
	st := store.NewMemoryStore()
	bs := store.NewMemoryBlobStore()
	sum := ai.NewFakeSummariser()
	emb := ai.NewFakeEmbedder()

	p := ingest.NewPipeline(
		ingest.PipelineConfig{
			MaxSummariserChars: maxChars,
			MonthlyLimit:       monthlyLimit,
		},
		st,
		bs,
		sum,
		emb,
		nil,
	)
	p.Clock = func() time.Time {
		return time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	}

	return p, st, bs
}

func TestPipeline_IngestShareURL(t *testing.T) {
	p, st, bs := setupPipeline(t, 10, 200000)
	ctx := context.Background()
	uid := "user_test_1"

	transcript := notes.Transcript{
		Provider: "chatgpt",
		Model:    "gpt-5",
		Messages: []notes.TranscriptMessage{
			{Role: "user", Content: "How do I use Go generics?"},
			{Role: "assistant", Content: "Go generics were introduced in Go 1.18. Here is how: func Map[T any](s []T) {}"},
		},
	}

	p.SetFetcherResolver(func(rawURL string) (ingest.Fetcher, error) {
		return &mockFetcher{t: transcript}, nil
	})

	keep := true
	note, err := p.Ingest(ctx, ingest.IngestRequest{
		UID:            uid,
		ShareURL:       "https://chatgpt.com/share/mock-id",
		KeepTranscript: &keep,
	})
	if err != nil {
		t.Fatalf("Ingest failed: %v", err)
	}

	if note.ID == "" {
		t.Errorf("expected non-empty note ID")
	}
	if note.OwnerUID != uid {
		t.Errorf("expected owner UID %q, got %q", uid, note.OwnerUID)
	}
	if note.Source.Provider != "chatgpt" {
		t.Errorf("expected provider chatgpt, got %q", note.Source.Provider)
	}
	if !note.HasTranscript {
		t.Errorf("expected HasTranscript true")
	}
	if note.TranscriptBytes <= 0 {
		t.Errorf("expected TranscriptBytes > 0, got %d", note.TranscriptBytes)
	}
	if len(note.Embedding) != 768 {
		t.Errorf("expected 768-dim embedding, got %d", len(note.Embedding))
	}

	// Verify transcript was written to blob store and is valid gzip
	gzData, err := bs.Get(ctx, "transcripts/"+note.ID+".json.gz")
	if err != nil {
		t.Fatalf("failed to get transcript blob: %v", err)
	}
	gr, err := gzip.NewReader(bytes.NewReader(gzData))
	if err != nil {
		t.Fatalf("failed to create gzip reader: %v", err)
	}
	defer gr.Close()

	var gotTranscript notes.Transcript
	if err := json.NewDecoder(gr).Decode(&gotTranscript); err != nil {
		t.Fatalf("failed to decode transcript from blob: %v", err)
	}
	if len(gotTranscript.Messages) != 2 {
		t.Errorf("expected 2 messages in transcript, got %d", len(gotTranscript.Messages))
	}

	// Verify store has note
	storedNote, err := st.GetNote(ctx, uid, note.ID)
	if err != nil {
		t.Fatalf("GetNote failed: %v", err)
	}
	if storedNote.Title != note.Title {
		t.Errorf("stored title %q != returned title %q", storedNote.Title, note.Title)
	}
}

func TestPipeline_IngestManualText(t *testing.T) {
	p, _, _ := setupPipeline(t, 10, 200000)
	ctx := context.Background()
	uid := "user_test_2"

	note, err := p.Ingest(ctx, ingest.IngestRequest{
		UID:      uid,
		Text:     "Here is some pasted text to summarize and index.",
		Provider: "manual",
	})
	if err != nil {
		t.Fatalf("Ingest failed: %v", err)
	}

	if note.Source.Provider != "manual" {
		t.Errorf("expected manual provider, got %q", note.Source.Provider)
	}
}

func TestPipeline_UnsupportedProvider(t *testing.T) {
	p, _, _ := setupPipeline(t, 10, 200000)
	ctx := context.Background()

	// Empty request
	_, err := p.Ingest(ctx, ingest.IngestRequest{UID: "u1"})
	if !errors.Is(err, ingest.ErrUnsupportedProvider) {
		t.Errorf("expected ErrUnsupportedProvider, got %v", err)
	}

	// Unsupported domain
	_, err = p.Ingest(ctx, ingest.IngestRequest{
		UID:      "u1",
		ShareURL: "https://example.com/share/123",
	})
	if !errors.Is(err, ingest.ErrUnsupportedProvider) {
		t.Errorf("expected ErrUnsupportedProvider for example.com, got %v", err)
	}
}

func TestPipeline_QuotaLimitReached(t *testing.T) {
	p, _, _ := setupPipeline(t, 1, 200000)
	ctx := context.Background()
	uid := "user_quota_test"

	_, err := p.Ingest(ctx, ingest.IngestRequest{
		UID:      uid,
		Text:     "First ingest",
		Provider: "manual",
	})
	if err != nil {
		t.Fatalf("first ingest should succeed, got: %v", err)
	}

	// Second ingest should hit quota
	_, err = p.Ingest(ctx, ingest.IngestRequest{
		UID:      uid,
		Text:     "Second ingest",
		Provider: "manual",
	})
	if !errors.Is(err, store.ErrIngestLimitReached) {
		t.Fatalf("expected ErrIngestLimitReached, got %v", err)
	}
}

func TestPipeline_QuotaRollbackOnFetchFailure(t *testing.T) {
	p, st, _ := setupPipeline(t, 10, 200000)
	ctx := context.Background()
	uid := "user_rollback_test"

	p.SetFetcherResolver(func(rawURL string) (ingest.Fetcher, error) {
		return &mockFetcher{err: ingest.ErrFetchBlocked}, nil
	})

	_, err := p.Ingest(ctx, ingest.IngestRequest{
		UID:      uid,
		ShareURL: "https://claude.ai/share/blocked-id",
	})
	if !errors.Is(err, ingest.ErrFetchBlocked) {
		t.Fatalf("expected ErrFetchBlocked, got %v", err)
	}

	// Verify quota was rolled back
	user, err := st.GetUser(ctx, uid)
	if err != nil {
		t.Fatalf("GetUser failed: %v", err)
	}
	if user.IngestCount != 0 {
		t.Errorf("expected IngestCount 0 after rollback, got %d", user.IngestCount)
	}
}

func TestPipeline_TranscriptTooLong(t *testing.T) {
	p, _, _ := setupPipeline(t, 10, 200000)
	ctx := context.Background()
	uid := "user_too_long"

	hugeText := strings.Repeat("x", 2*1024*1024+10)
	p.SetFetcherResolver(func(rawURL string) (ingest.Fetcher, error) {
		return &mockFetcher{
			t: notes.Transcript{
				Provider: "chatgpt",
				Messages: []notes.TranscriptMessage{
					{Role: "user", Content: hugeText},
				},
			},
		}, nil
	})

	_, err := p.Ingest(ctx, ingest.IngestRequest{
		UID:      uid,
		ShareURL: "https://chatgpt.com/share/huge",
	})
	if !errors.Is(err, ingest.ErrTranscriptTooLong) {
		t.Fatalf("expected ErrTranscriptTooLong, got %v", err)
	}
}

func TestPipeline_KeepTranscriptFalse(t *testing.T) {
	p, _, bs := setupPipeline(t, 10, 200000)
	ctx := context.Background()
	uid := "user_nokeep"

	keep := false
	note, err := p.Ingest(ctx, ingest.IngestRequest{
		UID:            uid,
		Text:           "Some conversation text",
		Provider:       "manual",
		KeepTranscript: &keep,
	})
	if err != nil {
		t.Fatalf("Ingest failed: %v", err)
	}

	if note.HasTranscript {
		t.Errorf("expected HasTranscript false")
	}
	if note.TranscriptBytes != 0 {
		t.Errorf("expected TranscriptBytes 0, got %d", note.TranscriptBytes)
	}

	// Verify blob store has no entry
	_, err = bs.Get(ctx, "transcripts/"+note.ID+".json.gz")
	if !errors.Is(err, store.ErrBlobNotFound) {
		t.Errorf("expected ErrBlobNotFound for blob, got %v", err)
	}
}
