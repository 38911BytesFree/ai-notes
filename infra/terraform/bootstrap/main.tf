terraform {
  required_version = ">= 1.9"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

variable "project_id" {
  type        = string
  description = "GCP Project ID"
  default     = "ai-notes-507510"
}

variable "region" {
  type        = string
  description = "GCP Region"
  default     = "europe-west1"
}

variable "bucket_name" {
  type        = string
  description = "Name of the GCS bucket for Terraform remote state"
  default     = "ai-notes-tfstate"
}

resource "google_storage_bucket" "tf_state" {
  name                        = var.bucket_name
  location                    = var.region
  force_destroy               = false
  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }
}

output "tf_state_bucket" {
  value       = google_storage_bucket.tf_state.name
  description = "Bucket for Terraform remote state storage"
}
