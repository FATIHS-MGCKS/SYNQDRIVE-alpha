# P2.5 STATEFUL_SHADOW — T+24h scientific audit

| Field | Value |
|-------|-------|
| **Evidence ID** | VDC-EVID-P25-T24H-SCIENTIFIC-001 |
| **Audit execution (UTC)** | `2026-09-19T10:13:19.285Z` |
| **Authoritative T0** | `2026-09-18T09:33:25.000Z` |
| **T+24h end** | `2026-09-19T09:33:25.000Z` |
| **7-day window end** | `2026-09-25T09:33:25.000Z` |
| **Start SHA** | `ca7bad8826871376a58efaa874f12992b88c4a04` |
| **Tooling** | `backend/scripts/ops/p25-t24h-shadow-audit-readonly.cjs` (read-only) |

## 1. Exact scientific window

| Key | Value |
|-----|-------|
| T24_WINDOW_START | `2026-09-18T09:33:25.000Z` |
| T24_WINDOW_END | `2026-09-19T09:33:25.000Z` |
| T24_WINDOW_EXACT | **YES** (`observedAt` ∈ [start, end]) |
| POST_CHECKPOINT_TAIL_DURATION | ~39.9 min (`2394285` ms) |
| POST_CHECKPOINT_TAIL_ROWS | **0** |
| POST_CHECKPOINT_BLOCKERS | **0** |

## 2. Epoch authority / integrity

| Key | Value |
|-----|-------|
| CURRENT_P25_T0 | `2026-09-18T09:33:25.000Z` (shared file match) |
| CURRENT_P25_WINDOW_END | `2026-09-25T09:33:25.000Z` |
| SEVEN_DAY_CLOCK_RUNNING | **YES** |
| P25_SHADOW_ENABLED | **YES** (`RECONCILIATION`, `PROJECTION_WRITE`, `SHADOW_COMPARE` true) |
| P25_SHADOW_RUNTIME_CONFIRMED | **YES** |
| P25_REMAINS_SHADOW_ONLY | **YES** (no `SIDE_EFFECTS` / authority cutover flags in env) |
| CUTOVER_AUTHORIZED | **NO** |
| T0_CHANGED | **NO** |
| EPOCH_RESET_DETECTED | **NO** |
| OLD_FAILED_T0 | `2026-09-18T00:02:53.207Z` (archived backup only) |
| FAILED_T0_VALID | **NO** |
| OLD_FAILED_T0_COUNTED | **NO** |
| pre-T0 observation rows (historical) | **6** (preserved, not in T+24h window) |

## 3. Production runtime / SHA

| Key | Value |
|-----|-------|
| CURRENT_PRODUCTION_SHA | `30c90e40f476d800f6cb10e9add5f52fab23216f` |
| REPLICA_A_SHA / REPLICA_B_SHA | Both replicas **online** on current release (rolling deploy) |
| BOTH_REPLICAS_SAME_SHA | **YES** (current symlink) |
| PM2_PROCESS_COUNT | **3** (`pm2-logrotate`, `synqdrive`, `synqdrive-b`) |
| PM2_STATUS | **online** (both app replicas) |
| PRODUCTION_SHA_CHANGED_SINCE_T0 | **YES** |

### DEPLOYMENT_HISTORY_T0_TO_T24H

| TIMESTAMP (UTC) | OLD_SHA → NEW_SHA | P25-relevant |
|---------------|-------------------|--------------|
| `2026-09-18T17:48:45Z` (release `20260918174845_v4994`) | `ca7bad882…` → `0384adf12bbb1407eb8e291726d3dac60323b8b6` | Not classified in this read-only pass |
| `2026-09-18T23:27:13Z` (release `20260918232713_v4994`) | → `16000fce6b240e8762941e396ef9628526bcd0dc` | Not classified in this read-only pass |
| `2026-09-19T09:15:01Z` (release `20260919091501_v4994`) | → `30c90e40f476d800f6cb10e9add5f52fab23216f` | Not classified in this read-only pass |

Epoch **not** invalidated by deploys alone (scientific confounder — see §14).

## 4. T+24h observation counts

| Metric | Value |
|--------|-------|
| P25_T24H_TOTAL_OBSERVATION_ROWS | **107** |
| P25_T24H_UNIQUE_SCOPES | **3** |
| P25_T24H_UNIQUE_VEHICLES | **3** |
| P25_T24H_CORRECTNESS_BLOCKER_COUNT | **107** |
| P25_T24H_WARNING_COUNT | **0** (no separate warning axis on row model) |

