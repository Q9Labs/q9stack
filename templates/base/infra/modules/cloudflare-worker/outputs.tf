output "worker_name" {
  description = "Deployed Cloudflare Worker name."
  value       = cloudflare_workers_script.worker.script_name
}

output "custom_domain" {
  description = "Configured custom domain hostname, if any."
  value       = var.custom_domain
}

output "APP_ENV" {
  description = "Configured APP_ENV binding."
  value       = var.APP_ENV
}

output "APP_URL" {
  description = "Configured APP_URL binding."
  value       = var.APP_URL
}

output "LOG_LEVEL" {
  description = "Configured LOG_LEVEL binding."
  value       = var.LOG_LEVEL
}

output "OPENROUTER_API_KEY" {
  description = "Configured OpenRouter secret binding."
  value       = var.OPENROUTER_API_KEY
  sensitive   = true
}

output "SENTRY_DSN" {
  description = "Configured optional public Sentry binding."
  value       = var.SENTRY_DSN
}
