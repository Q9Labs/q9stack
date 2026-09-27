output "APP_ENV" {
  description = "Configured APP_ENV value."
  value       = var.APP_ENV
}

output "APP_URL" {
  description = "Configured APP_URL value."
  value       = var.APP_URL
}

output "LOG_LEVEL" {
  description = "Configured LOG_LEVEL value."
  value       = var.LOG_LEVEL
}

output "OPENROUTER_API_KEY" {
  description = "Configured OpenRouter API key."
  value       = var.OPENROUTER_API_KEY
  sensitive   = true
}

output "SENTRY_DSN" {
  description = "Configured optional Sentry DSN."
  value       = var.SENTRY_DSN
}

output "worker_name" {
  description = "Deployed Worker name."
  value       = module.worker.worker_name
}

output "custom_domain" {
  description = "Configured Worker custom domain, if any."
  value       = module.worker.custom_domain
}

output "dns_record_ids" {
  description = "Created DNS record IDs."
  value       = module.dns.record_ids
}
