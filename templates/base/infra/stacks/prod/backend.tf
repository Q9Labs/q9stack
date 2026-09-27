terraform {
  backend "s3" {
    bucket       = "__APP_SLUG__-tofu-state"
    key          = "prod/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
