# -----------------------------------------------------------------------------
# Cloud Storage: Transcripts Bucket (Private)
# -----------------------------------------------------------------------------

resource "google_storage_bucket" "transcripts" {
  name                        = "${var.project_id}-transcripts"
  location                    = var.region
  project                     = var.project_id
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = false
  }
}

# Grant API Service Account objectAdmin on the transcripts bucket
resource "google_storage_bucket_iam_member" "api_transcripts" {
  bucket = google_storage_bucket.transcripts.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.api.email}"
}
