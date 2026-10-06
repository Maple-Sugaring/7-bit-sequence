# Roles and logins

## Roles

Three roles, keyed by `roles.id`: 1 Admin, 2 Student, 3 MSS. The matrix lives in two mirrored files that must be changed together:

- Frontend (hides menus and buttons, guards routes): `Maple-Sugar-FE/src/business/permissions.js`
- Backend (the real control): `Maple-Sugar-BE/src/business/permissions.js`

| Capability | Admin | Student | MSS |
| --- | :-: | :-: | :-: |
| `view_dashboard` | yes | yes | yes |
| `view_data_table` | yes | yes | yes |
| `export_data` | yes | yes | yes |
| `view_guides` | yes | yes | yes |
| `record_data` | yes | yes | no |
| `view_alerts` | yes | yes | no |
| `resolve_alerts` | yes | yes | no |
| `view_schedule` | yes | yes | no |
| `claim_shift` | yes | yes | no |
| `view_nodes` | yes | yes | no |
| `flag_node` | yes | yes | no |
| `edit_data` | yes | no | no |
| `manage_schedule` | yes | no | no |
| `manage_users` | yes | no | no |
| `deploy_nodes` | yes | no | yes |

`deploy_nodes` is granted to MSS on purpose: the backend comment calls it "Admins and the MSS service account". It gates the Deploy page, gateway registration, and node create/edit/delete.

Intended meaning (from `Maple-Sugar-BE/docs/business.md`): Admins are the course instructors and never expire. Students are enrolled students. MSS members are Maple Sugaring Society members with mostly view-only access. Expiry lengths for Student and MSS accounts are written in that doc with question marks (`120?` days, `1 year?`); **TODO** confirm with the instructor and where it is enforced (the code only checks `Is_Active` and `Account_Expiry` at sign-in; no code that sets a default expiry was found).

## Pages by role

Navigation (`Maple-Sugar-FE/src/routes/navigation.js`) shows an item when the role has its capability. The first visible item is the landing page after sign in.

| Nav label | Route | Capability | Admin | Student | MSS |
| --- | --- | --- | :-: | :-: | :-: |
| The Bush | `/dashboard` | `view_dashboard` | yes | yes | yes |
| Deploy | `/deploy` | `deploy_nodes` | yes | no | yes |
| Schedule | `/schedule` | `view_schedule` | yes | yes | no |
| Collection | `/collection` | `record_data` | yes | yes | no |
| Sugar Woods | `/table` | `view_data_table` | yes | yes | yes |
| Notifications | `/notifications` | `view_alerts` | yes | yes | no |
| Admin | `/admin` | `manage_users` | yes | no | no |

Also routed: `/nodes/:nodeId` (a tree's detail page, `view_dashboard`), `/login`, `/auth/callback`. Legacy paths redirect (`/input` and `/record` to `/collection`, `/alerts` to `/notifications`, `/data` to `/table`, `/nodes` and `/deployed` to `/deploy`, `/schedule/manage` and `/schedule-admin` to `/schedule`, `/guides` to `/dashboard`).

Since the first visible nav item is the landing page, Admin, Student, and MSS land on The Bush (`/dashboard`) in the current nav order.

## Real sign-in (API mode)

1. An admin invites the user's email (Admin page, `POST /users/invite`) or the email is in `BOOTSTRAP_ADMIN_EMAILS` (promoted to Admin with no expiry on every API boot).
2. The user clicks "Sign in with Google" (`GET /auth/google`). Only emails whose domain is in `ALLOWED_EMAIL_DOMAINS` (default `g.rit.edu,rit.edu`) are accepted.
3. First login links the Google subject to the invited row. Unknown email gives `NOT_PROVISIONED`; inactive or expired gives `ACCOUNT_EXPIRED`; unverified Google email gives `EMAIL_UNVERIFIED`.
4. Session is the `maple_session` cookie (JWT, `SESSION_TTL_DAYS`, default 7). The user is re-read on every request, so deactivating an account takes effect immediately.

There is no password login against the real API.

## Mock logins (one per role)

Added in commit `24e09f2` (issue #23). When `VITE_API_MODE=mock`, the login page shows a "Mock data" divider and one button per role: "Continue as Administrator", "Continue as Student", "Continue as MSS Member". In `http` mode the list is empty and the buttons do not render.

How it works:

- `demoAccounts()` in `Maple-Sugar-FE/src/services/authService.js` walks the seed users in `Maple-Sugar-FE/src/data/fixtures/seed.js` in order and takes the first account per role that passes `isAccountUsable` (active and not expired).
- Clicking a button calls `signIn({ email, password: 'mock' })`. The mock transport (`Maple-Sugar-FE/src/data/transports/mockTransport.js`) accepts any non-empty password for a seeded email, so no real credential is involved.
- Sessions are in memory only; a page reload signs out of the mock.
- Seed data in `seed.js` includes a deactivated student (to demonstrate locked accounts) and an MSS account with an expiry date in 2027. Names and emails in the fixtures are placeholders or team members; do not treat them as login credentials for the real API.

To try it:

```bash
cd Maple-Sugar-FE
echo "VITE_API_MODE=mock" > .env.local   # plus VITE_API_BASE_URL=/api if you like
npm run dev
```

Use these to demo each role's view for the sponsor report without a backend.

## Account lifecycle

- `isAccountUsable`: false when `Is_Active` is false or `Account_Expiry` is in the past. Null expiry never expires.
- The Admin page shows status chips (Locked, Expired, "Expires in Nd", No expiry) and lets admins set or clear an end date, change roles, lock, and delete users. An admin cannot demote, deactivate, or delete themselves.
- `Account_Expiry` is a timestamp (date-only values from earlier data were stored as 11:59pm Eastern).
