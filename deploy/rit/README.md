# RIT server deploy (maplesugaring01.webdev.gccis.rit.edu)

The RIT VM runs the Docker stack and polls `origin/main` every minute; a new commit triggers `git merge --ff-only` and `docker compose up -d --build`.

## One-time setup on the VM
```bash
ssh student@maplesugaring01.webdev.gccis.rit.edu -p 22010
mkdir -p ~/maple/config && cd ~/maple
git clone https://github.com/Maple-Sugaring/7-bit-sequence app   # public repo; use a read-only deploy key if private

# secrets (never committed)
cat > config/compose.env <<ENV
POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')
WEB_PORT=80
ENV
cp app/Maple-Sugar-BE/.env.example config/backend.env
chmod 600 config/*.env
$EDITOR config/backend.env   # see below
```
`backend.env` for production: `NODE_ENV=production`, `JWT_SECRET` (`openssl rand -base64 48`), Google OAuth id/secret, `GATEWAY_INGEST_TOKEN`, and `PUBLIC_API_URL=https://maplesugaring01.webdev.gccis.rit.edu/api`, `PUBLIC_WEB_URL=https://maplesugaring01.webdev.gccis.rit.edu`. Add `https://maplesugaring01.webdev.gccis.rit.edu/api/auth/google/callback` as a redirect URI in the Google Cloud Console. `DATABASE_URL`/`REDIS_URL` are set by the overlay.

First deploy, then enable the poller:
```bash
cd ~/maple/app && MAPLE_CONFIG_DIR=~/maple/config bash deploy/rit/deploy.sh   # no-op if already current; to force: docker compose ... up -d --build
mkdir -p ~/.config/systemd/user
cp deploy/rit/maple-deploy.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now maple-deploy.timer
loginctl enable-linger "$USER"      # keep timer running after logout (may need sudo)
journalctl --user -u maple-deploy -f
```
No systemd user session? Use cron instead: `* * * * * $HOME/maple/app/deploy/rit/deploy.sh >> $HOME/maple/deploy.log 2>&1`.

Note: the first run when HEAD already equals origin/main exits without starting anything, so start the stack manually once:
`docker compose --env-file ~/maple/config/compose.env -f docker-compose.yml -f deploy/rit/compose.rit.yml up -d --build`

## Pointing the Raspberry Pi at it
On the Pi, in `gateway/raspberry-pi/.env`:
```
FORWARD_TO_SERVER=1
MAPLE_API_URL=https://maplesugaring01.webdev.gccis.rit.edu/api/ingest
GATEWAY_INGEST_TOKEN=<same value as GATEWAY_INGEST_TOKEN in the VM's backend.env>
```
then restart the Pi app (`sudo systemctl restart maple-gateway` if the unit exists). Check with `curl -i https://maplesugaring01.webdev.gccis.rit.edu/api/health` from the Pi.
