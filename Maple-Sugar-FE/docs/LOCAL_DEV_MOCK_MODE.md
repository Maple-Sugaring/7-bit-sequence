# Local Dev: Bypassing Login with Mock Mode

How to run `Maple-Sugar-FE` against in-memory mock data so you can test pages in dev without the Express backend or Google sign-in. Everything here is **local only**: nothing in this guide gets pushed to GitHub. Avoids having to rebuild Docker each time a change is made in front-end development and shows changes live in dev without login errors.

## Background

The frontend has two transports, chosen in `src/data/apiClient.js`:

```js
const mode = import.meta.env.VITE_API_MODE ?? 'mock';
const transport = mode === 'http' ? httpTransport : mockTransport;
```

- `VITE_API_MODE=http` sends requests through the Vite proxy to the Express API at `127.0.0.1:3000`.
- Anything else (including unset) uses the in-memory mock transport.

The repo's `.env` sets `VITE_API_MODE=http` (line 11), so by default the app talks to a backend that may not be running. On the login page, `demoAccounts()` in `authService.js` returns an empty list unless `apiMode === 'mock'`, so the "Continue as ..." buttons only appear in mock mode.

## Symptoms that mean you're in the wrong mode

- Terminal spam like:
  ```
  [vite] http proxy error: /auth/session
  Error: connect ECONNREFUSED 127.0.0.1:3000
  ```
- Clicking "Sign in with Google" produces `/auth/google` proxy errors.
- No "Mock data" divider or "Continue as ..." buttons on the login page.

## Setup

### 1. Create a local override

Run from inside the `Maple-Sugar-FE` directory (next to `.env`, not the repo root):

```bash
cd Maple-Sugar-FE
echo "VITE_API_MODE=mock" >> .env.local
```

Vite loads env files in this order, with later files overriding earlier ones:

1. `.env`
2. `.env.local`
3. `.env.development`
4. `.env.development.local`

So `.env.local` overrides the `http` value in `.env` without touching the shared file.

### 2. Make sure it stays out of Git

```bash
git status
```

`.env.local` should **not** appear. If it does, add this line to `.gitignore`:

```
.env.local
```

### 3. Restart the dev server

Vite only reads env files at startup, so stop it (Ctrl+C) and run:

```bash
npm run dev
```

### 4. Verify

- No more `ECONNREFUSED 127.0.0.1:3000` errors in the terminal.
- The login page shows a **Mock data** divider with one "Continue as ..." button per role.
- Clicking a button signs you in (the mock transport accepts any password for a seeded account) and routes you to that role's landing page.

Each button is a different role, so you can use them to test role-specific views.

## Switching back to the real API

Delete the line from `.env.local` (or delete the file) and restart `npm run dev`. The value in `.env` (`http`) applies again. You'll need the backend running on port 3000, and Google login only works if your localhost origin is registered in the OAuth config.

## Troubleshooting

| Problem | Likely cause | Fix |
| --- | --- | --- |
| Still seeing proxy errors after the change | Dev server wasn't restarted | Stop and restart `npm run dev` |
| Still in `http` mode | `.env.local` is in the wrong folder | It must be in `Maple-Sugar-FE/`, where Vite is launched |
| Still in `http` mode | The variable is exported in your shell, which beats env files | Run `echo $VITE_API_MODE`; if set, `unset VITE_API_MODE` |
| Still in `http` mode | A `package.json` script sets it inline (e.g. `dev:http`) | Check `scripts` and use the plain `dev` script |
| Mock mode but no demo buttons | Value isn't exactly `mock` (typo, `Mock`, trailing space) | Fix the value in `.env.local` |
| A role's button is missing | All seeded users for that role have an expired `Account_Expiry` (`isAccountUsable` filters them out) | Update the dates in `src/data/fixtures/seed` |
| Logged out on every refresh | Mock session lives in memory only | See "Optional" below |

To find where the variable is set:

```bash
grep -rn "VITE_API_MODE" --include=".env*" .
```

## Optional: auto sign-in on the login page

If you're tired of clicking a demo button after every reload, you can have the login page sign in for you in mock mode. Note this **edits `LoginPage.jsx`, which is tracked by Git**, so don't commit it.

Add this inside `LoginPage`, after `signInAsDemo` is defined (and make sure `useEffect` is imported from `react`):

```jsx
useEffect(() => {
  if (restoring || isAuthenticated || !DEMO_ACCOUNTS.length) return;
  if (!import.meta.env.VITE_AUTO_LOGIN_ROLE_INDEX) return; // opt-in
  const account = DEMO_ACCOUNTS[Number(import.meta.env.VITE_AUTO_LOGIN_ROLE_INDEX)];
  if (account) signInAsDemo(account.email);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [restoring, isAuthenticated]);
```

Then add to `.env.local`:

```
VITE_AUTO_LOGIN_ROLE_INDEX=0
```

Change the index to pick a different role; remove the line to get the normal login screen again. It only fires when `DEMO_ACCOUNTS` is non-empty, which means mock mode only, so it can't trigger against the real API.

To keep this edit out of your commits:

```bash
git update-index --skip-worktree src/pages/LoginPage.jsx   # adjust to the real path
```

Undo with `git update-index --no-skip-worktree <path>` before you need to pull or commit real changes to that file. Alternatively, just discard the change with `git checkout -- <path>` before committing.

## Keeping this guide itself local

If you don't want this file in the repo, add it to your personal exclude list (this is not shared and doesn't touch `.gitignore`):

```bash
echo "LOCAL_DEV_MOCK_MODE.md" >> .git/info/exclude
```

## Quick reference

```bash
cd Maple-Sugar-FE
echo "VITE_API_MODE=mock" >> .env.local   # enable mock mode
git status                                # confirm .env.local isn't tracked
npm run dev                               # restart the dev server
```