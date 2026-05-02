# REFACTOR_PLAN.md

## Objective
Reduce `org/org.py` from monolith to a thin compatibility shim while preserving API contracts, auth semantics, data model behavior, and operational reliability.

## Success Criteria
- `org/org.py` <= 250 lines and contains only compatibility imports/composition glue.
- All HTTP endpoints live in `org/api/routers/*`.
- All business logic lives in `org/services/*`.
- All SQLAlchemy models live in `org/db/models/*`.
- `main.py` is the only app composition root (app creation + lifespan wiring + router registration).
- Route map and OpenAPI contract are unchanged except non-breaking metadata ordering.

## Non-Negotiable Constraints
- No path/method changes for existing endpoints.
- No auth behavior changes.
- No schema changes unless explicitly planned and migrated.
- No big-bang rewrite.
- Each PR must be reversible independently.

## Target Architecture

```text
org/
  main.py
  org.py                        # thin compat shim only
  config/
    settings.py
    logging.py
  db/
    base.py
    models/
      __init__.py
      accounts.py
      economy.py
      governance.py
      network.py
      admin.py
    repositories/
      __init__.py
      accounts_repo.py
      governance_repo.py
      network_repo.py
  api/
    deps.py
    routers/
      health.py
      auth.py
      accounts.py
      transactions.py
      ubi.py
      stocks.py
      insurance.py
      fiscal.py
      governance.py
      network_orgs.py
      network_events.py
      network_scans.py
      network_chat.py
      contact.py
      admin.py
      mcp.py
  services/
    auth_service.py
    accounts_service.py
    transactions_service.py
    ubi_service.py
    stocks_service.py
    insurance_service.py
    fiscal_service.py
    governance_service.py
    network_service.py
    scan_ai.py
    notification_service.py
  integrations/
    pidp_client.py
    spicedb_client.py
    matrix_client.py
    openai_client.py
    storage_client.py
  utils/
    security.py
    ids.py
    dates.py
    text.py
```

## Enforcement Rules
- Routers may depend on: `api/deps`, `schemas`, `services`.
- Services may depend on: `db/repositories`, `integrations`, `utils`.
- Repositories may depend on: `db/models`, `db/base` only.
- Models must not import services/routers.
- `main.py` may depend on everything; nothing should depend on `main.py`.

## File Size Budgets
- Router file target: <= 400 LOC.
- Service file target: <= 500 LOC.
- Model file target: <= 350 LOC.
- Any file exceeding budget requires split before adding new features.

## Execution Strategy (Best Practice)
Use parallel tracks with small, reversible PRs.

### Track A: Composition and Lifespan (Critical Path)
1. Move `lifespan` and startup/shutdown side effects from `org.py` to `main.py`.
2. Register all routers in `main.py`.
3. Convert `org.py` to:
   - import `app` from `main.py`
   - optional compatibility exports only.

Exit criteria:
- Launch target `main:app` works in all environments.
- `org:app` still works as compatibility alias.

### Track B: Router Decomposition (Current Momentum)
Consolidate and complete endpoint extraction by domain:
1. `accounts.py` (read/write)
2. `transactions.py`
3. `ubi.py` (eligibility + settings)
4. `admin.py` (settings, scans, admin account views)
5. `stocks.py`, `insurance.py`, `fiscal.py`
6. `governance.py`
7. `network_*` routers (orgs/events/scans/chat/contact)
8. `auth.py` and public/system endpoints

Exit criteria:
- No `@app.<method>` decorators left in `org.py`.

### Track C: Service Extraction
For each router domain:
1. Move non-trivial logic from route handlers to service functions.
2. Keep routers as thin request/response mappers.
3. Add/expand unit tests at service layer.

Exit criteria:
- Routers contain no complex DB/business branching.

### Track D: Model Extraction
1. Split SQLAlchemy models into `db/models/*` by domain.
2. Keep import aggregator in `db/models/__init__.py` for compatibility.
3. Update references incrementally.

Exit criteria:
- No model class definitions remain in `org.py`.

### Track E: Dependency + Integration Cleanup
1. Replace wildcard settings import with explicit typed settings access.
2. Move external calls to `integrations/*` wrappers.
3. Centralize shared dependencies in `api/deps.py`.

Exit criteria:
- No wildcard config import in runtime paths.
- No direct external API logic in routers.

## PR Plan (Recommended Order)
1. PR-1: `main.py` owns lifespan + router registration; `org.py` shim groundwork.
2. PR-2: Finish router extraction for economy endpoints (`stocks`, `insurance`, `fiscal`, `portfolio`).
3. PR-3: Finish governance router extraction.
4. PR-4: Finish network routers extraction.
5. PR-5: Extract services for economy + governance.
6. PR-6: Extract services for network + admin.
7. PR-7: Extract models into `db/models/*`.
8. PR-8: Explicit settings + deps cleanup.
9. PR-9: Final shim reduction and dead code removal.

## Quality Gates (Run Every PR)
- `pytest` targeted domain tests + full regression suite.
- Route inventory diff: exact path/method parity.
- OpenAPI diff: no breaking contract changes.
- Startup smoke test: import + app boot + DB connect/disconnect.
- Manual smoke:
  1. auth/login,
  2. account read/write,
  3. transaction flow,
  4. governance motion + vote,
  5. business-card scan submit/list/image,
  6. admin settings read/write.

## Risk Controls
- Keep each extraction small and single-domain.
- Preserve registration order unless intentionally changed and verified.
- If regression occurs, revert only latest PR.
- Avoid cross-domain refactors in same PR.

## Current Progress (As of 2026-05-01)
Completed:
1. `config/settings.py`, `config/logging.py`, `db/base.py` introduced.
2. Compatibility `main.py` added and launch targets switched to `main:app`.
3. `services/scan_ai.py` extracted.
4. Router scaffolding added under `org/api/routers`.
5. Extracted routers:
   - `health.py`
   - `admin_settings.py`
   - `admin_scans.py`
   - `ubi_settings.py`
   - `ubi_eligibility.py`
   - `authz_admin.py`
   - `accounts_read.py`
   - `accounts_write.py`
   - `transactions.py`

## Prioritized Remaining Backlog
1. Move lifespan/app construction fully into `main.py` (highest priority).
2. Extract remaining endpoint domains into routers: `stocks`, `portfolio`, `insurance`, `fiscal`, `governance`, `network`, `auth`.
3. Move route business logic into services domain by domain.
4. Extract SQLAlchemy models to `db/models/*`.
5. Remove wildcard settings import and centralize dependencies.
6. Reduce `org.py` to compatibility shim only.

## Definition of Done
- `org.py` is a thin shim.
- `main.py` is the sole composition root.
- Routes/models/services are fully separated by domain.
- CI/test/smoke gates pass.
- No contract regressions.
