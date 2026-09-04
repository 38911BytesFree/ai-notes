resource "google_artifact_registry_repository" "repo" {
  project       = var.project_id
  location      = var.region
  repository_id = "ai-notes"
  description   = "Docker repository for ai-notes services"
  format        = "DOCKER"

  depends_on = [google_project_service.services["artifactregistry.googleapis.com"]]
}
