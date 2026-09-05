resource "google_cloudbuild_trigger" "api_deploy" {
  name        = "ai-notes-api-deploy"
  project     = var.project_id
  location    = var.region
  description = "Build and deploy ai-notes-api on push to main"

  service_account = google_service_account.build.id

  github {
    owner = var.github_owner
    name  = var.github_repo
    push {
      branch = "^main$"
    }
  }

  included_files = ["api/**", "cloudbuild/api.yaml"]

  filename = "cloudbuild/api.yaml"

  substitutions = {
    _AR_HOSTNAME   = "${var.region}-docker.pkg.dev"
    _DEPLOY_REGION = var.region
    _SERVICE_NAME  = google_cloud_run_v2_service.api.name
    _REPO_NAME     = google_artifact_registry_repository.repo.repository_id
  }

  depends_on = [
    google_project_service.services["cloudbuild.googleapis.com"]
  ]
}

resource "google_cloudbuild_trigger" "web_deploy" {
  name        = "ai-notes-web-deploy"
  project     = var.project_id
  location    = var.region
  description = "Build and deploy ai-notes-web on push to main"

  service_account = google_service_account.build.id

  github {
    owner = var.github_owner
    name  = var.github_repo
    push {
      branch = "^main$"
    }
  }

  included_files = ["web/**", "cloudbuild/web.yaml", "pnpm-lock.yaml", "pnpm-workspace.yaml", "package.json"]

  filename = "cloudbuild/web.yaml"

  substitutions = merge({
    _AR_HOSTNAME                       = "${var.region}-docker.pkg.dev"
    _DEPLOY_REGION                     = var.region
    _SERVICE_NAME                      = google_cloud_run_v2_service.web.name
    _REPO_NAME                         = google_artifact_registry_repository.repo.repository_id
    _VITE_FIREBASE_AUTH_DOMAIN         = var.firebase_auth_domain
    _VITE_FIREBASE_PROJECT_ID          = var.project_id
    _VITE_FIREBASE_STORAGE_BUCKET      = var.firebase_storage_bucket
    _VITE_FIREBASE_MESSAGING_SENDER_ID = var.firebase_messaging_sender_id
    _VITE_FIREBASE_APP_ID              = var.firebase_app_id
    _VITE_FIREBASE_MEASUREMENT_ID      = var.firebase_measurement_id
    }, var.firebase_api_key != "" ? {
    _VITE_FIREBASE_API_KEY = var.firebase_api_key
  } : {})

  lifecycle {
    ignore_changes = [
      substitutions["_VITE_FIREBASE_API_KEY"]
    ]
  }

  depends_on = [
    google_project_service.services["cloudbuild.googleapis.com"]
  ]
}
