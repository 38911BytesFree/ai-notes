package httpapi

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"ainotes/internal/store"
)

type SetVisibilityRequest struct {
	Visibility     string `json:"visibility"`
	AcknowledgePII bool   `json:"acknowledge_pii"`
}

func (s *Server) handleSetVisibility(w http.ResponseWriter, r *http.Request) {
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

	var req SetVisibilityRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, ErrCodeInvalidArgument)
		return
	}

	vis := strings.ToLower(strings.TrimSpace(req.Visibility))
	if vis != "private" && vis != "unlisted" && vis != "public" {
		writeError(w, ErrCodeInvalidArgument)
		return
	}

	ack := ""
	if req.AcknowledgePII {
		ack = "true"
	}

	updated, err := s.store.SetNoteVisibility(r.Context(), tok.UID, id, vis, ack)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, ErrCodeNotFound)
			return
		}
		if errors.Is(err, store.ErrInvalidArgument) {
			writeError(w, ErrCodeInvalidArgument)
			return
		}
		if errors.Is(err, store.ErrPIIUnacknowledged) {
			writeError(w, ErrCodePIIUnacknowledged)
			return
		}
		s.logger.Error("failed to set note visibility", slog.String("id", id), slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(updated)
}
