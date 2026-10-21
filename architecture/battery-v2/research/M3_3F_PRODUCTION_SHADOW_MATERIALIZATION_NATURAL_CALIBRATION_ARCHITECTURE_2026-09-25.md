# M3.3F — Production Shadow Materialization & Natural-Data Calibration Gate (Architecture)

**Date:** 2026-09-25  
**Phase:** M3.3F (architecture audit — **not activated**, **not deployed**)  
**Authority baseline main:** `abc2e6c2b53813b3071e03ca441749d1b82e5071` (E3 post-merge seal PR #1782)  
**Predecessors:** M3.3C C1–C5B on main; M3.3D D0–D4 on main; M3.3E E0–E3 on main (`M3_3E_E3_COMPLETE_ON_MAIN=YES`)

---

## 1. Baseline (repository + documented production)

| Field | Value |
|-------|-------|
| `M3_3E_E3_COMPLETE_ON_MAIN` | **YES** (PR #1778 + seal #1782) |
| `M3_3E_E3_POST_MERGE_SEAL` | **PASS** |
| `M3_3E_PURE_LONGITUDINAL_EVALUATOR_IMPLEMENTED` | **YES** (pure function; tests only) |
| `M3_3E_CONCLUSION_BEARING_MODEL_READY` | **NO** |
| `M3_3F_REMAINS_PENDING` | **YES** (until explicit F-stage activation) |
| `D3_RUNTIME_REACHABLE` | **NO** |
| `D4_RUNTIME_REACHABLE` | **NO** |
| `E3_RUNTIME_REACHABLE` | **NO** |
| `PRODUCTION_MATERIALIZATION_READY` | **NO** |

### 1.1 Documented production flags (`CURRENT_STATE.md` + `battery-health-v2.config.ts`)

| Flag | Documented production | Code default |
|------|----------------------|--------------|
| `BATTERY_V2_GENERALIZED_EVIDENCE_ENABLED` | **true** (M3.3A B1 active) | **false** |
| `BATTERY_V2_PROVIDER_OBSERVABILITY_GAP_ENABLED` | **true** (B1.2Y active) | **false** |
| `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED` | **false** | **false** |

Runtime truth on VPS is **env-backed**; agents must treat deployed `backend.env` as authoritative over snapshot prose when they differ. This audit records **architectural** gating: C3 writers exist in code but **effective production writes = OFF** until the C3 shadow flag is enabled.

### 1.2 Code inventory (audit counts on `origin/main`)

| Component | Exists | Nest `providers` | Production call sites (excl. tests/scripts) |
|-----------|--------|------------------|---------------------------------------------|
| C3 `RestSessionFeatureComputationService` | YES | YES (`GeneralizedEvidenceModule`) | **0** direct — only via C4 |
| C4 `RestSessionFeatureShadowTriggerService` | YES | YES | **3** optional hooks: `BatteryRestSessionService` (×2), `LateTripAssociationService` (×1) |
| C5A inspection / ops CLI | YES | YES (`RestSessionFeatureShadowInspectionService`) | Read-only ops script `battery-rest-session-feature-shadow-inspect.ts` |
| D1 `LongitudinalInputReaderService` | YES | YES | **0** runtime consumers |
| D2 profile assembly | YES (pure) | NO | **0** |
| D3 `LongitudinalProfileMaterializationService` | YES | **NO** | **0** |
| D4 `LongitudinalIntegrityInspectionService` | YES | **NO** | **0** |
| E1 adapter | YES (pure) | NO | **0** |
| E3 evaluator | YES (pure) | NO | **0** |

**`C3_WRITES_EFFECTIVELY_GATED_OFF=YES`** — C4 returns `SKIPPED_FLAG_OFF` when `isBatteryV2RestSessionFeaturesShadowEnabled()` is false; C3 also re-checks the flag inside `computeAndPersist`.

**`D3_NEST_PROVIDER_REGISTERED=NO`** — `LongitudinalProfileMaterializationService` is not listed in `generalized-evidence.module.ts` or `vehicle-intelligence.module.ts`.

No scheduler, HTTP controller, or worker on main invokes D3 materialization or D4 inspection outside gated integration tests.

---

## 2. Authority chain (unchanged semantics)

```text
C1 retention policy → C3 feature rows (shadow append-only)
  → D1 bounded read → D2 assembly → D3 revision persist (append-only)
    → D4 integrity overlay (read-only)
      → E1 consumption adapter (pure) → E3 evaluator (pure, UNSET calibration)
```

M3.3F may authorize **shadow writes** at C3 and D3 and **read-only** natural-data analysis. It must **not** authorize E3 runtime, assessment/publication writes, readiness, or customer surfaces.

---

## 3. M3.3F objective (frozen)

**Name:** Production shadow evidence + materialization + natural-data calibration **gate**.

M3.3F is **not** “turn battery health on.”

| Frozen boundary | Value |
|-----------------|-------|
| `M3_3F_CUSTOMER_EFFECT` | **NO** |
| `M3_3F_READINESS_EFFECT` | **NO** |
| `M3_3F_BATTERY_ASSESSMENT_WRITES` | **NO** |
| `M3_3F_BATTERY_PUBLICATION_WRITES` | **NO** |
| `M3_3F_CONCLUSION_BEARING_HEALTH` | **NO** |
| `NUMERIC_CALIBRATION_VALUES_SET` | **NO** (architecture only; thresholds remain UNSET) |

Natural-data rows are **shadow scientific evidence**, not production battery-health truth.

| Rule | Value |
|------|-------|
| `NATURAL_DATA_CAN_BLOCK_CUSTOMER_READINESS` | **NO** |
| `NATURAL_DATA_CAN_TRIGGER_PUBLICATION` | **NO** |
| `NATURAL_DATA_CAN_CREATE_HEALTH_ASSESSMENT` | **NO** |

Missing wake samples, short rests, or `NO_CONCLUSION` outcomes must remain **non-adverse** (no implicit “bad battery” inference).

---

## 4. Two separate shadow write gates

| Gate | Env flag | Persists | Default |
|------|----------|----------|---------|
| **A — C3 feature evidence** | `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED` | `BatteryRestSessionFeature` append-only | **OFF** |
| **B — D3 profile materialization** | **`BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED`** (proposed; canonical for F1) | `BatteryLongitudinalProfileRevision` append-only | **OFF** |

| Field | Value |
|-------|-------|
| `C3_SHADOW_GATE` | `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED` |
| `D3_MATERIALIZATION_GATE` | `BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED` |
| `SEPARATE_ACTIVATION_GATE_REQUIRED` | **YES** |
| `FLAG_COUPLING_ALLOWED` | **NO** |

C3 ON **does not** imply D3 ON. D3 ON **does not** imply C3 ON.

**D3 ON + C3 OFF:** Allowed only as a **degraded ops mode** on **pre-existing** C3 rows (D1 read from DB). It produces **no new natural post-T0 C3 evidence** and must be labeled `REPLAY_OR_HISTORICAL_C3_ONLY` in ops/evidence reports — **not** pooled with live shadow collection. Default F4 activation assumes **C3 ON first** (F3 before F4).

---

## 5. D3 runtime trigger V1 (frozen decision)

Prior D3 audit rejected **A (every C3 append)** and required foundation trigger **E** (no reachable production path). M3.3F authorizes runtime under trigger **D** plus bounded reconciliation.

| Option | Verdict |
|--------|---------|
| A. Every C3 append | **REJECT** — write amplification, INCREMENTAL churn, couples materialization to C4 fail-open hooks |
| B. FINAL C3 only | **DEFER** — still couples to hook semantics; acceptable only as manual/on-demand subset |
| C. Scheduled reconciliation alone | **INSUFFICIENT** — needs explicit bounded job + idempotency story |
| D. On-demand internal ops + optional persist | **REQUIRED primary** |
| E. D + bounded scheduled reconciliation | **SELECTED V1** |

**`M3_3F_D3_TRIGGER_V1=`** **`ON_DEMAND_INTERNAL_OPS_PLUS_BOUNDED_SCHEDULED_RECONCILIATION`**

**WHY:** Minimal writes while enabling fleet-scale natural evidence: (1) **internal-only** invocation (ops CLI / internal service method) with explicit `organizationId`, `vehicleId`, `sessionLimit`, `profileGeneratedAt`; (2) optional **bounded** reconciliation tick (vehicle batch cap, monotonic idempotency via D3 fingerprint) to refresh profiles after new C3 rows without hooking every C3 append. Multi-replica safety preserved via D3 idempotent insert + deterministic D2 fingerprint (existing foundation). Rollback = flag OFF (stop new attempts; history append-only).

Automatic materialization **must not** be wired inside `RestSessionFeatureShadowTriggerService` in F1/F4 without a separate architecture amendment.

---

## 6. Runtime reachability boundary (M3.3F)

| Surface | F may reach runtime? | Notes |
|---------|---------------------|-------|
| C3 shadow computation | **YES** (F3) | Existing C4 hooks; flag gated |
| D3 materialization | **YES** (F4) | New Nest registration + dedicated flag + trigger V1 |
| D4 integrity inspection | **YES** (read-only) | Ops/analysis only; no customer API |
| E1 adapter | **NO** (runtime) | Consumed offline or inside read-only analysis jobs from exported D3/E1-shaped JSON |
| E3 evaluator | **NO** (runtime) | Same — offline calibration analysis |

| Field | Value |
|-------|-------|
| `M3_3F_REQUIRES_E3_RUNTIME` | **NO** |
| `E3_RUNTIME_REACHABLE_AFTER_F_ENGINEERING` | **NO** |

Natural calibration consumes **read-only** D3 revisions (+ D4 disposition) and recomputes E1/E3 **offline**; persisting E3 output remains out of scope for M3.3F.

---

## 7. D4 role (unchanged semantics)

D4 contract: `M3_3D_D4_INTEGRITY_INSPECTION_V1` — overlay only; no D2/D3 mutation.

**M3.3F analysis admission:** A materialized revision enters calibration statistics only when:

1. Row exists (D3 `CREATED` or `EXISTING` with stable fingerprint), **and**
2. D4 self-integrity + source-evidence checks yield disposition **`ELIGIBLE`**.

**Excluded from assessment-grade natural calibration pools (explicit):**

- `QUARANTINED_INTEGRITY_WARNING`
- `SOURCE_EVIDENCE_LIMITED`
- `PROVISIONAL` / `EXCLUDED` (per D4 vocabulary)

**Invocation pattern (F5):** **Separate inspection pass** after materialization (on-demand ops / analysis job), not inline blocking inside D3 insert path — preserves D3 idempotent append latency and audit trail. Optional: analysis job batches D4 for newly materialized revision IDs post-`F_D3_T0`.

---

## 8. Natural-data items (NAT-M3.3F-*)

| ID | F scope | Rationale |
|----|---------|-----------|
| NAT-M3.3F-001 | **F_REQUIRED** | Gate existence of fleet-scale C3 rows |
| NAT-M3.3F-002 | **F_REQUIRED** | Descriptor distributions drive CAL-001..011 evidence |
| NAT-M3.3F-003 | **F_REQUIRED** | Repeatability for CAL-006 / slope noise |
| NAT-M3.3F-004 | **F_BEST_EFFORT** | Wake vs parked-rest comparison; confounded but useful |
| NAT-M3.3F-005 | **F_BEST_EFFORT** | Parasitic draw not in E1 contract |
| NAT-M3.3F-006 | **F_BEST_EFFORT** | Powertrain not in E1; partial fleet |
| NAT-M3.3F-007 | **F_PLUS** | Temperature age beyond current E1 |
| NAT-M3.3F-008 | **G_OWNER** | Ground truth → **M3.3G** (workshop linkage) |
| NAT-M3.3F-009 | **G_OWNER** | Replacement labels → **M3.3G** |

Do **not** claim F resolves NAT-008/009.

---

## 9. Calibration evidence plan (CAL-M3.3E-001 … 011)

Architecture defines **how** evidence is collected; **no numeric thresholds** in this document.

| ID | Field / question | Natural evidence | Source contract | F can propose candidate? | Blocks premature promotion |
|----|------------------|------------------|-----------------|--------------------------|----------------------------|
| CAL-001 | Min series count | Session/version counts per segment | C3 + D3 + E1 window | Candidate only | Requires NAT-001/002 maturity |
| CAL-002 | Min evidence span | `anchorAt` span | E1 from D3 | Candidate only | Same |
| CAL-003 | Temporal concentration | Observation time density | E1 descriptors | Candidate only | Same |
| CAL-004 | Rest-depth bands | `maxActualRestAgeMs` distribution | C3 retention fields | Candidate only | NAT-003 repeatability |
| CAL-005 | First-point-age bands | `firstRestPointAgeMs` | C3/E1 | Candidate only | Same |
| CAL-006 | Min detectable slope | Same-condition slopes | NAT-003 | Candidate only | Noise floor unknown |
| CAL-007 | Step-change magnitude | Step events | D3/E3 offline | **Partial** | NAT-009 (G) for validation |
| CAL-008 | MAD multiplier | Residual distribution | E3 offline on ELIGIBLE D4 | Candidate only | Distribution maturity |
| CAL-009 | Temperature coverage/strata | TRIP_EXTERIOR share | C3/E1 | Candidate only | NAT-007 |
| CAL-010 | C2 classifier thresholds | Charge class ≠ UNKNOWN rate | C2/C3 | **F_PLUS** (depends C2 calibration) | Classifier not calibrated |
| CAL-011 | Per-session slope minima | Points/span per session | C3 | Candidate only | NAT-002 |

**Evidence maturity states (non-numeric):** `COLLECTING` → `DISTRIBUTION_VISIBLE` → `REPEATABILITY_VISIBLE` → `CALIBRATION_CANDIDATE` → `CALIBRATION_VALIDATION_PENDING`. Do **not** label **`VALIDATED`** until explicit gate passes.

---

## 10. Observability contract (pre-activation design)

### 10.1 C3 (extend existing)

Already present: `synqdrive_battery_rest_session_feature_trigger_total{status}`, `_duration_seconds`, `_row_created_total{phase,trust}`.

Required labels: **bounded** — `status`, `phase`, `trust`, `outcome`; **no** `vehicleId` / `organizationId`.

### 10.2 D3 (new in F1)

Proposed metrics (names stable prefix `synqdrive_battery_longitudinal_profile_materialization_*`):

- attempts_total{outcome} — `CREATED`, `EXISTING`, `D1_REJECTED`, `D2_REJECTED`, `ERROR`
- duration_seconds
- revisions_per_vehicle gauge (histogram or summary with capped buckets)
- idempotency_ratio (EXISTING / attempts)

### 10.3 D4 (new in F1/F5 analysis path)

- inspection_total{disposition} — `ELIGIBLE`, `QUARANTINED_INTEGRITY_WARNING`, `SOURCE_EVIDENCE_LIMITED`, …
- self_integrity_failure_total

### 10.4 Natural evidence (F5 dashboards / batch reports)

Aggregate only: vehicles with ≥1 ELIGIBLE row, sessions/vehicle, evidence span, version segments, temperature coverage, rest-depth / first-point-age / charge-class distributions, zero/one/multi-point session counts. **Fleet aggregates** — no per-vehicle Prometheus labels.

---

## 11. Activation / rollback state machine

| Stage | ENTRY | ACTION | EXPECTED | ABORT | ROLLBACK | EVIDENCE TO ADVANCE |
|-------|-------|--------|----------|-------|----------|---------------------|
| **F0** | E3 sealed on main | This architecture doc | Boundaries frozen | — | N/A | Architecture merged |
| **F1** | F0 merged | Register D3 service + **new flag default OFF** + D3/D4 metrics stubs; **no** production ON | Deploy noop | Wiring reaches customer API | Revert PR | Unit/integration tests; flag OFF smoke |
| **F2** | F1 on main | Deploy; verify flags OFF; DB invariants | Zero new C3/D3 rows | Unexpected writes | Disable deploy / flag verify fail | Production read-only counts |
| **F3** | F2 pass | Enable **C3 shadow** only; record **`F_C3_T0`** | Natural C3 append-only | Write storm / error rate | C3 flag OFF | NAT-001 observability |
| **F4** | F3 stable | Enable **D3 materialization** + trigger V1; record **`F_D3_T0`** | D3 revisions append-only | D1/D2 reject spike | D3 flag OFF | Materialization metrics + sample D4 |
| **F5** | F4 stable | Read-only analysis exports | Distributions visible | — | Stop jobs only | NAT-002/003 maturity |
| **F6** | F5 maturity | Calibration **candidate** docs (still UNSET numerics) | No production model | Any customer/readiness coupling | Discard candidates | Review gate |

Flag OFF rollback: **stop new writes**; **never delete** append-only history.

---

## 12. Flag dependency matrix

Legend: **VALID** = supported combination for F stages; **INVALID** = must not be enabled together for natural evidence; **NO_EFFECT** = flag irrelevant.

| GENERALIZED | PROVIDER_GAP | C3_SHADOW | D3_MATERIALIZATION | Result |
|-------------|--------------|-----------|-------------------|--------|
| OFF | * | * | * | **BLOCKED** — no rest-session pipeline for C3 |
| ON | OFF | ON | OFF | **VALID** (F3) — gap resolution degraded but C3 OK |
| ON | ON | ON | OFF | **VALID** (F3 preferred) |
| ON | * | OFF | ON | **DEGRADED** — historical/replay C3 only; not F4 default |
| ON | * | ON | ON | **VALID** (F4) |
| ON | * | ON | OFF | **VALID** (F3) |
| * | * | OFF | OFF | **NO_EFFECT** on C3/D3 writes (current prod) |

**D3 requires GENERALIZED_EVIDENCE=YES** (rest sessions + C3 inputs). **D3 does not require PROVIDER_OBSERVABILITY_GAP** (recommended ON for liveness semantics aligned with B1.2W).

Turning a flag **OFF** after rows exist: **stop new writes**; existing rows remain; analysis must tag pre-OFF vs post-T0.

---

## 13. Backfill policy

**`M3_3F_BACKFILL_POLICY=`** **`NO_BACKFILL`** (default for natural shadow science)

Prospective observation after **`F_C3_T0`** / **`F_D3_T0`** is the primary evidence path. Bounded replay/backfill may be authorized only in a **separate** ops gate with explicit **`REPLAY/BACKFILL_EVIDENCE`** labeling — **never** silently pooled with **`NATURAL_POST_T0_EVIDENCE`**.

Historical recompute is not scientifically identical to live shadow capture (hook timing, contamination, provider gap state). If later authorized, it requires its own T0 and ledger entry.

---

## 14. Production T0 semantics

| Timestamp | Assigned when | Purpose |
|-----------|---------------|---------|
| **`F_C3_T0`** | First production `BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED=true` | Natural C3 evidence boundary |
| **`F_D3_T0`** | First production `BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED=true` | Natural D3 revision boundary |

**Not assigned in this architecture PR.** All F5 reports must segment: pre-T0, post-C3-T0, post-D3-T0, replay/backfill.

---

## 15. Materialization request authority

`LongitudinalProfileMaterializationRequest` (code on main):

- `organizationId`, `vehicleId` — **required**; tenant isolation preserved
- `sessionLimit` — **F1 must freeze** as config/env constant (e.g. `BATTERY_V2_LONGITUDINAL_MATERIALIZATION_SESSION_LIMIT`) with documented max; ops CLI may override only with explicit audit log, not arbitrary runtime API params in V1
- `profileGeneratedAt` — **ISO UTC envelope** for D2 assembly; excluded from scientific fingerprint; set from **clock at invocation** (ops job) or reconciliation tick — not invented backdated values

---

## 16. Cohort / tenancy

- All persisted science rows carry **`organizationId`** + **`vehicleId`** (existing schema).
- **No cross-tenant** aggregation in persisted tables.
- Fleet-level calibration analysis: **read-only**, anonymized aggregates in F5 only after documented boundaries.
- Operational canary cohort (if used): **ops config** (org allowlist / feature rollout), **not** embedded in E2/E3 calibration profiles.
- Connected fleet reference: **6 DIMO vehicles** (`CURRENT_STATE`) — do not hard-code IDs in scientific policy files.

---

## 17. Retention

**`RETENTION_POLICY=DECISION_REQUIRED`** (D3 architecture) remains open.

| Field | Value |
|-------|-------|
| `DOES_F_REQUIRE_RETENTION_POLICY_BEFORE_SHADOW_ACTIVATION` | **NO** |
| `RETENTION_POLICY_BLOCKS_F_ACTIVATION` | **NO** |

Initial shadow volume is bounded by fleet size + append-only semantics + F3/F4 rate limits; retention product decision required before **M3.3G** customer authority or unbounded multi-year growth — not before first shadow activation.

---

## 18. Security / operations

- Internal-only triggers (ops CLI / future internal service); **no public/customer HTTP**
- MASTER_ADMIN C5B remains **read-only** inspection — not D3 activation
- Workers/schedulers: any F4 reconciliation job must be **org-scoped batches**, idempotent, rate-limited
- Multi-replica: D3 `insertIdempotent` + fingerprint; C3 digest idempotency (existing)
- Failures: C4 **fail-open** (already); D3 materialization failures **must not** block rest session lifecycle

---

## 19. Engineering blockers & next slice

| Blocker | Status |
|---------|--------|
| E3 complete on main | **CLOSED** |
| D3 foundation schema/service | **CLOSED** |
| Separate D3 flag name | **CLOSED in F0** (this doc) |
| D3 trigger V1 | **CLOSED in F0** |
| `RETENTION_POLICY` product decision | **OPEN** — non-blocking for F1–F4 |
| `DEC-M3.3D-001` | **OPEN** — track in F1 engineering |
| Numeric calibration | **OPEN by design** until F5/F6 evidence |

**Next engineering slice (F1):** Register `LongitudinalProfileMaterializationService` + repository in Nest (internal export only), add `BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED` default **OFF**, D3/D4 metric hooks, ops entrypoint skeleton — **no production activation**.

| Field | Value |
|-------|-------|
| `M3_3F_F1_IMPLEMENTATION_READY` | **YES** |

---

## 20. Explicit non-effects (this architecture PR)

No runtime wiring activation, no Prisma/migration, no flag **values** changed in production, no deploy, no assessment/publication/readiness, no E3 runtime, no numeric calibration, no customer UI.

---

## 21. Machine-readable summary

```yaml
M3_3F_SCOPE_DEFINED: YES
M3_3F_ARCHITECTURE_STATUS: DRAFT_PR
M3_3F_CUSTOMER_EFFECT: NO
M3_3F_READINESS_EFFECT: NO
M3_3F_CONCLUSION_BEARING_HEALTH: NO
C3_SHADOW_GATE: BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED
D3_MATERIALIZATION_GATE: BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_ENABLED
SEPARATE_ACTIVATION_GATE_REQUIRED: YES
M3_3F_D3_TRIGGER_V1: ON_DEMAND_INTERNAL_OPS_PLUS_BOUNDED_SCHEDULED_RECONCILIATION
M3_3F_REQUIRES_E3_RUNTIME: NO
M3_3F_BACKFILL_POLICY: NO_BACKFILL
NUMERIC_CALIBRATION_VALUES_SET: NO
PRODUCTION_MATERIALIZATION_READY: NO
M3_3F_REMAINS_PENDING: YES
NEXT_ENGINEERING_SLICE: M3.3F F1
```
