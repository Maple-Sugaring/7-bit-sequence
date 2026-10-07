#!/bin/bash
set -euo pipefail
umask 077
exec 9>/opt/maple/deploy.lock
flock -n 9 || { echo 'Another application deployment is running'; exit 1; }
[ -f /opt/maple/config/bootstrap-complete ] || { echo 'Instance bootstrap has not completed'; exit 1; }
source /opt/maple/config/host.env
bucket=$1
key=$2
revision=$3
dump_key=${4:-}
[[ "$bucket" =~ ^[a-z0-9.-]+$ && "$revision" =~ ^[a-zA-Z0-9-]+$ && "$key" =~ ^releases/[a-zA-Z0-9/._-]+$ ]] || exit 2
release=/opt/maple/releases/$revision
[ ! -e "$release" ] || { echo 'Revision already exists; use a new release identifier'; exit 1; }
mkdir -m 700 "$release"
archive=$(mktemp --suffix=.tar.gz)
trap 'rm -f "$archive"' EXIT
aws s3 cp "s3://$bucket/$key" "$archive" --region "$AWS_REGION" --only-show-errors
tar -xzf "$archive" -C "$release" --no-same-owner

# Values go straight to protected files, never to SSM command output or state.
aws ssm get-parameter --name "$PARAMETER_PATH/backend-env" --with-decryption --region "$AWS_REGION" --query Parameter.Value --output text > /opt/maple/config/backend.env
password=$(aws ssm get-parameter --name "$PARAMETER_PATH/postgres-password" --with-decryption --region "$AWS_REGION" --query Parameter.Value --output text)
[[ "$password" =~ ^[a-zA-Z0-9]{32,}$ ]] || { echo 'Database password must be URL-safe alphanumeric, at least 32 characters'; exit 1; }
printf 'POSTGRES_PASSWORD=%s\nPUBLIC_HOSTNAME=%s\n' "$password" "$PUBLIC_HOSTNAME" > /opt/maple/config/compose.env
unset password
chmod 600 /opt/maple/config/*.env
cd "$release"
compose=(docker compose --env-file /opt/maple/config/compose.env -f docker-compose.yml -f terraform/compose.production.yml)
"${compose[@]}" config --quiet
"${compose[@]}" build

# Back up before app migrations or a release changes production data.
if [ -L /opt/maple/current ]; then /opt/maple/bin/backup.sh; fi
"${compose[@]}" up -d --wait --wait-timeout 120 db cache
if [ -n "$dump_key" ]; then
  [[ "$dump_key" =~ ^migration/[a-zA-Z0-9/._-]+\.dump$ ]] || exit 2
  [ ! -f /srv/maple/.database-imported ] || { echo 'Initial database import has already run'; exit 1; }
  tables=$("${compose[@]}" exec -T db psql -U maple -d maple_sugaring -Atc "select count(*) from pg_tables where schemaname='public'")
  [ "$tables" = 0 ] || { echo 'Destination database has tables; refusing to overwrite it'; exit 1; }
  dump=$(mktemp --suffix=.dump)
  aws s3 cp "s3://$BACKUP_BUCKET/$dump_key" "$dump" --region "$AWS_REGION" --only-show-errors
  "${compose[@]}" exec -T db pg_restore -U maple -d maple_sugaring --no-owner --no-acl --exit-on-error < "$dump"
  rm -f "$dump"
  touch /srv/maple/.database-imported
fi
"${compose[@]}" up -d --wait --wait-timeout 300 api web
"${compose[@]}" up -d caddy
ln -sfn "$release" /opt/maple/current
"${compose[@]}" exec -T api node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
echo "Application deployment completed: $revision"
