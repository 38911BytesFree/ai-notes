package httpapi

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"ainotes/internal/notes"
	"ainotes/internal/store"
)

type CreatePATRequest struct {
	Label string `json:"label"`
}

type CreatePATResponse struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Prefix string `json:"prefix"`
	Token  string `json:"token"`
}

type PATItem struct {
	ID         string     `json:"id"`
	Label      string     `json:"label"`
	Prefix     string     `json:"prefix"`
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
}

type ListPATsResponse struct {
	PATs []PATItem `json:"pats"`
}

func (s *Server) handleListPATs(w http.ResponseWriter, r *http.Request) {
	tok, ok := UserFromContext(r.Context())
	if !ok || tok == nil {
		writeError(w, ErrCodeUnauthenticated)
		return
	}

	pats, err := s.store.ListPATs(r.Context(), tok.UID)
	if err != nil {
		s.logger.Error("failed to list pats", "uid", tok.UID, "error", err.Error())
		writeError(w, ErrCodeInternalError)
		return
	}

	items := make([]PATItem, 0, len(pats))
	for _, p := range pats {
		items = append(items, PATItem{
			ID:         p.ID,
			Label:      p.Label,
			Prefix:     p.Prefix,
			CreatedAt:  p.CreatedAt,
			LastUsedAt: p.LastUsedAt,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(ListPATsResponse{PATs: items})
}

func (s *Server) handleCreatePAT(w http.ResponseWriter, r *http.Request) {
	tok, ok := UserFromContext(r.Context())
	if !ok || tok == nil {
		writeError(w, ErrCodeUnauthenticated)
		return
	}

	var req CreatePATRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, ErrCodeInvalidArgument)
		return
	}

	label := strings.TrimSpace(req.Label)
	if label == "" || len(label) > 60 {
		writeError(w, ErrCodeInvalidArgument)
		return
	}

	rawBytes := make([]byte, 32)
	if _, err := rand.Read(rawBytes); err != nil {
		s.logger.Error("failed to generate random bytes for pat", "error", err.Error())
		writeError(w, ErrCodeInternalError)
		return
	}
	tokenStr := "ain_pat_" + base64.RawURLEncoding.EncodeToString(rawBytes)
	prefix := tokenStr[:12]

	h := sha256.Sum256([]byte(tokenStr))
	tokenHash := hex.EncodeToString(h[:])

	patID, err := notes.NewNoteID()
	if err != nil {
		s.logger.Error("failed to generate pat id", "error", err.Error())
		writeError(w, ErrCodeInternalError)
		return
	}

	now := time.Now().UTC()
	pat := &store.PATToken{
		ID:        patID,
		TokenHash: tokenHash,
		UID:       tok.UID,
		Label:     label,
		Prefix:    prefix,
		Scopes:    []string{"notes:read", "notes:write"},
		CreatedAt: now,
	}

	if err := s.store.CreatePAT(r.Context(), tokenHash, pat); err != nil {
		s.logger.Error("failed to store pat", "uid", tok.UID, "error", err.Error())
		writeError(w, ErrCodeInternalError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(CreatePATResponse{
		ID:     pat.ID,
		Label:  pat.Label,
		Prefix: pat.Prefix,
		Token:  tokenStr,
	})
}

func (s *Server) handleDeletePAT(w http.ResponseWriter, r *http.Request) {
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

	if err := s.store.RevokePAT(r.Context(), tok.UID, id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, ErrCodeNotFound)
			return
		}
		s.logger.Error("failed to revoke pat", "id", id, "error", err.Error())
		writeError(w, ErrCodeInternalError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleGetPATByHash(w http.ResponseWriter, r *http.Request) {
	hash := r.PathValue("hash")
	if hash == "" {
		writeError(w, ErrCodeNotFound)
		return
	}

	pat, err := s.store.GetPATByHash(r.Context(), hash)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, ErrCodeNotFound)
			return
		}
		s.logger.Error("failed to lookup pat by hash", "error", err.Error())
		writeError(w, ErrCodeInternalError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(pat)
}
