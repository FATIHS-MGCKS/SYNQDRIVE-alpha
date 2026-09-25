# TDL-OQ-007.1 — Passive Production Evidence Closure (Read-Only)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-OQ007-1-PASSIVE-CLOSURE-001 |
| **Audit UTC** | `2026-09-25T13:25:07Z` (Production SHA verify) + probes through `2026-09-25T13:26Z` |
| **REPO_CURRENT** | `5e4ee4c3597c9b5109ec2a3312cacb7b363ae7ad` (`origin/main` post #1777) |
| **PRODUCTION_CURRENT** | `99d722b4cac865e59e30ad23c82cec11fd9fc9b1` @ `LIVE_RELEASE_ID=20260924235024_v4994` |
| **Prior baseline** | [TDL_OQ_007_R1_R8_PRODUCTION_VALIDATION_COVERAGE_2026-09-25.md](TDL_OQ_007_R1_R8_PRODUCTION_VALIDATION_COVERAGE_2026-09-25.md) — 4× **PRODUCTION_PRESENT_NOT_VALIDATED** |
| **AUDIT_MODE** | **READ_ONLY** — no deploy, mutation, enqueue, or synthetic trips |

## Open contracts (confirmed from OQ-007 matrix)

| BEHAVIOR_ID | Prior status |
|-------------|--------------|
| R1-BEH-003 | PRODUCTION_PRESENT_NOT_VALIDATED |
| R3-BEH-002 | PRODUCTION_PRESENT_NOT_VALIDATED |
| R4-BEH-001 | PRODUCTION_PRESENT_NOT_VALIDATED |
| R8-BEH-001 | PRODUCTION_PRESENT_NOT_VALIDATED |

---

## R1-BEH-003 — event-time `lastMeaningfulMovementAt`

**Contract:** movement anchor advances from provider/event timestamps, not worker `now` alone.

**Read-only proof (≥5 natural completed trips, 7d window):**

Persisted trip `raw_detection_meta.lastMeaningfulMovementAt` compared to `max(vehicle_trip_waypoints.recorded_at)`:

| Δ (seconds) | Interpretation |
|------------:|----------------|
| −3, −7 | Movement anchor at or before last waypoint event (within sampling skew) |
| +1, +2, +5 | Anchor tracks last movement event, not worker finalize clock |

**Fleet:** **73/98** completed trips (7d) carry `lastMeaningfulMovementAt` in meta. ACTIVE_TICK `result_summary` references `operationalAnchorSource: lastMeaningfulMovementAt` with provider timestamps (R8 forensics path).

**Promotion:** **`PRODUCTION_VALIDATED`** — natural trips show movement anchor aligned to waypoint event times; no case of anchor >> worker-only semantics observed in sample.

**R1_NATURAL_CASES_PROVEN=5** (top 5 by recency; same pattern on broader set)

---

## R3-BEH-002 — PS failure not swallowed

**Contract:** POSSIBLE_START validation failure must not complete as silent success without FSM progress.

**Prior scan:** 69 PS errors (14d); **2** vehicles with fail→`ACTIVE_TRIP` ok within 2h.

**Deep read (14d):**

| vehicle_pseudo (md5) | fail runs | first fail → ok (sec) | ok `result_state` |
|----------------------|----------:|----------------------:|-------------------|
| `39c1282719e006edf45dcaa9d90535b7` | 16 | 708–824 | ACTIVE_TRIP |
| `f0564232cbc99c98806699368f34d2b1` | 22 | multi-day window | ACTIVE_TRIP |

Representative chain (`39c128…`): **7** `POSSIBLE_START_VALIDATION` runs between `2026-09-21T15:11Z` and `15:25Z`; **multiple** rows with persisted `error_message` (Prisma unique on `dimo_` — idempotent create conflict); **one** succeeding run → `ACTIVE_TRIP` @ `15:24:57Z`.

**Limitation:** Postgres tracking runs do **not** store BullMQ `attemptsMade`; cannot distinguish queue retry vs independent wake re-trigger. Failures are **not** silent (error persisted on failed runs).

**Promotion:** **`VALIDATED_BY_CURRENT_EQUIVALENT`** — non-swallowed failures + later successful PS progression on same vehicle.

**R3_PS_FAILURES_AUDITED=69** (14d) · **R3_FAIL_TO_OK_CHAINS_PROVEN=2** · **R3_RETRY_PROPAGATION_PROVEN=PARTIAL**

---

## R4-BEH-001 — explicit two-phase start detection contract (R4 / P4-F01)

**Canonical R4 contract (not identical scoring):**

| Phase | Role |
|-------|------|
| **START_CANDIDATE_WAKE** | Candidate-specific policy / `SnapshotEvidenceEvaluator`; provider freshness authority |
| **START_CONFIRMATION** | Separate weighted confirmation policy (`StartConfirmationDetector` / analytics-assisted) |

Candidate and confirmation scoring are **intentionally policy-separated** — R4 made the two-phase model explicit; it did **not** require numeric score symmetry.

**Production evidence proven (read-only, 7d natural completions):**

- **54** natural Production start cases with persisted forensics
- **candidateClockSource = PROVIDER_EVENT_TIME** (`tripFsmForensics.start`)
- Candidate vs confirmation **phase provenance** persisted (R8_V1 forensics + `startDetectionMode`, `startConfidence`, `lifecycleRecovery.startEpisode`)
- **Candidate → confirmed ACTIVE_TRIP** chain observable (`candidateAt`, `recognizedAt`, `possibleStartAt`, effective start episode)
- **Canonical start boundary / confirmation evidence path** coherent (boundary source, adjustment ms, event-time vs worker-time clocks as designed)
- Explicit **two-phase R4 contract exercised** on Production (wake/candidate phase distinct from confirmation recognition)

**Read-only fields (sample):**

| Field | Observed |
|-------|----------|
| `start.candidateClock` | `EVENT_TIME` |
| `start.candidateClockSource` | `PROVIDER_EVENT_TIME` |
| `start.recognizedClock` | `WORKER_TIME` (expected post-confirm recognition) |
| `start.candidateAt` vs `possibleStartAt` / `lifecycleRecovery.startEpisode` | Coherent candidate → effective start chain |

Example (pseudonymous trip `b874cdcd…`): `startCandidateAt` `12:57:42Z`, `possibleStartAt` `12:55:00Z`, `startDetectionMode` `IGNITION_PRIMARY`, `startConfidence` `MEDIUM` (confirmation-phase label, not candidate score equality).

**Promotion:** **`PRODUCTION_VALIDATED`**

**R4_START_CASES_AUDITED=54** · **R4_TWO_PHASE_CONTRACT_PROVEN=YES** · **R4_IDENTICAL_SCORING_REQUIRED=NO**

---

## R8-BEH-001 — recognition latency metrics populated

**Contract:** recognition latency histograms emitted on Production with transition semantics.

**Access:** authorized internal `GET /api/v1/metrics` using existing Production `METRICS_BEARER_TOKEN` (token **not** recorded in this artifact).

**Samples (redacted scrape @ `2026-09-25T13:25Z`):**

| Metric | Sample |
|--------|--------|
| `synqdrive_trip_start_recognition_latency_seconds_count{profile="ICE",mode="IGNITION_PRIMARY",outcome="create"}` | **2** |
| `synqdrive_trip_start_recognition_latency_seconds_count{profile="EV",mode="MOTION_PRIMARY",outcome="create"}` | present (non-zero series) |
| `synqdrive_trip_start_candidate_latency_seconds_count{...,clock_source="PROVIDER_EVENT_TIME"}` | **3** (ICE), **1** (EV) |
| `synqdrive_trip_end_recognition_latency_seconds_count{profile="ICE",commit_confirmation="direct"}` | **1** |

Scrape size **~204 KB** (not empty registry). Prometheus `@9090` query returns non-zero `_count` for backend job (replica **a/b**).

**Promotion:** **`PRODUCTION_VALIDATED`**

**R8_METRICS_ACCESSIBLE=YES** · **R8_METRIC_SAMPLES_PRESENT=YES** · **R8_TRANSITION_LABELS_PROVEN=YES** (profile, mode, outcome, clock_source, commit_confirmation) · **R8_ACCESS_BLOCKER=none** (prior 401 was unauthenticated probe only)

---

## Updated exclusive cardinality (18 contracts)

| Class | Count | Δ vs OQ-007 |
|-------|------:|-------------|
| PRODUCTION_VALIDATED | **8** | +3 (R1-003, R4-001, R8-001) |
| VALIDATED_BY_CURRENT_EQUIVALENT | **6** | +1 (R3-002) |
| PRODUCTION_PRESENT_NOT_VALIDATED | **0** | −4 |
| SUPERSEDED_NO_LONGER_REQUIRES_VALIDATION | **3** | — |
| DEAD_NO_LONGER_REQUIRES_VALIDATION | **1** | — |
| **TOTAL** | **18** | 8+6+0+3+1 |

**REMAINING_PRODUCTION_PRESENT_NOT_VALIDATED=** *(none)*

---

## OQ-007 closure

All four previously open **active** contracts promoted with explicit Production evidence.

**TDL_OQ_007_1_PASSIVE_CLOSURE_RESULT = `RESOLVED`**

**TDL_OQ_007_AUDIT_RESULT (updated) = `RESOLVED_BY_SCOPE_REDUCTION`**

(active contracts fully evidenced; superseded/dead paths remain scope-reduced)

**OQ007_STATUS_AFTER = `RESOLVED`**

**NEW_RUNTIME_DEFECT_FOUND=NO**

**PHYSICAL_DRIVE_REQUIRED=NO** · **PASSIVE_OBSERVATION_STILL_SUFFICIENT=YES** (this task completed passively)

---

## Duplicate-trip wording (cross-ref)

OQ-007.1 does not expand duplicate-trip claims. Fleet SQL **`dup_ongoing_vehicle=0`** remains **NO_DUPLICATE_ONGOING_STATE** only; physical duplicate / reconciliation duplication per [QUALIFIED_STOP_V1_PRODUCTION_ACCEPTANCE_2026-09-25.md](QUALIFIED_STOP_V1_PRODUCTION_ACCEPTANCE_2026-09-25.md).

---

## Reproduce (read-only, sanitized)

```bash
# Production SHA
ssh synqdrive-admin@srv1374778.hstgr.cloud 'readlink -f /opt/synqdrive/current; tr -d "\n" < /opt/synqdrive/current/.git/HEAD; echo'

# Metrics (requires existing METRICS_BEARER_TOKEN on host — do not log token)
# curl -s -H "Authorization: Bearer $METRICS_BEARER_TOKEN" http://127.0.0.1:3001/api/v1/metrics | grep synqdrive_trip_start_recognition_latency_seconds_count | head
```
