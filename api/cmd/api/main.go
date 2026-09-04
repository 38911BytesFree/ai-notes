package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"ainotes/internal/config"
	"ainotes/internal/httpapi"
	"ainotes/internal/ingest"
	"ainotes/internal/store"

	"cloud.google.com/go/firestore"
	firebase "firebase.google.com/go/v4"
	"github.com/joho/godotenv"
)

func runProbe(urlStr, ua, dumpPath string) {
	if ua == "" {
		ua = os.Getenv("PROBE_UA")
	}
	client := ingest.NewClient(ingest.DefaultAllowlist)
	req, err := http.NewRequestWithContext(context.Background(), "GET", urlStr, nil)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error creating probe request: %v\n", err)
		os.Exit(1)
	}

	if ua != "" {
		req.Header.Set("User-Agent", ua)
		req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8")
		req.Header.Set("Accept-Language", "en-US,en;q=0.5")
	}

	resp, err := client.Do(req)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Probe request failed: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil && !errors.Is(err, io.EOF) {
		fmt.Fprintf(os.Stderr, "Warning reading body: %v\n", err)
	}

	finalURL := resp.Request.URL.String()
	contentType := resp.Header.Get("Content-Type")
	bodyLen := len(body)
	previewLimit := 2048
	if bodyLen < previewLimit {
		previewLimit = bodyLen
	}

	fmt.Printf("Status: %d\n", resp.StatusCode)
	fmt.Printf("Final URL: %s\n", finalURL)
	fmt.Printf("Content-Type: %s\n", contentType)
	fmt.Printf("Body Length: %d bytes\n", bodyLen)
	fmt.Printf("Preview (first %d bytes):\n%s\n", previewLimit, string(body[:previewLimit]))

	if dumpPath != "" {
		if err := os.WriteFile(dumpPath, body, 0644); err != nil {
			fmt.Fprintf(os.Stderr, "Error dumping body to %s: %v\n", dumpPath, err)
		} else {
			fmt.Printf("Dumped full body to %s (%d bytes)\n", dumpPath, len(body))
		}
	}
	os.Exit(0)
}

func main() {
	probeFlag := flag.String("probe", "", "URL to probe with SSRF-safe client")
	uaFlag := flag.String("ua", "", "Custom User-Agent for probe")
	dumpFlag := flag.String("dump", "", "Filepath to dump full response body")
	flag.Parse()

	if *probeFlag != "" {
		runProbe(*probeFlag, *uaFlag, *dumpFlag)
		return
	}

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
