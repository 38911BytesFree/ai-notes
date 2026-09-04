output "artifact_registry_repository_url" {
  description = "URL of the Artifact Registry Docker repository"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}"
}

output "api_service_url" {
  description = "Private URL of the ai-notes-api Cloud Run service"
  value       = google_cloud_run_v2_service.api.uri
}

output "web_service_url" {
  description = "Public URL of the ai-notes-web Cloud Run service"
  value       = google_cloud_run_v2_service.web.uri
}

output "api_service_account_email" {
  description = "Email of the API runtime service account"
  value       = google_service_account.api.email
}

output "web_service_account_email" {
  description = "Email of the Web runtime service account"
  value       = google_service_account.web.email
}

output "build_service_account_email" {
  description = "Email of the Cloud Build service account"
  value       = google_service_account.build.email
}
