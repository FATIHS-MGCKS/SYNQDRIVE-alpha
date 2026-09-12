# RFRF F2 — RawRefuelCandidate Persistence + Semantic Rediscovery

**Workstream:** Raw Fuel Refuel Fallback (RFRF)  
**Phase:** F2 — Candidate staging persistence (Option D)  
**Date:** 2026-09-12  
**Parent documents:** `docs/audits/eed-rfrf-f1-architecture-2026-09-12.md`, `docs/audits/eed-rfrf-f1-1-hardening-2026-09-12.md`  
**Mode:** SCHEMA + PERSISTENCE SERVICE + DESIGN CONTRACTS + INTEGRATION TESTS (no detector wiring, no production fallback)

---

## 1. Scope attestation

| Field | Value |
|-------|-------|
| **F2_IMPLEMENTATION_COMPLETE** | **YES** (candidate persistence scope) |
| **FALLBACK_RUNTIME_READY** | **NO** |
| **PRODUCTION_FALLBACK_READY** | **NO** |
| **KS_MS_661_DETECTED_BY_F2** | **NO** — F2 does not run raw-rise detector or reconcile scheduling |
| **RAW_FUEL_REFUEL_FALLBACK_ENABLED** | **false** (constants only; no runtime wiring) |
| **RUNTIME_BEHAVIOR_CHANGED** | **NO** (no `detectEnergyEvents` path; flags remain OFF) |
| **BACKEND_SOURCE_TREE_CHANGED** | **YES** |
| **PRODUCTION_MUTATED** | **NO** |
| **PRODUCTION_DEPLOYED** | **NO** |

F2 persists and rediscovers **normalized candidate observations** supplied by future F3/F4 callers. It does **not** detect KS MS 661, does **not** promote to `VehicleEnergyEvent`, and does **not** enable production fallback.

---

## 2. Schema + migration

### 2.1 `raw_refuel_candidates` table

Migration: `backend/prisma/migrations/20260912123000_rfrf_f2_raw_refuel_candidates/migration.sql`

| Column group | Fields |
|--------------|--------|
| Identity | `id` (UUID PK), `organization_id`, `vehicle_id`, `candidate_identity_key` (**nullable until assigned**) |
| Versioning | `detection_version`, `detector_version`, `signal_channel` |
| Lifecycle | `lifecycle_state`, `rejection_reason` |
| Evidence digest | `evidence_revision_fingerprint` |
| Physical envelope | `physical_evidence_start/end`, `rise_onset_at`, `rise_end_at` |
| Fuel levels | pre/post/delta absolute liters + relative percent |
| Quality | sample counts, `max_sample_gap_seconds`, `absolute_signal_trust`, route/stationary flags |
| Scan context | `scan_window_start/end`, `signal_provider`, `evidence_meta`, `quality_meta` |
| Timestamps | `first_observed_at` (immutable), `last_observed_at`, `created_at`, `updated_at` |

**Constraints / indexes:**

- `@@unique([vehicleId, candidateIdentityKey])` — prevents duplicate keys per vehicle
- Indexes on `(vehicle_id, lifecycle_state)`, `(vehicle_id, physical_evidence_start)`, `(vehicle_id, first_observed_at)`, `(lifecycle_state, updated_at)`, `organization_id`

### 2.2 Enums

| Enum | Values |
|------|--------|
| `RawRefuelCandidateLifecycleState` | `INSUFFICIENT`, `OBSERVED`, `SETTLING`, `READY_FOR_PERSIST`, `REJECTED`, `PROMOTED` |
| `RawRefuelCandidateSignalChannel` | `ABSOLUTE_LITERS`, `RELATIVE_PERCENT` |
| `RawRefuelAbsoluteSignalTrust` | `TRUSTED`, `UNTRUSTED`, `UNKNOWN` |
| `RawRefuelCandidateRejectionReason` | 13 fail-closed reasons (F1 §18) |

### 2.3 Deferred to F4 — `vehicle_energy_events` source metadata

F2.1 **removed** additive `detection_source`, `source_event_key`, and `@@unique([vehicleId, sourceEventKey])` from the F2 migration to minimize migration surface. Promotion idempotency columns remain a **F4 promotion** concern; design contract in `raw-refuel-candidate-promotion.design.ts` is unchanged.

