package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"ainotes/internal/notes"
)

func TestVisibilityAndPIIGate(t *testing.T) {
	tc := setupTestContext(t)
	ctx := context.Background()

	// 1. Publish clean note
	t.Run("publish clean note", func(t *testing.T) {
		cleanNote := &notes.Note{
			ID:         "clean-note-1",
			OwnerUID:   tc.uid,
			Visibility: "private",
			Title:      "Clean Title",
			Summary:    "Clean Summary without any credentials or personal info",
			Takeaways:  []string{"Takeaway 1", "Takeaway 2"},
			Category:   "Programming",
			Tags:       []string{"go"},
			CreatedAt:  time.Now().UTC(),
			UpdatedAt:  time.Now().UTC(),
		}
		if err := tc.memStore.CreateNote(ctx, cleanNote); err != nil {
			t.Fatalf("CreateNote failed: %v", err)
		}

		body, _ := json.Marshal(SetVisibilityRequest{
			Visibility:     "public",
			AcknowledgePII: false,
		})
		req := httptest.NewRequest("PUT", "/v1/notes/clean-note-1/visibility", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+tc.token)
		w := httptest.NewRecorder()

		tc.srv.Handler().ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp notes.Note
		if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if resp.Visibility != "public" {
			t.Errorf("expected visibility public, got %q", resp.Visibility)
		}
		if resp.PublishedAt == nil {
			t.Errorf("expected published_at to be set, got nil")
		}
		if len(resp.PIIFlags) != 0 {
			t.Errorf("expected 0 PII flags, got %v", resp.PIIFlags)
		}
	})

	// 2. Publish flagged note refused
	t.Run("publish flagged note refused", func(t *testing.T) {
		flaggedNote := &notes.Note{
			ID:         "flagged-note-1",
			OwnerUID:   tc.uid,
			Visibility: "private",
			Title:      "Contact Details",
			Summary:    "Reach me at user@example.com or sk-1234567890abcdefghijklmnopqrstuvwxyz",
			Takeaways:  []string{"Email on file"},
			Category:   "Career",
			CreatedAt:  time.Now().UTC(),
			UpdatedAt:  time.Now().UTC(),
		}
		if err := tc.memStore.CreateNote(ctx, flaggedNote); err != nil {
			t.Fatalf("CreateNote failed: %v", err)
		}

		body, _ := json.Marshal(SetVisibilityRequest{
			Visibility:     "public",
			AcknowledgePII: false,
		})
		req := httptest.NewRequest("PUT", "/v1/notes/flagged-note-1/visibility", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+tc.token)
		w := httptest.NewRecorder()

		tc.srv.Handler().ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("expected status 403, got %d: %s", w.Code, w.Body.String())
		}

		var errResp map[string]string
		_ = json.NewDecoder(w.Body).Decode(&errResp)
		if errResp["code"] != "pii_unacknowledged" {
			t.Errorf("expected code pii_unacknowledged, got %q", errResp["code"])
		}

		// Verify note in store is unchanged
		stored, err := tc.memStore.GetNote(ctx, tc.uid, "flagged-note-1")
		if err != nil {
			t.Fatalf("GetNote failed: %v", err)
		}
		if stored.Visibility != "private" {
			t.Errorf("expected note to remain private, got %q", stored.Visibility)
		}
		if stored.PublishedAt != nil {
			t.Errorf("expected published_at to remain nil, got %v", stored.PublishedAt)
		}
	})

	// 3. Publish after acknowledgement
	t.Run("publish after acknowledgement", func(t *testing.T) {
		body, _ := json.Marshal(SetVisibilityRequest{
			Visibility:     "public",
			AcknowledgePII: true,
		})
		req := httptest.NewRequest("PUT", "/v1/notes/flagged-note-1/visibility", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+tc.token)
		w := httptest.NewRecorder()

		tc.srv.Handler().ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp notes.Note
		_ = json.NewDecoder(w.Body).Decode(&resp)

		if resp.Visibility != "public" {
			t.Errorf("expected visibility public, got %q", resp.Visibility)
		}
		if resp.PublishedAt == nil {
			t.Errorf("expected published_at to be set")
		}
		if resp.PIIAckHash == "" || resp.PIIAckHash != resp.PIIScannedHash {
			t.Errorf("expected pii_ack_hash to equal pii_scanned_hash (%q), got %q", resp.PIIScannedHash, resp.PIIAckHash)
		}
	})

	// 4. Edit that introduces PII into a published note refused and nothing written
	t.Run("edit that introduces PII into published note refused", func(t *testing.T) {
		pubNote := &notes.Note{
			ID:         "pub-clean-note",
			OwnerUID:   tc.uid,
			Visibility: "public",
			Title:      "Public Title",
			Summary:    "Clean public summary",
			Takeaways:  []string{"Clean takeaway"},
			Category:   "Programming",
			CreatedAt:  time.Now().UTC(),
			UpdatedAt:  time.Now().UTC(),
		}
		_ = tc.memStore.CreateNote(ctx, pubNote)

		badSummary := "New summary introducing sk-secret1234567890abcdefghijklmnopqrstuvwxyz"
		patchBody, _ := json.Marshal(UpdateNoteRequest{
			Summary: &badSummary,
		})
		req := httptest.NewRequest("PATCH", "/v1/notes/pub-clean-note", bytes.NewReader(patchBody))
		req.Header.Set("Authorization", "Bearer "+tc.token)
		w := httptest.NewRecorder()

		tc.srv.Handler().ServeHTTP(w, req)

		if w.Code != http.StatusForbidden {
			t.Fatalf("expected status 403, got %d: %s", w.Code, w.Body.String())
		}

		var errResp map[string]string
		_ = json.NewDecoder(w.Body).Decode(&errResp)
		if errResp["code"] != "pii_unacknowledged" {
			t.Errorf("expected code pii_unacknowledged, got %q", errResp["code"])
		}

		// Verify nothing was written to the store
		stored, _ := tc.memStore.GetNote(ctx, tc.uid, "pub-clean-note")
		if stored.Summary != "Clean public summary" {
			t.Errorf("expected summary to remain unchanged, got %q", stored.Summary)
		}
		if stored.Visibility != "public" {
			t.Errorf("expected visibility to remain public, got %q", stored.Visibility)
		}
	})

	// 5. Edit that removes PII allows publishing without a new acknowledgement
	t.Run("edit removing PII allows publishing", func(t *testing.T) {
		dirtyNote := &notes.Note{
			ID:         "dirty-note-1",
			OwnerUID:   tc.uid,
			Visibility: "private",
			Title:      "Dirty Title",
			Summary:    "Has secret sk-secret1234567890abcdefghijklmnopqrstuvwxyz",
			Takeaways:  []string{"Secret key above"},
			Category:   "Programming",
			CreatedAt:  time.Now().UTC(),
			UpdatedAt:  time.Now().UTC(),
		}
		_ = tc.memStore.CreateNote(ctx, dirtyNote)

		cleanSummary := "Cleaned summary without secrets"
		patchBody, _ := json.Marshal(UpdateNoteRequest{
			Summary: &cleanSummary,
		})
		patchReq := httptest.NewRequest("PATCH", "/v1/notes/dirty-note-1", bytes.NewReader(patchBody))
		patchReq.Header.Set("Authorization", "Bearer "+tc.token)
		wPatch := httptest.NewRecorder()
		tc.srv.Handler().ServeHTTP(wPatch, patchReq)

		if wPatch.Code != http.StatusOK {
			t.Fatalf("patch failed: %d %s", wPatch.Code, wPatch.Body.String())
		}

		// Now publish without acknowledgement -> should succeed
		pubBody, _ := json.Marshal(SetVisibilityRequest{
			Visibility:     "public",
			AcknowledgePII: false,
		})
		pubReq := httptest.NewRequest("PUT", "/v1/notes/dirty-note-1/visibility", bytes.NewReader(pubBody))
		pubReq.Header.Set("Authorization", "Bearer "+tc.token)
		wPub := httptest.NewRecorder()
		tc.srv.Handler().ServeHTTP(wPub, pubReq)

		if wPub.Code != http.StatusOK {
			t.Fatalf("expected publish to succeed with 200, got %d: %s", wPub.Code, wPub.Body.String())
		}
	})

	// 6. Unpublish note
	t.Run("unpublish note sets published_at to nil and visibility to private", func(t *testing.T) {
		now := time.Now().UTC()
		pubNote := &notes.Note{
			ID:          "unpub-note-1",
			OwnerUID:    tc.uid,
			Visibility:  "public",
			Title:       "Title",
			Summary:     "Summary",
			Takeaways:   []string{"T1"},
			Category:    "Design",
			PublishedAt: &now,
			CreatedAt:   now,
			UpdatedAt:   now,
		}
		_ = tc.memStore.CreateNote(ctx, pubNote)

		unpubBody, _ := json.Marshal(SetVisibilityRequest{
			Visibility: "private",
		})
		req := httptest.NewRequest("PUT", "/v1/notes/unpub-note-1/visibility", bytes.NewReader(unpubBody))
		req.Header.Set("Authorization", "Bearer "+tc.token)
		w := httptest.NewRecorder()
		tc.srv.Handler().ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp notes.Note
		_ = json.NewDecoder(w.Body).Decode(&resp)
		if resp.Visibility != "private" {
			t.Errorf("expected private, got %q", resp.Visibility)
		}
		if resp.PublishedAt != nil {
			t.Errorf("expected published_at to be nil, got %v", resp.PublishedAt)
		}
	})

	// 7. published_at set on each transition into public
	t.Run("published_at set on each transition into public", func(t *testing.T) {
		t1 := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
		note := &notes.Note{
			ID:          "multi-pub-note",
			OwnerUID:    tc.uid,
			Visibility:  "unlisted",
			Title:       "Title",
			Summary:     "Summary",
			Takeaways:   []string{"T1"},
			Category:    "AI & ML",
			PublishedAt: nil,
			CreatedAt:   t1,
			UpdatedAt:   t1,
		}
		_ = tc.memStore.CreateNote(ctx, note)

		pubBody, _ := json.Marshal(SetVisibilityRequest{Visibility: "public"})
		req1 := httptest.NewRequest("PUT", "/v1/notes/multi-pub-note/visibility", bytes.NewReader(pubBody))
		req1.Header.Set("Authorization", "Bearer "+tc.token)
		w1 := httptest.NewRecorder()
		tc.srv.Handler().ServeHTTP(w1, req1)
		if w1.Code != http.StatusOK {
			t.Fatalf("pub1 failed: %d", w1.Code)
		}

		var resp1 notes.Note
		_ = json.NewDecoder(w1.Body).Decode(&resp1)
		if resp1.PublishedAt == nil {
			t.Fatalf("expected published_at to be set on transition")
		}
	})

	// 8. A note created before the phase (no pii_* fields) publishes correctly
	t.Run("legacy note without pii fields publishes correctly", func(t *testing.T) {
		legacyNote := &notes.Note{
			ID:         "legacy-note-clean",
			OwnerUID:   tc.uid,
			Visibility: "private",
			Title:      "Legacy Clean Note",
			Summary:    "Clean note created before Phase 3 with no pii_* fields set",
			Takeaways:  []string{"T1"},
			Category:   "Writing",
			CreatedAt:  time.Date(2026, 8, 15, 10, 0, 0, 0, time.UTC),
			UpdatedAt:  time.Date(2026, 8, 15, 10, 0, 0, 0, time.UTC),
		}
		_ = tc.memStore.CreateNote(ctx, legacyNote)

		body, _ := json.Marshal(SetVisibilityRequest{Visibility: "unlisted"})
		req := httptest.NewRequest("PUT", "/v1/notes/legacy-note-clean/visibility", bytes.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+tc.token)
		w := httptest.NewRecorder()
		tc.srv.Handler().ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
		}

		var resp notes.Note
		_ = json.NewDecoder(w.Body).Decode(&resp)
		if resp.Visibility != "unlisted" {
			t.Errorf("expected unlisted, got %q", resp.Visibility)
		}
		if resp.PIIScannedHash == "" {
			t.Errorf("expected authoritative scan to populate pii_scanned_hash")
		}
	})
}
