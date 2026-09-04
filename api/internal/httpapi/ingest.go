package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"ainotes/internal/ingest"
)

func (s *Server) handleIngest(w http.ResponseWriter, r *http.Request) {
	tok, ok := UserFromContext(r.Context())
	if !ok || tok == nil {
		writeError(w, ErrCodeUnauthenticated)
		return
	}

	var req ingest.IngestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, ErrCodeInvalidArgument)
		return
	}
	req.UID = tok.UID

	if s.pipeline == nil {
		s.logger.Error("pipeline is not configured on server")
		writeError(w, ErrCodeInternalError)
		return
	}

	note, err := s.pipeline.Ingest(r.Context(), req)
	if err != nil {
		s.logger.Warn("ingest failed", slog.String("uid", tok.UID), slog.String("error", err.Error()))
		writeError(w, mapIngestError(err))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(note); err != nil {
		s.logger.Error("failed to write ingest response", slog.String("error", err.Error()))
	}
}
