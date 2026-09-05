package httpapi

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ainotes/internal/ai"
	"ainotes/internal/notes"
	"ainotes/internal/store"

	"cloud.google.com/go/firestore"
)

type NoteListItem struct {
	ID              string       `json:"id"`
	OwnerUID        string       `json:"owner_uid"`
	Visibility      string       `json:"visibility"`
	Title           string       `json:"title"`
	Summary         string       `json:"summary"`
	Takeaways       []string     `json:"takeaways"`
	Category        string       `json:"category"`
	Tags            []string     `json:"tags"`
	Source          notes.Source `json:"source"`
	HasTranscript   bool         `json:"has_transcript"`
	TranscriptBytes int          `json:"transcript_bytes,omitempty"`
	CreatedAt       time.Time    `json:"created_at"`
	UpdatedAt       time.Time    `json:"updated_at"`
	Distance        *float64     `json:"distance,omitempty"`
}

func toNoteListItem(n *notes.Note, dist *float64) NoteListItem {
	return NoteListItem{
		ID:              n.ID,
		OwnerUID:        n.OwnerUID,
		Visibility:      n.Visibility,
		Title:           n.Title,
		Summary:         notes.TruncateString(n.Summary, 300),
		Takeaways:       n.Takeaways,
		Category:        n.Category,
		Tags:            n.Tags,
		Source:          n.Source,
		HasTranscript:   n.HasTranscript,
		TranscriptBytes: n.TranscriptBytes,
		CreatedAt:       n.CreatedAt,
		UpdatedAt:       n.UpdatedAt,
		Distance:        dist,
	}
}

type ListNotesResponse struct {
	Notes      []NoteListItem `json:"notes"`
	NextCursor string         `json:"next_cursor,omitempty"`
}

type SearchNotesResponse struct {
	Notes []NoteListItem `json:"notes"`
}

func (s *Server) handleListNotes(w http.ResponseWriter, r *http.Request) {
	tok, ok := UserFromContext(r.Context())
	if !ok || tok == nil {
		writeError(w, ErrCodeUnauthenticated)
		return
	}

	category := strings.TrimSpace(r.URL.Query().Get("category"))
	cursor := strings.TrimSpace(r.URL.Query().Get("cursor"))

	limit := 30
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
			limit = l
			if limit > 100 {
				limit = 100
			}
		}
	}

	notesList, nextCursor, err := s.store.ListNotes(r.Context(), tok.UID, category, cursor, limit)
	if err != nil {
		s.logger.Error("failed to list notes", slog.String("uid", tok.UID), slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}

	items := make([]NoteListItem, 0, len(notesList))
	for _, n := range notesList {
		items = append(items, toNoteListItem(n, nil))
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(ListNotesResponse{
		Notes:      items,
		NextCursor: nextCursor,
	})
}

func (s *Server) handleSearchNotes(w http.ResponseWriter, r *http.Request) {
	tok, ok := UserFromContext(r.Context())
	if !ok || tok == nil {
		writeError(w, ErrCodeUnauthenticated)
		return
	}

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" || len(q) > 500 {
		writeError(w, ErrCodeInvalidArgument)
		return
	}

	if s.embedder == nil {
		s.logger.Error("embedder not configured")
		writeError(w, ErrCodeInternalError)
		return
	}

	category := strings.TrimSpace(r.URL.Query().Get("category"))
	limit := 10
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
			limit = l
			if limit > 30 {
				limit = 30
			}
		}
	}

	vec, err := s.embedder.Embed(r.Context(), q, ai.TaskRetrievalQuery)
	if err != nil {
		s.logger.Error("failed to embed search query", slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}

	results, err := s.store.SearchNotes(r.Context(), tok.UID, category, vec, limit)
	if err != nil {
		s.logger.Error("failed to search notes", slog.String("uid", tok.UID), slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}

	items := make([]NoteListItem, 0, len(results))
	for _, res := range results {
		d := res.Distance
		items = append(items, toNoteListItem(res.Note, &d))
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(SearchNotesResponse{
		Notes: items,
	})
}

func (s *Server) handleGetNote(w http.ResponseWriter, r *http.Request) {
	tok, ok := UserFromContext(r.Context())
	if !ok || tok == nil {
		writeError(w, ErrCodeUnauthenticated)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		writeError(w, ErrCodeNotFound)
		return
	}

	note, err := s.store.GetNote(r.Context(), tok.UID, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, ErrCodeNotFound)
			return
		}
		s.logger.Error("failed to get note", slog.String("id", id), slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(note)
}

type UpdateNoteRequest struct {
	Title     *string   `json:"title"`
	Summary   *string   `json:"summary"`
	Takeaways *[]string `json:"takeaways"`
	Category  *string   `json:"category"`
	Tags      *[]string `json:"tags"`
}

func (s *Server) handlePatchNote(w http.ResponseWriter, r *http.Request) {
	tok, ok := UserFromContext(r.Context())
	if !ok || tok == nil {
		writeError(w, ErrCodeUnauthenticated)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		writeError(w, ErrCodeNotFound)
		return
	}

	note, err := s.store.GetNote(r.Context(), tok.UID, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, ErrCodeNotFound)
			return
		}
		s.logger.Error("failed to get note for patch", slog.String("id", id), slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}

	var req UpdateNoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, ErrCodeInvalidArgument)
		return
	}

	if req.Title != nil {
		note.Title = *req.Title
	}
	if req.Summary != nil {
		note.Summary = *req.Summary
	}
	if req.Takeaways != nil {
		note.Takeaways = *req.Takeaways
	}
	if req.Category != nil {
		note.Category = notes.Normalise(*req.Category)
	}
	if req.Tags != nil {
		note.Tags = *req.Tags
	}

	// Enforce taxonomy, casing, tag bounds, and field length limits
	notes.CleanAndTruncateNote(note)

	// Check if re-embedding is necessary
	embedText := note.Title + "\n" + note.Summary + "\n" + strings.Join(note.Takeaways, "\n")
	h := sha256.Sum256([]byte(embedText))
	newHash := hex.EncodeToString(h[:])

	if newHash != note.EmbeddingTextHash && s.embedder != nil {
		vec, err := s.embedder.Embed(r.Context(), embedText, ai.TaskRetrievalDocument)
		if err != nil {
			s.logger.Error("failed to re-embed note", slog.String("id", id), slog.String("error", err.Error()))
			writeError(w, ErrCodeInternalError)
			return
		}
		note.EmbeddingTextHash = newHash
		note.EmbeddingModel = "gemini-embedding-001"
		note.Embedding = firestore.Vector32(vec)
	}

	note.UpdatedAt = time.Now().UTC()
	updated, err := s.store.UpdateNote(r.Context(), tok.UID, note)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, ErrCodeNotFound)
			return
		}
		s.logger.Error("failed to update note", slog.String("id", id), slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(updated)
}

