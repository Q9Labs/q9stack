terraform {
  required_version = ">= 1.12.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

variable "account_id" {
  description = "Cloudflare account that owns the Worker."
  type        = string
}

variable "worker_name" {
  description = "Globally unique Cloudflare Worker name."
  type        = string
}

variable "zone_id" {
  description = "Cloudflare zone ID used by the optional custom domain."
  type        = string
  default     = null
  nullable    = true
}

variable "custom_domain" {
  description = "Optional hostname attached to the Worker custom domain."
  type        = string
  default     = null
  nullable    = true
}

variable "APP_ENV" {
  description = "Deployment environment exposed to the Worker."
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.APP_ENV)
    error_message = "APP_ENV must be dev or prod."
  }
}

variable "APP_URL" {
  description = "Canonical application URL exposed to the Worker."
  type        = string
}

variable "LOG_LEVEL" {
  description = "Application log level exposed to the Worker."
  type        = string
}

variable "OPENROUTER_API_KEY" {
  description = "Server-only OpenRouter API key bound as a Worker secret."
  type        = string
  sensitive   = true
}

variable "SENTRY_DSN" {
  description = "Optional public Sentry DSN exposed to the Worker."
  type        = string
  default     = null
  nullable    = true
}

locals {
  plain_bindings = concat(
    [
      {
        name = "APP_ENV"
        type = "plain_text"
        text = var.APP_ENV
      },
      {
        name = "APP_URL"
        type = "plain_text"
        text = var.APP_URL
      },
      {
        name = "LOG_LEVEL"
        type = "plain_text"
        text = var.LOG_LEVEL
      },
    ],
    var.SENTRY_DSN == null ? [] : [
      {
        name = "SENTRY_DSN"
        type = "plain_text"
        text = var.SENTRY_DSN
      },
    ],
  )

  secret_bindings = [
    {
      name = "OPENROUTER_API_KEY"
      type = "secret_text"
      text = var.OPENROUTER_API_KEY
    },
  ]

  bindings = concat(local.plain_bindings, local.secret_bindings)
}

resource "cloudflare_workers_script" "worker" {
  account_id  = var.account_id
  script_name = var.worker_name
  content     = file("${path.module}/worker.js")
  bindings    = local.bindings
}

resource "cloudflare_workers_custom_domain" "worker" {
  count = var.custom_domain == null ? 0 : 1

  account_id = var.account_id
  hostname   = var.custom_domain
  service    = cloudflare_workers_script.worker.script_name
  zone_id    = var.zone_id
}
