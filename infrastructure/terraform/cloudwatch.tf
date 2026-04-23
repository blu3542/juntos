resource "aws_cloudwatch_log_group" "rds_postgresql" {
  name              = "/aws/rds/instance/${var.project_name}-postgres/postgresql"
  retention_in_days = var.log_retention_days

  tags = merge(local.tags, { Name = "${var.project_name}-rds-logs" })
}
