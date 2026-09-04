# Cloud Build Pipelines

The build-and-deploy pipelines for `ai-notes-api` and `ai-notes-web` run on Cloud Build.

Terraform (`infra/terraform/cloud_build.tf`) is the authoritative source of truth for Cloud Build triggers. Triggers are managed declaratively via Terraform rather than manually imported.
