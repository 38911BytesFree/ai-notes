package config

import (
	"errors"
	"log/slog"
	"os"
	"strconv"
)

type Config struct {
	BindAddress               string
	GoogleCloudProject        string
	FirestoreEmulatorHost     string
	FirebaseAuthEmulatorHost  string
	TranscriptsBucket         string
	GeminiModel               string
	VertexLocation            string
	IngestMonthlyLimit        int
	SummariserMaxChars        int
	UseFakeAI                 bool
	ServiceAudience           string
	WebServiceAccount         string
	ServiceDevToken           string
}

func Load() (*Config, error) {
	bindAddr := os.Getenv("BIND_ADDRESS")
	if bindAddr == "" {
		bindAddr = "0.0.0.0:8000"
	}

	projectID := os.Getenv("GOOGLE_CLOUD_PROJECT")
	if projectID == "" {
		return nil, errors.New("GOOGLE_CLOUD_PROJECT environment variable is required")
	}

	firestoreEmu := os.Getenv("FIRESTORE_EMULATOR_HOST")
	authEmu := os.Getenv("FIREBASE_AUTH_EMULATOR_HOST")

	transcriptsBucket := os.Getenv("TRANSCRIPTS_BUCKET")

	geminiModel := os.Getenv("GEMINI_MODEL")
	if geminiModel == "" {
		geminiModel = "gemini-2.5-flash"
	}

	vertexLocation := os.Getenv("VERTEX_LOCATION")
	if vertexLocation == "" {
		vertexLocation = "europe-west1"
	}

	ingestMonthlyLimit := 30
	if val := os.Getenv("INGEST_MONTHLY_LIMIT"); val != "" {
		if n, err := strconv.Atoi(val); err == nil && n > 0 {
			ingestMonthlyLimit = n
		}
	}

	summariserMaxChars := 200000
	if val := os.Getenv("SUMMARISER_MAX_CHARS"); val != "" {
		if n, err := strconv.Atoi(val); err == nil && n > 0 {
			summariserMaxChars = n
		}
	}

	useFakeAI := os.Getenv("USE_FAKE_AI") == "true"

	serviceAudience := os.Getenv("SERVICE_AUDIENCE")
	webServiceAccount := os.Getenv("WEB_SERVICE_ACCOUNT")
	serviceDevToken := os.Getenv("SERVICE_DEV_TOKEN")

	return &Config{
		BindAddress:              bindAddr,
		GoogleCloudProject:       projectID,
		FirestoreEmulatorHost:    firestoreEmu,
		FirebaseAuthEmulatorHost: authEmu,
		TranscriptsBucket:         transcriptsBucket,
		GeminiModel:               geminiModel,
		VertexLocation:            vertexLocation,
		IngestMonthlyLimit:        ingestMonthlyLimit,
		SummariserMaxChars:        summariserMaxChars,
		UseFakeAI:                 useFakeAI,
		ServiceAudience:           serviceAudience,
		WebServiceAccount:         webServiceAccount,
		ServiceDevToken:           serviceDevToken,
	}, nil
}

func (c *Config) LogStartupMode(logger *slog.Logger) {
	if c.FirestoreEmulatorHost != "" {
		logger.Info("firestore emulator configured", slog.String("host", c.FirestoreEmulatorHost))
	} else {
		logger.Info("using production firestore", slog.String("project", c.GoogleCloudProject))
	}

	if c.FirebaseAuthEmulatorHost != "" {
		logger.Info("firebase auth emulator configured", slog.String("host", c.FirebaseAuthEmulatorHost))
	} else {
		logger.Info("using production firebase auth", slog.String("project", c.GoogleCloudProject))
	}
}
