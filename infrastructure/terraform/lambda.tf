# ── npm install before packaging ──────────────────────────────────────────────

resource "null_resource" "npm_install" {
  triggers = {
    package_json = filemd5("${path.module}/../lambda/agent/package.json")
  }

  provisioner "local-exec" {
    command     = "npm install --omit=dev"
    working_dir = "${path.module}/../lambda/agent"
  }
}

# ── Zip the Lambda source (node_modules included, test.js excluded) ────────────

data "archive_file" "agent_lambda" {
  depends_on  = [null_resource.npm_install]
  type        = "zip"
  source_dir  = "${path.module}/../lambda/agent"
  output_path = "${path.module}/agent_lambda.zip"
  excludes    = ["test.js", "*.zip", ".env", ".env.*"]
}

# ── IAM role for Lambda ────────────────────────────────────────────────────────

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_agent" {
  name               = "${var.project_name}-lambda-agent"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json

  tags = local.tags
}

resource "aws_iam_role_policy" "lambda_agent" {
  name = "${var.project_name}-lambda-agent-policy"
  role = aws_iam_role.lambda_agent.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SecretsManager"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:*:secret:${var.project_name}/*"
      },
      {
        Sid      = "RdsConnect"
        Effect   = "Allow"
        Action   = ["rds-db:connect"]
        Resource = "*"
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
    ]
  })
}

# VPC access (create/delete ENIs in private subnets)
resource "aws_iam_role_policy_attachment" "lambda_vpc_access" {
  role       = aws_iam_role.lambda_agent.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# ── Lambda security group ──────────────────────────────────────────────────────

resource "aws_security_group" "lambda_agent" {
  name        = "${var.project_name}-lambda-agent-sg"
  description = "Lambda agent outbound: RDS on 5432 and HTTPS for external APIs"
  vpc_id      = var.vpc_id

  egress {
    description     = "PostgreSQL to RDS"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.rds_security_group_id]
  }

  egress {
    description = "HTTPS for Secrets Manager, Gemini, OpenAI via NAT"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.tags, { Name = "${var.project_name}-lambda-agent-sg" })
}

# ── Lambda function ────────────────────────────────────────────────────────────

resource "aws_lambda_function" "agent" {
  function_name    = "${var.project_name}-agent"
  description      = "Juntos travel agent — LangGraph + Gemini 2.5 Flash"
  role             = aws_iam_role.lambda_agent.arn
  runtime          = "nodejs20.x"
  handler          = "handler.handler"
  filename         = data.archive_file.agent_lambda.output_path
  source_code_hash = data.archive_file.agent_lambda.output_base64sha256
  memory_size      = 512
  timeout          = 30

  environment {
    variables = {
      GEMINI_API_KEY        = var.gemini_api_key
      OPENAI_API_KEY        = var.openai_api_key
      AWS_SECRET_NAME       = var.aws_secret_name
      COGNITO_USER_POOL_ID  = aws_cognito_user_pool.main.id
    }
  }

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.lambda_agent.id]
  }

  tags = merge(local.tags, { Name = "${var.project_name}-agent" })

  depends_on = [
    aws_iam_role_policy_attachment.lambda_vpc_access,
    aws_cloudwatch_log_group.lambda_agent,
  ]
}

# ── CloudWatch log group for the Lambda ───────────────────────────────────────

resource "aws_cloudwatch_log_group" "lambda_agent" {
  name              = "/aws/lambda/${var.project_name}-agent"
  retention_in_days = var.log_retention_days

  tags = merge(local.tags, { Name = "${var.project_name}-lambda-agent-logs" })
}

# ── Outputs ───────────────────────────────────────────────────────────────────

output "lambda_function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.agent.function_name
}

output "lambda_function_arn" {
  description = "Lambda function ARN"
  value       = aws_lambda_function.agent.arn
}

# ══════════════════════════════════════════════════════════════════════════════
# WebSocket Lambda
# ══════════════════════════════════════════════════════════════════════════════

resource "null_resource" "npm_install_websocket" {
  triggers = {
    package_json = filemd5("${path.module}/../lambda/websocket/package.json")
  }
  provisioner "local-exec" {
    command     = "npm install --omit=dev"
    working_dir = "${path.module}/../lambda/websocket"
  }
}

data "archive_file" "websocket_lambda" {
  depends_on  = [null_resource.npm_install_websocket]
  type        = "zip"
  source_dir  = "${path.module}/../lambda/websocket"
  output_path = "${path.module}/websocket_lambda.zip"
  excludes    = ["*.zip", ".env"]
}

