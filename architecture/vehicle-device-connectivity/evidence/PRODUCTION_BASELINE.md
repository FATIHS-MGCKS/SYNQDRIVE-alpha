# Vehicle & Device Connectivity — Production Baseline

| Field | Value |
|-------|-------|
| **Evidence ID** | VDC-EVID-PROD-BASELINE-002 |
| **Audit phase** | Phase 2 — read-only Production forensics |
| **PRODUCTION_ACCESS** | `VERIFIED_READ_ONLY` |
| **PRODUCTION_AUDITED_AT** | `2026-09-11T23:15:18Z` |
| **Auditor context** | Cursor Cloud Agent — SSH `synqdrive-admin@srv1374778.hstgr.cloud` |
| **Mutations** | **None** |

## Release topology

| Field | Value | Evidence |
|-------|-------|----------|
| **Active release path** | `/opt/synqdrive/releases/20260911190214_v4994` | `readlink -f /opt/synqdrive/current` → same path |
| **Deployed Git SHA** | `adef555430eee7d53e0b3e90c4154ec5fdcd18ad` | `git rev-parse HEAD` in release tree |
| **origin/main SHA (audit workspace)** | `f952234ecce3b4892c667ba26a35fabbbaeda516` | `git rev-parse origin/main` at audit time |
| **Repo/Production drift** | **YES** — Production behind `origin/main` | Phase 1 VDC precision hardening merged on `main` after last VPS deploy |
| **Public health** | `{"status":"ok"}` | `GET https://app.synqdrive.eu/api/v1/health` @ 2026-09-11T23:05:56Z |

## Process/runtime footprint (connectivity-relevant)

| Component | Observation | Classification |
|-----------|-------------|----------------|
| **PM2 backend replicas** | 2 (`synqdrive`, `synqdrive-b`), both `online` | PRODUCTION_OBSERVATION |
| **PostgreSQL** | 16.15, reachable via app `DATABASE_URL` | PRODUCTION_OBSERVATION |
| **Redis** | `PONG` | PRODUCTION_OBSERVATION |
| **ClickHouse** | Docker `synqdrive-clickhouse`; queried read-only via `docker exec` | PRODUCTION_OBSERVATION |
| **Scheduler/workers** | DIMO snapshot polling active (1030 SUCCESS polls for primary vehicle in 3.75d stationary window) | PRODUCTION_OBSERVATION |

## Connectivity-relevant bounded observations

| Observation | Value | Classification |
|-------------|-------|----------------|
| LTE_R1 fleet count | 6 vehicles | PRODUCTION_OBSERVATION |
| Primary forensic vehicle | KS MX 2024 / token 187336 | PRODUCTION_OBSERVATION |
| ClickHouse `telemetry_snapshots` rows (primary) | 183,985 total | PRODUCTION_OBSERVATION |
| Multi-replica CH duplicate `recorded_at` (historical) | Up to 11,293 rows at one timestamp | PRODUCTION_OBSERVATION — see VDC-Q-010 |

## Phase 2 gate status

| Gate | Status |
|------|--------|
| G1 Vehicle identity verified | **PASS** |
| G2 Analysis window documented | **PASS** — UTC primary; Europe/Berlin in forensics doc |
| G3 Deduplicated source timeline | **PASS** — ClickHouse distinct `recorded_at` |
| G4 Hypothesis matrix updated | **PASS** — see [LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md](./LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md) |
| G5 Evidence committed | **PASS** — this file + forensics artifact |

## Related evidence

- [LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md](./LTE_R1_KS_MX_2024_PRODUCTION_FORENSICS.md) — canonical Phase 2 primary vehicle forensics
- [LTE_R1_KS_MX_2024_PENDING_RECONSTRUCTION.md](./LTE_R1_KS_MX_2024_PENDING_RECONSTRUCTION.md) — **superseded** for numeric claims; retained as historical pointer
