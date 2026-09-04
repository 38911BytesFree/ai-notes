package httpapi

import (
	"log/slog"
	"net/http"

	"ainotes/internal/store"
)

type MeResponse struct {
	UID         string `json:"uid"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	tok, ok := UserFromContext(r.Context())
	if !ok || tok == nil {
		s.respondJSON(w, http.StatusUnauthorized, map[string]string{"code": "unauthenticated"})
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
		s.respondJSON(w, http.StatusInternalServerError, map[string]string{"code": "internal_error"})
		return
	}

	s.respondJSON(w, http.StatusOK, MeResponse{
		UID:         tok.UID,
		Email:       email,
		DisplayName: displayName,
	})
}
