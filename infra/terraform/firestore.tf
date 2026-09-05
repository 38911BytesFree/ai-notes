resource "google_firestore_database" "database" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  delete_protection_state = "DELETE_PROTECTION_ENABLED"
  deletion_policy         = "ABANDON"

  depends_on = [google_project_service.services["firestore.googleapis.com"]]
}

# -----------------------------------------------------------------------------
# Firestore Indexes: notes collection
# -----------------------------------------------------------------------------

# 1. Vector Index: owner_uid ASC + embedding (768 flat)
resource "google_firestore_index" "notes_vector" {
  project    = var.project_id
  database   = google_firestore_database.database.name
  collection = "notes"

  fields {
    field_path = "owner_uid"
    order      = "ASCENDING"
  }

  fields {
    field_path = "__name__"
    order      = "ASCENDING"
  }

  fields {
    field_path = "embedding"
    vector_config {
      dimension = 768
      flat {}
    }
  }
}

# 2. Composite Index: owner_uid ASC, created_at DESC
resource "google_firestore_index" "notes_by_created" {
  project    = var.project_id
  database   = google_firestore_database.database.name
  collection = "notes"

  fields {
    field_path = "owner_uid"
    order      = "ASCENDING"
  }

  fields {
    field_path = "created_at"
    order      = "DESCENDING"
  }
}

# 3. Composite Index: owner_uid ASC, category ASC, created_at DESC
resource "google_firestore_index" "notes_by_category" {
  project    = var.project_id
  database   = google_firestore_database.database.name
  collection = "notes"

  fields {
    field_path = "owner_uid"
    order      = "ASCENDING"
  }

  fields {
    field_path = "category"
    order      = "ASCENDING"
  }

  fields {
    field_path = "created_at"
    order      = "DESCENDING"
  }
}

# -----------------------------------------------------------------------------
# Firestore Indexes: pat_tokens collection
# -----------------------------------------------------------------------------

resource "google_firestore_index" "pat_tokens_by_created" {
  project    = var.project_id
  database   = google_firestore_database.database.name
  collection = "pat_tokens"

  fields {
    field_path = "uid"
    order      = "ASCENDING"
  }

  fields {
    field_path = "created_at"
    order      = "DESCENDING"
  }
}

# -----------------------------------------------------------------------------
# Firestore TTL Policies: oauth_codes and oauth_tokens
# -----------------------------------------------------------------------------

resource "google_firestore_field" "oauth_codes_ttl" {
  project    = var.project_id
  database   = google_firestore_database.database.name
  collection = "oauth_codes"
  field      = "expires_at"
  ttl_config {}
}

resource "google_firestore_field" "oauth_tokens_ttl" {
  project    = var.project_id
  database   = google_firestore_database.database.name
  collection = "oauth_tokens"
  field      = "expires_at"
  ttl_config {}
}
