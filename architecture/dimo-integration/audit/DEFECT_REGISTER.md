# DIMO Integration — Central Defect Register (Audit-First)

| Field | Value |
|-------|-------|
| **Policy** | `AUDIT_FIRST` — no remediation until owner prioritization |
| **Production audit SHA (R4 series)** | `a4d06c602ff192aa7ba6688a6472100033417bca` |
| **Register opened** | 2026-10-12 |
| **Last updated** | 2026-10-12 (R4.5 reconciliation) |
| **Prior docs PR** | [#1995](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1995) — superseded by docs-only branch; see [PR_REFERENCE.md](./PR_REFERENCE.md) |
| **Supersedes** | Ad-hoc `DIM-GAP-*` defect wording for R4-class issues (gaps remain cross-linked) |

## Legend

| Priority | Meaning |
|----------|---------|
| **P0** | Severe confirmed malfunction with immediate customer/data impact |
| **P1** | Wrong live position, speed, or stale telemetry on active customer vehicles |
| **P2** | Freshness/signal display or contract gap without proven severe ops failure |
| **P3** | Metrics, documentation, or hygiene |

| Status | Meaning |
|--------|---------|
| **OPEN** | Confirmed; fix not started |
| **DELEGATED** | Owned by another workstream |
| **READY_FOR_FIX** | Scoped; awaiting audit closure + owner approval |
| **RESOLVED** | Fixed in production (none yet) |

| Evidence class | Maps to register `verification` column |
|----------------|----------------------------------------|
| VERIFIED_PRODUCTION | Live prod read-only observation @ R4 SHA |
| VERIFIED_CODE | Static code / architecture trace |
| REPRODUCED | Tests or deterministic script |
| SUSPECTED | Plausible; not fully measured |
| NOT_MEASURED | Blocked (credentials, time window, etc.) |

---

## 1 — Confirmed defects (production or reproduced)

### DIM-DEF-001 — Vehicle JWT exchange HTTP 403 (two fleet tokens)

| Field | Value |
|-------|-------|
| **ID** | DIM-DEF-001 |
| **Summary** | Scheduled snapshot polls for DIMO tokenIds **187336** and **190497** fail at `POST /v1/tokens/exchange` with **403**; no telemetry refresh for those vehicles. |
| **Priority** | **P1** |
| **Verification** | VERIFIED_PRODUCTION |
| **Impact** | Continuous `IDENTITY/client_error` (~17.5k/24h) and `snapshot_poll` failure (~17.2k/24h); stale VLS for **2** vehicles; unnecessary provider budget use. |
| **Components** | `dimo-auth.service.ts` (`fetchVehicleJwtWithLock` ~453–468), `dimo-snapshot.processor.ts` (~326), `dimo-request-executor.service.ts` (~96–98) |
| **Evidence** | `/opt/cursor/artifacts/DIMO_R41B_ROOT_CAUSE_RESULT.md`; R4.1a Prometheus; PM2 logs 2026-10-12 |
| **Workstream** | **Vehicle Device Connectivity / Onboarding** (consent, privileges, former-fleet assets) |
| **Fix idea (no impl)** | Stop scheduling polls for non-exchangeable tokens; reconcile registry/offboarding; optional negative cache on persistent 403. |
| **Open proof** | Root provider reason string for 403 (beyond SynqDrive mirror state). |
| **Status** | **DELEGATED** |

### DIM-DEF-002 — Registry CONNECTED while provider denies vehicle JWT (exchange 403)

| Field | Value |
|-------|-------|
| **ID** | DIM-DEF-002 |
| **Summary** | SynqDrive **snapshot scheduler** still enqueues polls for vehicles whose **provider token exchange returns HTTP 403**, while local registry may still show CONNECTED/operational eligibility. This is a **registry ↔ provider permission mismatch**, **not** an R9 webhook cohort rule. `DEFAULT_EXCLUDED` in `dimo-r9-webhook-health.config.ts` applies only to **Master Admin webhook health diagnostics** — it is **not** a fleet-wide polling ban and must not be conflated with this defect. |
| **Priority** | **P2** (reclassified R4.5 — operational/budget impact; not proven wrong live map for authorized cohort) |
| **Verification** | VERIFIED_PRODUCTION + VERIFIED_CODE |
| **Impact** | Amplifies DIM-DEF-001 budget and log noise; metrics suggest broader poll failure than authorized fleet reality. |
| **Components** | `dimo-snapshot.scheduler.ts`, `dimo-snapshot.processor.ts`, registry lifecycle vs `DimoAuthService` exchange |
| **Evidence** | R4.1b; [TENANT_AND_REGISTRY_BOUNDARIES.md](./evidence/TENANT_AND_REGISTRY_BOUNDARIES.md) |
| **Workstream** | **DIMO Integration** (eligibility predicate) + **VDC** (registry/offboarding truth) |
| **Fix idea** | After persistent 403, mark provider-ineligible for polling; align `registry_lifecycle` / connection status with VDC — **do not** map R9 diagnostic exclusions onto scheduler. |
| **Open proof** | Product rule: offboard vs poll-skip-only for denied-exchange tokens. |
| **Status** | **OPEN** |

### DIM-DEF-003 — No negative cache on persistent vehicle JWT 403

| Field | Value |
|-------|-------|
| **ID** | DIM-DEF-003 |
| **Summary** | Each failed poll re-attempts token exchange; 403 classified non-retryable but **re-scheduled** on next tier tick. |
| **Priority** | **P2** |
| **Verification** | VERIFIED_CODE + VERIFIED_PRODUCTION (volume) |
| **Impact** | Budget/request waste; log cardinality. |
| **Components** | `DimoAuthService`, `DimoRequestExecutor`, snapshot scheduler |
| **Evidence** | R4.1b § Phase 4 “unnecessary repeat provider calls” |
| **Workstream** | **DIMO Integration** |
| **Fix idea** | Short TTL “exchange denied” marker per tokenId with metric `dimo_vehicle_jwt_denied_total`. |
| **Open proof** | — |
| **Status** | **OPEN** |

### DIM-DEF-004 — Live map `livePosition` bypasses GPS freshness gate

| Field | Value |
|-------|-------|
| **ID** | DIM-DEF-004 |
| **Summary** | `deriveOverviewMapPosition`: `hasLiveGps \|\| (isLiveTracking && targetPosition)` → **livePosition** even when `isFresh` is false. Note: `hasLiveGps` treats `gpsSource === 'dimo'` as a **transport/channel** flag (live-gps HTTP succeeded), **not** proof of coordinate freshness. The bypass disjunct ignores both freshness and channel. |
| **Priority** | **P1** |
| **Verification** | REPRODUCED (code) + VERIFIED_CODE |
| **Impact** | Hours-old coordinates can show **Live** badge and map mode `livePosition`. |
| **Components** | `frontend/src/rental/lib/overview-map-position.ts` ~129–158, `resolveVehicleDetailMapTrackingBadge` |
| **Evidence** | `/opt/cursor/artifacts/DIMO_R43_LIVE_FRESHNESS_AUDIT.md`; `overview-map-position.test.ts` (no bypass case) |
| **Workstream** | **Rental UI / Vehicle detail** |
| **Fix idea** | Require **time-based freshness** (and/or explicit GPS `observedAt`) for `livePosition`; `gpsSource==='dimo'` alone insufficient; stale → `lastKnownPosition` + copy. |
| **Open proof** | Prod session recording of stale coords + Live badge (pattern supported by R4.2 prod timestamps). |
| **Status** | **READY_FOR_FIX** |

### DIM-DEF-005 — `lastLocationAt` uses client receive time, not GPS observation time

| Field | Value |
|-------|-------|
| **ID** | DIM-DEF-005 |
| **Summary** | `applyGpsPoint` sets `lastLocationAt: Date.now()` and does not use provider times from `/live-gps`. Backend `getLiveGps` sets `lastSeenAt = signals.lastSeen ?? loc?.timestamp` (`vehicles.service.ts` ~1998) — **`signals.lastSeen` is collection-level, not a substitute for GPS coordinate `timestamp`**. UI must not treat either as interchangeable without explicit field authority. |
| **Priority** | **P1** |
| **Verification** | VERIFIED_CODE |
| **Impact** | Fresh HTTP poll receive time masks stale coordinates in store-level age heuristics. |
| **Components** | `useLiveVehicleTelemetry.ts`, `vehicles.service.ts` `getLiveGps` |
| **Evidence** | R4.3 lineage; R4.5 field note in inventory |
| **Workstream** | **Rental UI** + **API contract** |
| **Fix idea** | Propagate **`currentLocationCoordinates.timestamp`** (fallback chain documented) into store/HUD; keep `lastSeen` separate for diagnostics only. |
| **Open proof** | — |
| **Status** | **READY_FOR_FIX** |

### DIM-DEF-006 — Dead reckoning without freshness gate

| Field | Value |
|-------|-------|
| **ID** | DIM-DEF-006 |
| **Summary** | `LiveMapOverview` DR when `speedKmh >= 3` and heading set — no `isFresh` / GPS age check. |
| **Priority** | **P1** |
| **Verification** | VERIFIED_CODE |
| **Impact** | Animated motion from stale speed + position. |
| **Components** | `LiveMapOverview.tsx` ~182–205 |
| **Evidence** | R4.3 |
| **Workstream** | **Rental UI** |
| **Fix idea** | Gate DR on same freshness contract as `hasLiveGps`. |
| **Open proof** | — |
| **Status** | **READY_FOR_FIX** |

### DIM-DEF-007 — Frontend/backend future timestamp classification mismatch

| Field | Value |
|-------|-------|
| **ID** | DIM-DEF-007 |
| **Summary** | Backend `resolveTelemetryFreshness` → **offline** for future `sourceTimestamp`; frontend clamps age → **live**. |
| **Priority** | **P2** |
| **Verification** | REPRODUCED (`telemetryFreshness.test.ts`) |
| **Impact** | Clock-skewed provider timestamps show live in UI while APIs classify offline. |
| **Components** | `telemetry-freshness.resolver.ts` L108–114; `frontend/.../telemetryFreshness.ts` |
| **Evidence** | R4.2 scenario F; R4.3 parity matrix |
| **Workstream** | **DIMO Integration** (contract) + **Frontend** |
| **Fix idea** | Align FE to BE (offline/no_signal) without changing 15m/24h/48h thresholds. |
| **Open proof** | Prod sample with future-dated signal (not required for code parity). |
| **Status** | **READY_FOR_FIX** |

### DIM-DEF-008 — VLS scalar `source_timestamp` uses snapshot `lastSeen` only

| Field | Value |
|-------|-------|
| **ID** | DIM-DEF-008 |
| **Summary** | Per-signal timestamps (speed, GPS) in `raw_payload_json` can lag; freshness/merge uses aggregate `lastSeen` only. |
| **Priority** | **P2** |
| **Verification** | VERIFIED_PRODUCTION + VERIFIED_CODE |
| **Impact** | `isFresh`/standby can reflect newer aggregate time while speed/GPS values are hours old (vehicle 186946 exemplar). |
| **Components** | `latest-vehicle-snapshot.query.ts`, `normalizeSnapshot`, `vls-monotonic-merge.util.ts` |
| **Evidence** | R4.2 production table; 6h polls with 1 distinct `source_timestamp` |
| **Workstream** | **DIMO Integration** + **Trip Detection** (consumer of `interpretVehicleState`) |
| **Fix idea** | Per-signal observedAt in VLS or expose in API; consumers use min(signal times) for movement/GPS. |
| **Open proof** | DIMO provider intent for `lastSeen` vs signal `.timestamp` |
| **Status** | **OPEN** |

### DIM-DEF-009 — Detail telemetry coerces missing numerics to zero

| Field | Value |
|-------|-------|
| **ID** | DIM-DEF-009 |
| **Summary** | `getVehicleWithTelemetry`: `speed: state?.speedKmh ?? 0`, `battery: state?.evSoc ?? 0`; HUD poll defaults fuel/battery/odometer/speed to 0. |
| **Priority** | **P2** |
| **Verification** | VERIFIED_CODE (+ R4.2 fleet vs detail fuel asymmetry) |
| **Impact** | Missing fuel/SoC/speed can present as real **0** in UI. |
| **Components** | `vehicles.service.ts`, `useLiveVehicleTelemetry.ts`, `vehicle-state-interpreter.ts` |
| **Evidence** | R4.2 accuracy notes; R4.3 |
| **Workstream** | **Rental UI** + **Backend API** |
| **Fix idea** | Null-safe DTOs (match `resolveFuelPercentOrNull` on fleet). |
| **Open proof** | — |
| **Status** | **OPEN** |

### DIM-DEF-010 — Map speed uses raw `speedKmh` not `displaySpeed`

| Field | Value |
|-------|-------|
| **ID** | DIM-DEF-010 |
| **Summary** | Store snapshot uses API `speed`; interpreter nulls `displaySpeed` when not fresh but map DR/HUD uses `speedKmh`. |
| **Priority** | **P2** |
| **Verification** | VERIFIED_CODE |
| **Impact** | Stale speed can drive dead reckoning while gauge shows suppressed display speed. |
| **Components** | `useLiveVehicleTelemetry.ts`, `OverviewLiveMapCard.tsx` |
| **Evidence** | R4.3 |
| **Workstream** | **Rental UI** |
| **Fix idea** | Single speed authority for map + HUD (`displaySpeed` or null). |
| **Open proof** | — |
| **Status** | **OPEN** |

### DIM-DEF-011 — Per-signal timestamps not in public telemetry/live-gps API contract

| Field | Value |
|-------|-------|
| **ID** | DIM-DEF-011 |
| **Summary** | `/telemetry` and `/live-gps` do not expose per-signal `observedAt` to UI; `lastSeenAt` on live-gps ignored client-side. |
| **Priority** | **P2** |
| **Verification** | VERIFIED_CODE (contract gap) |
| **Impact** | UI cannot show truthful per-field freshness; audit-only lineage in DB/raw JSON. |
| **Components** | Vehicle telemetry DTOs, OpenAPI mappings, `useLiveVehicleTelemetry.ts` |
| **Evidence** | R4.2 matrix; R4.3 `PER_SIGNAL_TIMESTAMP_API_COVERAGE` |
| **Workstream** | **DIMO Integration** (API) + **Frontend** |
| **Fix idea** | Add optional `signals[].observedAt` in contract design pass (post-audit). |
| **Open proof** | — |
| **Status** | **OPEN** |

### DIM-DEF-012 — Stale former-fleet scheduler mirror still polled

| Field | Value |
|-------|-------|
| **ID** | DIM-DEF-012 |
| **Summary** | SynqDrive DB mirror for historically excluded former-fleet asset remains scheduler-eligible (`DIM-GAP-005`). |
| **Priority** | **P2** |
| **Verification** | VERIFIED_PRODUCTION (historical) + VERIFIED_CODE |
| **Impact** | Contributes to poll failures / integrity noise; not R9 cohort. |
| **Components** | Prisma `dimo_vehicles` / scheduler eligibility |
| **Evidence** | `DIM-EV-R9-PERM-001`, TDL-OQ-009, `KNOWLEDGE_GAPS.md` DIM-GAP-005 |
| **Workstream** | **Vehicle Onboarding / VDC** (data cleanup) |
| **Fix idea** | Offboard registry lifecycle + deactivate link; do not re-grant provider consent. |
| **Open proof** | Re-verify mirror count @ `a4d06c60…` |
| **Status** | **DELEGATED** |

### DIM-DEF-013 — Driving-events fetch failures swallowed as empty array

| Field | Value |
|-------|-------|
| **ID** | DIM-DEF-013 |
| **Summary** | `fetchDrivingEventsChunkWithRetry` / `fetchEventDataSummary` return `[]` on failure — indistinguishable from zero events. |
| **Priority** | **P2** |
| **Verification** | VERIFIED_CODE |
| **Impact** | Post-trip enrichment may silently miss events (DI fails closed on native path). |
| **Components** | `dimo-segments.service.ts` ~1058–1161 |
| **Evidence** | `KNOWLEDGE_GAPS.md` DIM-GAP-007; DI EXP-021 C1D.10A |
| **Workstream** | **Driving Intelligence** (consumer) + **DIMO Integration** (provider read semantics) |
| **Fix idea** | Typed error or `Result` for budgeted reads; DI already documents fail-closed. |
| **Open proof** | Prod metric for silent `[]` rate |
| **Status** | **DELEGATED** |

---

## 2 — Suspected risks (not promoted to confirmed defect)

| ID | Summary | P | Verification | Workstream | Status |
|----|---------|---|--------------|------------|--------|
| DIM-RISK-001 | R9 speed/ignition webhooks lack inbox-level dedup (coordinator may coalesce) | P2 | SUSPECTED | DIMO Integration / Trip Detection | OPEN |
| DIM-RISK-002 | Stale GPS with fresh snapshot poll could present as “live” fleet connectivity | P1 | SUSPECTED (R4.2 prod + R4.3 UI path) | Rental UI | OPEN |
| DIM-RISK-003 | Webhook replay attack surface: unsigned trigger POSTs when verification token configured | P3 | VERIFIED_CODE (by design) | Security / DIMO Integration | OPEN |
| DIM-RISK-004 | Multi-replica webhook ingress duplicate delivery | P2 | SUSPECTED | Scaling Process | OPEN |

---

## 3 — Observability gaps

| ID | Summary | P | Verification | Evidence | Status |
|----|---------|---|--------------|----------|--------|
| DIM-OBS-001 | Operators hit `:3001/metrics` → SPA HTML, not Prometheus | P3 | VERIFIED_PRODUCTION | R4.1a `WRONG_ENDPOINT` | OPEN (doc/runbook) |
| DIM-OBS-002 | R4.1 provider GraphQL/query inventory | P3 | VERIFIED_CODE | [evidence/PROVIDER_QUERY_INVENTORY.md](./evidence/PROVIDER_QUERY_INVENTORY.md) @ R4.5 | **CLOSED (doc)** |
| DIM-OBS-003 | Complete DIMO env/feature-flag matrix | P3 | UNKNOWN | `DIM-GAP-003` | OPEN |
| DIM-OBS-004 | ClickHouse read-only correlation for signal lineage | P2 | NOT_MEASURED | R4.3 CH auth blocked | OPEN |
| DIM-OBS-005 | Fleet-wide R9 wake-rate KPI | P2 | NOT_MEASURED | `DIM-GAP-006` | BLOCKED (R9 T+24 window) |

---

## 4 — Documentation / authority gaps (non-runtime)

| ID | Summary | P | Status |
|----|---------|---|--------|
| DIM-DOC-001 | Module authority still `AUDIT_IN_PROGRESS`; R4 findings not previously centralized | P3 | **Mitigated** by this register |
| DIM-DOC-002 | Full provider gateway graph (`DIM-GAP-004`) | P3 | OPEN |

---

## 5 — Cross-workstream dependencies (no duplicate defects)

### Active (fix or coordination required)

| Dependency ID | Topic | Owner workstream | Related register IDs |
|---------------|-------|------------------|----------------------|
| DIM-XWS-001 | Token 187336/190497 consent/privileges / exchange 403 | VDC / Onboarding | DIM-DEF-001 |
| DIM-XWS-002 | Registry lifecycle vs provider eligibility | VDC + DIMO Integration | DIM-DEF-002, DIM-DEF-012 |
| DIM-XWS-003 | Battery V2 HV signal rules | Battery V2 | DIM-DEF-008 |
| DIM-XWS-004 | RFRF fuel semantics | KG-EED / RFRF | DIM-DEF-009 |
| DIM-XWS-005 | Trip FSM / wake semantics / R9 KPI | Trip Detection | DIM-RISK-001, DIM-OBS-005 |
| DIM-XWS-006 | Driving-events `[]` swallow semantics | Driving Intelligence | DIM-DEF-013 |

### Informational / out of audit remediation scope

| Dependency ID | Topic | Notes |
|---------------|-------|-------|
| DIM-XWS-APDS | APDS / adaptive polling | R4.1a volumes only — VDC owns implementation |
| DIM-XWS-R5 | R5 shadow epoch | Do not mutate per charter |

### Historical / resolved (not active blockers)

| Dependency ID | Topic | Resolution |
|---------------|-------|------------|
| DIM-XWS-HIST-001 | Segment vs FSM boundaries | **RESOLVED** — TDL-OQ-006 / DIM-GAP-001 |

---

## 6 — Historical gap index (retained)

| Legacy ID | Disposition |
|-----------|-------------|
| DIM-GAP-001 | **RESOLVED** — segment mutation ownership (TDL-OQ-006) |
| DIM-GAP-002 | **PARTIAL** — R9 cohort 5/5; fleet-wide inventory open |
| DIM-GAP-003 | → DIM-OBS-003 |
| DIM-GAP-004 | → DIM-DOC-002 |
| DIM-GAP-005 | → DIM-DEF-012 |
| DIM-GAP-006 | → DIM-OBS-005 + DIM-RISK-001 |
| DIM-GAP-007 | → DIM-DEF-013 |

---

## Counts (snapshot — R4.5)

| Class | Count |
|-------|------:|
| Confirmed / reproduced defects (§1) | **13** |
| — Priority P1 (§1 only) | **4** (DEF-001, 004, 005, 006) |
| — Priority P2 (§1 only) | **9** (DEF-002 reclassified, 003, 007–013) |
| — Priority P0 | **0** |
| Suspected risks (§2) — **not** added to defect total | **4** |
| Observability gaps (§3) | **4** open + **1** closed (OBS-002) |
| Active cross-workstream dependencies (§5) | **6** |
| Historical/resolved dependencies | **1** |

**Ledger:** DIM-DEF-002 priority P1→P2 and scope clarification — R4.5 change ledger entry.
