terraform {
  required_version = ">= 1.10, < 2.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}
provider "aws" {
  region = var.aws_region
  default_tags {
    tags = { Project = "maple-sugar", ManagedBy = "Terraform" }
  }
}
variable "aws_region" {
  type    = string
  default = "us-east-1"
}
variable "github_repository" {
  type    = string
  default = "Maple-Sugaring/7-bit-sequence"
}
variable "existing_oidc_provider_arn" {
  type        = string
  default     = ""
  description = "Set when this AWS account already has the GitHub OIDC provider."
}
data "aws_caller_identity" "current" {}
locals {
  account = data.aws_caller_identity.current.account_id
  oidc    = var.existing_oidc_provider_arn != "" ? var.existing_oidc_provider_arn : aws_iam_openid_connect_provider.github[0].arn
}
resource "aws_s3_bucket" "state" {
  bucket = "maple-sugar-tfstate-${local.account}-${var.aws_region}"
  lifecycle { prevent_destroy = true }
}
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Deny", Principal = "*", Action = "s3:*"
      Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}
resource "aws_iam_openid_connect_provider" "github" {
  count          = var.existing_oidc_provider_arn == "" ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}
resource "aws_iam_role" "github" {
  for_each = toset(["terraform", "deploy"])
  name     = "maple-sugar-github-${each.key}"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow", Principal = { Federated = local.oidc }, Action = "sts:AssumeRoleWithWebIdentity"
      Condition = { StringEquals = {
        "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:ref:refs/heads/main"
      } }
    }]
  })
}
resource "aws_iam_role_policy" "terraform" {
  role = aws_iam_role.github["terraform"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["ec2:*"], Resource = "*", Condition = { StringEquals = { "aws:RequestedRegion" = var.aws_region } } },
      { Effect = "Allow", Action = ["s3:*"], Resource = ["arn:aws:s3:::maple-sugar-*-${local.account}-${var.aws_region}", "arn:aws:s3:::maple-sugar-*-${local.account}-${var.aws_region}/*"] },
      { Effect = "Allow", Action = ["iam:GetRole", "iam:CreateRole", "iam:DeleteRole", "iam:TagRole", "iam:UntagRole", "iam:UpdateAssumeRolePolicy", "iam:ListRolePolicies", "iam:GetRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:ListAttachedRolePolicies", "iam:AttachRolePolicy", "iam:DetachRolePolicy"], Resource = "arn:aws:iam::${local.account}:role/maple-sugar-ec2" },
      { Effect = "Allow", Action = ["iam:CreateInstanceProfile", "iam:DeleteInstanceProfile", "iam:GetInstanceProfile", "iam:TagInstanceProfile", "iam:UntagInstanceProfile", "iam:AddRoleToInstanceProfile", "iam:RemoveRoleFromInstanceProfile"], Resource = "arn:aws:iam::${local.account}:instance-profile/maple-sugar-ec2" },
      { Effect = "Allow", Action = ["iam:PassRole"], Resource = "arn:aws:iam::${local.account}:role/maple-sugar-ec2", Condition = { StringEquals = { "iam:PassedToService" = "ec2.amazonaws.com" } } }
    ]
  })
}
resource "aws_iam_role_policy" "deploy" {
  role = aws_iam_role.github["deploy"].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["s3:PutObject", "s3:GetObject"], Resource = "arn:aws:s3:::maple-sugar-artifacts-${local.account}-${var.aws_region}/releases/*" },
      { Effect = "Allow", Action = ["ssm:SendCommand"], Resource = "arn:aws:ssm:${var.aws_region}::document/AWS-RunShellScript" },
      { Effect = "Allow", Action = ["ssm:SendCommand"], Resource = "arn:aws:ec2:${var.aws_region}:${local.account}:instance/*", Condition = { StringEquals = { "ssm:resourceTag/Project" = "maple-sugar" } } },
      { Effect = "Allow", Action = ["ssm:GetCommandInvocation", "ssm:ListCommandInvocations", "ssm:ListCommands", "ssm:DescribeInstanceInformation", "ec2:DescribeInstances"], Resource = "*" }
    ]
  })
}
output "state_bucket" { value = aws_s3_bucket.state.id }
output "terraform_role_arn" { value = aws_iam_role.github["terraform"].arn }
output "deploy_role_arn" { value = aws_iam_role.github["deploy"].arn }