---

## 3. Lifecycle semantics

Implemented in `raw-refuel-candidate-lifecycle.ts`.

| State | Meaning | Persist to VehicleEnergyEvent? |
|-------|---------|-------------------------------|
| **INSUFFICIENT** | Not enough pre/post plateau or material rise | NO |
| **OBSERVED** | Rise onset detected; identity locked; evidence immature | NO |
| **SETTLING** | Post-rise samples still arriving; fingerprint may change | NO |
| **READY_FOR_PERSIST** | All fail-closed gates pass (caller-assigned in F4+) | YES → promote (F4) |
| **REJECTED** | Fail-closed rejection reason | NO (terminal) |
| **PROMOTED** | Successfully promoted to VehicleEnergyEvent | NO (terminal) |

**Forward transitions:**

```
INSUFFICIENT → OBSERVED | REJECTED
OBSERVED → SETTLING | READY_FOR_PERSIST | REJECTED
SETTLING → READY_FOR_PERSIST | REJECTED
READY_FOR_PERSIST → PROMOTED | SETTLING | REJECTED   # SETTLING regression allowed (F1.2 §26)
REJECTED → (terminal)
PROMOTED → (terminal)
```

F2 `resolveOrCreateCandidate` accepts caller-supplied `lifecycleState` (except **PROMOTED**, which is not caller-controlled) and applies `resolveNextLifecycleState` — invalid transitions **throw** `RawRefuelCandidateLifecycleTransitionError` (fail-closed). `REJECTED` requires `rejectionReason`. `READY_FOR_PERSIST` requires non-null `candidateIdentityKey`.

---

## 4. Per-vehicle locking

| Property | Value |
|----------|-------|
| Mechanism | `pg_advisory_xact_lock64` via `acquirePgAdvisoryXactLock64` |
| Lock key | `raw_refuel_candidate:{vehicleId}` (`buildRawRefuelCandidateLockKey`) |
| Scope | Transaction-scoped; released on commit/rollback |
| Coupling | Separate from G2 `physical-refuel` reconciliation lock |

**Purpose:** Serialize semantic rediscovery + insert for a single vehicle across concurrent reconcile passes / replicas.

---

## 5. Semantic rediscovery contract (F2.1 / F2.2)

Entry point: `@Injectable()` `RawRefuelCandidateService.resolveOrCreateCandidate`.

```
BEGIN TRANSACTION
  pg_advisory_xact_lock64("raw_refuel_candidate:{vehicleId}")
  resolveAuthoritativeOrganizationId(vehicleId, assertedOrgId)  # fail-closed on mismatch
  window = computeRawRefuelCandidateRediscoveryWindow(observation, serviceNow)
  candidates = findRediscoveryCandidatesInWindow(vehicleId, signalChannel, window)
    # bounded non-terminal + terminal rows only
  classify each candidate → SAME | INSUFFICIENT | DISTINCT
  if SAME count > 1 → RawRefuelCandidateAmbiguityError (MULTIPLE_SAME_PHYSICAL_RISE)
  if SAME count = 1 and INSUFFICIENT neighbors > 0 → AmbiguityError (SAME_WITH_INSUFFICIENT_NEIGHBOR)
  if SAME count = 1 → reconcileExistingCandidate (terminal rows: return without mutation)
  if SAME count = 0 and INSUFFICIENT count > 1 → AmbiguityError (MULTIPLE_INSUFFICIENT_NEIGHBORS)
  if SAME count = 0 and INSUFFICIENT count = 1 → reconcile that INSUFFICIENT row (maturation)
  if exact candidateIdentityKey lookup hits → reconcile (includes out-of-window terminal guard)
  else INSERT new row (candidateIdentityKey nullable when evidence insufficient)
  merge evidence → canonical fingerprint from merged state → persist atomically
  lastObservedAt = MAX(existing, serviceNow) even when fingerprint unchanged (non-terminal)
COMMIT
```

