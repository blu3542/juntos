resource "aws_db_subnet_group" "main" {
  name        = "${var.project_name}-rds-subnet-group"
  description = "RDS PostgreSQL subnet group - private subnets only"
  # TEMPORARY: public subnets only so the instance is placed with an IGW route.
  # Revert to aws_subnet.private[*].id after testing.
  subnet_ids  = aws_subnet.public[*].id

  tags = merge(local.tags, { Name = "${var.project_name}-rds-subnet-group" })
}

resource "aws_db_parameter_group" "main" {
  name        = "${var.project_name}-postgres16"
  family      = "postgres16"
  description = "PostgreSQL 16 parameter group for ${var.project_name}"

  parameter {
    name         = "shared_preload_libraries"
    value        = "pg_stat_statements"
    apply_method = "pending-reboot"
  }

  tags = merge(local.tags, { Name = "${var.project_name}-pg-param-group" })
}

resource "aws_db_instance" "main" {
  identifier = "${var.project_name}-postgres"

  engine         = "postgres"
  engine_version = var.db_engine_version
  instance_class = var.db_instance_class

  db_name  = var.db_name
  username = var.db_username
  password = random_password.db.result

  allocated_storage = 20
  storage_type      = "gp2"
  storage_encrypted = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.aurora.id]
  parameter_group_name   = aws_db_parameter_group.main.name

  publicly_accessible = true # TEMPORARY — revert to false after local testing
  multi_az            = false

  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn

  enabled_cloudwatch_logs_exports = ["postgresql"]

  skip_final_snapshot = true

  tags = merge(local.tags, { Name = "${var.project_name}-postgres" })
}
