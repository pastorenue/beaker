# AGENT.md — Multi-Organization (Org Switching)

This document guides adding **multi-organization support** so a user can belong to multiple orgs and **switch the active org** to perform any operation in the app.

## Goals / Success Criteria

- Users can create/join multiple organizations.
- There’s always a clear **active organization context** for authenticated requests.
- All org-scoped data (experiments, user groups, feature flags/gates, analytics, SDK tokens, etc.) is **isolated by org**.
- Frontend provides an org switcher and persists the selection.
- Backend enforces org scoping consistently (no cross-org reads/writes).

Non-goals (for first pass):
- SSO / SCIM provisioning
- Complex RBAC beyond basic roles (owner/admin/member)
- Cross-org analytics aggregation

---

## High-level design

### Key concepts

- **Organization**: Top-level tenant.
- **Membership**: Connects a user to an organization with a role.
- **Active organization**: The org that request handlers should use to scope all operations.

### Request scoping contract

Pick one of these approaches (A is recommended):

**A) Header-based active org** (recommended)
- Frontend sends `X-Org-Id: <uuid>` with every authenticated request.
- Backend middleware validates membership and attaches `org_id` to request context.

**B) Token-embedded active org**
- JWT includes `org_id` claim.
- Switching org requires issuing a new token.

This repo currently uses JWT + server-side session validation (see `backend/src/middleware/auth.rs`). To avoid re-issuing tokens frequently, use **Approach A**.

---

## Backend plan (Rust / Actix / SQLx)

### 1) Database schema

Add a new migration (e.g. `backend/migrations/003_create_organizations.sql`).

Tables:

- `organizations`
  - `id uuid pk default uuid_generate_v4()`
  - `name text not null`
  - `created_at timestamptz not null default now()`

- `organization_memberships`
  - `id uuid pk default uuid_generate_v4()`
  - `org_id uuid not null references organizations(id) on delete cascade`
  - `user_id uuid not null references users(id) on delete cascade`
  - `role text not null` (enum-ish: `owner|admin|member`)
  - `created_at timestamptz not null default now()`
  - unique constraint `(org_id, user_id)`

Then **scope existing domain tables by org**.

You likely have tables for experiments, user_groups, feature_flags, feature_gates, sdk_tokens, events, etc. For each org-owned entity:

- Add `org_id uuid not null references organizations(id) on delete cascade`.
- Add useful indexes, e.g. `(org_id, created_at)`, `(org_id, name)`.

Migration strategy (choose based on existing data):

- If the app is used only locally/dev: create a default org and set all rows to that org.
- If there’s real data: write a data backfill that creates a per-user default org and assigns rows based on ownership.

### 2) Auth middleware: identify user + org

Current middleware validates `Authorization: Bearer <jwt>` and checks `sessions`.

Extend it to also:

1. Parse `X-Org-Id` header as UUID.
2. Validate the authenticated `user_id` is a member of that org.
3. Attach `user_id` and `org_id` into request extensions so handlers can read them.

Suggested extension keys:

- `req.extensions_mut().insert(AuthedUser { user_id, org_id, role })`

Where:

```rust
pub struct AuthedUser {
  pub user_id: Uuid,
  pub org_id: Uuid,
  pub role: OrgRole,
}
```

Behavior:
- If `X-Org-Id` is missing:
  - Option 1: pick the user’s most recent org (stored server-side) and proceed.
  - Option 2 (simpler & explicit): return 400 with `{ error: "Missing X-Org-Id" }`.

Prefer option 2 for correctness; add a frontend default selection so it’s always present.

### 3) Organization API

Add `backend/src/api/organizations.rs` and mount under `/api/organizations`.

Endpoints (minimum viable):

- `GET /api/organizations` — list orgs for current user
- `POST /api/organizations` — create org; creator becomes `owner`
- `GET /api/organizations/{org_id}` — org details (member-only)
- `GET /api/organizations/{org_id}/members` — list members (admin+)
- `POST /api/organizations/{org_id}/members` — invite/add by email (admin+)
- `DELETE /api/organizations/{org_id}/members/{user_id}` — remove member (admin+)

Optional convenience:
- `POST /api/organizations/{org_id}/leave`

### 4) Make all domain APIs org-scoped

For each existing handler/service that queries or mutates data:

- Add `org_id` filter in SELECTs.
- When inserting, set `org_id` from request context.
- When updating/deleting, include `AND org_id = $org_id`.

Places to check (based on repo structure):

- `backend/src/api/*.rs` (experiments, user_groups, events, feature_flags, feature_gates, analytics, sdk)
- `backend/src/services/*_service.rs`
- `backend/src/models/**`
- `backend/src/db/postgres.rs` and queries

### 5) SDK tokens and tracking endpoints

There are endpoints excluded from auth middleware:

- `/api/track/...` and `/api/sdk/feature-flags...`

Those likely authenticate using header keys (`x-beaker-key`).

Update those flows to additionally resolve an org:

- Option A: Make keys **org-scoped** (store tokens with `org_id`, and look up org by key).
- Option B: Require `X-Org-Id` on sdk/track calls too.

Prefer **org-scoped keys** so the SDK doesn’t need org headers.

### 6) Tests (backend)

Add focused tests for:

- Auth middleware rejects missing/invalid `X-Org-Id`.
- Auth middleware rejects `X-Org-Id` where user isn’t a member.
- Org scoping: user cannot read/write entities in another org.

If there’s no existing test harness, add minimal integration tests that spin up the Actix app with a test DB.

---

## Frontend plan (React / Vite / Axios)

### 1) Org context + storage

Add a small org state module:

- Store `activeOrgId` in `localStorage` (e.g. `beaker-org-id`).
- On login or initial load:
  - call `GET /api/organizations`
  - if no active org selected, choose the first org (or the one flagged `is_default` if you add it later)

### 2) Axios: send org header

In `frontend/src/services/api.ts` request interceptor:

- Read `beaker-org-id` from localStorage.
- If present, set header `X-Org-Id`.

This ensures **every** request is scoped.

### 3) Org switcher UI

Add a simple dropdown in an existing top-level nav component (likely in `components/Common.tsx` or the home header), with:

- list orgs
- selected org name
- action: switch org
  - update localStorage
  - refresh data views (either reload page or invalidate queries/state)

### 4) Update types and api client

Add TS types:

```ts
export interface Organization { id: string; name: string; created_at: string; }
export interface OrganizationMembership { org_id: string; user_id: string; role: 'owner'|'admin'|'member'; }
```

Add `organizationApi` in `frontend/src/services/api.ts`.

---

## Rollout checklist

- [ ] Add migrations for org + memberships.
- [ ] Add `org_id` columns to org-scoped tables + backfill.
- [ ] Implement org API endpoints.
- [ ] Extend auth middleware to enforce `X-Org-Id` + membership.
- [ ] Update all services/queries to include `org_id`.
- [ ] Update SDK token logic to be org-scoped.
- [ ] Frontend: store active org, send header, add org switcher.
- [ ] Add tests for middleware and data isolation.

---

## Edge cases to handle

- User has 0 orgs (new user): create a default org at registration or first login.
- Removing a user from the active org: frontend should detect 403/401 and force org re-select.
- Last owner leaving org: prevent leaving or transfer ownership.
- Switching org while background requests are in-flight: cancel/ignore stale responses.

---

## Suggested minimal MVP behavior

- On user registration: automatically create an organization named like `"<email> Org"` and add membership as `owner`.
- Require `X-Org-Id` for all authenticated endpoints.
- Scope all reads/writes by `org_id`.
- Add frontend org dropdown in the main header.
