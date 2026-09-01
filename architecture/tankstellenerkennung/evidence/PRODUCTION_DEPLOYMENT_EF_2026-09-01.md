# Tankstellenerkennung — Phase E+F Production Deployment Observation

**Evidence node:** `FST-EVID-PROD-DEPLOY-001`  
**Observed at:** 2026-09-01 (UTC)  
**Classification:** `PRODUCTION_OBSERVATION` — post-change runtime snapshot; not an architecture memo

## Deployment identity

| Field | Verified value |
|-------|----------------|
| **Deployed main SHA** | `e76ada3d8885f8eeb7f2e6c6c50be115d0758c2c` |
| **Previous production SHA** | `d6cbcd842` |
| **New production release** | `20260901052629_v4994` |
| **Deployment method** | `bash .cursor/scripts/cloud-agent-deploy.sh` → VPS `backend/scripts/ops/vps-deploy-release.sh` (clone `main` from GitHub, build, migrate, PM2 restart) |
| **Health check** | `https://app.synqdrive.eu/api/v1/health` — **PASS** |

## Runtime / infra snapshot (post-deploy)

| Field | Before deploy | After deploy |
|-------|---------------|--------------|
| **Backend replica count** | 1 | 1 |
| **Prisma migration delta** | — | **0** (no new migrations applied) |
| **Phase-D feature flags** | `FUEL_STATION_ENRICHMENT_ENABLED=true`, `FUEL_STATION_ENRICHMENT_RECOVERY_ENABLED=true` | **unchanged (preserved)** |
| **Cutover timestamp** | `2026-08-31T19:47:39.000Z` | **preserved** |
| **Recovery scheduler** | enabled (valid cutover) | **enabled** |
| **BullMQ queue `energy.refuel.station.enrich`** | empty | **empty (no backlog)** |

## Database counts (read-only snapshot)

| Metric | Value | Notes |
|--------|-------|-------|
| **REFUEL pre-cutover** | 16 | unchanged across deploy |
| **REFUEL post-cutover** | 0 | no eligible events at observation time |
| **Enrichment rows** | 0 | `vehicle_energy_event_fuel_station_enrichments` |
| **Enrichment delta across deploy** | 0 | historical firewall intact |

**RECHARGE counts:** not recorded in this observation pass.

## Phase E production API verification

- Deployed code includes Phase E (`PR #1473`, merge `ee7701209aebfea0cb53337755b54656a6c31ebb`).
- Backward-compatible read path confirmed: historical REFUEL events return `stationEnrichment: null`.
- **No enriched payload observed** — zero enrichment rows exist.

## Phase F structural / bundle verification

- Deployed code includes Phase F (`PR #1475`, merge `e76ada3d8885f8eeb7f2e6c6c50be115d0758c2c`).
- Frontend bundle deployed with presentation policy code present.
- **No trusted-match UI observed in production** — no post-cutover REFUEL with enrichment.

## Historical firewall

- Pre-cutover REFUEL count unchanged (16).
- Zero enrichment rows before and after deploy.
- Confirms no automatic backfill occurred during Phase E+F release.

## Positive-path match observation

| Claim | Result |
|-------|--------|
| Natural post-cutover REFUEL with resolver match → enrichment row → API → UI | **NOT OBSERVED** |

## Warnings classified

| Warning / signal | Classification |
|------------------|----------------|
| Deploy health PASS without enriched REFUEL | **Expected epistemic gap** (`FST-GAP-REAL-POST-CUTOVER-REFUEL-001`) — not a deploy failure |
| Unrelated pre-existing production warnings during deploy window | **Unrelated / pre-existing** — do not attribute to Tankstellenerkennung Phase E+F |

## Epistemic scope of this evidence

This document supports **scoped** production validation only:

- Infrastructure deploy success, flag/cutover preservation, queue health, zero DB delta
- Negative-path / backward-compat observations (null enrichment on historical REFUEL)
- Absence of post-cutover REFUEL positive match

It does **not** support `PRODUCTION_VALIDATED` for async enrichment execution, station-match outcomes, enriched API payloads, or trusted-match UI on real production data.