resource "aws_iam_role" "lambda_websocket" {
  name               = "${var.project_name}-lambda-websocket"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy" "lambda_websocket" {
  name = "${var.project_name}-lambda-websocket-policy"
  role = aws_iam_role.lambda_websocket.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SecretsManager"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:*:secret:${var.project_name}/*"
      },
      {
        Sid      = "WebSocketBroadcast"
        Effect   = "Allow"
        Action   = ["execute-api:ManageConnections"]
        Resource = "arn:aws:execute-api:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*/*/*"
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_websocket_vpc" {
  role       = aws_iam_role.lambda_websocket.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_cloudwatch_log_group" "lambda_websocket" {
  name              = "/aws/lambda/${var.project_name}-websocket"
  retention_in_days = var.log_retention_days
  tags              = local.tags
}

resource "aws_lambda_function" "websocket" {
  function_name    = "${var.project_name}-websocket"
  description      = "Juntos WebSocket handler — connect/disconnect/broadcast"
  role             = aws_iam_role.lambda_websocket.arn
  runtime          = "nodejs20.x"
  handler          = "handler.handler"
  filename         = data.archive_file.websocket_lambda.output_path
  source_code_hash = data.archive_file.websocket_lambda.output_base64sha256
  memory_size      = 256
  timeout          = 10

  environment {
    variables = {
      AWS_SECRET_NAME        = var.aws_secret_name
      WEBSOCKET_API_ENDPOINT = replace(aws_apigatewayv2_stage.websocket_prod.invoke_url, "wss://", "https://")
      COGNITO_USER_POOL_ID   = aws_cognito_user_pool.main.id
    }
  }

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.lambda_agent.id]
  }

  tags = merge(local.tags, { Name = "${var.project_name}-websocket" })

  depends_on = [
    aws_iam_role_policy_attachment.lambda_websocket_vpc,
    aws_cloudwatch_log_group.lambda_websocket,
  ]
}

# ══════════════════════════════════════════════════════════════════════════════
# Conversations Lambda
# ══════════════════════════════════════════════════════════════════════════════

resource "null_resource" "npm_install_conversations" {
  triggers = {
    package_json = filemd5("${path.module}/../lambda/conversations/package.json")
  }
  provisioner "local-exec" {
    command     = "npm install --omit=dev"
    working_dir = "${path.module}/../lambda/conversations"
  }
}

data "archive_file" "conversations_lambda" {
  depends_on  = [null_resource.npm_install_conversations]
  type        = "zip"
  source_dir  = "${path.module}/../lambda/conversations"
  output_path = "${path.module}/conversations_lambda.zip"
  excludes    = ["*.zip", ".env"]
}

resource "aws_iam_role" "lambda_conversations" {
  name               = "${var.project_name}-lambda-conversations"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = local.tags
}

resource "aws_iam_role_policy" "lambda_conversations" {
  name = "${var.project_name}-lambda-conversations-policy"
  role = aws_iam_role.lambda_conversations.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SecretsManager"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:*:secret:${var.project_name}/*"
      },
      {
        Sid      = "S3Upload"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = "arn:aws:s3:::${var.project_name}-attachments-*/*"
      },
      {
        Sid    = "CloudWatchLogs"
        Effect = "Allow"
        Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      },
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_conversations_vpc" {
  role       = aws_iam_role.lambda_conversations.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_cloudwatch_log_group" "lambda_conversations" {
  name              = "/aws/lambda/${var.project_name}-conversations"
  retention_in_days = var.log_retention_days
  tags              = local.tags
}

resource "aws_lambda_function" "conversations" {
  function_name    = "${var.project_name}-conversations"
  description      = "Juntos conversations + messages + upload presign"
  role             = aws_iam_role.lambda_conversations.arn
  runtime          = "nodejs20.x"
  handler          = "handler.handler"
  filename         = data.archive_file.conversations_lambda.output_path
  source_code_hash = data.archive_file.conversations_lambda.output_base64sha256
  memory_size      = 256
  timeout          = 15

  environment {
    variables = {
      AWS_SECRET_NAME      = var.aws_secret_name
      ATTACHMENTS_BUCKET   = aws_s3_bucket.attachments.bucket
      COGNITO_USER_POOL_ID = aws_cognito_user_pool.main.id
    }
  }

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [aws_security_group.lambda_agent.id]
  }

  tags = merge(local.tags, { Name = "${var.project_name}-conversations" })

  depends_on = [
    aws_iam_role_policy_attachment.lambda_conversations_vpc,
    aws_cloudwatch_log_group.lambda_conversations,
  ]
}
