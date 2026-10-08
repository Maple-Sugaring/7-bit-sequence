output "instance_id" { value = aws_instance.app.id }
output "elastic_ip" { value = aws_eip.app.public_ip }
output "data_volume_id" { value = aws_ebs_volume.data.id }
output "public_url" { value = "https://${var.hostname}" }
output "artifact_bucket" { value = aws_s3_bucket.storage["artifacts"].id }
output "backup_bucket" { value = aws_s3_bucket.storage["backups"].id }
output "parameter_path" { value = local.parameter_path }
output "aws_region" { value = var.aws_region }