**Matcher** (`classifyRawRefuelCandidateOverlap`): tri-state `SAME_PHYSICAL_RISE | DISTINCT_PHYSICAL_RISE | INSUFFICIENT_EVIDENCE`. Does **not** compare `candidateIdentityKey` or 5-minute buckets alone.

**Bounded lookup (F2.2 / F2.2a):**

- Lookback: `RAW_REFUEL_CANDIDATE_REDISCOVERY_LOOKBACK_MS = 6 hours`
- **Evidence anchors (authoritative):** min/max of observation `riseOnsetAt`, `riseEndAt`, `physicalEvidenceStart`, `physicalEvidenceEnd`, `scanWindowStart`, `scanWindowEnd`
- **`serviceNow` is excluded** from anchor min/max when any evidence timestamp exists — delayed telemetry does **not** stretch the DB lookup from evidence time to processing time
- **Fallback only:** when no evidence timestamp exists, anchor on `serviceNow` (±6h)
- Resulting window: `[earliestEvidence − 6h, latestEvidence + 6h]` (evidence-local even if telemetry arrives hours or days late)
- Rationale: covers 45-minute same-rise neighborhood, bucket shifts, warm reconciliation scan windows, and delayed telemetry without scanning vehicle lifetime
- Exact `candidateIdentityKey` lookup remains an additional guard outside the temporal window

**Ambiguity policy (fail-closed):**

| Condition | Policy |
|-----------|--------|
| >1 SAME | Throw `MULTIPLE_SAME_PHYSICAL_RISE` |
| 1 SAME + ≥1 INSUFFICIENT neighbor | Throw `SAME_WITH_INSUFFICIENT_NEIGHBOR` |
| 0 SAME + >1 INSUFFICIENT | Throw `MULTIPLE_INSUFFICIENT_NEIGHBORS` |
| 0 SAME + 1 INSUFFICIENT | Reconcile the single INSUFFICIENT row |
| 0 SAME + 0 INSUFFICIENT | Insert new row (or exact-key reconcile) |
| DISTINCT neighbors | Ignored (do not block) |
| Distant terminal outside window | Ignored by bounded query |

**Neighborhood constants (matcher):**

- Rise neighborhood: 45 min (`RAW_REFUEL_CANDIDATE_RISE_NEIGHBORHOOD_MS`)
- Pre-plateau tolerance: ±0.5 L / ±1.0 %
- Post-plateau tolerance: ±1.0 L

---

## 6. Identity semantics (four-way separation)

| Concept | Storage | Mutability | F2 role |
|---------|---------|------------|---------|
| `RawRefuelCandidate.id` | UUID PK | Immutable | DB row identity |
| `candidateIdentityKey` | SHA-256 of `vehicleId\|detectionVersion\|signalChannel\|prePlateauBucket\|riseOnsetBucketUtc` | **Nullable until sufficient evidence; assigned once; immutable thereafter** | Auditable key; promotion `sourceEventKey` |
| `evidenceRevisionFingerprint` | SHA-256 of recursive canonical merged evidence JSON | Updates when merged evidence changes | Idempotent no-op detection (except `lastObservedAt` advance) |
| Semantic matcher | Algorithm | N/A | Rediscovery when bucket/hash would differ |

**Assignment rule:** `candidateIdentityKey` is assigned when rise onset **and** pre-plateau bucket become sufficient — either on first insert or on maturation of an existing INSUFFICIENT row. It is **not** required for INSUFFICIENT persistence.

**Service-owned clocks:** `firstObservedAt` and `lastObservedAt` are set from `RawRefuelCandidateClock` (production default: system UTC). Caller `observedAt` is **not** accepted.

**Immutable audit fields on rediscovery:**

- `candidateIdentityKey` — preserved after first assignment
- `firstObservedAt` — preserved

**Mutable envelope fields on rediscovery:**

- `physicalEvidenceStart` — min(existing, incoming)
- `physicalEvidenceEnd`, `riseEndAt` — max(existing, incoming)
- `riseOnsetAt` — min(existing, incoming)
- post-plateau levels, sample counts, fingerprints, `lastObservedAt`

---

## 7. Promotion contract (design only — no F2 runtime caller)

`raw-refuel-candidate-promotion.design.ts` maps `READY_FOR_PERSIST` row → promotion draft:

