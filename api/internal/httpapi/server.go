package httpapi

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"time"

	"ainotes/internal/ai"
	"ainotes/internal/config"
	"ainotes/internal/ingest"
	"ainotes/internal/store"
)

type ServerDeps struct {
	Config     *config.Config
	Store      store.Store
	BlobStore  store.BlobStore
	Verifier   TokenVerifier
	Pipeline   *ingest.Pipeline
	Embedder   ai.Embedder
	AuthClient AuthUserDeleter
	Logger     *slog.Logger
}

type Server struct {
	cfg        *config.Config
	store      store.Store
	blobStore  store.BlobStore
	verifier   TokenVerifier
	pipeline   *ingest.Pipeline
	embedder   ai.Embedder
	authClient AuthUserDeleter
	logger     *slog.Logger
	handler    http.Handler
}

func NewCloudLoggingLogger() *slog.Logger {
	opts := &slog.HandlerOptions{
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			if a.Key == slog.LevelKey {
				a.Key = "severity"
				level, ok := a.Value.Any().(slog.Level)
				if !ok {
					return a
				}
				switch {
				case level < slog.LevelInfo:
					a.Value = slog.StringValue("DEBUG")
				case level < slog.LevelWarn:
					a.Value = slog.StringValue("INFO")
				case level < slog.LevelError:
					a.Value = slog.StringValue("WARNING")
				default:
					a.Value = slog.StringValue("ERROR")
				}
			} else if a.Key == slog.MessageKey {
				a.Key = "message"
			}
			return a
		},
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, opts))
}

func NewServer(deps ServerDeps) *Server {
	logger := deps.Logger
	if logger == nil {
		logger = NewCloudLoggingLogger()
	}

	s := &Server{
		cfg:        deps.Config,
		store:      deps.Store,
		blobStore:  deps.BlobStore,
		verifier:   deps.Verifier,
		pipeline:   deps.Pipeline,
		embedder:   deps.Embedder,
		authClient: deps.AuthClient,
		logger:     logger,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.handleHealthz)

	// User endpoints
	mux.Handle("GET /v1/me", s.requireUser(http.HandlerFunc(s.handleMe)))
	mux.Handle("PATCH /v1/me", s.requireUser(http.HandlerFunc(s.handlePatchMe)))
	mux.Handle("GET /v1/me/export", s.requireUser(http.HandlerFunc(s.handleExportMe)))
	mux.Handle("DELETE /v1/me", s.requireUser(http.HandlerFunc(s.handleDeleteMe)))

	// Ingest endpoint
	mux.Handle("POST /v1/ingest", s.requireUser(http.HandlerFunc(s.handleIngest)))

	// Notes endpoints
	mux.Handle("GET /v1/notes", s.requireUser(http.HandlerFunc(s.handleListNotes)))
	mux.Handle("GET /v1/notes/search", s.requireUser(http.HandlerFunc(s.handleSearchNotes)))
	mux.Handle("GET /v1/notes/{id}", s.requireUser(http.HandlerFunc(s.handleGetNote)))
	mux.Handle("PATCH /v1/notes/{id}", s.requireUser(http.HandlerFunc(s.handlePatchNote)))
	mux.Handle("DELETE /v1/notes/{id}", s.requireUser(http.HandlerFunc(s.handleDeleteNote)))

	// Transcript endpoints
	mux.Handle("GET /v1/notes/{id}/transcript", s.requireUser(http.HandlerFunc(s.handleGetTranscript)))
	mux.Handle("DELETE /v1/notes/{id}/transcript", s.requireUser(http.HandlerFunc(s.handleDeleteTranscript)))

	s.handler = s.accessLogMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, pattern := mux.Handler(r)
		if pattern == "" {
			writeError(w, ErrCodeNotFound)
			return
		}
		mux.ServeHTTP(w, r)
	}))

	return s
}

func (s *Server) Handler() http.Handler {
	return s.handler
}

func (s *Server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	s.respondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) respondJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		s.logger.Error("failed to write json response", slog.String("error", err.Error()))
	}
}

type responseRecorder struct {
	http.ResponseWriter
	statusCode  int
	wroteHeader bool
}

func (r *responseRecorder) WriteHeader(code int) {
	if !r.wroteHeader {
		r.statusCode = code
		r.wroteHeader = true
	}
	r.ResponseWriter.WriteHeader(code)
}

func (s *Server) accessLogMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &responseRecorder{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(rec, r)
		duration := time.Since(start)

		s.logger.Info("request completed",
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.Int("status", rec.statusCode),
			slog.Duration("duration", duration),
		)
	})
}