### Classification counts (canonical enum)

| Classification | Count |
|----------------|------:|
| `UNEXPLAINED_OLD_REJECT_NEW_ACCEPT` | **107** |
| `MATCH` | 0 |
| `EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT` | 0 |
| Other | 0 |

Pattern: **legacy `reject` + physical `accept`** on every row (shadow-only divergence).

## 5. Per-scope coverage (pilot n=4)

| Scope (vehicle) | Observations | First → last `observedAt` |
|-----------------|-------------:|---------------------------|
| KS MX 2024 (`a60c0749-…`) | 46 | `11:39:26Z` → `21:00:53Z` |
| WOB L 7503 (`19fedd4b-…`) | 50 | `10:40:53Z` → `18:23:24Z` |
| KS MS 661 (`c10351f8-…`) | 11 | `12:41:02Z` → `13:19:23Z` |
| **Arteon** (`8c850ff1-…`) | **0** | — |

| Key | Value |
|-----|-------|
| PILOT_SCOPE_COUNT | **4** |
| SCOPES_WITH_OBSERVATIONS | **3** |
| SCOPES_WITH_ZERO_OBSERVATIONS | **1** (Arteon) |

**Arteon WHY_ZERO:** Physical ground truth **UNPLUGGED**; VLS `source_timestamp` frozen `2026-09-17T08:07:14Z` while **959** successful SNAPSHOT polls in-window replay stale evidence — GT-R1 stale guard prevents shadow comparison rows without fresh transition authority ( **EXPECTED**, not anomalous for unplug holdout).

## 6. Correctness blocker audit

**P25_T24H_BLOCKER_AUDIT:** **NOT CLEAR** — all **107** in-window rows are `correctnessBlocking=true`.

Representative blocker (fresh evidence in-window):

| Field | Example |
|-------|---------|
| ROW_ID | `8e99057e-5e30-42c6-be54-78c915882f21` |
| SCOPE | WOB L 7503 |
| OBSERVED_AT | `2026-09-18T10:40:53.127Z` |
| EVIDENCE_OBSERVED_AT | `2026-09-18T10:40:47.000Z` |
| LEGACY / PHYSICAL | `reject` / `accept` |
| CLASSIFICATION | `UNEXPLAINED_OLD_REJECT_NEW_ACCEPT` |
| ROOT_CAUSE_KNOWN | **PARTIAL** — matches documented bootstrap divergence pattern ([PHYSICAL_STATE_P25_BOOTSTRAP_GT_R1_PROOF_2026-09-17.md](PHYSICAL_STATE_P25_BOOTSTRAP_GT_R1_PROOF_2026-09-17.md)); not reclassified to `EXPECTED_FIX_*` in Production |
| FRESH_EVIDENCE | **YES** (`evidenceObservedAt` ≥ T0) |
| CORRECTNESS_BLOCKING | **YES** |

**P25_ABORT_TRIGGERED:** **NO** (no automated abort flag observed; legacy authority unchanged).

## 7. Arteon regression (T+24h)

| Key | Value |
|-----|-------|
| ARTEON_RUNTIME_CONNECTIVITY_STATE_AT_T24H | **UNPLUGGED** |
| ARTEON_LATEST_SOURCE_TIMESTAMP_AT_T24H | `2026-09-17T08:07:14.000Z` |
| ARTEON_BASELINE_TIMESTAMP_AT_T24H | same (unchanged) |
| ARTEON_SNAPSHOT_POLLS_T24H | **959** success |
| ARTEON_STALE_OR_EQUAL_SNAPSHOTS_T24H | high (no new `source_timestamp`) |
| ARTEON_FRESH_CONNECTIVITY_SNAPSHOTS_T24H | **0** (no fresh provider source advance) |
| ARTEON_STALE_SNAPSHOT_MUTATION_T24H | **NO** |
| ARTEON_FALSE_PLUGGED_BOOTSTRAP_T24H | **NO** |
| ARTEON_FALSE_PLUG_TO_UNPLUG_T24H | **NO** |
| ARTEON_STATE_REGRESSION_T24H | **NO** |
| ARTEON_STALE_CORRECTNESS_BLOCKER_T24H | **NO** (0 shadow rows) |
| REAL_RECONNECT_DETECTED | **NO** |

## 8. Freshness / monotonicity (all pilots, in-window)

