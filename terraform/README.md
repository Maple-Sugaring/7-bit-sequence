# EC2 production deployment

One Ubuntu 24.04 `t3.medium` in `us-east-1` runs the Compose application. Caddy
terminates HTTPS for `ritmaplesugaring.privatedns.org`, then Nginx forwards `/api`
to Express. Only TCP 80/443 have inbound security-group rules. Postgres, Redis,
the API, and Nginx have no public host-port mappings. Administration uses SSM.

The root disk and separate database/certificate disk are encrypted gp3 EBS.
Database and Caddy directories bind to `/srv/maple` on the persistent disk;
Docker requires that mount before starting. Terraform prevents deletion of the
data disk and S3 buckets. This is one server, so maintenance causes downtime.

## First deployment

Requirements: authenticated AWS CLI, Terraform >=1.10, Python 3, PowerShell 7,
and Docker Desktop running the existing local Postgres container.

1. Verify `aws sts get-caller-identity` and use `us-east-1` throughout.
2. Run `terraform -chdir=terraform/bootstrap init`, `plan`, then `apply`.
   Bootstrap creates the private, encrypted, versioned state bucket and GitHub
   OIDC roles. If GitHub's OIDC provider already exists, set
   `existing_oidc_provider_arn` to its ARN instead of creating another.
3. Copy `bootstrap/backend.tf.example` to ignored
   `bootstrap/backend_override.tf`; set its bucket from the bootstrap output.
   Run `terraform -chdir=terraform/bootstrap init -migrate-state`. Both bootstrap
   and production state then reside in S3, using native lockfiles. Protect the
   initial local state until migration is confirmed.
4. Copy `backend.tfbackend.example` to ignored `backend.tfbackend`, replace the
   account placeholder, and run:

   ```powershell
   terraform -chdir=terraform init "-backend-config=backend.tfbackend"
   terraform -chdir=terraform plan "-out=production.tfplan"
   terraform -chdir=terraform apply production.tfplan
   ./terraform/scripts/configure-secrets.ps1
   ./terraform/scripts/export-database.ps1
   python terraform/scripts/package-source.py terraform/.local/release.tar.gz
   ```

5. Upload the archive to the artifact bucket under `releases/<revision>.tar.gz`
   and the dump to the backup bucket under `migration/<timestamp>.dump`, with
   `aws s3 cp ... --sse AES256`. These objects and buckets stay private.
6. Wait for SSM to report the instance online, then use `run-ssm.ps1` to run
   `cloud-init status --wait` and verify `/opt/maple/config/bootstrap-complete`.
   Deploy using `/opt/maple/bin/deploy.sh <artifact-bucket> <archive-key>
   <unique-revision> <migration-dump-key>` through SSM. The optional last argument
   is for the first import only; it refuses to overwrite existing tables.
7. Point the FreeDNS A record at the `elastic_ip` Terraform output. Caddy obtains
   and renews its certificate automatically. Verify `/` and `/api/health` over
   HTTPS before directing devices to the server.
8. In the existing Google OAuth web client, add this JavaScript origin:
   `https://ritmaplesugaring.privatedns.org`, and these authorized redirect URIs:
   `https://ritmaplesugaring.privatedns.org/api/auth/google/callback` and
   `https://ritmaplesugaring.privatedns.org/api/auth/google/calendar/callback`.
9. Set the physical Pi's `MAPLE_API_URL` to
   `https://ritmaplesugaring.privatedns.org/api/ingest` and restart its gateway.
   Preserve its existing ingest token, which matches the backend's local env.

Backend values are copied from local `Maple-Sugar-BE/.env` to an SSM SecureString,
with production public URLs and CORS origins substituted. A separate random
Postgres password is generated once and reused. Secrets are excluded from
Terraform state, Git, archives, and command output. To update app secrets, rerun
`configure-secrets.ps1` then deploy the application. Do not manually rotate the
Postgres parameter without also changing the database role's password.

## GitHub Actions

After merging this branch into `main`, set these repository **variables** using
bootstrap/production Terraform outputs (these identifiers are not secrets):

| Variable | Terraform output |
| --- | --- |
| `TF_STATE_BUCKET` | bootstrap `state_bucket` |
| `AWS_TERRAFORM_ROLE_ARN` | bootstrap `terraform_role_arn` |
| `AWS_DEPLOY_ROLE_ARN` | bootstrap `deploy_role_arn` |
| `EC2_INSTANCE_ID` | production `instance_id` |
| `EC2_ARTIFACT_BUCKET` | production `artifact_bucket` |

`Terraform EC2` validates pull requests without AWS credentials. Manual runs
from `main` use OIDC to plan or apply infrastructure with state locking.
`Deploy Docker stack to EC2` manually packages `main`, uploads it to private
S3, deploys through SSM, and checks HTTPS. IAM trust permits only this repo's
`main` ref. Infrastructure and application operations are separate; bootstrap,
initial migration, DNS, and OAuth registration are one-time local steps.

Provider dependency lockfiles are committed. The Ubuntu AMI lookup selects the
latest image; review replacement plans before applying. Changing boot scripts
also replaces the instance. Data EBS is preserved and reattached, but app source
must be redeployed and `EC2_INSTANCE_ID` updated after replacement. Do not
manually destroy data resources to make a replacement plan succeed.

## Backup, verification, and recovery

`maple-backup.timer` makes a consistent `pg_dump` every day at 03:00 America/New_York.
Each successful later deployment also backs up before migrations. S3 objects
are encrypted with AES256, denied over non-TLS connections, and expire after
seven days; backup logs are in `journalctl -u maple-backup.service`.

Run a backup immediately through SSM with `systemctl start maple-backup.service`.
Run `bash terraform/scripts/verify-host.sh` from the active release to check
HTTPS, authenticated idempotent ingest, and a backup restoration into a scratch
database. It replays an existing sample and creates no new sensor reading.
Verify restoration into a separate scratch database and compare table counts
before treating a backup as recoverable. Compare source/destination counts
after initial import, test authenticated ingest, then restart Compose and
reboot the instance to check data and certificate persistence. Verify the EC2
security group and host Docker mappings have no DB, Redis, API, or SSH ingress.

Releases live under `/opt/maple/releases/<revision>`; `/opt/maple/current` points
to the active release. Application rollback uses a previously packaged commit
with a new release identifier. A database rollback is a separate maintenance
operation: stop writers and restore a selected backup after preserving the
current database. Old releases are retained on EBS root storage; monitor disk
usage and prune unused releases as needed. Never remove `/srv/maple`.

AWS bills the EC2 instance, EBS, public IPv4 address, S3, and traffic. Stopping
the instance retains storage and Elastic IP charges. Resource removal is a
deliberate Terraform operation; protected data resources require an explicit
change to their `prevent_destroy` settings.
