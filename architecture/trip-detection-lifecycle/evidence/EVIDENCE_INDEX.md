# Trip Detection & Lifecycle — Evidence Index

**Repository re-audit baseline:** `origin/main` @ `06095af91ce6f58366734a182ac5962830e858db`

Historical FSM corpus: [`docs/audits/trip-fsm/`](../../../docs/audits/trip-fsm/) — **supporting evidence only**, not canonical authority.

## Schema

| Column | Meaning |
|--------|---------|
| **Evidence ID** | Stable identifier — never reuse |
| **Source type** | Standard-1.0 evidence class (`CODE`, `HISTORICAL_RECORD`, `PRODUCTION_OBSERVATION`, …) |
| **Source path / method** | Repository path or sanitized observation method |
| **Timestamp** | ISO-8601 UTC when applicable |
| **Audited SHA / environment** | Repo SHA or Production release context |
| **Supported claim** | What this evidence supports |
| **Currentness / maturity** | Separate from source type |
| **Limitations** | Residual uncertainty |

### Source types used

`CODE` · `HISTORICAL_RECORD` · `PRODUCTION_OBSERVATION`

### Currentness / maturity legend

| Label | Meaning |
|-------|---------|
| **CONFIRMED_ON_MAIN** | Reconfirmed on `06095af91…` |
| **PARTIALLY_CURRENT** | Core claim valid; Production refs, line numbers, or pre-R context stale |
| **HISTORICAL** | Pre-remediation or superseded runtime context |
| **NOT_ON_PRODUCTION** | On `main` but not on observed Production SHA |
| **UNKNOWN** | Not re-verified this phase |

---

## P1 — ownership invariants (no Markdown artifact)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EV-P1-001 |
| **Source type** | CODE |
| **Source path** | [`backend/src/modules/vehicle-intelligence/trips/TRIP_OWNERSHIP.ts`](../../../backend/src/modules/vehicle-intelligence/trips/TRIP_OWNERSHIP.ts) |
| **Timestamp** | `2026-09-06T23:09:32Z` (reconfirmed during bootstrap) |
| **Audited SHA** | `06095af91ce6f58366734a182ac5962830e858db` |
| **Supported claim** | P1 ownership: sole creator/lifecycle writer (`TripDecisionEngine`); detectors read-only; repair routes through decision engine |
| **Currentness** | CONFIRMED_ON_MAIN |
| **Limitations** | No separate P1 Markdown in `docs/audits/trip-fsm/` |

---

## Historical audit and implementation records (P2–R8)

| Evidence ID | Source type | Source path | Timestamp | Audited SHA | Supported claim | Currentness | Limitations |
|-------------|-------------|-------------|-----------|-------------|-----------------|-------------|-------------|
| TDL-EV-P2-001 | HISTORICAL_RECORD | [`P2_STATE_MACHINE…`](../../../docs/audits/trip-fsm/P2_STATE_MACHINE_EXECUTION_PHASE_AUDIT_2026-09-05.md) | 2026-09-05 | `3d5040b67…` | FSM vs execution phases; `ENDED` dead; finalize→RESTING | PARTIALLY_CURRENT | P2 Production SSH/SQL stale; line numbers may drift |
| TDL-EV-P3-001 | HISTORICAL_RECORD | [`P3_SIGNAL…`](../../../docs/audits/trip-fsm/P3_SIGNAL_AUTHORITY_TIMESTAMP_ORDERING_AUDIT_2026-09-05.md) | 2026-09-05 | `3d5040b67…` | EVENT_TIME vs WORKER_TIME separation | PARTIALLY_CURRENT | Production unverified in P3; partially addressed by PROD baseline |
| TDL-EV-P4-001 | HISTORICAL_RECORD | [`P4_TRIP_START…`](../../../docs/audits/trip-fsm/P4_TRIP_START_DEEP_DIVE_AUDIT_2026-09-05.md) | 2026-09-05 | `b62c4c44…` | Start detectors, policies, failure windows | PARTIALLY_CURRENT | P4-F11/F12 addressed on main via R3 |
| TDL-EV-P5-001 | HISTORICAL_RECORD | [`P5_TRIP_END…`](../../../docs/audits/trip-fsm/P5_TRIP_END_DEEP_DIVE_AUDIT_2026-09-06.md) | 2026-09-06 | P5 closure | End modes, CUSUM, finalize semantics | PARTIALLY_CURRENT | Several P5 findings addressed via R5–R7 |
| TDL-EV-P6-001 | HISTORICAL_RECORD | [`P6_TARGET…`](../../../docs/audits/trip-fsm/P6_TARGET_ARCHITECTURE_REMEDIATION_PLAN_2026-09-06.md) | 2026-09-06 | `3d5040b67…` | R1–R8 remediation dependency graph | PARTIALLY_CURRENT | P6 explicitly deferred canonical docs to this authority |
| TDL-EV-R1-001 | HISTORICAL_RECORD | [`R1_EVENT_TIME…`](../../../docs/audits/trip-fsm/R1_EVENT_TIME_AUTHORITY_IMPLEMENTATION_2026-09-06.md) | 2026-09-06 | `3d5040b67…` | EVENT_TIME boundary field contract | CONFIRMED_ON_MAIN | Not deployed to Production `01541c2ab…` at observation time |
| TDL-EV-R2-001 | HISTORICAL_RECORD | [`R2_LIFECYCLE…`](../../../docs/audits/trip-fsm/R2_LIFECYCLE_INVARIANTS_IMPLEMENTATION_2026-09-06.md) | 2026-09-06 | `8ddf73e56…` | Lifecycle commit + orphan recovery | CONFIRMED_ON_MAIN | Deploy evidence separate |
| TDL-EV-R3-001 | HISTORICAL_RECORD | [`R3_START_LIVENESS…`](../../../docs/audits/trip-fsm/R3_START_LIVENESS_ORDERING_IMPLEMENTATION_2026-09-06.md) | 2026-09-06 | `ff95395d6…` | Queue handoff settlement / start liveness | CONFIRMED_ON_MAIN | — |
| TDL-EV-R4-001 | HISTORICAL_RECORD | [`R4_START_DETECTION…`](../../../docs/audits/trip-fsm/R4_START_DETECTION_CONSISTENCY_IMPLEMENTATION_2026-09-06.md) | 2026-09-06 | `12a5fdac9…` | Start detection consistency | CONFIRMED_ON_MAIN | — |
| TDL-EV-R5-001 | HISTORICAL_RECORD | [`R5_END_VALIDATION…`](../../../docs/audits/trip-fsm/R5_END_VALIDATION_SEMANTICS_IMPLEMENTATION_2026-09-06.md) | 2026-09-06 | `eb51d8f80…` | End validation semantics | CONFIRMED_ON_MAIN | — |
| TDL-EV-R6-001 | HISTORICAL_RECORD | [`R6_MID_GAP…`](../../../docs/audits/trip-fsm/R6_MID_GAP_SPLIT_SAFETY_IMPLEMENTATION_2026-09-06.md) | 2026-09-06 | `4cd02d7f8…` | Mid-gap split safety | CONFIRMED_ON_MAIN | — |
| TDL-EV-R7-001 | HISTORICAL_RECORD | [`R7_TERMINAL…`](../../../docs/audits/trip-fsm/R7_TERMINAL_RESTING_RECOVERY_IMPLEMENTATION_2026-09-06.md) | 2026-09-06 | `de402f7c9…` | Terminal→RESTING recovery | CONFIRMED_ON_MAIN | — |
| TDL-EV-R8-001 | HISTORICAL_RECORD | [`R8_OBSERVABILITY…`](../../../docs/audits/trip-fsm/R8_OBSERVABILITY_FORENSICS_IMPLEMENTATION_2026-09-06.md) | 2026-09-06 | `140ebdd33…` branch | Forensic metadata / metric fixes | CONFIRMED_ON_MAIN / **NOT_ON_PRODUCTION** | Merged #1549 on `main`; absent on Production `01541c2ab…` |

