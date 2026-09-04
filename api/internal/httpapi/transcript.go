package httpapi

import (
	"bytes"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"ainotes/internal/store"
)

func (s *Server) handleGetTranscript(w http.ResponseWriter, r *http.Request) {
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
		writeError(w, ErrCodeNotFound)
		return
	}

	if !note.HasTranscript || s.blobStore == nil {
		writeError(w, ErrCodeNotFound)
		return
	}

	blobKey := fmt.Sprintf("transcripts/%s.json.gz", id)
	gzData, err := s.blobStore.Get(r.Context(), blobKey)
	if err != nil {
		if errors.Is(err, store.ErrBlobNotFound) {
			writeError(w, ErrCodeNotFound)
			return
		}
		s.logger.Error("failed to get transcript blob", slog.String("key", blobKey), slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}

	gr, err := gzip.NewReader(bytes.NewReader(gzData))
	if err != nil {
		s.logger.Error("failed to decompress transcript gzip", slog.String("key", blobKey), slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}
	defer gr.Close()

	decompressed, err := io.ReadAll(gr)
	if err != nil {
		s.logger.Error("failed to read decompressed transcript", slog.String("key", blobKey), slog.String("error", err.Error()))
		writeError(w, ErrCodeInternalError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(decompressed)
}

func (s *Server) handleDeleteTranscript(w http.ResponseWriter, r *http.Request) {
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
		writeError(w, ErrCodeNotFound)
		return
	}

	if note.HasTranscript {
		if s.blobStore != nil {
			blobKey := fmt.Sprintf("transcripts/%s.json.gz", id)
			if err := s.blobStore.Delete(r.Context(), blobKey); err != nil && !errors.Is(err, store.ErrBlobNotFound) {
				s.logger.Warn("failed to delete transcript blob", slog.String("key", blobKey), slog.String("error", err.Error()))
			}
		}

		note.HasTranscript = false
		note.TranscriptBytes = 0
		note.UpdatedAt = time.Now().UTC()
		if _, err := s.store.UpdateNote(r.Context(), tok.UID, note); err != nil {
			s.logger.Error("failed to update note after transcript deletion", slog.String("id", id), slog.String("error", err.Error()))
			writeError(w, ErrCodeInternalError)
			return
		}
	}

	w.WriteHeader(http.StatusNoContent)
}
