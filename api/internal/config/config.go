package config

import (
	"errors"
	"log/slog"
	"os"
)

type Config struct {
	BindAddress               string
	GoogleCloudProject        string
	FirestoreEmulatorHost     string
	FirebaseAuthEmulatorHost  string
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

	return &Config{
		BindAddress:              bindAddr,
		GoogleCloudProject:       projectID,
		FirestoreEmulatorHost:    firestoreEmu,
		FirebaseAuthEmulatorHost: authEmu,
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