- `detectionSource = SYNQDRIVE_RAW_FUEL_FALLBACK`
- `sourceEventKey = candidateIdentityKey`
- `dimoSegmentIdPlaceholder = synqdrive-rfrf-{vehicleId}-{hashPrefix16}`
- `rawDetectionMeta` carries `rawRefuelCandidateId`, fingerprints, detector versions

| Field | Status |
|-------|--------|
| **PROMOTION_RUNTIME_WIRED** | **NO** (F4) |
| **dimoSegmentId fleet compatibility** | **NOT_PROVEN** (F5 G2 proof) |

---

## 8. Idempotency matrix A–L

Maps F1.1 delayed-telemetry cases (A–G) plus F2 integration scenarios (H–L).

| Case | Scenario | Expected | F2 proof |
|------|----------|----------|----------|
| **A** | Post plateau 29 L → 31 L | Reuse row; key unchanged; fingerprint changes | **PASS** — `post-plateau maturation` integration test |
| **B** | Rise end shifts +6 min | Reuse row; key unchanged | **PASS** — matcher + repository `maxDate` on `riseEndAt` |
| **C** | Rise onset shifts across 5-min bucket boundary | Semantic rediscovery; key unchanged | **PASS** — `bucket-shift rediscovery` integration test |
| **D** | Reconcile window shifts ±15 min | Reuse row | **PASS** — `window shift reuses same candidate` integration test |
| **E** | Duplicate identical observations (serial) | Single row; no duplicate insert | **PASS** — `identical observation is idempotent` integration test |
| **F** | Fast pass then warm pass (wider window) | Reuse row | **PASS** — covered by window-shift test |
| **G** | Two refuels ~45 min apart | Distinct rows + distinct keys | **PASS** — `two close refuels remain distinct rows` integration test |
| **H** | Concurrent identical observation (2 connections) | Single row under advisory lock | **PASS** — `concurrent same observation yields one row` integration test |
| **I** | Parallel different vehicles | Independent rows | **PASS** — `different vehicles process in parallel` integration test |
| **J** | `firstObservedAt` on rediscovery | Immutable | **PASS** — `firstObservedAt remains immutable` integration test |
| **K** | Identical fingerprint + lifecycle → `lastObservedAt` still advances | Touch `lastObservedAt` only | **PASS** — `lastObservedAt advances on unchanged evidence` integration test |
| **L** | Promotion draft mapping | Stable `sourceEventKey` + placeholder segment id | **PASS** — `raw-refuel-candidate-promotion.design.spec.ts` |
| **M** | INSUFFICIENT without pre-plateau persisted | Row with null key | **PASS** — integration test |
| **N** | Terminal PROMOTED/REJECTED rediscovery | No duplicate insert | **PASS** — integration tests |
| **O** | SAME + INSUFFICIENT neighbor ambiguity | Fail closed | **PASS** — integration test |
| **P** | Bounded lookup ignores distant terminal | Reuse in-window SAME | **PASS** — integration test |

| Field | Value |
|-------|-------|
| **IMPLEMENTATION_IDEMPOTENCY_PROOF** | **PASS** — 25 unit + 19 real-PG integration tests |
| **MULTI_REPLICA_STRATEGY_DEFINED** | **YES** (design + lock) |
| **MULTI_REPLICA_PROOF_IN_CI** | **NO** — requires `RAW_REFUEL_CANDIDATE_POSTGRES_INTEGRATION=1` |

---

## 9. Test evidence

### 9.1 Unit tests (CI-default)

```bash
cd backend && npm test -- --testPathPattern=raw-refuel-candidate --testPathIgnorePatterns=postgres.integration
```

| Suite | Tests | Result (2026-09-12 F2.2) |
|-------|-------|---------------------------|
| `raw-refuel-candidate.matcher.spec.ts` | overlap classification | **PASS** |
| `raw-refuel-candidate-identity-key.spec.ts` | bucket + hash stability | **PASS** |
| `raw-refuel-candidate-evidence-fingerprint.spec.ts` | fingerprint + merge parity | **PASS** |
| `raw-refuel-candidate-promotion.design.spec.ts` | promotion draft mapping | **PASS** |
| `raw-refuel-candidate-lifecycle.spec.ts` | terminal transition safety | **PASS** |
| `raw-refuel-candidate-rediscovery-window.spec.ts` | evidence-local bounded window + delayed telemetry | **PASS** |
| `raw-refuel-candidate.nest-di.spec.ts` | Nest provider resolution | **PASS** |

