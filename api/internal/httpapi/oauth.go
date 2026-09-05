package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"ainotes/internal/store"
)

func (s *Server) handleRegisterOAuthClient(w http.ResponseWriter, r *http.Request) {
	var client store.OAuthClient
	if err := json.NewDecoder(r.Body).Decode(&client); err != nil {
		writeError(w, ErrCodeInvalidArgument)
		return
	}

	if client.ClientID == "" {
		writeError(w, ErrCodeInvalidArgument)
		return
	}

	if client.CreatedAt.IsZero() {
		client.CreatedAt = time.Now().UTC()
	}

	if err := s.store.CreateOAuthClient(r.Context(), &client); err != nil {
		s.logger.Error("failed to create oauth client", "error", err.Error())
		writeError(w, ErrCodeInternalError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(client)
}

func (s *Server) handleGetOAuthClient(w http.ResponseWriter, r *http.Request) {
	clientID := r.PathValue("client_id")
	if clientID == "" {
		writeError(w, ErrCodeNotFound)
		return
	}

	client, err := s.store.GetOAuthClient(r.Context(), clientID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, ErrCodeNotFound)
			return
		}
		s.logger.Error("failed to get oauth client", "error", err.Error())
		writeError(w, ErrCodeInternalError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(client)
}

type CreateOAuthCodeRequest struct {
	CodeHash            string    `json:"code_hash"`
	ClientID            string    `json:"client_id"`
	UID                 string    `json:"uid"`
	Scopes              []string  `json:"scopes"`
	CodeChallenge       string    `json:"code_challenge"`
	CodeChallengeMethod string    `json:"code_challenge_method"`
	RedirectURI         string    `json:"redirect_uri"`
	Resource            string    `json:"resource"`
	ExpiresAt           time.Time `json:"expires_at"`
}

func (s *Server) handleCreateOAuthCode(w http.ResponseWriter, r *http.Request) {
	var req CreateOAuthCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, ErrCodeInvalidArgument)
		return
	}

	if req.CodeHash == "" || req.ClientID == "" || req.UID == "" {
		writeError(w, ErrCodeInvalidArgument)
		return
	}

	code := &store.OAuthCode{
		CodeHash:            req.CodeHash,
		ClientID:            req.ClientID,
		UID:                 req.UID,
		Scopes:              req.Scopes,
		CodeChallenge:       req.CodeChallenge,
		CodeChallengeMethod: req.CodeChallengeMethod,
		RedirectURI:         req.RedirectURI,
		Resource:            req.Resource,
		ExpiresAt:           req.ExpiresAt,
	}

	if err := s.store.CreateOAuthCode(r.Context(), req.CodeHash, code); err != nil {
		s.logger.Error("failed to create oauth code", "error", err.Error())
		writeError(w, ErrCodeInternalError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

func (s *Server) handleGetOAuthCode(w http.ResponseWriter, r *http.Request) {
	hash := r.PathValue("hash")
	if hash == "" {
		writeError(w, ErrCodeNotFound)
		return
	}

	code, err := s.store.GetOAuthCode(r.Context(), hash)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, ErrCodeNotFound)
			return
		}
		s.logger.Error("failed to get oauth code", "error", err.Error())
		writeError(w, ErrCodeInternalError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(code)
}

func (s *Server) handleConsumeOAuthCode(w http.ResponseWriter, r *http.Request) {
	hash := r.PathValue("hash")
	if hash == "" {
		writeError(w, ErrCodeNotFound)
		return
	}

	code, err := s.store.ConsumeOAuthCode(r.Context(), hash)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, ErrCodeNotFound)
			return
		}
		s.logger.Error("failed to consume oauth code", "error", err.Error())
		writeError(w, ErrCodeInternalError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(code)
}

type CreateOAuthTokenRequest struct {
	TokenHash         string    `json:"token_hash"`
	Kind              string    `json:"kind"` // "access" | "refresh"
	ClientID          string    `json:"client_id"`
	UID               string    `json:"uid"`
	Scopes            []string  `json:"scopes"`
	Resource          string    `json:"resource"`
	ExpiresAt         time.Time `json:"expires_at"`
	RefreshParentHash string    `json:"refresh_parent_hash,omitempty"`
}

func (s *Server) handleCreateOAuthToken(w http.ResponseWriter, r *http.Request) {
	var req CreateOAuthTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, ErrCodeInvalidArgument)
		return
	}

	if req.TokenHash == "" || req.Kind == "" || req.ClientID == "" || req.UID == "" {
		writeError(w, ErrCodeInvalidArgument)
		return
	}

	token := &store.OAuthToken{
		TokenHash:         req.TokenHash,
		Kind:              req.Kind,
		ClientID:          req.ClientID,
		UID:               req.UID,
		Scopes:            req.Scopes,
		Resource:          req.Resource,
		ExpiresAt:         req.ExpiresAt,
		CreatedAt:         time.Now().UTC(),
		RefreshParentHash: req.RefreshParentHash,
	}

	if err := s.store.CreateOAuthToken(r.Context(), req.TokenHash, token); err != nil {
		s.logger.Error("failed to create oauth token", "error", err.Error())
		writeError(w, ErrCodeInternalError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

func (s *Server) handleGetOAuthToken(w http.ResponseWriter, r *http.Request) {
	hash := r.PathValue("hash")
	if hash == "" {
		writeError(w, ErrCodeNotFound)
		return
	}

	token, err := s.store.GetOAuthToken(r.Context(), hash)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, ErrCodeNotFound)
			return
		}
		s.logger.Error("failed to get oauth token", "error", err.Error())
		writeError(w, ErrCodeInternalError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(token)
}

func (s *Server) handleRotateOAuthToken(w http.ResponseWriter, r *http.Request) {
	hash := r.PathValue("hash")
	if hash == "" {
		writeError(w, ErrCodeNotFound)
		return
	}

	token, err := s.store.RotateOAuthToken(r.Context(), hash)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, ErrCodeNotFound)
			return
		}
		s.logger.Error("failed to rotate oauth token", "error", err.Error())
		writeError(w, ErrCodeInternalError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(token)
}

func (s *Server) handleRevokeOAuthToken(w http.ResponseWriter, r *http.Request) {
	hash := r.PathValue("hash")
	if hash == "" {
		writeError(w, ErrCodeNotFound)
		return
	}

	if err := s.store.RevokeOAuthToken(r.Context(), hash); err != nil {
		s.logger.Error("failed to revoke oauth token", "error", err.Error())
		writeError(w, ErrCodeInternalError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
