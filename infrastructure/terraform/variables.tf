variable "project_name" {
  description = "Name prefix applied to all resources"
  type        = string
  default     = "juntos"
}

variable "environment" {
  description = "Deployment environment (e.g. dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "us-east-1"
}

variable "availability_zones" {
  description = "List of two AZs to spread subnets across"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "db_name" {
  description = "Initial database name created in the RDS instance"
  type        = string
  default     = "juntos"
}

variable "db_username" {
  description = "Master username for the RDS instance"
  type        = string
  default     = "juntos_admin"
}

variable "db_master_password" {
  description = "Master password for the RDS instance — ignored after initial creation (managed via Secrets Manager)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_engine_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "16"
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 7
}

# ── Lambda variables ───────────────────────────────────────────────────────────

variable "gemini_api_key" {
  description = "Gemini API key for the agent Lambda"
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API key for text-embedding-3-small"
  type        = string
  sensitive   = true
}

variable "aws_secret_name" {
  description = "Secrets Manager secret name holding RDS credentials"
  type        = string
  default     = "juntos/rds/master-credentials"
}

variable "vpc_id" {
  description = "VPC ID to place the Lambda in"
  type        = string
  default     = "vpc-03bb9bdf572a2cafe"
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for Lambda VPC config"
  type        = list(string)
  default     = ["subnet-01132a467df7d72a5", "subnet-0e754586922cede85"]
}

variable "rds_security_group_id" {
  description = "RDS security group ID — Lambda is allowed outbound 5432 to this SG"
  type        = string
  default     = "sg-02587cb6c17ebe958"
}

variable "google_places_api_key" {
  description = "Google Places API key for on-demand review scraping"
  type        = string
  sensitive   = true
  default     = ""
}
