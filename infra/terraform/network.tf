resource "google_compute_network" "vpc" {
  name                    = "ai-notes-vpc"
  auto_create_subnetworks = false
  project                 = var.project_id

  depends_on = [google_project_service.services["compute.googleapis.com"]]
}

resource "google_compute_subnetwork" "subnet" {
  name          = "ai-notes-subnet"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.vpc.id
  project       = var.project_id

  # Direct VPC Egress routes all web-service traffic through this subnet;
  # Private Google Access lets it reach Google APIs without Cloud NAT.
  private_ip_google_access = true
}
