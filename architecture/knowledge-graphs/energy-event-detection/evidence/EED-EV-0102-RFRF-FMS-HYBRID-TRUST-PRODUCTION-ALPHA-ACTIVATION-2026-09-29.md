# EED-EV-0102 — RFRF Hybrid Trust Production Alpha Activation (F.S Mobility Service)

**Date:** 2026-09-29  
**Status:** PROVEN_IN_PRODUCTION (scoped env activation + post-check)

## Scope

Explicit authorized Production activation for **F.S Mobility Service** only (SynqDrive Alpha fuel/DIMO fleet tenant in Production), superseding the prior customer-org prohibition for this single verified Organization row.

- **Release:** `20260929224455_v4994`
- **Runtime SHA:** `1dd4224037a84417c5d605575bb6d288ac93184e`
- **No source deploy** — env-only change on existing release

## Env applied (shared `/opt/synqdrive/shared/backend.env`)

| Key | Value |
|-----|--------|
| `RFRF_HYBRID_TRUST_ACTIVATION_MODE` | `ALPHA_ALLOWLIST` |
| `RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS` | Single verified F.S Mobility Service org UUID (from `organizations` row) |
| `RFRF_HYBRID_TRUST_ALLOWED_VEHICLE_IDS` | unset / empty |

Backup: `backend.env.rfrf-hybrid-trust-fms-alpha-20260929T232450Z.bak`

Rolling restart: PM2 `synqdrive` (3001) then `synqdrive-b` (3002) with `--update-env`; external health PASS.

## Preconditions verified (read-only)

- RFRF prerequisite flags already true (master, persist, recovery, convergence, promotion execution).
- `ABSOLUTE_SIGNAL_TRUST_AUTHORITY_AVAILABLE` remains **false** in deployed code.
- Historical FMS candidates: 12 total; 6 `READY_FOR_PERSIST`; **0** persisted hybrid `TRUSTED`; **0** `PROMOTED`.
- WOB Event B candidate: hybrid provenance absent → effective **UNKNOWN**; not promoted; no fallback VEE.

## Post-activation safety (immediate)

- Fallback VEE count: 0 → 0
- Promoted candidates: 0 → 0
- Runtime authority probe: FMS org **authorized**; Voice Staging E2E and Data Auth orgs **not authorized**
- Both replicas worker readiness PASS

## EED-OQ-019

Remains **PARTIALLY_RESOLVED** — Production scoped activation is live (`ALPHA_ALLOWLIST`, F.S Mobility org only). Remaining work is **first natural Production refuel end-to-end evidence** and **durable fleet calibration store** design/implementation — not missing activation infrastructure.

**Post-activation:** `READY_FOR_FIRST_NATURAL_REFUEL_VALIDATION=YES`

**Explicitly not performed:** backfill; manual VEE creation; manual candidate promotion; provider test writes; Production source deploy; global Hybrid Trust (`ABSOLUTE_SIGNAL_TRUST_AUTHORITY_AVAILABLE` remains **false**).

**Authority versions on release:** `rfrf-signal-trust-v2`, `rfrf-hybrid-absolute-trust-v2`, `rfrf-hybrid-trust-activation-v1`.

## Rollback

On unexpected historical promotion or non-FMS fallback VEE: set `RFRF_HYBRID_TRUST_ACTIVATION_MODE=OFF` via standard env procedure (preserve DB evidence).
