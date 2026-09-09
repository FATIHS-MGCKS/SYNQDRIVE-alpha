# KS MS 661 — Stop-boundary audit correction (TDL-EVID-KS-MS-661-002)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-KS-MS-661-002 |
| **Corrects** | TDL-EVID-KS-MS-661-001, TDL-EVID-KS-MS-661-TEMPORAL-001, TDL-EVID-KS-MS-661-REPRO-001 (partial) |
| **Production SHA audited** | `68495041974135f7c6565fd5b836b3e2f9176fae` |
| **R11 implementation branch** | `cursor/trip-fsm-r11-empty-core-evidence-64c8` |
| **observedAt (UTC)** | `2026-09-09T01:00:00Z` |

## Corrections to prior audit wording

| Prior claim | Correction |
|-------------|------------|
| Late-phase blocker = **`vls_row_absent`** on KS MS 661 | **Incorrect for persisted Production forensics.** `vehicle_latest_states` row remained present; `vlsProviderObservedAt=2026-09-08T19:59:22Z` in all late tracking runs. Blocker was **`vls_engine_load_active`** then **`vls_stale_provider_observation` → UNKNOWN**. |
| `vls_row_absent` on this drive | **Separate case only** — applies when `telemetry === null` (no VLS row read). Not evidenced on KS MS 661 Production DB. |
| Motor-aus @ 19:53:22 → first empty-core @ 19:54:38 = “16,9 s Stille” | **Misleading.** Δ Motor-aus → first empty-core = **76 s**. **16,9 s** = `operationalInactiveMs` from **`lastActivityAt` anchor 19:54:21.115** (worker-time motion path), not from operator motor-off. |
| Natural validation of R11 | **After authorized deploy only** — not claimed from Production @ `684950419`. |
| Trip completed via end detection | **Contradicted.** Production completed via **`STALE_ONGOING` repair** @ `2026-09-08T21:40:38Z`; **0** `POSSIBLE_END` tracking runs. |

## VLS field provenance (Production observation + code)

| Field | Production @ KS MS 661 | Provenance | Per-field measurement time |
|-------|------------------------|------------|----------------------------|
| `speed_kmh` | 0 | DIMO snapshot `signals.speed` → `normalizeSnapshot` | **Shared** `sourceTimestamp` = snapshot `lastSeen` (single row clock) |
| `is_ignition_on` | false | Explicit provider numeric `isIgnitionOn`: `>= 0.5` → **true**, `< 0.5` (incl. **0**) → **false**, missing/invalid → **`null`** (`dimo-snapshot.processor.ts`) | Same shared timestamp |
| `engine_load` | 42.745 | `obdEngineLoad` in same snapshot upsert | Same shared timestamp — **cannot prove** load measured simultaneously with ignition-off; semantically may be stale motor activity |
| `source_timestamp` | 2026-09-08 19:59:22 | `normalized.lastSeenAt` on upsert (`dimo-snapshot.processor.ts`) | Row-level provider event time |

**Independent stop-boundary evidence (R11 fix):** IDLE transition anchors via `resolveIdleStopBoundaryAt()` using stationary VLS provider time **only when `isIgnitionOn === false` (explicit OFF)**. Ignition ON or `null` does not qualify — traffic-stop/idling is not shutdown evidence.

## Runtime proof (R11 branch, CI-verified @ `6a460b868`)

| Artifact | Result |
|----------|--------|
| `trip-r11-stop-boundary-completion-chain.postgres-redis.integration.spec.ts` › **Scenario J** | **PASS** — CI run [34298939251](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/actions/runs/34298939251) job *Backend R11 postgres+redis integration* @ head `6a460b868`. ACTIVE_TRIP without pre-seeded boundary → IDLE sets `stopBoundaryAt`/`idle_within_trip_stationary_vls` via orchestration → empty-core → `POSSIBLE_END` → R10 queue drain → `COMPLETED` + `RESTING` + `activeTripId=null`; no `STALE_ONGOING` repair. |
| `trip-fsm-evidence-state.spec.ts` | **PASS** — unit proof for `resolveIdleStopBoundaryAt`, ignition ON/null counter-cases, DIMO ignition normalization contract (41/41 R11 unit tests green in same CI run) |

**Head history:** `17b841953` failed Scenario J (harness omitted `ContinuityAssessmentDetector` → spurious `POSSIBLE_END`). Fixed in `70a5e48b4` + ledger `6a460b868`.

## Remaining limits (unchanged)

- **`telemetry === null`** (`vls_row_absent`) — still UNKNOWN; separate from KS MS 661 Production case.
- **PD-2** LOW candidacy — not implemented.
- **45 s positive TTL** — not implemented / not validated fleet-wide.
- **Ignition-OFF DIMO trigger** — separate integration step; R9 canary registers ON only.

**Mutations:** NONE on Production
