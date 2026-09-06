package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ainotes/internal/notes"
	"ainotes/internal/store"
)

type PublicSource struct {
	Provider         string     `json:"provider"`
	ShareURL         string     `json:"share_url,omitempty"`
	Model            string     `json:"model,omitempty"`
	ConversationDate *time.Time `json:"conversation_date,omitempty"`
}

type PublicNote struct {
	ID          string            `json:"id"`
	Title       string            `json:"title"`
	Summary     string            `json:"summary"`
	Takeaways   []string          `json:"takeaways"`
	CodeBlocks  []notes.CodeBlock `json:"code_blocks,omitempty"`
	Category    string            `json:"category"`
	Tags        []string          `json:"tags"`
	Source      PublicSource      `json:"source"`
	Visibility  string            `json:"visibility"`
	PublishedAt *time.Time        `json:"published_at,omitempty"`
	CreatedAt   time.Time         `json:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at"`
}

func toPublicNote(n *notes.Note) PublicNote {
	return PublicNote{
		ID:         n.ID,
		Title:      n.Title,
		Summary:    n.Summary,
		Takeaways:  n.Takeaways,
		CodeBlocks: n.CodeBlocks,
		Category:   n.Category,
		Tags:       n.Tags,
		Source: PublicSource{
			Provider:         n.Source.Provider,
			ShareURL:         n.Source.ShareURL,
			Model:            n.Source.Model,
			ConversationDate: n.Source.ConversationDate,
		},
		Visibility:  n.Visibility,
		PublishedAt: n.PublishedAt,
		CreatedAt:   n.CreatedAt,
		UpdatedAt:   n.UpdatedAt,
	}
}

type ListPublicNotesResponse struct {
	Notes      []PublicNote `json:"notes"`
	NextCursor string       `json:"next_cursor,omitempty"`
}

func (s *Server) handleGetPublicNote(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		writeError(w, ErrCodeNotFound)
		return
	}

	note, err := s.store.GetPublicNote(r.Context(), id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, ErrCodeNotFound)
			return
		}
		s.logger.Error("failed to get public note", slog.String("id", id), slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}

	w.Header().Set("Cache-Control", "public, max-age=60")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(toPublicNote(note))
}

func (s *Server) handleListPublicNotes(w http.ResponseWriter, r *http.Request) {
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

	publicNotes, nextCursor, err := s.store.ListPublicNotes(r.Context(), category, cursor, limit)
	if err != nil {
		s.logger.Error("failed to list public notes", slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}

	items := make([]PublicNote, 0, len(publicNotes))
	for _, n := range publicNotes {
		items = append(items, toPublicNote(n))
	}

	w.Header().Set("Cache-Control", "public, max-age=60")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(ListPublicNotesResponse{
		Notes:      items,
		NextCursor: nextCursor,
	})
}