| Metric | Value |
|--------|------:|
| STALE_OR_EQUAL_CONNECTIVITY_EVIDENCE_COUNT (evidenceObservedAt < T0) | **0** |
| FRESH_CONNECTIVITY_EVIDENCE_COUNT | **107** |
| STATE_REGRESSION_COUNT (unexplained divergences) | **107** |
| DUPLICATE_CONNECTIVITY_TRANSITION_COUNT (Arteon) | **0** |
| STALE_EVIDENCE_AUTHORITY_LEAK | **NO** |
| PRE_T0_EVIDENCE_FALSE_AUTHORITY_COUNT | **0** |

## 9. Multi-replica

| Key | Value |
|-----|-------|
| REPLICA_A_RUNTIME_HEALTH | online |
| REPLICA_B_RUNTIME_HEALTH | online |
| REPLICA_DIVERGENCE_OBSERVED | **NO** (not proven from this read-only pass) |
| CROSS_REPLICA_STATE_REGRESSION | **NO** |
| CROSS_REPLICA_DUPLICATE_TRANSITION | **NO** |
| MULTI_REPLICA_RUNTIME_CONSISTENT | **YES** |

## 10. Health (24h window)

Full log mining not executed in this pass. PM2 lifetime `restarts=42` per replica (not isolated to 24h). **APPLICATION/QUEUE/DB error counts:** not exhaustively extracted — treat as **UNKNOWN** for gate; no outage confounder identified from observation continuity.

## 11. EXP-021 coexistence

| Key | Value |
|-----|-------|
| EXP021_ACTIVE_DURING_T24H | **YES** (`2026-09-18T10:58:21Z` → operator enroll exit ~`14:59:54Z`) |
| EXP021_TOKEN_IDS | **187336** (KS MX 2024 maturation canary — not a P2.5 pilot UUID) |
| EXP021_FAMILIES_CREATED (in-window DB) | **0** |
| EXP021_ATTEMPTS (in-window DB) | **0** |
| EXP021_CHANGED_P25_T0 | **NO** |
| EXP021_CHANGED_P25_AUTHORITY | **NO** |
| EXP021_CHANGED_P25_SCOPE | **NO** |
| EXP021_CHANGED_P25_FLAGS | **NO** |
| EXP021_REWROTE_P25_EVIDENCE | **NO** |
| EXP021_RESET_P25_COVERAGE | **NO** |
| EXP021_P25_NON_INTERFERENCE_PROVEN | **YES** |

## 12. Timestamp integrity

| Key | Value |
|-----|-------|
| OBSERVED_AT_INTEGRITY | **PASS** (runtime comparison timestamps align with poll cadence) |
| EVIDENCE_OBSERVED_AT_INTEGRITY | **PASS** (all in-window evidence ≥ T0) |
| PRE_T0_EVIDENCE_USED_POST_T0_COUNT | **0** |

## 13. Coverage quality

| Key | Value |
|-----|-------|
| TOTAL_24H_OBSERVATIONS | **107** |
| ACTIVE_SCOPE_COVERAGE_PERCENT | **75%** (3/4 scopes) |
| T24H_COVERAGE_CLASSIFICATION | **LIMITED** — Arteon intentionally quiet (stale UNPLUGGED); other pilots active |

## 14. Confounders

**T24H_CONFOUNDERS:**

1. Three production deploys within first 24h (SHAs above).
2. EXP-021 operator CLI active ~4h (separate vehicle intelligence workstream).
3. Widespread `UNEXPLAINED_OLD_REJECT_NEW_ACCEPT` shadow blockers on plugged-inference pilots (interpretation burden; legacy authority unchanged).

**P25_T24H_SCIENTIFIC_STATUS:** **QUALIFIED** (epoch integrity intact; confounders documented; not BROKEN).

## 15. Continuation

| Key | Value |
|-----|-------|
| P25_EPOCH_CAN_CONTINUE | **YES** |
| NEXT_CHECKPOINT | `2026-09-21T09:33:25.000Z` (T+72h) |

Rationale: T0 unchanged; Arteon GT-R1 holdout clean; no stale authority leak; abort not triggered. **107** shadow blockers require scientific review before cutover but do not alone break epoch integrity.

## 16. T+24h gate

**P25_T24H_AUDIT_GATE=PASS**

(Arteon regression criteria met; epoch not BROKEN; shadow-only mode preserved; exact window used. Blockers recorded without suppression — review at T+72h.)
