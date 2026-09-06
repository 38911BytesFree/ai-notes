variable "project_id" {
  type        = string
  description = "GCP Project ID"
  default     = "ai-notes-507510"
}

variable "region" {
  type        = string
  description = "GCP Region for regional resources"
  default     = "europe-west1"
}

variable "domain" {
  type        = string
  description = "Primary domain for the product"
  default     = "ai-notes.io"
}

variable "manage_domain" {
  type        = bool
  description = "Whether to manage Cloud Run custom domain mappings"
  default     = false
}

variable "billing_account_id" {
  type        = string
  description = "GCP Billing Account ID for budget alerting"
  default     = "013059-480603-477E0A"
}

variable "github_owner" {
  type        = string
  description = "GitHub repository owner/organization"
  default     = "38911BytesFree"
}

variable "github_repo" {
  type        = string
  description = "GitHub repository name"
  default     = "ai-notes"
}

variable "environment" {
  type        = string
  description = "Deployment environment name"
  default     = "prod"
}

variable "budget_amount" {
  type        = string
  description = "Monthly budget alert amount"
  default     = "4000"
}

variable "budget_currency" {
  type        = string
  description = "Currency for the billing budget matching the billing account"
  default     = "JPY"
}

variable "firebase_api_key" {
  type        = string
  description = "Firebase Web API key"
  default     = ""
  sensitive   = true
}

variable "firebase_auth_domain" {
  type        = string
  description = "Firebase Auth domain"
  default     = "ai-notes-507510.firebaseapp.com"
}

variable "firebase_storage_bucket" {
  type        = string
  description = "Firebase storage bucket"
  default     = "ai-notes-507510.firebasestorage.app"
}

variable "firebase_messaging_sender_id" {
  type        = string
  description = "Firebase messaging sender ID"
  default     = "786405456691"
}

variable "firebase_app_id" {
  type        = string
  description = "Firebase web app ID"
  default     = "1:786405456691:web:11c00589c1b217981e1c46"
}

variable "firebase_measurement_id" {
  type        = string
  description = "Firebase measurement ID"
  default     = "G-VRBFCMKKJ1"
}

# Cloud Run assigns these URLs and keeps them for the life of the service. They
# cannot be read from google_cloud_run_v2_service.{api,web}.uri here: each
# service's own env references its URL, which would make the resource depend on
# itself. They change only if a service is deleted and recreated, so do not
# delete them.
variable "api_service_url" {
  type        = string
  description = "Cloud Run URL of the private Go API, the expected aud on service tokens"
  default     = "https://ai-notes-api-g3q7qn4imq-ew.a.run.app"
}

variable "web_service_url" {
  type        = string
  description = "Cloud Run URL of the public web service, used as PUBLIC_BASE_URL until manage_domain is true"
  default     = "https://ai-notes-web-g3q7qn4imq-ew.a.run.app"
}