func (s *Server) handleDeleteNote(w http.ResponseWriter, r *http.Request) {
	tok, ok := UserFromContext(r.Context())
	if !ok || tok == nil {
		writeError(w, ErrCodeUnauthenticated)
		return
	}

	id := r.PathValue("id")
	if id == "" {
		writeError(w, ErrCodeNotFound)
		return
	}

	note, err := s.store.GetNote(r.Context(), tok.UID, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, ErrCodeNotFound)
			return
		}
		s.logger.Error("failed to get note for delete", slog.String("id", id), slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}

	if note.HasTranscript && s.blobStore != nil {
		blobKey := fmt.Sprintf("transcripts/%s.json.gz", id)
		if err := s.blobStore.Delete(r.Context(), blobKey); err != nil && !errors.Is(err, store.ErrBlobNotFound) {
			s.logger.Warn("failed to delete transcript blob", slog.String("key", blobKey), slog.String("error", err.Error()))
		}
	}

	if err := s.store.DeleteNote(r.Context(), tok.UID, id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, ErrCodeNotFound)
			return
		}
		s.logger.Error("failed to delete note", slog.String("id", id), slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

type CreateNoteRequest struct {
	Title          string            `json:"title"`
	Summary        string            `json:"summary"`
	Takeaways      []string          `json:"takeaways"`
	CodeBlocks     []notes.CodeBlock `json:"code_blocks,omitempty"`
	Category       string            `json:"category,omitempty"`
	Tags           []string          `json:"tags,omitempty"`
	Source         notes.Source      `json:"source"`
	Transcript     *notes.Transcript `json:"transcript,omitempty"`
	KeepTranscript *bool             `json:"keep_transcript,omitempty"`
}

var allowedNoteProviders = map[string]bool{
	"chatgpt":    true,
	"claude":     true,
	"gemini":     true,
	"grok":       true,
	"perplexity": true,
	"other":      true,
}

func (s *Server) handleCreateNote(w http.ResponseWriter, r *http.Request) {
	tok, ok := UserFromContext(r.Context())
	if !ok || tok == nil {
		writeError(w, ErrCodeUnauthenticated)
		return
	}

	var req CreateNoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, ErrCodeInvalidArgument)
		return
	}

	if strings.TrimSpace(req.Summary) == "" || len(req.Takeaways) < 1 {
		writeError(w, ErrCodeInvalidArgument)
		return
	}

	provider := strings.ToLower(strings.TrimSpace(req.Source.Provider))
	if !allowedNoteProviders[provider] {
		writeError(w, ErrCodeInvalidArgument)
		return
	}
	req.Source.Provider = provider

	keepTranscript := true
	if req.KeepTranscript != nil {
		keepTranscript = *req.KeepTranscript
	} else {
		if user, err := s.store.GetUser(r.Context(), tok.UID); err == nil {
			keepTranscript = user.DefaultKeepTranscript
		}
	}

	noteID, err := notes.NewNoteID()
	if err != nil {
		s.logger.Error("failed to generate note id", slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}

	now := time.Now().UTC()
	if req.Source.FetchedAt.IsZero() {
		req.Source.FetchedAt = now
	}

	note := &notes.Note{
		ID:         noteID,
		OwnerUID:   tok.UID,
		Visibility: "private",
		Title:      req.Title,
		Summary:    req.Summary,
		Takeaways:  req.Takeaways,
		CodeBlocks: req.CodeBlocks,
		Category:   notes.Normalise(req.Category),
		Tags:       req.Tags,
		Source:     req.Source,
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	if s.pipeline == nil {
		s.logger.Error("pipeline not configured")
		writeError(w, ErrCodeInternalError)
		return
	}

	savedNote, err := s.pipeline.SaveNote(r.Context(), note, req.Transcript, keepTranscript)
	if err != nil {
		s.logger.Error("failed to save note", slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(savedNote)
}
