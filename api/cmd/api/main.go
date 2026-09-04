package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"ainotes/internal/config"
	"ainotes/internal/httpapi"
	"ainotes/internal/store"

	"cloud.google.com/go/firestore"
	firebase "firebase.google.com/go/v4"
	"github.com/joho/godotenv"
)

func main() {
	// Attempt to load .env from root or current dir (optional)
	_ = godotenv.Load("../.env")
	_ = godotenv.Load(".env")

	logger := httpapi.NewCloudLoggingLogger()

	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load config", slog.String("error", err.Error()))
		os.Exit(1)
	}

	cfg.LogStartupMode(logger)

	ctx := context.Background()

	// Initialize Firebase App
	fbConfig := &firebase.Config{
		ProjectID: cfg.GoogleCloudProject,
	}
	app, err := firebase.NewApp(ctx, fbConfig)
	if err != nil {
		logger.Error("failed to initialize firebase app", slog.String("error", err.Error()))
		os.Exit(1)
	}

	authClient, err := app.Auth(ctx)
	if err != nil {
		logger.Error("failed to initialize firebase auth client", slog.String("error", err.Error()))
		os.Exit(1)
	}

	// Initialize Firestore Client
	firestoreClient, err := firestore.NewClient(ctx, cfg.GoogleCloudProject)
	if err != nil {
		logger.Error("failed to initialize firestore client", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer firestoreClient.Close()

	userStore := store.NewFirestoreStore(firestoreClient)
	verifier := httpapi.NewFirebaseTokenVerifier(authClient)
	srv := httpapi.NewServer(cfg, userStore, verifier, logger)

	httpServer := &http.Server{
		Addr:    cfg.BindAddress,
		Handler: srv.Handler(),
	}

	shutdownCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	serveErr := make(chan error, 1)
	go func() {
		logger.Info("starting server", slog.String("addr", cfg.BindAddress))
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serveErr <- err
		}
	}()

	select {
	case err := <-serveErr:
		logger.Error("server error", slog.String("error", err.Error()))
		os.Exit(1)
	case <-shutdownCtx.Done():
		logger.Info("shutdown signal received, draining in-flight requests (10s)")
		drainCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		if err := httpServer.Shutdown(drainCtx); err != nil {
			logger.Error("graceful shutdown failed", slog.String("error", err.Error()))
		}
		logger.Info("server shutdown complete")
	}
}
