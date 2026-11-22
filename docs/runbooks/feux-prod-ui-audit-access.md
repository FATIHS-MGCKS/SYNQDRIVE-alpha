# FEUX — Production UI read-only audit access (Variant B)

| Field | Value |
|-------|-------|
| **Milestones** | **P9A** architecture · **P9B** implementation (this repo) · **P9C** owner-provisioned Production session |
| **Operational flag** | `FEUX_PROD_UI_AUDIT_AUTHORIZED=1` — **authorization marker only**; must pair with server grants + identity |

## Do NOT reuse

| Identity | Verdict |
|----------|---------|
| `master-admin-smoke-lifecycle` (`MASTER_ADMIN`) | **FORBIDDEN** for FEUX UI audit |
| Any `ORG_ADMIN` / `MASTER_ADMIN` bypass path | **FORBIDDEN** as audit persona |

## P9C provisioning (owner-only — not executed by agents)

1. Create **isolated smoke org** with synthetic data only.
2. Create **USER** platform role identity(ies) — separate per product if needed.
3. Membership: **read-only** module flags (`read: true`, `write/manage: false`) — never `ORG_ADMIN`.
4. Grant **one** `UserPlatformPermissionGrant` per scope: `ui-audit-master` | `ui-audit-rental` | `ui-audit-operator`.
5. Enforce MFA as for normal users — **no bypass**.
6. Short session TTL; revoke grant + disable user after audit window.
7. Store Playwright `storageState` in Cursor **Runtime Secret** path reference — **never git**.

## Browser harness

```bash
# Harness unit tests (no Production session) — CI-safe
npx playwright test -c e2e/feux-prod-audit-playwright.config.ts feux-prod-audit-readonly.harness.spec.ts

# Authenticated Production UI audit — skipped unless explicitly armed; no local webServer
FEUX_PROD_UI_AUDIT_AUTHORIZED=1 \
FEUX_PROD_AUDIT_BASE_URL=https://app.synqdrive.eu \
FEUX_PROD_AUDIT_STORAGE_STATE_PATH=/path/outside/repo/.storageState.json \
npx playwright test -c e2e/feux-prod-audit-playwright.config.ts feux-prod-audit-readonly.spec.ts
```

**Origin policy:** `FEUX_PROD_AUDIT_APPROVED_ORIGINS` (comma-separated) defaults to `https://app.synqdrive.eu`. Armed prod audit mode **rejects** `localhost` / `127.0.0.1`.

**Server read policy:** `backend/src/modules/ui-audit/ui-audit-read-allowlist.ts` — explicit GET/HEAD allowlist with product scopes (`ui-audit-master` | `ui-audit-rental` | `ui-audit-operator`); unlisted reads fail closed.

## Offboarding

1. Revoke platform permission grants.
2. Increment `sessionVersion` / revoke refresh tokens.
3. Set user `INACTIVE`.
4. Delete ephemeral credential files.
5. Append evidence row to FEUX audit matrix (no PII).