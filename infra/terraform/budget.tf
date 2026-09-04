resource "google_billing_budget" "budget" {
  billing_account = var.billing_account_id
  display_name    = "ai-notes-monthly-budget"

  budget_filter {
    projects               = ["projects/${data.google_project.project.number}"]
    credit_types_treatment = "INCLUDE_ALL_CREDITS"
    calendar_period        = "MONTH"
  }

  amount {
    specified_amount {
      currency_code = var.budget_currency
      units         = var.budget_amount
    }
  }

  threshold_rules {
    threshold_percent = 0.5
  }

  threshold_rules {
    threshold_percent = 0.9
  }

  threshold_rules {
    threshold_percent = 1.0
  }

  depends_on = [
    google_project_service.services["billingbudgets.googleapis.com"]
  ]
}
