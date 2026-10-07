#!/bin/bash
set -euo pipefail
umask 077
source /opt/maple/config/host.env
cd /opt/maple/current
compose=(docker compose --env-file /opt/maple/config/compose.env -f docker-compose.yml -f terraform/compose.production.yml)
temp=$(mktemp --suffix=.dump)
trap 'rm -f "$temp"' EXIT
"${compose[@]}" exec -T db pg_dump -U maple -d maple_sugaring -Fc > "$temp"
aws s3 cp "$temp" "s3://$BACKUP_BUCKET/daily/$(date -u +%Y-%m-%dT%H-%M-%SZ).dump" --region "$AWS_REGION" --sse AES256 --only-show-errors
echo 'Database backup completed.'