---

## Production observations (read-only)

| Evidence ID | Source type | Method / path | Timestamp | Environment | Supported claim | Currentness | Limitations |
|-------------|-------------|---------------|-----------|-------------|-----------------|-------------|-------------|
| TDL-EV-PROD-001 | PRODUCTION_OBSERVATION | SSH: `readlink` + `git rev-parse` on `/opt/synqdrive/current` | Revalidation `2026-09-06T23:24:20Z` | Release `01541c2ab…` @ `/opt/synqdrive/releases/20260906213654_v4994` | Active release path and deployed SHA | CONFIRMED_ON_MAIN drift noted | Original bootstrap exact time not recovered |
| TDL-EV-PROD-002 | PRODUCTION_OBSERVATION | HTTPS `GET /api/v1/health` | Bootstrap + revalidation window 2026-09-06 UTC evening | Production | API health reachable (HTTP 200) | CONFIRMED | Liveness only |
| TDL-EV-PROD-003 | PRODUCTION_OBSERVATION | SSH: `sudo pm2 jlist`, `pgrep -af backend/dist/src/main.js` | `2026-09-06T23:24:20Z` | Production VPS | Two PM2 apps (`synqdrive`, `synqdrive-b`) each `instances=1`; matching Node processes observed | CONFIRMED | **Not** proven as two replicas of one app; trip worker roles not fully mapped |
| TDL-EV-PROD-004 | PRODUCTION_OBSERVATION | SSH: `redis-cli --scan --pattern 'bull:…'` | Bootstrap session | Production Redis | Bull key-prefix counts for snapshot + trip-tracking queues | CONFIRMED | Prefix counts ≠ job queue depth by state |
| TDL-EV-PROD-005 | PRODUCTION_OBSERVATION | SSH-local `psql` read-only aggregate | Bootstrap session | Production PostgreSQL | `vehicle_trip_detection_states`: 6× RESTING | CONFIRMED | Small cohort; not full fleet |
| TDL-EV-PROD-006 | PRODUCTION_OBSERVATION | SSH-local `psql` read-only aggregate | Bootstrap session | Production PostgreSQL | `vehicle_trips`: 1994 COMPLETED, 18 CANCELLED, 0 ONGOING | CONFIRMED | Aggregate only |
| TDL-EV-PROD-007 | PRODUCTION_OBSERVATION | SSH-local `psql` read-only aggregate | Bootstrap session | Production PostgreSQL | `vehicle_trip_route_artifacts`: 94 rows | CONFIRMED | Coverage vs completed trips ~4.7% |
| TDL-EV-PROD-008 | PRODUCTION_OBSERVATION | SSH-local `psql` read-only aggregate | Bootstrap session | Production PostgreSQL | `trip_repairs` status/type distributions | CONFIRMED | High PROPOSED volume not root-caused |
| TDL-EV-PROD-009 | PRODUCTION_OBSERVATION | SSH-local `psql` read-only aggregate (7-day window) | Bootstrap session | Production PostgreSQL | `vehicle_trip_tracking_runs` by `run_type` | CONFIRMED | Natural activity evidence; not per-vehicle |

Detail and reproducibility templates: [PRODUCTION_BASELINE.md](PRODUCTION_BASELINE.md).

---

## Explicit non-artifacts

- **R9** adaptive polling wake — out of scope for bootstrap PR #1554
- **Competing authority paths** — must not be created under `architecture/trip-fsm/` or `docs/architecture/trip-fsm/`
