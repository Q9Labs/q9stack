output "record_ids" {
  description = "Cloudflare DNS record IDs keyed by the input record name."
  value       = { for key, record in cloudflare_dns_record.record : key => record.id }
}

output "record_hostnames" {
  description = "Cloudflare DNS record hostnames keyed by the input record name."
  value       = { for key, record in cloudflare_dns_record.record : key => record.name }
}