**Total:** 7 suites, 25 tests — **PASS**

### 9.2 PostgreSQL integration tests (opt-in)

File: `raw-refuel-candidate.postgres.integration.spec.ts`

**Enable:**

```bash
export RAW_REFUEL_CANDIDATE_POSTGRES_INTEGRATION=1
export DATABASE_URL='postgresql://postgres@localhost:5433/synqdrive_rfrf_f2_test?schema=public'
cd backend && npm test -- raw-refuel-candidate.postgres.integration
```

| Test | Coverage |
|------|----------|
| bucket-shift rediscovery | Case C |
| window shift | Case D/F |
| post-plateau maturation | Case A |
| two close refuels distinct | Case G |
| identical observation idempotent | Case E |
| concurrent same observation (2 Prisma clients) | Case H |
| different vehicles parallel | Case I |
| firstObservedAt immutable (service clock) | Case J |
| lastObservedAt advances unchanged evidence | F2.1 |
| org/vehicle mismatch rejected | F2.1 |
| INSUFFICIENT persist + key maturation | M |
| terminal rediscovery | N |
| multiple SAME ambiguity | O |
| SAME + INSUFFICIENT ambiguity | O |
| distant terminal outside bounded window | P |
| merged fingerprint parity | F2.1 |

**Total:** 19 integration tests — **PASS** on isolated localhost PostgreSQL.

**Schema bootstrap note:** integration tests use `prisma db push` on the current schema for convenience. This is **schema proof**, not migration execution proof. Actual F2 `migration.sql` proof is separate (§12.3).

---

## 10. Known limitations

| # | Limitation | Owner |
|---|------------|-------|
| 1 | No raw-rise detector — observations must be supplied by caller | F3 |
| 2 | No `detectEnergyEvents` wiring — flags defined but not scheduled | F4 |
| 3 | No `VehicleEnergyEvent` promotion runtime | F4 |
| 4 | No native↔fallback G2 convergence proof | F5 |
| 5 | `dimoSegmentId` synthetic placeholder compatibility unproven fleet-wide | F5 |
| 6 | READY_FOR_PERSIST gate evaluation not in F2 service | F4 |
| 7 | KS MS 661 positive path not exercised end-to-end | F3 + F4 |
| 8 | Postgres integration tests not in default CI | env constraint |
| 9 | `evidenceMeta`/`qualityMeta` Prisma JSON typing — compile noise in integration spec import path | minor TS hygiene |
| 10 | Historical `vehicle_energy_events` backfill for `detection_source` not executed | F4 deploy step |

---

## 11. F3 gate (next phase)

F2 completion does **not** authorize production fallback. F3 must deliver:

| Requirement | Status |
|-------------|--------|
| Pure `STABLE_PRE→RISING→STABLE_POST` detector functions | **NOT_STARTED** |
| KS MS 661 observed fixture positive unit test | **NOT_STARTED** |
| KS MS 661 synthetic fixture algorithm test | **NOT_STARTED** |
| Negative fixture matrix (F1 §12) as unit tests | **NOT_STARTED** |
| Detector produces `RawRefuelCandidateObservation` for F2 service | **NOT_STARTED** |

**F3_START_AUTHORIZED:** **YES** (F2 persistence contract stable)  
**F3_IMPLEMENTATION_COMPLETE:** **NO**

---

## 12. F2 / F2.1 / F2.2 completion gate results

