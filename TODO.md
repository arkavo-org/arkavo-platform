# TODO

## OrgPortal Email Integration (Resend)

- [x] Configure org runtime to auto-load `RESEND_API_KEY` from `.env.resend`.
- [x] Wire SMTP relay defaults in `org/run.py` (`smtp.resend.com:587`, username `resend`).
- [x] Create Resend domain `arkavo.org` (id: `d399536e-e10f-4fe7-bd0e-99211f2f4cde`).
- [ ] Publish required DNS records for `arkavo.org` in Route53 (or current DNS provider):
  - `TXT` `resend._domainkey` = `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDeG3VkLY7nHK+rcIb5RHTRLfddg0S8rws1Pdy1Pu+H8LiFIliUykbzxb8IR1QYzQRYYT/45UP5yNUDf54Xn2ne912/RQOmJ0Z2vd3gxq/Z7TLmoVpp5Z9Uz73B9umGMb4abYIYEwXbNnNIKTvQFt8f8/zKPKUF6lWL68pbLeKHkwIDAQAB`
  - `MX` `send` = `10 feedback-smtp.us-east-1.amazonses.com`
  - `TXT` `send` = `v=spf1 include:amazonses.com ~all`
- [ ] Re-run Resend domain verification until status becomes `verified`.
- [ ] Send production-path test email from `noreply@arkavo.org` to `julian@codecollective.us`.
- [ ] Validate business-card intake email notification end-to-end after domain verification.

## Notes

- Current blocker: DNS records are not present on authoritative nameservers for `arkavo.org`.
- Nginx cannot satisfy this requirement; verification is DNS-based.

## Near-Term Product / Platform Backlog

### Auth, Access, and Roles

- [ ] Enforce `SysAdmin` vs `Admin` vs `Member` vs `Attendee` vs `Public` checks on every org API route.
- [ ] Add explicit access matrix tests for all protected routes (positive and negative cases).
- [ ] Add self-service profile-scoped PAT management UI in OrgPortal (create/revoke/view last-used).
- [ ] Add PAT scope documentation and examples to `org/ACCESS_POLICY.md`.

### Events and Attendance

- [ ] Fix remaining `401` cases for event attendance actions in the live dev portal flow.
- [ ] Add frontend UX fallback for unauthenticated attendance attempts (redirect to login with return URL).
- [ ] Add integration tests for attendance submit/cancel with real auth tokens.

### Chat / Matrix Integration

- [ ] Complete OrgPortal chat adapter layer migration from mock service to Matrix-backed service.
- [ ] Add robust session bootstrap to reduce manual Matrix session reconnect friction.
- [ ] Add end-to-end chat integration tests against the running Synapse container.
- [ ] Finalize color/token adaptation so chat UI fully matches OrgPortal theme (`#002a61` prominence).

### Constitution and Governance

- [ ] Review and codify remaining constitution-aligned policies not yet formalized in backend docs.
- [ ] Add governance workflow tests for dissolution and membership state transitions.
- [ ] Add admin UX for constitution-sensitive actions with confirmation/audit trails.

### Security and Data Hygiene

- [ ] Add structured security logging for admin actions and profile changes.
- [ ] Add PII minimization/redaction pass for OCR/business-card ingestion logs.
- [ ] Add periodic token/key rotation checklist for PIdP, Org backend, and SMTP credentials.

### Operations and Deployment

- [ ] Keep `org/DEPLOY.md` current with exact dev/prod runbooks after each infra change.
- [ ] Add pre-deploy smoke-test script (auth, admin route gating, attendance, email notification).
- [ ] Add post-deploy health checks for `org`, `org-dev`, `org-worker`, `org-smtp-relay`, `synapse`.

### Testing and Quality

- [ ] Establish a single command for full local CI (lint + unit + integration tests).
- [ ] Add CI gate for new integration tests (attendance + email + chat adapter).
- [ ] Remove/retire remaining legacy implementations after replacement parity is verified.

## OrgPortal Playwright Docker + Mobile UI Handoff (2026-05-01)

### Completed Today

- [x] Added Playwright config for desktop + mobile runs:
  - `OrgPortal/web/playwright.config.ts`
- [x] Added initial responsive E2E suite:
  - `OrgPortal/web/tests/e2e/layout-smoke.spec.ts`
  - Covers:
    - Profile dropdown viewport bounds check
    - Horizontal overflow check on key routes (`/`, `/events`, `/orgs`, `/people`)
- [x] Added Dockerized Playwright runner:
  - `OrgPortal/web/docker/playwright/Dockerfile`
  - `OrgPortal/web/docker/playwright/docker-compose.yml`
- [x] Added npm scripts:
  - `test:e2e`
  - `test:e2e:headed`
  - `test:e2e:report`
  - `test:e2e:docker`
- [x] Patched likely mobile profile menu offscreen root cause:
  - `OrgPortal/web/src/index.css`
  - Added mobile rule at `@media (max-width: 680px)` to anchor `.portal-user-menu` left and cap width to viewport.
- [x] Updated docs in `OrgPortal/web/README.md` with E2E + Docker test commands.

### Remaining Work

- [ ] Finish interrupted Docker test run and capture pass/fail results after latest image/tooling changes.
- [ ] If any E2E failures remain, fix UI/layout regressions and re-run until green.
- [ ] Expand UI pitfall coverage beyond current checks:
  - sticky header overlap issues
  - nav wrapping/clickability on narrow widths
  - modal/overlay clipping
  - z-index conflicts (search/menu/modal)
  - keyboard navigation + focus trapping for dropdowns/modals
- [ ] Optional: add Selenium parity runner in Docker (if dual-framework coverage is still desired).

### Important Context / Gotchas

- Local `npm/node` is unavailable on host shell; use Docker-based commands.
- Playwright package resolved to `1.59.1`; Docker base image was updated to `mcr.microsoft.com/playwright:v1.59.1-jammy`.
- Mobile project explicitly set to Chromium in Playwright config (`browserName: 'chromium'`) to avoid unintended WebKit requirement.

### Resume Commands (from repo root)

1. Re-run the Playwright Docker suite:
   ```bash
   docker compose -f /home/julian/Documents/arkavo-platform/OrgPortal/web/docker/playwright/docker-compose.yml up --build --abort-on-container-exit --exit-code-from orgportal-playwright
   ```

2. If you prefer npm script wrapper (requires npm available in shell):
   ```bash
   cd /home/julian/Documents/arkavo-platform/OrgPortal/web
   npm run test:e2e:docker
   ```

3. Inspect generated artifacts after run:
   - `OrgPortal/web/playwright-report/`
   - `OrgPortal/web/test-results/`

### Files Changed Today

- `OrgPortal/web/package.json`
- `OrgPortal/web/package-lock.json`
- `OrgPortal/web/src/index.css`
- `OrgPortal/web/README.md`
- `OrgPortal/web/playwright.config.ts`
- `OrgPortal/web/tests/e2e/layout-smoke.spec.ts`
- `OrgPortal/web/docker/playwright/Dockerfile`
- `OrgPortal/web/docker/playwright/docker-compose.yml`
