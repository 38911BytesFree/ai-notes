locals {
  api_service_url = "https://ai-notes-api-g3q7qn4imq-ew.a.run.app"
  public_base_url = var.manage_domain ? "https://${var.domain}" : "https://ai-notes-web-g3q7qn4imq-ew.a.run.app"
}

# -----------------------------------------------------------------------------
# Cloud Run: Go API (Private, Internal Ingress)
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "api" {
  name                = "ai-notes-api"
  location            = var.region
  project             = var.project_id
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  deletion_protection = false

  template {
    service_account = google_service_account.api.email

    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }

    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      resources {
        startup_cpu_boost = true
      }

      ports {
        container_port = 8000
      }

      env {
        name  = "BIND_ADDRESS"
        value = "0.0.0.0:8000"
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }

      env {
        name  = "TRANSCRIPTS_BUCKET"
        value = google_storage_bucket.transcripts.name
      }

      env {
        name  = "GEMINI_MODEL"
        value = "gemini-2.5-flash"
      }

      env {
        name  = "VERTEX_LOCATION"
        value = var.region
      }

      env {
        name  = "INGEST_MONTHLY_LIMIT"
        value = "30"
      }

      env {
        name  = "SUMMARISER_MAX_CHARS"
        value = "200000"
      }

      env {
        name  = "SERVICE_AUDIENCE"
        value = local.api_service_url
      }

      env {
        name  = "WEB_SERVICE_ACCOUNT"
        value = google_service_account.web.email
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
      scaling, # service-level block Cloud Run reports back; template[0].scaling stays managed
    ]
  }

  depends_on = [
    google_project_service.services["run.googleapis.com"],
    google_project_service.services["aiplatform.googleapis.com"],
    google_storage_bucket.transcripts,
  ]
}

# Allow Web Runtime SA to invoke the private Go API
resource "google_cloud_run_v2_service_iam_member" "web_invoke_api" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.web.email}"
}

# -----------------------------------------------------------------------------
# Cloud Run: Web App (Public Ingress)
# -----------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "web" {
  name                = "ai-notes-web"
  location            = var.region
  project             = var.project_id
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.web.email
    timeout         = "900s"

    scaling {
      min_instance_count = 0
      max_instance_count = 5
    }

    # Direct VPC Egress: no always-on connector instances. ALL_TRAFFIC is
    # required so calls to the internal-ingress API count as VPC-originated;
    # Google APIs are reached via Private Google Access on the subnet.
    vpc_access {
      network_interfaces {
        network    = google_compute_network.vpc.id
        subnetwork = google_compute_subnetwork.subnet.id
      }
      egress = "ALL_TRAFFIC"
    }

    containers {
      image = "us-docker.pkg.dev/cloudrun/container/hello"

      resources {
        startup_cpu_boost = true
      }

      ports {
        container_port = 3000
      }

      env {
        name  = "BACKEND_URL"
        value = google_cloud_run_v2_service.api.uri
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "PUBLIC_BASE_URL"
        value = local.public_base_url
      }

      env {
        name = "SESSION_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.session_secret.secret_id
            version = "latest"
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
      scaling, # service-level block Cloud Run reports back; template[0].scaling stays managed
    ]
  }

  depends_on = [
    google_project_service.services["run.googleapis.com"],
    google_compute_subnetwork.subnet,
    google_secret_manager_secret.session_secret
  ]
}

# Public access: allUsers can invoke the web service
resource "google_cloud_run_v2_service_iam_member" "public_invoke_web" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# -----------------------------------------------------------------------------
# Cloud Run: Custom Domain Mappings (managed via var.manage_domain)
# -----------------------------------------------------------------------------

resource "google_cloud_run_domain_mapping" "root" {
  count    = var.manage_domain ? 1 : 0
  location = var.region
  project  = var.project_id
  name     = var.domain

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.web.name
  }
}

resource "google_cloud_run_domain_mapping" "www" {
  count    = var.manage_domain ? 1 : 0
  location = var.region
  project  = var.project_id
  name     = "www.${var.domain}"

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.web.name
  }
}
