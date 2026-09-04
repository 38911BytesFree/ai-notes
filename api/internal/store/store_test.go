package store

import (
	"context"
	"os"
	"testing"
	"time"

	"ainotes/internal/notes"

	"cloud.google.com/go/firestore"
)

func TestMemoryStoreNoteCRUD(t *testing.T) {
	ctx := context.Background()
	s := NewMemoryStore()
	uid := "user-123"

	// Create user
	err := s.UpsertUser(ctx, User{UID: uid, Email: "user@example.com"})
	if err != nil {
		t.Fatalf("UpsertUser failed: %v", err)
	}

	// Create Note
	note := &notes.Note{
		ID:         "test-note-1",
		OwnerUID:   uid,
		Title:      "First Note",
		Summary:    "Summary of first note",
		Takeaways:  []string{"Point 1", "Point 2", "Point 3"},
		Category:   "Programming",
		Tags:       []string{"go", "testing"},
		Embedding:  firestore.Vector32{0.1, 0.2, 0.3},
		CreatedAt:  time.Now().UTC().Add(-10 * time.Minute),
	}
	if err := s.CreateNote(ctx, note); err != nil {
		t.Fatalf("CreateNote failed: %v", err)
	}

	// Get Note
	got, err := s.GetNote(ctx, uid, "test-note-1")
	if err != nil {
		t.Fatalf("GetNote failed: %v", err)
	}
	if got.Title != "First Note" {
		t.Errorf("expected title 'First Note', got %q", got.Title)
	}

	// Cross-user read should fail with ErrNotFound
	_, err = s.GetNote(ctx, "another-user", "test-note-1")
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound for cross-user get, got %v", err)
	}

	// Update Note
	got.Title = "Updated Note Title"
	updated, err := s.UpdateNote(ctx, uid, got)
	if err != nil {
		t.Fatalf("UpdateNote failed: %v", err)
	}
	if updated.Title != "Updated Note Title" {
		t.Errorf("expected updated title, got %q", updated.Title)
	}

	// Cross-user update should fail
	_, err = s.UpdateNote(ctx, "another-user", got)
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound for cross-user update, got %v", err)
	}

	// Delete Note
	if err := s.DeleteNote(ctx, uid, "test-note-1"); err != nil {
		t.Fatalf("DeleteNote failed: %v", err)
	}

	// Get deleted Note
	_, err = s.GetNote(ctx, uid, "test-note-1")
	if err != ErrNotFound {
		t.Errorf("expected ErrNotFound after delete, got %v", err)
	}
}

func TestMemoryStoreListAndPagination(t *testing.T) {
	ctx := context.Background()
	s := NewMemoryStore()
	uid := "user-list"

	baseTime := time.Date(2026, 9, 4, 10, 0, 0, 0, time.UTC)
	for i := 1; i <= 5; i++ {
		cat := "Programming"
		if i%2 == 0 {
			cat = "Design"
		}
		note := &notes.Note{
			ID:        notes.TruncateString(string(rune('a'+i)), 10) + "-id",
			OwnerUID:  uid,
			Title:     "Note",
			Category:  cat,
			CreatedAt: baseTime.Add(time.Duration(i) * time.Minute),
		}
		_ = s.CreateNote(ctx, note)
	}

	// List all, limit 2
	page1, nextCursor, err := s.ListNotes(ctx, uid, "", "", 2)
	if err != nil {
		t.Fatalf("ListNotes failed: %v", err)
	}
	if len(page1) != 2 {
		t.Fatalf("expected 2 notes on page 1, got %d", len(page1))
	}
	if nextCursor == "" {
		t.Errorf("expected non-empty nextCursor")
	}

	// Page 2
	page2, nextCursor2, err := s.ListNotes(ctx, uid, "", nextCursor, 2)
	if err != nil {
		t.Fatalf("ListNotes page 2 failed: %v", err)
	}
	if len(page2) != 2 {
		t.Fatalf("expected 2 notes on page 2, got %d", len(page2))
	}
	if nextCursor2 == "" {
		t.Errorf("expected non-empty nextCursor2")
	}

	// Page 3 (remaining 1 item)
	page3, nextCursor3, err := s.ListNotes(ctx, uid, "", nextCursor2, 2)
	if err != nil {
		t.Fatalf("ListNotes page 3 failed: %v", err)
	}
	if len(page3) != 1 {
		t.Fatalf("expected 1 note on page 3, got %d", len(page3))
	}
	if nextCursor3 != "" {
		t.Errorf("expected empty nextCursor3 on last page, got %q", nextCursor3)
	}

	// Filter by category
	designNotes, _, err := s.ListNotes(ctx, uid, "Design", "", 10)
	if err != nil {
		t.Fatalf("ListNotes category filter failed: %v", err)
	}
	if len(designNotes) != 2 {
		t.Fatalf("expected 2 Design notes, got %d", len(designNotes))
	}
}

func TestMemoryStoreVectorSearch(t *testing.T) {
	ctx := context.Background()
	s := NewMemoryStore()
	uid := "user-search"

	// Nearer note
	nearNote := &notes.Note{
		ID:        "near-note",
		OwnerUID:  uid,
		Title:     "Near Note",
		Category:  "AI & ML",
		Embedding: firestore.Vector32{1.0, 0.0, 0.0},
	}
	// Farther note
	farNote := &notes.Note{
		ID:        "far-note",
		OwnerUID:  uid,
		Title:     "Far Note",
		Category:  "AI & ML",
		Embedding: firestore.Vector32{0.0, 1.0, 0.0},
	}

	_ = s.CreateNote(ctx, nearNote)
	_ = s.CreateNote(ctx, farNote)

	// Query vector aligned with nearNote (1.0, 0.0, 0.0)
	queryVector := []float32{0.9, 0.1, 0.0}
	results, err := s.SearchNotes(ctx, uid, "", queryVector, 10)
	if err != nil {
		t.Fatalf("SearchNotes failed: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 search results, got %d", len(results))
	}

	if results[0].Note.ID != "near-note" {
		t.Errorf("expected first result to be 'near-note', got %q", results[0].Note.ID)
	}
	if results[0].Distance >= results[1].Distance {
		t.Errorf("expected result[0].Distance (%f) < result[1].Distance (%f)", results[0].Distance, results[1].Distance)
	}
}

