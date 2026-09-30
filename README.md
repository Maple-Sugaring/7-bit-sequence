# Run 7-Bit Sequence with Docker Compose

Follow these steps, in order, to run the complete application locally. Docker Compose starts the React dashboard, nginx, the Express API, PostgreSQL, and Redis. Do not start the frontend or backend separately with `npm`.

## 1. Install and start Docker

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and start it. In a terminal, verify that Docker and the Compose plugin are available:

```sh
docker --version
docker compose version
```

Both commands must print a version before continuing.

## 2. Get the repository and open its root directory

Clone the repository if you do not already have it, then change into the cloned directory:

```sh
git clone https://github.com/Maple-Sugaring/7-bit-sequence.git
cd 7-bit-sequence
```

If you already cloned it, open a terminal in the directory that contains `docker-compose.yml` instead.

## 3. Create the API environment file

Copy the template to the file Docker Compose reads:

```sh
cp Maple-Sugar-BE/.env.example Maple-Sugar-BE/.env
```

In Windows PowerShell, use this equivalent command:

```powershell
Copy-Item Maple-Sugar-BE/.env.example Maple-Sugar-BE/.env
```

Open `Maple-Sugar-BE/.env` in an editor. Do not commit this file.

## 4. Create a Google OAuth web client

The application requires Google sign-in. In [Google Cloud Console](https://console.cloud.google.com/):

1. Create or select a Google Cloud project.
2. Open **APIs & Services** → **OAuth consent screen**. Complete its required fields and add every person who will sign in as a test user when the app is in testing mode.
3. Open **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**.
4. Choose **Web application**.
5. Add both of these authorized redirect URIs exactly:

   ```text
   http://localhost:8080/api/auth/google/callback
   http://localhost:8080/api/auth/google/calendar/callback
   ```

6. Create the client, then copy its client ID and client secret.
7. Open **APIs & Services** → **Library**, enable the **Google Calendar API**, then add `https://www.googleapis.com/auth/calendar.events` to the OAuth consent screen scopes.

## 5. Fill in `Maple-Sugar-BE/.env`

Set these three required values using the OAuth client from the previous step:

```dotenv
JWT_SECRET=replace-with-a-random-secret-of-at-least-32-characters
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

Generate a unique `JWT_SECRET`; for example, if OpenSSL is installed, run this command and paste its output into the file:

```sh
openssl rand -base64 48
```

For a local Docker run, leave these template values unchanged:

```dotenv
PUBLIC_API_URL=http://localhost:8080/api
PUBLIC_WEB_URL=http://localhost:8080
ALLOWED_EMAIL_DOMAINS=g.rit.edu,rit.edu
```

If you will open the app from another machine, replace `localhost` in both `PUBLIC_*` values with the host name or IP address that browser will use, then register the matching two redirect URIs in Google Cloud Console. If your sign-in account is not an RIT account, update `ALLOWED_EMAIL_DOMAINS` to include its domain.

Leave `NODE_ENV`, `PORT`, `DATABASE_URL`, `REDIS_URL`, and `BOOTSTRAP_ADMIN_EMAILS` unset in this file: Compose supplies them.

## 6. Build and start the complete stack

From the repository root, build the images and start every service in the background:

```sh
docker compose up --build -d
```

This starts `db`, `cache`, `api`, and `web`. The API waits for PostgreSQL; the web server waits for the API health check. On its first successful start, the API applies database migrations and seeds data.

## 7. Verify the services

Check that the containers are running:

```sh
docker compose ps
```

If a service is still starting or unhealthy, view the relevant logs:

```sh
docker compose logs --tail=100 db cache api web
```

When `web` and `api` are healthy, open these URLs in a browser:

```text
http://localhost:8080
http://localhost:8080/api/health
```

Sign in with a Google account permitted by `ALLOWED_EMAIL_DOMAINS`. An address listed in `BOOTSTRAP_ADMIN_EMAILS` in `docker-compose.yml` is promoted to Admin when the API starts; use that account to invite other users.

## 8. Start or stop the stack later

After the first successful build, start the existing containers without rebuilding:

```sh
docker compose up -d
```

Stop the application while keeping PostgreSQL data:

```sh
docker compose down
```

To stop the application **and permanently delete all local database data**, run:

```sh
docker compose down -v
```
