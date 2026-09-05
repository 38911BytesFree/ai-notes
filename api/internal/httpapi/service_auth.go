package httpapi

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"google.golang.org/api/idtoken"
)

type ServiceTokenValidator interface {
	Validate(ctx context.Context, token, audience string) (string, error)
}

type GoogleIDTokenValidator struct{}

func (v *GoogleIDTokenValidator) Validate(ctx context.Context, token, audience string) (string, error) {
	payload, err := idtoken.Validate(ctx, token, audience)
	if err != nil {
		return "", err
	}
	email, _ := payload.Claims["email"].(string)
	if email == "" {
		return "", fmt.Errorf("idtoken payload missing email claim")
	}
	return email, nil
}

type TestServiceTokenValidator struct {
	Tokens map[string]string // token -> email
}

func (v *TestServiceTokenValidator) Validate(_ context.Context, token, _ string) (string, error) {
	email, ok := v.Tokens[token]
	if !ok {
		return "", fmt.Errorf("invalid service token")
	}
	return email, nil
}

func (s *Server) requireService(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			writeError(w, ErrCodeUnauthenticated)
			return
		}

		token := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		if token == "" {
			writeError(w, ErrCodeUnauthenticated)
			return
		}

		// Dev token check for local development
		if s.cfg.ServiceDevToken != "" && token == s.cfg.ServiceDevToken {
			next.ServeHTTP(w, r)
			return
		}

		if s.serviceValidator == nil {
			s.logger.Error("service token validator not configured")
			writeError(w, ErrCodeInternalError)
			return
		}

		callerEmail, err := s.serviceValidator.Validate(r.Context(), token, s.cfg.ServiceAudience)
		if err != nil {
			s.logger.Warn("service token validation failed", slog.String("error", err.Error()))
			writeError(w, ErrCodeUnauthenticated)
			return
		}

		if s.cfg.WebServiceAccount != "" && callerEmail != s.cfg.WebServiceAccount {
			s.logger.Warn("service token caller forbidden", slog.String("caller_email", callerEmail))
			writeError(w, ErrCodeForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}
