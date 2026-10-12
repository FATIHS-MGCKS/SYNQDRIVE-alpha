# EXP021-S4P7 — Master Admin S4 Monitoring

**Date:** 2026-10-12  
**Mode:** Implementation only — no production deploy, no S4 activation, no synthetic alerts.

## Backend

- **Route:** `GET /admin/ops/driving-intelligence-s4`
- **Auth:** Same as other Platform Ops routes (`MASTER_ADMIN`, `MasterAdminMfaGuard`, step-up).
- **Service:** `PlatformOpsDiS4Service` — PostgreSQL (`di_v0_s4_control`, `di_v0_s4_work_items`), process env S4 flags/allowlists, Prometheus (`/api/v1/query`, `/api/v1/rules`), Alertmanager (`/api/v2/alerts`).
- **Status semantics:** `computePlatformOpsDiS4OperationalStatus` never returns `HEALTHY` when Prometheus is unavailable or operational metrics freshness is unknown/stale.

## Frontend

- **Location:** Master Admin → Platform Ops → Diagnostics → **Driving Intelligence S4**
- **Component:** `DrivingIntelligenceS4DiagnosticsPanel.tsx`

## IAM critical finding (read-only)

| Field | Detail |
|-------|--------|
| Alert | `IamSeedAdminEnabledInProduction` |
| Cause | `iam_seed_admin_enabled == 1` when seed admin bootstrap remains enabled (`ENABLE_SEED_ADMIN=true` in production). |
| Impact | Elevated privileged access path outside normal tenant IAM lifecycle. |
| Remediation | Disable seed admin in production env after bootstrap; revoke/rotate seed credentials; confirm metric `iam_seed_admin_enabled == 0` for 5m (see `docs/runbooks/iam-production-rollout.md`). |
| This task | **No IAM configuration changes.** |

## Authenticated smoke

| Check | Result |
|-------|--------|
| `/admin/ops/alerts` with live master-admin browser session | **UNVERIFIED** — no legitimate production master-admin session available in the Cloud Agent environment. |
| Master-admin guard coverage | Covered by existing `PlatformAdminController` guard stack (same as `/admin/ops/alerts`). |
| IAM alert representation | API + UI document `IamSeedAdminEnabledInProduction`; when Alertmanager reports the alert, `representedInPlatformAlerts=true` on the S4 status DTO. |

## Tests

- `platform-ops-di-s4.status.spec.ts`
- `platform-ops-di-s4.service.spec.ts` (includes stale/unavailable Prometheus path)
- `driving-intelligence-s4-panel.test.tsx`
