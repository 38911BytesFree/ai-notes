package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"firebase.google.com/go/v4/auth"
)

type userContextKeyType struct{}

var userContextKey = userContextKeyType{}

type TokenVerifier interface {
	Verify(ctx context.Context, idToken string) (*auth.Token, error)
}

type FirebaseTokenVerifier struct {
	client *auth.Client
}

func NewFirebaseTokenVerifier(client *auth.Client) *FirebaseTokenVerifier {
	return &FirebaseTokenVerifier{client: client}
}

func (v *FirebaseTokenVerifier) Verify(ctx context.Context, idToken string) (*auth.Token, error) {
	return v.client.VerifyIDTokenAndCheckRevoked(ctx, idToken)
}

type TestTokenVerifier struct {
	Tokens map[string]*auth.Token
}

func NewTestTokenVerifier(validToken string, token *auth.Token) *TestTokenVerifier {
	return &TestTokenVerifier{
		Tokens: map[string]*auth.Token{
			validToken: token,
		},
	}
}

func (v *TestTokenVerifier) Verify(_ context.Context, idToken string) (*auth.Token, error) {
	if tok, ok := v.Tokens[idToken]; ok {
		return tok, nil
	}
	return nil, errors.New("invalid token")
}

func UserFromContext(ctx context.Context) (*auth.Token, bool) {
	tok, ok := ctx.Value(userContextKey).(*auth.Token)
	return tok, ok
}

func (s *Server) requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			s.respondJSON(w, http.StatusUnauthorized, map[string]string{"code": "unauthenticated"})
			return
		}

		idToken := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
		if idToken == "" {
			s.respondJSON(w, http.StatusUnauthorized, map[string]string{"code": "unauthenticated"})
			return
		}

		decodedToken, err := s.verifier.Verify(r.Context(), idToken)
		if err != nil {
			s.logger.Warn("token verification failed", slog.String("error", err.Error()))
			s.respondJSON(w, http.StatusUnauthorized, map[string]string{"code": "unauthenticated"})
			return
		}

		ctx := context.WithValue(r.Context(), userContextKey, decodedToken)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
