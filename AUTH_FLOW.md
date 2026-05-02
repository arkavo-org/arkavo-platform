# AUTH_FLOW.md

## Purpose
Defines the canonical authentication and authorization flow for Arkavo `OrgPortal` + `PIdP`, including actor separation and PAT management rules.

## Actor Model

### Owner Account (`users`)
- Table: `users`
- Intended for platform/control-plane actions:
  - Website ownership/management
  - API token (PAT) lifecycle
  - Sysadmin capabilities (when configured)

### Website User (`website_users`)
- Table: `website_users`
- Intended for app/data-plane actions scoped to a website.
- Must not be used for owner-only control-plane endpoints.

## Token Types

### Session Cookie (browser)
- Set by PIdP during web login/session flows.
- Used to bootstrap/refresh runtime bearer token.

### Runtime Bearer JWT
- Obtained from `GET /auth/session-token` (with cookie).
- Used as `Authorization: Bearer <token>` for API endpoints requiring `oauth2_scheme`.

### PAT (`pidp_pat_*`)
- Created/managed via owner-authenticated endpoints.
- Scope-constrained (`service`, `org_portal`, `org_mcp`, `org_admin`).

## Canonical Browser Flow

1. User authenticates via PIdP web login (`/app/login`, social callback, exchange).
2. Browser holds valid session cookie.
3. Client fetches runtime JWT via `GET /auth/session-token` (`credentials: include`).
4. Client calls owner APIs with `Authorization: Bearer <runtime-jwt>`.
5. On `401`, client refreshes runtime JWT once, retries once.

## Endpoint Auth Rules (PIdP)

### `/auth/tokens` family
- `GET /auth/tokens`
- `POST /auth/tokens`
- `PATCH /auth/tokens/{token_id}`
- `DELETE /auth/tokens/{token_id}`
- `POST /auth/tokens/{token_id}/cycle`

Rules:
- Requires bearer auth (`oauth2_scheme` path).
- Must resolve actor through owner resolver (`users`).
- `website_users` actor is invalid for these endpoints.

## Error Semantics

### `401 Unauthorized`
- Missing/invalid bearer/session context.
- Client must re-authenticate or refresh session token.

### `403 Forbidden`
- Authenticated but disallowed actor/permissions.
- Common case: authenticated as `website_user` for owner-only endpoint.

## DevTools Requirements

### PAT Management
- Must use explicit bearer mode for `/auth/tokens` endpoints.
- Must not rely on implicit cookie-only calls for PAT APIs.
- Should:
  - Attempt runtime token refresh before PAT call
  - Retry once on `401`
  - Show explicit actionable UI:
    - `401`: re-authenticate prompt
    - `403`: actor mismatch/permission explanation with active identity UUID/email

### Visibility
- Always display active identity context from token introspection when available:
  - owner/email/id
  - token kind/scope/grants

## UUID Alignment Policy
- Required: distinct UUIDs across `users` and `website_users`, even for the same email.
- Reason: these are different security principals with different authorization surfaces.
- If IDs are changed:
  - Existing tokens/sessions may become stale.
  - User must log out and re-authenticate.

## Operational Checklist

1. Verify current actor via `/service/token-info`.
2. Confirm runtime token issuance via `/auth/session-token`.
3. Confirm PAT endpoints are called with bearer token.
4. Distinguish `401` (auth) vs `403` (authz/actor).
5. After identity migrations, force fresh login.
