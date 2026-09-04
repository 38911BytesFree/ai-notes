# -----------------------------------------------------------------------------
# Runtime Service Accounts
# -----------------------------------------------------------------------------

# API Runtime Service Account
resource "google_service_account" "api" {
  account_id   = "sa-ai-notes-api"
  display_name = "ai-notes API service account"
  project      = var.project_id
}

resource "google_project_iam_member" "api_datastore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "api_firebase_auth" {
  project = var.project_id
  role    = "roles/firebaseauth.viewer"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "api_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.api.email}"
}


# Web Runtime Service Account
resource "google_service_account" "web" {
  account_id   = "sa-ai-notes-web"
  display_name = "ai-notes Web service account"
  project      = var.project_id
}

resource "google_project_iam_member" "web_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.web.email}"
}

# Build Service Account (for Cloud Build triggers)
resource "google_service_account" "build" {
  account_id   = "sa-ai-notes-build"
  display_name = "ai-notes Cloud Build service account"
  project      = var.project_id
}

resource "google_project_iam_member" "build_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.build.email}"
}

resource "google_project_iam_member" "build_ar_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.build.email}"
}

resource "google_project_iam_member" "build_logging" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.build.email}"
}

# Allow Cloud Build SA to act as the runtime service accounts
resource "google_service_account_iam_member" "build_actas_api" {
  service_account_id = google_service_account.api.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.build.email}"
}

resource "google_service_account_iam_member" "build_actas_web" {
  service_account_id = google_service_account.web.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.build.email}"
}
