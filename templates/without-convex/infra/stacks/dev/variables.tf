variable "CLOUDFLARE_API_TOKEN" {
  description = "Cloudflare API token supplied by the deployment environment."
  type        = string
  sensitive   = true
}

variable "CLOUDFLARE_ACCOUNT_ID" {
  description = "Cloudflare account ID supplied by the deployment environment."
  type        = string
}

variable "CLOUDFLARE_ZONE_ID" {
  description = "Optional Cloudflare zone ID for custom domains and DNS records."
  type        = string
  default     = null
  nullable    = true
}

variable "CUSTOM_DOMAIN" {
  description = "Optional custom hostname for the Worker."
  type        = string
  default     = null
  nullable    = true
}

variable "APP_ENV" {
  description = "Deployment environment."
  type        = string
  default     = "dev"

  validation {
    condition     = var.APP_ENV == "dev"
    error_message = "The dev stack must use APP_ENV=dev."
  }
}

variable "APP_URL" {
  description = "Canonical application URL."
  type        = string
}

variable "API_URL" {
  description = "Canonical API URL."
  type        = string
}

variable "API_PORT" {
  description = "API listen port."
  type        = number
  default     = 3001
}

variable "DATABASE_URL" {
  description = "PostgreSQL connection URL supplied by the deployment environment."
  type        = string
  sensitive   = true
}

variable "BETTER_AUTH_SECRET" {
  description = "Better Auth signing secret supplied by the deployment environment."
  type        = string
  sensitive   = true
}

variable "PASSWORD_RESET_WEBHOOK_URL" {
  description = "Optional HTTPS endpoint for password-reset delivery."
  type        = string
  default     = null
  nullable    = true
}

variable "PASSWORD_RESET_WEBHOOK_TOKEN" {
  description = "Optional bearer token for the password-reset delivery webhook."
  type        = string
  default     = null
  nullable    = true
  sensitive   = true
}

variable "LOG_LEVEL" {
  description = "Application log level."
  type        = string
  default     = "info"
}

variable "OPENROUTER_API_KEY" {
  description = "Required server-only OpenRouter API key."
  type        = string
  sensitive   = true
}

variable "SENTRY_DSN" {
  description = "Optional public Sentry DSN."
  type        = string
  default     = null
  nullable    = true
}

variable "DNS_RECORDS" {
  description = "Optional Cloudflare DNS records keyed by a stable logical name."
  type = map(object({
    name    = string
    type    = string
    content = string
    ttl     = optional(number, 1)
    proxied = optional(bool, false)
  }))
  default = {}
}
