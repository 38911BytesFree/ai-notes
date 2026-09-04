package ingest

import (
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestClientRedirectRejection(t *testing.T) {
	// Server that redirects to an off-list host
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "https://disallowed-host.example.com/some/path", http.StatusFound)
	}))
	defer ts.Close()

	u, err := url.Parse(ts.URL)
	if err != nil {
		t.Fatalf("failed to parse test server url: %v", err)
	}

	client := NewClientWithConfig(ClientConfig{
		Allowlist:     []string{u.Hostname()},
		AllowLoopback: true,
		Timeout:       5 * time.Second,
	})

	_, err = client.Get(ts.URL)
	if err == nil {
		t.Fatalf("expected error on off-list redirect, got nil")
	}
	if !strings.Contains(err.Error(), "off-list host rejected") {
		t.Errorf("expected off-list host rejected error, got: %v", err)
	}
}

func TestClientTooManyRedirects(t *testing.T) {
	var hop int
	var ts *httptest.Server
	ts = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hop++
		http.Redirect(w, r, ts.URL, http.StatusFound)
	}))
	defer ts.Close()

	u, err := url.Parse(ts.URL)
	if err != nil {
		t.Fatalf("failed to parse test server url: %v", err)
	}

	client := NewClientWithConfig(ClientConfig{
		Allowlist:     []string{u.Hostname()},
		AllowLoopback: true,
		Timeout:       5 * time.Second,
	})

	_, err = client.Get(ts.URL)
	if err == nil {
		t.Fatalf("expected error on too many redirects, got nil")
	}
	if !strings.Contains(err.Error(), "too many redirects") {
		t.Errorf("expected too many redirects error, got: %v", err)
	}
}

func TestClientSizeCap(t *testing.T) {
	// Server that produces 6 MB of data
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		chunk := make([]byte, 1024*1024) // 1MB chunk
		for i := 0; i < 6; i++ {
			if _, err := w.Write(chunk); err != nil {
				return
			}
		}
	}))
	defer ts.Close()

	u, err := url.Parse(ts.URL)
	if err != nil {
		t.Fatalf("failed to parse test server url: %v", err)
	}

	client := NewClientWithConfig(ClientConfig{
		Allowlist:     []string{u.Hostname()},
		AllowLoopback: true,
		Timeout:       5 * time.Second,
	})

	resp, err := client.Get(ts.URL)
	if err != nil {
		// ContentLength check might reject immediately
		if errors.Is(err, ErrResponseTooLarge) {
			return
		}
		t.Fatalf("unexpected error getting url: %v", err)
	}
	defer resp.Body.Close()

	_, readErr := io.ReadAll(resp.Body)
	if readErr == nil {
		t.Fatalf("expected ErrResponseTooLarge reading body > 5MB, got nil")
	}
	if !errors.Is(readErr, ErrResponseTooLarge) {
		t.Errorf("expected ErrResponseTooLarge, got: %v", readErr)
	}
}

func TestClientRejectsLoopbackByDefault(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	u, err := url.Parse(ts.URL)
	if err != nil {
		t.Fatalf("failed to parse test server url: %v", err)
	}

	// NewClient has AllowLoopback: false
	client := NewClient([]string{u.Hostname()})

	_, err = client.Get(ts.URL)
	if err == nil {
		t.Fatalf("expected error on loopback dial with NewClient, got nil")
	}
	if !strings.Contains(err.Error(), "dial to non-public IP rejected") {
		t.Errorf("expected non-public IP rejection, got: %v", err)
	}
}