```
RFRF_F2_2A_FINAL_MERGE_CLOSURE = PASS
RFRF_F2_2_FINAL_CLOSURE = PASS
RFRF_F2_1_HARDENING = PASS
RFRF_F2_CANDIDATE_PERSISTENCE = PASS
F2_IMPLEMENTATION_COMPLETE = YES
F3_START_AUTHORIZED = YES
PR_1620_READY_TO_MERGE = YES
FALLBACK_RUNTIME_READY = NO
PRODUCTION_FALLBACK_READY = NO
KS_MS_661_DETECTED_BY_F2 = NO
FIRST_OBSERVED_CLOCK_AUTHORITY = SERVICE_OWNED
LAST_OBSERVED_SEMANTICS = last_synqdrive_observation_advances_even_when_fingerprint_unchanged
ORG_VEHICLE_INTEGRITY = PASS
INSUFFICIENT_CANDIDATE_PERSISTABLE = YES
CANDIDATE_IDENTITY_KEY_NULLABLE_UNTIL_ASSIGNED = YES
CANDIDATE_IDENTITY_ASSIGNED_ONCE = PASS
TERMINAL_REDISCOVERY = PASS
PROMOTED_RESCAN_DUPLICATE_GUARD = PASS
REJECTED_RESCAN_DUPLICATE_GUARD = PASS
MULTIPLE_SAME_POLICY = FAIL_CLOSED
SAME_PLUS_INSUFFICIENT_POLICY = FAIL_CLOSED_HOLD
ZERO_SAME_PLUS_INSUFFICIENT_POLICY = RECONCILE_SINGLE_INSUFFICIENT_ROW
REDISCOVERY_LOOKUP_BOUNDED = YES
REDISCOVERY_WINDOW_TRULY_BOUNDED = PASS
REDISCOVERY_EVIDENCE_ANCHORED = YES
SERVICE_NOW_FALLBACK_ONLY = YES
REDISCOVERY_LOOKBACK = 6h
DELAYED_TELEMETRY_24H_BOUND = PASS
DELAYED_TELEMETRY_6D_BOUND = PASS
NO_EVIDENCE_SERVICE_NOW_FALLBACK = PASS
LIFECYCLE_TERMINAL_SAFETY = PASS
PROMOTED_TO_REJECTED = BLOCKED
INVALID_TRANSITION_BEHAVIOR = ERROR
NESTED_FINGERPRINT_CANONICALIZATION = PASS
FINGERPRINT_MATCHES_PERSISTED_EVIDENCE = PASS
PROMOTION_DRAFT_TIME_MAPPING = PASS
F2_MIGRATION_SQL_REAL_POSTGRES = PASS
F2_MIGRATION_SCHEMA_ASSERTIONS = PASS
F2_MIGRATION_REQUIRED_INDEXES = PASS
F2_MIGRATION_FOREIGN_KEYS = PASS
F2_MIGRATION_ZERO_SEED_ROWS = PASS
PRE_F2_SCHEMA_SENTINELS_PRESERVED = PASS
REAL_POSTGRES_SCHEMA_PROOF = PASS
REAL_POSTGRES_INTEGRATION_TESTS = PASS
FULL_REPOSITORY_MIGRATION_CHAIN = FAIL_PRE_EXISTING
HISTORICAL_MIGRATION_CHAIN_DEFECT_RECORDED = YES
RAW_REFUEL_CANDIDATE_NEST_DI = PASS
SYSTEM_CLOCK_PRODUCTION_DEFAULT = YES
TEST_CLOCK_DETERMINISTIC = YES
BUCKET_SHIFT_REDISCOVERY_REAL_PG = PASS
WINDOW_SHIFT_REDISCOVERY_REAL_PG = PASS
POST_PLATEAU_MATURATION_REAL_PG = PASS
CONCURRENT_SAME_CANDIDATE_REAL_PG = PASS
DIFFERENT_VEHICLES_PARALLEL_REAL_PG = PASS
FIRST_OBSERVED_IMMUTABLE_REAL_PG = PASS
ORG_MISMATCH_REAL_PG = PASS
TERMINAL_REDISCOVERY_REAL_PG = PASS
IMPLEMENTATION_IDEMPOTENCY_PROOF = PASS
UNIT_TESTS_RAW_REFUEL_CANDIDATE = PASS (25/25)
REAL_PG_TEST_COUNT = 19
NEST_PROVIDER_TEST = PASS
PRISMA_VALIDATE = PASS
PRISMA_GENERATE = PASS
EED_GRAPH_VALIDATOR = PASS
FST_GRAPH_VALIDATOR = PASS
MODULE_REGISTRY_VALIDATOR = PASS
GIT_DIFF_CHECK = PASS
AUDIT_INTERNAL_CONSISTENCY = PASS
RAW_FUEL_DETECTOR_IMPLEMENTED = NO
PROMOTION_RUNTIME_IMPLEMENTED = NO
G2_RUNTIME_CHANGED = NO
PRODUCTION_MUTATED = NO
PRODUCTION_DEPLOYED = NO
PR_1620_STILL_DRAFT = YES
KNOWN_P0_F2_BLOCKERS = 0
KNOWN_P1_F2_BLOCKERS = 0
```

