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
