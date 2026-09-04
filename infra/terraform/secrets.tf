resource "google_secret_manager_secret" "session_secret" {
  secret_id = "session-secret"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.services["secretmanager.googleapis.com"]]
}

resource "google_secret_manager_secret_iam_member" "web_session_secret" {
  secret_id = google_secret_manager_secret.session_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.web.email}"
}

resource "google_secret_manager_secret" "github_token" {
  secret_id = "github-token"
  project   = var.project_id

  replication {
    auto {}
  }

  depends_on = [google_project_service.services["secretmanager.googleapis.com"]]
}