### 12.1 Real PostgreSQL epistemic labels (corrected F2.2)

| Label | Meaning | Result |
|-------|---------|--------|
| `REAL_POSTGRES_SCHEMA_PROOF` | Isolated PG objects match expected F2 schema | **PASS** |
| `REAL_POSTGRES_INTEGRATION_TESTS` | Service integration suite on isolated PG | **PASS** (19/19) |
| `F2_MIGRATION_SQL_REAL_POSTGRES` | Actual `20260912123000_.../migration.sql` executed on pre-F2 baseline | **PASS** |
| `F2_MIGRATION_SCHEMA_ASSERTIONS` | Hard post-migration assertions (table, nullable key, enums, indexes by name, FKs, zero rows, pre-F2 sentinels) | **PASS** |
| `FULL_REPOSITORY_MIGRATION_CHAIN` | Full `prisma migrate deploy` over all historical migrations | **FAIL_PRE_EXISTING** |

`prisma db push` is used **only** to establish pre-F2 baseline schema (from `503416c82`) and integration-test schema bootstrap. It is **not** claimed as migration execution proof.

Historical chain defect: `docs/audits/prisma-migration-chain-concurrently-defect-2026-09-12.md`

### 12.2 Integration test environment (isolated)

| Property | Value |
|----------|-------|
| Host | `localhost:5433` (dedicated non-production instance) |
| Database | `synqdrive_rfrf_f2_test` |
| Production touched | **NO** |

### 12.3 F2 migration SQL proof (isolated)

Script: `backend/scripts/ops/prove-rfrf-f2-migration-sql.sh`

| Step | Result |
|------|--------|
| A. Fresh DB `synqdrive_rfrf_f2_migration_proof` | **PASS** |
| B. Pre-F2 schema from `503416c82` via `prisma db push` (baseline only) | **PASS** |
| C. `raw_refuel_candidates` absent before F2 SQL | **PASS** |
| D. Execute actual `migration.sql` via `psql -f` (not db push) | **PASS** |
| E. Table nullable key, 4 enums, 6 required indexes by exact name, 2 FKs, 0 seed rows, pre-F2 sentinels (organizations, vehicles, vehicle_energy_events, vehicle_trips) | **PASS** (hard assertions; non-zero exit on mismatch) |

### 12.4 Migration operational review (F2 scope)

| Item | Detail |
|------|--------|
| Tables created | `raw_refuel_candidates` |
| Enums created | `RawRefuelCandidateLifecycleState`, `RawRefuelCandidateSignalChannel`, `RawRefuelAbsoluteSignalTrust`, `RawRefuelCandidateRejectionReason` |
| Lock-sensitive statements | Standard `CREATE TABLE` + index builds (no CONCURRENTLY in F2 migration) |
| Deferred | `vehicle_energy_events.detection_source` / `source_event_key` → F4 |
| Production index-build risk | F2 migration alone: low; full fleet deploy must still account for historical CONCURRENTLY migrations separately |

| Severity | Count | Description |
|----------|-------|-------------|
| P0 | 0 | — |
| P1 | 1 | Production raw-fuel fallback still absent (KS MS 661 class) — F3/F4 required |

---

## 13. Implementation map

