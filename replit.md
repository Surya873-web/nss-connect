# NSS Connect

A role-based college NSS portal for event registration, attendance, verified volunteer hours, announcements, and staff reporting.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/api-server run create-staff` — securely create the first staff account
- `pnpm --filter @workspace/nss-connect run typecheck` — check the web app
- `pnpm --filter @workspace/api-server run typecheck` — check the API
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — PostgreSQL connection string; `SESSION_SECRET` — private random value of at least 32 characters

## Stack and product

- Responsive NSS management web app for students and authorized staffs
- Web: React + Vite, TypeScript, generated React Query API hooks
- API: Express 5, TypeScript; contract-first OpenAPI with Orval-generated Zod schemas
- Database: PostgreSQL + Drizzle ORM
- Authentication: server-side sessions, scrypt password hashes, role checks, CSRF token validation
- The workspace stack is React/Vite + Express + PostgreSQL; this is documented in `README.md`.

## Where things live

- `artifacts/nss-connect` — responsive public pages and student/staff dashboards
- `artifacts/api-server` — auth, event, attendance, announcement, and report APIs
- `lib/api-spec/openapi.yaml` — API contract source of truth
- `lib/db/src/schema/nss.ts` — PostgreSQL schema
- `README.md` — local setup, first staff account creation, and supported stack notes

## Architecture decisions

- Roles are assigned only by account creation in trusted server-side flows; student signup cannot select a role.
- Volunteer hours are derived from an staff-verified attendance record and the event's configured hours.
- Session cookies are HTTP-only; the matching CSRF token is readable by the same-origin client and validated for state-changing signed-in requests.

## Product

Students browse and join published events, review their own attendance and hours, read announcements, and manage permitted profile fields. Staffs manage events and registrations, verify attendance, search students, publish notices, and download volunteer-hour CSV reports.

## Gotchas

- Run `pnpm --filter @workspace/db run push` after schema changes in development.
- The browser uses the same-origin `/api` path; local Vite development proxies it to the API on port 5000.
- Do not commit `.env`, database URLs, or session secrets.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
