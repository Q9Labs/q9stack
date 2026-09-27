module "worker" {
  source = "../../modules/cloudflare-worker"

  account_id         = var.CLOUDFLARE_ACCOUNT_ID
  worker_name        = "__APP_SLUG__-web"
  zone_id            = var.CLOUDFLARE_ZONE_ID
  custom_domain      = var.CUSTOM_DOMAIN
  APP_ENV            = var.APP_ENV
  APP_URL            = var.APP_URL
  LOG_LEVEL          = var.LOG_LEVEL
  OPENROUTER_API_KEY = var.OPENROUTER_API_KEY
  SENTRY_DSN         = var.SENTRY_DSN
}

module "dns" {
  source = "../../modules/dns"

  zone_id = var.CLOUDFLARE_ZONE_ID
  records = var.DNS_RECORDS
}
