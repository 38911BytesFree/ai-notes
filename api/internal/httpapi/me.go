package httpapi

import (
	"bytes"
	"compress/gzip"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"ainotes/internal/notes"
	"ainotes/internal/store"
)

type MeResponse struct {
	UID                   string `json:"uid"`
	Email                 string `json:"email"`
	DisplayName           string `json:"display_name"`
	DefaultKeepTranscript bool   `json:"default_keep_transcript"`
	IngestCount           int    `json:"ingest_count"`
	IngestLimit           int    `json:"ingest_limit"`
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	tok, ok := UserFromContext(r.Context())
	if !ok || tok == nil {
		writeError(w, ErrCodeUnauthenticated)
		return
	}

	email, _ := tok.Claims["email"].(string)
	displayName, _ := tok.Claims["name"].(string)

	u := store.User{
		UID:         tok.UID,
		Email:       email,
		DisplayName: displayName,
	}

	if err := s.store.UpsertUser(r.Context(), u); err != nil {
		s.logger.Error("failed to upsert user", slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}

	user, err := s.store.GetUser(r.Context(), tok.UID)
	if err != nil {
		s.logger.Error("failed to get user", slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}

	currentPeriod := time.Now().UTC().Format("2006-01")
	ingestCount := 0
	if user.IngestPeriod == currentPeriod {
		ingestCount = user.IngestCount
	}

	limit := 30
	if s.cfg != nil && s.cfg.IngestMonthlyLimit > 0 {
		limit = s.cfg.IngestMonthlyLimit
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(MeResponse{
		UID:                   user.UID,
		Email:                 user.Email,
		DisplayName:           user.DisplayName,
		DefaultKeepTranscript: user.DefaultKeepTranscript,
		IngestCount:           ingestCount,
		IngestLimit:           limit,
	})
}

type PatchMeRequest struct {
	DefaultKeepTranscript bool `json:"default_keep_transcript"`
}

func (s *Server) handlePatchMe(w http.ResponseWriter, r *http.Request) {
	tok, ok := UserFromContext(r.Context())
	if !ok || tok == nil {
		writeError(w, ErrCodeUnauthenticated)
		return
	}

	var req PatchMeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, ErrCodeInvalidArgument)
		return
	}

	user, err := s.store.UpdateUserSettings(r.Context(), tok.UID, req.DefaultKeepTranscript)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, ErrCodeNotFound)
			return
		}
		s.logger.Error("failed to update user settings", slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}

	currentPeriod := time.Now().UTC().Format("2006-01")
	ingestCount := 0
	if user.IngestPeriod == currentPeriod {
		ingestCount = user.IngestCount
	}

	limit := 30
	if s.cfg != nil && s.cfg.IngestMonthlyLimit > 0 {
		limit = s.cfg.IngestMonthlyLimit
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(MeResponse{
		UID:                   user.UID,
		Email:                 user.Email,
		DisplayName:           user.DisplayName,
		DefaultKeepTranscript: user.DefaultKeepTranscript,
		IngestCount:           ingestCount,
		IngestLimit:           limit,
	})
}

type ExportNote struct {
	*notes.Note
	Transcript *notes.Transcript `json:"transcript,omitempty"`
}

type ExportResponse struct {
	User  store.User   `json:"user"`
	Notes []ExportNote `json:"notes"`
}

func (s *Server) handleExportMe(w http.ResponseWriter, r *http.Request) {
	tok, ok := UserFromContext(r.Context())
	if !ok || tok == nil {
		writeError(w, ErrCodeUnauthenticated)
		return
	}

	user, err := s.store.GetUser(r.Context(), tok.UID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, ErrCodeNotFound)
			return
		}
		s.logger.Error("failed to get user for export", slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}

	notesList, err := s.store.GetNotesForExport(r.Context(), tok.UID)
	if err != nil {
		s.logger.Error("failed to get notes for export", slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}

	exportNotes := make([]ExportNote, 0, len(notesList))
	for _, n := range notesList {
		en := ExportNote{Note: n}
		if n.HasTranscript && s.blobStore != nil {
			blobKey := fmt.Sprintf("transcripts/%s.json.gz", n.ID)
			gzData, err := s.blobStore.Get(r.Context(), blobKey)
			if err == nil {
				gr, err := gzip.NewReader(bytes.NewReader(gzData))
				if err == nil {
					var t notes.Transcript
					if jsonErr := json.NewDecoder(gr).Decode(&t); jsonErr == nil {
						en.Transcript = &t
					}
					_ = gr.Close()
				}
			}
		}
		exportNotes = append(exportNotes, en)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(ExportResponse{
		User:  user,
		Notes: exportNotes,
	})
}

func (s *Server) handleDeleteMe(w http.ResponseWriter, r *http.Request) {
	tok, ok := UserFromContext(r.Context())
	if !ok || tok == nil {
		writeError(w, ErrCodeUnauthenticated)
		return
	}

	ctx := r.Context()

	// 1. Delete all notes and user doc, retrieving note IDs for transcript deletion
	noteIDs, err := s.store.DeleteAllForUser(ctx, tok.UID)
	if err != nil {
		s.logger.Error("failed to delete user notes and data", slog.String("uid", tok.UID), slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}

	// 2. Delete transcript objects from blob store
	if s.blobStore != nil {
		for _, noteID := range noteIDs {
			blobKey := fmt.Sprintf("transcripts/%s.json.gz", noteID)
			_ = s.blobStore.Delete(ctx, blobKey)
		}
	}

	// 3. Delete Firebase Auth user
	if s.authClient != nil {
		if err := s.authClient.DeleteUser(ctx, tok.UID); err != nil {
			// Data is gone but the login still exists; the user must retry so the
			// auth record is removed too. Reporting success here would leave a
			// sign-in that lands on a fresh empty account.
			s.logger.Error("failed to delete firebase auth user", slog.String("uid", tok.UID), slog.String("error", err.Error()))
			writeError(w, ErrCodeInternalError)
			return
		}
	}

	w.WriteHeader(http.StatusNoContent)
}