func TestMemoryStoreIngestQuota(t *testing.T) {
	ctx := context.Background()
	s := NewMemoryStore()
	uid := "quota-user"

	_ = s.UpsertUser(ctx, User{UID: uid, Email: "quota@example.com"})

	// Reserve up to limit 2
	period := "2026-09"
	limit := 2

	if err := s.ReserveIngest(ctx, uid, period, limit); err != nil {
		t.Fatalf("first reserve failed: %v", err)
	}
	if err := s.ReserveIngest(ctx, uid, period, limit); err != nil {
		t.Fatalf("second reserve failed: %v", err)
	}

	// Third reserve should hit limit
	err := s.ReserveIngest(ctx, uid, period, limit)
	if err != ErrIngestLimitReached {
		t.Fatalf("expected ErrIngestLimitReached on 3rd reserve, got %v", err)
	}

	// Release 1
	if err := s.ReleaseIngest(ctx, uid); err != nil {
		t.Fatalf("release failed: %v", err)
	}

	// Now reserve should succeed again
	if err := s.ReserveIngest(ctx, uid, period, limit); err != nil {
		t.Fatalf("reserve after release failed: %v", err)
	}

	// Changing period should reset count
	newPeriod := "2026-10"
	if err := s.ReserveIngest(ctx, uid, newPeriod, limit); err != nil {
		t.Fatalf("reserve in new period failed: %v", err)
	}
}

func TestMemoryStoreDeleteAllForUser(t *testing.T) {
	ctx := context.Background()
	s := NewMemoryStore()
	uid := "delete-user"

	_ = s.UpsertUser(ctx, User{UID: uid, Email: "del@example.com"})
	_ = s.CreateNote(ctx, &notes.Note{ID: "n1", OwnerUID: uid, Title: "N1"})
	_ = s.CreateNote(ctx, &notes.Note{ID: "n2", OwnerUID: uid, Title: "N2"})
	_ = s.CreateNote(ctx, &notes.Note{ID: "other-n", OwnerUID: "other", Title: "Other"})

	deletedIDs, err := s.DeleteAllForUser(ctx, uid)
	if err != nil {
		t.Fatalf("DeleteAllForUser failed: %v", err)
	}
	if len(deletedIDs) != 2 {
		t.Errorf("expected 2 deleted note IDs, got %d", len(deletedIDs))
	}

	// User doc should be gone
	_, err = s.GetUser(ctx, uid)
	if err != ErrNotFound {
		t.Errorf("expected user to be deleted, got %v", err)
	}

	// Other user's note should still exist
	otherNote, err := s.GetNote(ctx, "other", "other-n")
	if err != nil || otherNote.Title != "Other" {
		t.Errorf("expected other user note to exist, got %v", err)
	}
}

func TestMemoryBlobStore(t *testing.T) {
	ctx := context.Background()
	bs := NewMemoryBlobStore()
	key := "transcripts/test-123.json.gz"
	data := []byte("gzipped-transcript-data")

	// Get non-existent
	_, err := bs.Get(ctx, key)
	if err != ErrBlobNotFound {
		t.Fatalf("expected ErrBlobNotFound, got %v", err)
	}

	// Put
	if err := bs.Put(ctx, key, data); err != nil {
		t.Fatalf("Put failed: %v", err)
	}

	// Get
	got, err := bs.Get(ctx, key)
	if err != nil {
		t.Fatalf("Get failed: %v", err)
	}
	if string(got) != string(data) {
		t.Errorf("expected %q, got %q", string(data), string(got))
	}

	// Delete
	if err := bs.Delete(ctx, key); err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	// Verify deleted
	_, err = bs.Get(ctx, key)
	if err != ErrBlobNotFound {
		t.Errorf("expected ErrBlobNotFound after delete, got %v", err)
	}
}

func TestFirestoreStoreIntegration(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("skipping firestore integration test: FIRESTORE_EMULATOR_HOST not set")
	}

	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "test-project")
	if err != nil {
		t.Fatalf("failed to connect to firestore emulator: %v", err)
	}
	defer client.Close()

	s := NewFirestoreStore(client)
	uid := "emu-user-" + time.Now().Format("150405")

	err = s.UpsertUser(ctx, User{UID: uid, Email: "emu@example.com"})
	if err != nil {
		t.Fatalf("UpsertUser failed: %v", err)
	}

	note := &notes.Note{
		ID:        "emu-note-" + time.Now().Format("150405"),
		OwnerUID:  uid,
		Title:     "Emu Note",
		Summary:   "Summary",
		Takeaways: []string{"T1", "T2", "T3"},
		Category:  "Writing",
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}

	if err := s.CreateNote(ctx, note); err != nil {
		t.Fatalf("CreateNote on emulator failed: %v", err)
	}

	got, err := s.GetNote(ctx, uid, note.ID)
	if err != nil {
		t.Fatalf("GetNote on emulator failed: %v", err)
	}
	if got.Title != "Emu Note" {
		t.Errorf("expected 'Emu Note', got %q", got.Title)
	}
}
