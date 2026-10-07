# Deployment record — October 6, 2026

Production: https://ritmaplesugaring.privatedns.org

| Resource | Value |
| --- | --- |
| AWS region | `us-east-1` |
| EC2 | `i-03a1218ff87a002fd`, Ubuntu 24.04, `t3.medium` |
| Elastic IP | `34.225.248.172` |
| Persistent encrypted data disk | `vol-00efbd8d10872d12e`, 30 GiB gp3 |
| Encrypted root disk | 30 GiB gp3 |
| Terraform state | `maple-sugar-tfstate-068648884177-us-east-1` |
| Backups | `maple-sugar-backups-068648884177-us-east-1` |
| Release artifacts | `maple-sugar-artifacts-068648884177-us-east-1` |

Terraform provisioned 10 bootstrap resources and 27 production resources.
Bootstrap and production state were migrated/configured in encrypted,
versioned, private S3 with lockfiles. Both subsequent plans reported no changes.
The backend environment and Postgres password are SSM SecureStrings; no secret
values are in Git or Terraform state. GitHub repository variables are configured
for the OIDC roles, backend bucket, EC2 instance, and artifact bucket.

## Migration and verification

A consistent `pg_dump` snapshot of local Docker Postgres was restored into an
empty EC2 database. Local data was retained. Key table counts matched after
import, container restarts, and a complete EC2 reboot:

| Table | Local source | EC2 |
| --- | ---: | ---: |
| `node` | 1 | 1 |
| `metrics` | 17 | 17 |
| `users` | 12 | 12 |
| `buckets` | 1 | 1 |
| `gateway` | 1 | 1 |
| `schema_migrations` | 15 | 15 |

- Public frontend and `/api/health` returned 200 over verified HTTPS.
- Postgres and Redis health checks passed.
- Authenticated idempotent ingest returned 200; missing credentials returned 401.
- OAuth redirect and secure cookie checks passed, and an authenticated
  application session returned 200.
- Scheduled backups are active at 03:00 America/New_York with seven-day S3
  expiration. An encrypted S3 backup was downloaded and successfully restored
  into a scratch database; key table counts matched and the scratch DB was removed.
- Certificate checksums and database contents survived container restarts and
  an EC2 reboot. Both EBS disks are encrypted. Security-group ingress permits
  only TCP 80/443, and only Caddy publishes host ports.
- FreeDNS A record registration was completed and verified. The user confirmed
  the corresponding Google OAuth origin and callback URLs were saved.
- The physical Pi's ingest URL was changed, its token matched the backend, and
  `maple-gateway.service` was restarted. A request from the Pi to public HTTPS
  ingest returned 200 for a duplicate sample. The receiver was listening on
  `/dev/ttyUSB0`; no new radio packets arrived during the verification window.

All pull request checks passed, including 154 of 154 backend tests, frontend
checks, backend lint, environment consistency, and Terraform validation.
Actionlint, production Compose validation, and deployed stack checks passed.
The initial local SMTP test failure was caused by missing `nodemailer` in the
existing local dependency installation; the clean CI dependency install passed.
Nodemailer was updated to 10.0.15 to resolve the production audit findings;
the production dependency audit now reports zero advisories.

GitHub Actions deployment jobs are restricted to `main` and become runnable
after this branch is merged. One-time infrastructure deployment and migration
were performed locally through Terraform, encrypted S3, and SSM.