| Artifact | Path |
|----------|------|
| Prisma model | `backend/prisma/schema.prisma` (`RawRefuelCandidate`) |
| Migration | `backend/prisma/migrations/20260912123000_rfrf_f2_raw_refuel_candidates/` |
| Service | `raw-refuel-candidate.service.ts` |
| Repository | `raw-refuel-candidate.repository.ts` |
| Matcher | `raw-refuel-candidate.matcher.ts` |
| Identity key | `raw-refuel-candidate-identity-key.ts` |
| Evidence fingerprint | `raw-refuel-candidate-evidence-fingerprint.ts` |
| Lifecycle | `raw-refuel-candidate-lifecycle.ts` |
| Lock util | `raw-refuel-candidate-lock.util.ts` |
| Promotion design | `raw-refuel-candidate-promotion.design.ts` |
| Module wiring | `vehicle-intelligence.module.ts` (`RawRefuelCandidateService`) |
| Migration proof script | `backend/scripts/ops/prove-rfrf-f2-migration-sql.sh` |
| Nest DI test | `raw-refuel-candidate.nest-di.spec.ts` |
| Rediscovery window | `raw-refuel-candidate-rediscovery-window.ts` |

---

## 14. Canonical graph references

- **EED:** `EED-EV-0043` (this document), `EED-EV-0042` (F1.1), `EED-DEC-RFRF-005`

---

## 15. F2.1 hardening summary (2026-09-12)

Independent review gaps closed on PR #1620:

| Gap | Resolution |
|-----|------------|
| Caller-owned `observedAt` | Removed from public observation contract; `RawRefuelCandidateClock` owns durable timestamps |
| `lastObservedAt` ambiguity | Advances on every non-terminal re-observation (`MAX(existing, serviceNow)`) even when fingerprint unchanged |
| Org/vehicle integrity | `organizationId` derived from `Vehicle` row; mismatch throws before any candidate mutation |
| INSUFFICIENT persistence | `candidateIdentityKey` nullable until pre-plateau + rise evidence sufficient; assigned once |
| Terminal rediscovery | `PROMOTED` / `REJECTED` included in semantic lookup; no duplicate rows on rescan |
| Multiple SAME ambiguity | >1 SAME match → fail-closed |
| Lifecycle terminal safety | Removed REJECTED bypass; invalid transitions throw |
| Fingerprint canonicalization | Recursive canonical JSON from merged persisted evidence |
| Promotion `endTime` | Fixed operator precedence; explicit mapping tests |

---

## 16. F2.2 final closure summary (2026-09-12)

| Gap | Resolution |
|-----|------------|
| Postgres epistemic overclaim | Separated `F2_MIGRATION_SQL_REAL_POSTGRES`, `REAL_POSTGRES_SCHEMA_PROOF`, `REAL_POSTGRES_INTEGRATION_TESTS`, `FULL_REPOSITORY_MIGRATION_CHAIN=FAIL_PRE_EXISTING` |
| F2 migration SQL proof | `prove-rfrf-f2-migration-sql.sh` executes actual `migration.sql` on pre-F2 baseline (`503416c82`) |
| Historical chain defect | Recorded in `prisma-migration-chain-concurrently-defect-2026-09-12.md` |
| Nest DI | `@Injectable()` service with `PrismaService` only; `withClock`/`withFixedClock` static test helpers |
| Bounded rediscovery | 6-hour lookback window query; distant terminals excluded |
| SAME + INSUFFICIENT policy | Fail-closed hold when SAME coexists with INSUFFICIENT neighbors; reconcile single INSUFFICIENT when zero SAME |
| Audit consistency | Sections 5, 6, 8, 9, 12 rewritten to match implemented algorithm |

- **Motivates from:** `EED-EV-0040`, `EED-EV-0041`

---

## 17. F2.2a final merge closure summary (2026-09-12)

| Gap | Resolution |
|-----|------------|
| Rediscovery window stretched by `serviceNow` | Evidence timestamps only anchor min/max; `serviceNow` fallback when no evidence exists |
| Delayed telemetry unproven | Unit cases A–E: 24h/6d delay, no-evidence fallback, multi-hour scan envelope |
| Migration proof soft verification | Hard assertions with non-zero exit; indexes by exact name; FK + sentinel checks |
| Assertion harness fail-closed | `RFRF_F2_MIGRATION_PROOF_SELF_CHECK=1` negative probe |

- **Motivates from:** F2.2 independent review (`serviceNow` anchor defect)
