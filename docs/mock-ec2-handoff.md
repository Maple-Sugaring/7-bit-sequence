# Handoff: mock-mode demo on EC2

Audience: Oliver. Goal: a public demo of the frontend in **mock mode** (sample data, role picker, no backend) on its own EC2 host, built the same way as the production host in `terraform/`.

**Status: nothing in this document has been built or applied.** Sections 2 to 5 are a spec written from reading `terraform/main.tf`, `terraform/scripts/*`, `terraform/compose.production.yml` and `.github/workflows/deploy-ec2.yml`. Treat the file contents as a starting point and validate them (`terraform validate`, `docker compose config`) before use.

## 1. What mock mode is, and why it needs its own host

- Mock mode is a static site. All data lives in `Maple-Sugar-FE/src/data/transports/mockTransport.js` and is bundled into the JS. No API, Postgres, Redis, Google OAuth or SSM secrets are involved.
- `VITE_API_MODE` is inlined by Vite at **build time** (`Maple-Sugar-FE/Dockerfile` build arg). It cannot be switched on a running container.
- `docker-compose.yml` hardcodes `VITE_API_MODE: http`, and `terraform/scripts/deploy-host.sh` always pulls backend secrets, backs up Postgres and health-checks the API. The production pipeline therefore cannot ship mock mode.
- **Do not deploy mock mode onto the production instance** (`i-03a1218ff87a002fd`). `deploy-host.sh` swaps `/opt/maple/current`, so it would replace the real `web` container, and `docs/operations.md` forbids it. Use a separate host.

## 2. Fast path (no Terraform, fine for a one-off demo)

1. Launch an Ubuntu 24.04 `t3.micro`, security group inbound TCP 80 only, with the SSM instance profile. No SSH needed.
2. Over SSM: `apt-get install -y docker.io git`, clone the repo, then:
   ```bash
   docker build --build-arg VITE_API_MODE=mock -t maple-sugar-demo ./Maple-Sugar-FE
   docker run -d --restart unless-stopped -p 80:80 --name maple-sugar-demo maple-sugar-demo
   ```
3. Open `http://<public-ip>`. This is plain HTTP, which is fine for the UI. The firmware flasher (Web Serial) needs HTTPS, so use section 3 onward if you need it.

## 3. Proper path: a second Terraform stack

Create `terraform/mock/` as a separate root with its own state key, so a mock `apply` can never touch production resources.

**State:** reuse the bucket from `terraform/backend.tfbackend.example`, but set `key` to something different, for example `mock/terraform.tfstate`.

**Resources:** start from `terraform/main.tf` and change:

| Keep | Remove or change |
| --- | --- |
| VPC, subnet, IGW, route table | Delete `aws_ebs_volume.data` and `aws_volume_attachment.data` |
| Security group with 80 and 443 ingress only | Delete the backup lifecycle rules and the `maple-backup` timer |
| SSM role and instance profile | `instance_type` to `t3.micro`, `root_volume_gib` to 16 |
| Elastic IP | `hostname` to the demo hostname (new DNS record) |
| Artifact bucket (own one) | Rename every IAM role, profile, SG and bucket name so nothing collides with production |

`main.tf` does not set a name prefix in one place, so grep for `maple-sugar` and any hardcoded names before applying.

**User data:** copy `terraform/scripts/user-data.sh.tftpl` and cut it down to: install `docker.io docker-compose-v2` and the AWS CLI, create `/opt/maple/{bin,releases}`, write `host.env`, install `deploy-mock.sh` (section 4), start the SSM agent, `touch /opt/maple/config/bootstrap-complete`. Remove the EBS wait, `mkfs`, fstab, the `/srv/maple` mount, the Docker `RequiresMountsFor` drop-in and the backup service/timer.

## 4. Compose override and deploy script

**`terraform/compose.mock.yml`.** Make it a standalone file, not an override of `docker-compose.yml`. The base file's `api` service has `env_file: Maple-Sugar-BE/.env` with `required: true`, and `package-source.py` strips `.env` files, so layering would fail on the host.

```yaml
name: maple-sugar-mock
services:
  web:
    build:
      context: ../Maple-Sugar-FE
      args:
        VITE_API_BASE_URL: /api
        VITE_API_MODE: mock
    expose:
      - "80"
    restart: unless-stopped
    mem_limit: 128m
  caddy:
    image: caddy:2-alpine
    environment:
      PUBLIC_HOSTNAME: ${PUBLIC_HOSTNAME:?hostname required}
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - web
    restart: unless-stopped
    mem_limit: 128m
volumes:
  caddy_data:
  caddy_config:
```

Caddy data is a plain named volume here because there is no persistent disk. A rebuilt instance re-requests its certificate, which is fine at demo scale but watch the Let's Encrypt rate limit if you rebuild repeatedly. The existing `terraform/Caddyfile` (`reverse_proxy web:80`) works unchanged. The `web` image's nginx still has `API_UPSTREAM=http://api:3000` from the Dockerfile. The template resolves it per request, so nginx starts with no `api` host. Confirm that on first boot.

