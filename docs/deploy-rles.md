# Deploying to RLES

The `Deploy to RLES` workflow runs manually from `main`. It runs backend and
frontend CI on GitHub-hosted runners, then runs the deploy job on the
organization self-hosted runner group `rles-deploy`, with the `rles` label.
Install that runner on the RLES VM so the deploy job can update
`/home/student/maple/app` and use Docker locally. It does not SSH to the VM.

After a successful deployment, the site serves the deployed SHA at
[`/deployment.json`](https://maplesugaring01.webdev.gccis.rit.edu/deployment.json).

## Configure the runner group

Because this repository is public, do not make an unrestricted runner on the
RLES VM available to every workflow in the repository. An organization owner
should configure a dedicated runner group:

1. In the `Maple-Sugaring` organization, open **Settings → Actions → Runner
   groups** and create `rles-deploy`.
2. Allow only the `7-bit-sequence` repository to use the group.
3. Restrict the group to selected workflows and allow only
   `Maple-Sugaring/7-bit-sequence/.github/workflows/deploy-rles.yml@refs/heads/main`.
4. In **Settings → Actions → Runners**, add a Linux x64 runner to `rles-deploy`
   and give it the `rles` label.

Keep the deploy workflow limited to manual dispatch from `main`. The backend
and frontend jobs stay on GitHub-hosted runners.

## Install the runner on RLES

Sign in to the RLES VM as `student`. In the GitHub runner setup page, select
Linux x64 and copy the current download, checksum verification, and extraction
commands GitHub provides. Run them in a dedicated directory:

```sh
mkdir -p ~/actions-runner && cd ~/actions-runner
```

Then configure it with the temporary registration token shown by GitHub:

```sh
./config.sh \
  --url https://github.com/Maple-Sugaring \
  --token PASTE_THE_TEMPORARY_TOKEN_HERE \
  --runnergroup rles-deploy \
  --name rles-deploy-01 \
  --labels rles \
  --work _work
```

Start it once interactively to confirm it connects and appears online:

```sh
./run.sh
```

Stop the foreground runner with `Ctrl+C`, then install and start it as a service
that runs under `student`:

```sh
sudo ./svc.sh install student
sudo ./svc.sh start
sudo ./svc.sh status
```

The runner needs outbound HTTPS access to GitHub. It needs no inbound firewall
rule for the workflow: deployment commands execute on the VM itself. The
`student` account must be able to access the existing app checkout and run
`docker compose` without an interactive password prompt. Keep the runner
software and its work directory owned by `student`, and do not use this runner
for untrusted workflows.

## Deploy

In GitHub, open **Actions → Deploy to RLES → Run workflow**, select `main`, and
start the run. The deploy job checks that the checkout is clean and that the
selected workflow commit is still the latest `main`, then updates the app,
rebuilds the web and API containers, restarts those two services, and checks
that the site serves the selected SHA. Database and cache services are left
alone.

The deploy commands use the RLES Compose overlay and host configuration files:

```sh
docker compose \
  --env-file /home/student/maple/config/compose.env \
  -f docker-compose.yml \
  -f deploy/rit/compose.rit.yml
```

Use these options for each Compose command. The base `docker-compose.yml` alone
is the local development configuration and does not load the RLES backend
environment file.
