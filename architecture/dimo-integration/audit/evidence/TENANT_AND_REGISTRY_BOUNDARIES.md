# Vehicle Registry & Tenant Boundaries (R4.5-E)

**Scope:** DIMO integration glue only.

## Scheduler eligibility vs provider permission

| Signal | Source | Notes |
|--------|--------|-------|
| Snapshot tick includes vehicle | DB: CONNECTED dimo vehicle + activity tier | Independent of R9 webhook health UI cohort |
| Snapshot processor skip | `isVehicleRegistryOperationalActive(registryLifecycle)` | Logged as `registry_lifecycle=*`, metric `skipped` |
| Provider exchange | DIMO token exchange | **403** while DB still CONNECTED → **DIM-DEF-002** |

## R9 webhook health cohort (diagnostics only)

`backend/src/config/dimo-r9-webhook-health.config.ts`:

- `DEFAULT_AUTHORIZED_COHORT = [186946, 187361, 187784, 192922]`
- `DEFAULT_EXCLUDED = [187336, 190497]`

Used by **Master Admin** `GET /api/v1/admin/ops/dimo-webhook-health` — **not** snapshot scheduler gating.

## Stale mirror

Former-fleet asset mirror in scheduler DB — **DIM-DEF-012** (VDC cleanup), overlaps token **190497** permission story but distinct from R9 config.

## 403 tokens

Remain **DELEGATED** — **DIM-DEF-001**; do not re-audit onboarding flows here.
