# NSS Connect

NSS Connect is a responsive college National Service Scheme portal for volunteers and authorized staffs. Students can register for activities and track their attendance and verified hours. Staffs manage events, rosters, attendance, and announcements.

## Platform stack

NSS Connect uses React + Vite, Express + TypeScript, PostgreSQL, and pnpm. The API and frontend are served from one origin in production.

## Run in this Replit project

The project uses the provisioned PostgreSQL database and the managed app preview. Use the **NSS Connect** preview to open the app. The API runs at `/api`.

Public staff registration is disabled. The first staff account must be created with the one-time local bootstrap command below; authorized staff can create additional accounts in the staff dashboard.

Set a unique secret of at least 15 characters as `STAFF_SIGNUP_INVITE_PASSWORD` in the deployment's private environment variables. It is used by the existing staff password-reset flow; share it only with trusted staff.

For local development, set `STAFF_SIGNUP_INVITE_PASSWORD` as well as `DATABASE_URL` and `SESSION_SECRET`. The old one-time staff bootstrap command remains available:

```sh
pnpm --filter @workspace/api-server run create-staff
```

The command prompts for the name, email, and a password without echoing the password. It refuses to create another account after a staff account exists. The first account setup also adds a small set of future sample events and a welcome announcement if the events table is empty. Students can create accounts through the app's student sign-up page.

## Download and run locally

1. Download the NSS Connect source ZIP from the project chat and extract it.
2. Install Node.js 24 and pnpm, then run `pnpm install` from the extracted project folder.
3. Create a PostgreSQL database and copy `.env.example` to `.env`. Set `DATABASE_URL` to your PostgreSQL connection string (e.g. `postgresql://USER:PASSWORD@HOST:5432/DATABASE`), `SESSION_SECRET` to a random value of at least 32 characters, and `STAFF_SIGNUP_INVITE_PASSWORD` to a unique secret of at least 15 characters. `NSS_COLLEGE_NAME` and `NSS_UNIT_NAME` are optional certificate settings; they default to Bannari Amman Institute of Technology and National Service Scheme. Do not commit `.env`.
4. Load those environment values in your terminal before running the commands below. On macOS/Linux, use `set -a; source .env; set +a`.
5. Create/update the PostgreSQL database tables with `pnpm --filter @workspace/db run push`, then apply the staff-account limit trigger with `pnpm --filter @workspace/db run apply-staff-limit`.
6. In one terminal, start the API with `PORT=5000 pnpm --filter @workspace/api-server run dev`.
7. In another terminal, start the web app with `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/nss-connect run dev`.
8. Open the local Vite URL. Create the first staff account with `pnpm --filter @workspace/api-server run create-staff`, sign in at `/staff/login`, and create student accounts through **Sign up** to test both roles.

The local web server forwards `/api` to the API on port 5000. If you use Windows PowerShell, set the equivalent environment variables with `$env:NAME = "value"` before each command.

## Deploy to Render

The root `render.yaml` defines one web service named `nss-connect` and one PostgreSQL database. `DATABASE_URL` is connected from the database resource automatically. The API serves the built frontend and API on the same origin, and the database schema is applied during each build. Render generates `SESSION_SECRET`.

To deploy, put this project in a GitHub repository, sign in to Render, choose **New → Blueprint**, connect the repository, and deploy the `render.yaml` Blueprint. Render will provide the public `onrender.com` URL after the first successful deploy.

This Blueprint uses Render's free web-service plans for an initial preview. Free services and databases can have availability limitations. Do not store important or long-term data in a temporary database. Upgrade to persistent paid plans before production use.

## Features

- Separate student and NSS staff dashboards with server-verified roles and staff-managed account creation
- Scrypt password hashing, opaque server-side sessions, secure HTTP-only cookies, CSRF checks, login lockout/rate limiting, input validation, and role-protected API routes
- Event publishing, registration/cancellation, attendance, and hours calculated only from verified attendance
- Short-lived QR attendance tokens with revocation, registration checks, and duplicate-attendance prevention
- Staff-reviewed volunteer certificate requests, downloadable Unicode PDF certificates, and public certificate verification
- Student announcements with unread tracking
- NSS staff program creation, activity monitoring, attendance, student directory, and CSV export of verified volunteer hours
- PostgreSQL schema with foreign keys, unique registration constraints, and indexes

## Backups

Automated encrypted off-site backups are not configured in this repository yet. Render's free plans are temporary and do not provide a durable backup target; do not rely on them for important data. Configure a separate managed PostgreSQL plan and an external encrypted backup destination before production use.

## Important setup notes

- Student sign-in accepts email or student ID. Staff sign in at `/staff/login` using their staff email; access is read from the account record and never selected by the user.
- Public staff registration is disabled. Create the first staff account with the one-time local CLI bootstrap command; authorized staff can create additional accounts from the staff dashboard.
- Configure `DATABASE_URL` (PostgreSQL connection string) and `SESSION_SECRET` as private environment variables when hosting outside this project.
- This project is ready for Replit publishing. For other hosts, run the API and web app as separate services and route `/api` to the API.

## Staff role migration

This version uses `student` and `staff` as the only application roles. If you are updating an existing database, run `database/migrations/001_incharge_to_staff.sql` once before deploying so existing Incharge accounts become Staff accounts without losing their data. New staff accounts are created with the `create-staff` script; staff access is not available through student sign-up.
