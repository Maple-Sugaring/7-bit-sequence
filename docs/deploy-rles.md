# Deploying to RLES

The `Deploy to RLES` workflow runs manually from `main`. It runs the backend and
frontend CI commands against the selected `main` commit before connecting to RLES.
After a successful deployment, the site serves the deployed SHA at
[`/deployment.json`](https://maplesugaring01.webdev.gccis.rit.edu/deployment.json).

## One-time SSH setup

Create a dedicated Ed25519 key pair on a trusted machine:

```sh
ssh-keygen -t ed25519 -C "github-actions-rles-deploy" -f rles-deploy
```

Add the contents of `rles-deploy.pub` to
`/home/student/.ssh/authorized_keys` on RLES. Store the private key file contents
as the repository Actions secret `RLES_DEPLOY_KEY`:

**Settings → Secrets and variables → Actions → New repository secret**

Do not commit either key file. The workflow pins the RLES ED25519 host key
(`SHA256:BwoZFU1J4GHBu2FkrlziDB9ACnwy5Ciu5RmvL8FH/mk`) and refuses unknown or
changed host keys.

## Deploy

In GitHub, open **Actions → Deploy to RLES → Run workflow**, select `main`, and
start the run. The deploy job updates `/home/student/maple/app`, rebuilds the
web and API containers, restarts those two services, and checks that the site
serves the SHA selected for the run. Database and cache services are left alone.