**`terraform/scripts/deploy-mock-host.sh`**, modeled on `deploy-host.sh` but with no SSM secrets, no Postgres and no backup:

```bash
#!/bin/bash
set -euo pipefail
exec 9>/opt/maple/deploy.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
[ -f /opt/maple/config/bootstrap-complete ] || { echo 'Bootstrap not complete'; exit 1; }
source /opt/maple/config/host.env
bucket=$1; key=$2; revision=$3
[[ "$bucket" =~ ^[a-z0-9.-]+$ && "$revision" =~ ^[a-zA-Z0-9-]+$ && "$key" =~ ^releases/[a-zA-Z0-9/._-]+$ ]] || exit 2
release=/opt/maple/releases/$revision
[ ! -e "$release" ] || { echo 'Revision exists; use a new identifier'; exit 1; }
mkdir -m 700 "$release"
archive=$(mktemp --suffix=.tar.gz); trap 'rm -f "$archive"' EXIT
aws s3 cp "s3://$bucket/$key" "$archive" --region "$AWS_REGION" --only-show-errors
tar -xzf "$archive" -C "$release" --no-same-owner
cd "$release"
printf 'PUBLIC_HOSTNAME=%s\n' "$PUBLIC_HOSTNAME" > /opt/maple/config/compose.env
compose=(docker compose --env-file /opt/maple/config/compose.env -f terraform/compose.mock.yml)
"${compose[@]}" config --quiet
"${compose[@]}" up -d --build --wait --wait-timeout 300
ln -sfn "$release" /opt/maple/current
curl --fail --silent --show-error http://127.0.0.1/ -o /dev/null || curl --fail --silent --show-error -k https://127.0.0.1/ -o /dev/null
echo "Mock deployment completed: $revision"
```

`web` has a healthcheck in its Dockerfile, so `--wait` covers it. The final `curl` is a smoke test and may need `-H "Host: $PUBLIC_HOSTNAME"` if Caddy redirects.

**`terraform/scripts/package-source.py`:** add `terraform/compose.mock.yml` to the `files` tuple. The script already includes `Maple-Sugar-FE` and `terraform/Caddyfile`. Backend source is harmless to ship but unnecessary, so you may add a `--frontend-only` flag.

## 5. Workflow

Copy `.github/workflows/deploy-ec2.yml` to `deploy-ec2-mock.yml` and change:
- the variables to `EC2_MOCK_INSTANCE_ID` and `EC2_MOCK_ARTIFACT_BUCKET` (new repo variables, from the mock stack's outputs)
- the remote command to `/opt/maple/bin/deploy.sh '<bucket>' '<key>' '<revision>'`, where the mock host installs `deploy-mock-host.sh` as `deploy.sh`
- the verification URLs to the demo hostname, and drop the `/api/health` check (there is no API)
- the concurrency group to `maple-app-mock`

**IAM:** the deploy role from `terraform/bootstrap` trusts only this repo's `main` ref, but its permissions are scoped to the production instance and bucket. Add the mock instance ID and bucket to that policy, or the workflow will be denied.

## 6. Order of operations

1. Create the mock Terraform root and the files above. Run `terraform init` with the mock state key, then `plan`. Check the plan creates only new resources and shows no changes to production.
2. `terraform apply`. Note the `elastic_ip`, `instance_id` and artifact bucket outputs.
3. Create a DNS A record for the demo hostname pointing at the Elastic IP. Without a hostname, skip Caddy and serve plain HTTP on port 80.
4. Wait for SSM to show the instance online. Run `cloud-init status --wait` and check `/opt/maple/config/bootstrap-complete`, as `terraform/README.md` step 6 does with `run-ssm.ps1`.
5. Set the new GitHub repo variables, run the mock workflow from `main`, or do it by hand: `python terraform/scripts/package-source.py release.tar.gz`, upload to `releases/<rev>.tar.gz`, then `ssm send-command` with `deploy.sh`.
6. Verify (section 7).

## 7. Verification checklist

- `https://<demo-hostname>/` returns 200 with a valid certificate. The role picker loads.
- Sample data shows on every screen. `/api/health` should return 502 or 404, which is expected.
- Reload mid-session: the login survives, in-page edits reset.
- `docker ps` on the host shows only `web` and `caddy`, and only Caddy publishes host ports.
- Security group has inbound 80 and 443 only. No SSH.

## 8. Gotchas

- **Rebuilds after code changes:** the image bakes the mock data in. Deploy a new revision (the script refuses to reuse a revision ID). If the old UI still appears, build with `--no-cache`.
- **Instance replacement:** changing user data replaces the instance, as in production. Redeploy afterward and update `EC2_MOCK_INSTANCE_ID`.
- **Cost:** a `t3.micro`, a root disk and an Elastic IP bill even while stopped. Tear down with `terraform destroy` in `terraform/mock/` only. Never run destroy from the production root.
- **Docker version:** `docker-compose-v2` on Ubuntu 24.04 satisfies the `>= 2.24.4` note in `compose.production.yml`, which this override doesn't need anyway.
- **Mock vs hybrid:** `docker-compose.demo.yml` is hybrid mode (real login and schedule). It needs the backend and secrets, so it is not what this document covers.
