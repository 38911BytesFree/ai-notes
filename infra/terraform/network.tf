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
}

resource "google_vpc_access_connector" "connector" {
  name          = "ai-notes-vpc-connector"
  region        = var.region
  project       = var.project_id
  ip_cidr_range = "10.8.0.0/28"
  network       = google_compute_network.vpc.name

  min_instances = 2
  max_instances = 3
  machine_type  = "e2-micro"

  depends_on = [
    google_project_service.services["vpcaccess.googleapis.com"],
    google_compute_network.vpc
  ]
}
