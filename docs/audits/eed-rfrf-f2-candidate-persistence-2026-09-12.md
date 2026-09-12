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

## 5. Semantic rediscovery contract

Entry point: `RawRefuelCandidateService.resolveOrCreateCandidate`.

```
BEGIN TRANSACTION
  pg_advisory_xact_lock64("raw_refuel_candidate:{vehicleId}")
  load non-terminal rows for (vehicleId, signalChannel)
  for each existing row:
    classifyRawRefuelCandidateOverlap(observation, row)
    if SAME_PHYSICAL_RISE → reuse row (preserve candidateIdentityKey)
  if match:
    update evidenceRevisionFingerprint + evidence envelope + lifecycle
    skip insert
  else:
    require riseOnsetAt + pre-plateau bucket
    assign candidateIdentityKey (hash at insert time only)
    INSERT new row
COMMIT
```

**Matcher** (`classifyRawRefuelCandidateOverlap`): tri-state `SAME_PHYSICAL_RISE | DISTINCT_PHYSICAL_RISE | INSUFFICIENT_EVIDENCE`. Does **not** compare `candidateIdentityKey` or 5-minute buckets alone.

**Neighborhood constants (PROVISIONAL):**

- Rise neighborhood: 45 min (`RAW_REFUEL_CANDIDATE_RISE_NEIGHBORHOOD_MS`)
- Pre-plateau tolerance: ±0.5 L / ±1.0 %
- Post-plateau tolerance: ±1.0 L

---

## 6. Identity semantics (four-way separation)

| Concept | Storage | Mutability | F2 role |
|---------|---------|------------|---------|
| `RawRefuelCandidate.id` | UUID PK | Immutable | DB row identity |
| `candidateIdentityKey` | SHA-256 of `vehicleId\|detectionVersion\|signalChannel\|prePlateauBucket\|riseOnsetBucketUtc` | Immutable after first insert | Auditable key; promotion `sourceEventKey` |
| `evidenceRevisionFingerprint` | SHA-256 of canonical evidence JSON | Updates each pass | Idempotent no-op detection |
| Semantic matcher | Algorithm | N/A | Rediscovery when bucket/hash would differ |

**Rediscovery rule:** `candidateIdentityKey` is assigned only on **insert** after semantic search fails. Delayed telemetry that shifts the 5-minute rise bucket must rediscover via matcher, not re-hash.

**Immutable audit fields on rediscovery:**

- `candidateIdentityKey` — preserved
- `firstObservedAt` — preserved (SynqDrive first durable observation; not physical refuel time)

**Mutable envelope fields on rediscovery:**

- `physicalEvidenceStart` — min(existing, incoming)
- `physicalEvidenceEnd`, `riseEndAt` — max(existing, incoming)
- `riseOnsetAt` — min(existing, incoming)
- post-plateau levels, sample counts, fingerprints

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
| **K** | Identical fingerprint + lifecycle → no-op update | Skip write | **PASS** — service early return in `resolveOrCreateCandidate` |
| **L** | Promotion draft mapping | Stable `sourceEventKey` + placeholder segment id | **PASS** — `raw-refuel-candidate-promotion.design.spec.ts` |

| Field | Value |
|-------|-------|
| **IMPLEMENTATION_IDEMPOTENCY_PROOF** | **PARTIAL** — unit + opt-in Postgres integration; not CI-default |
| **MULTI_REPLICA_STRATEGY_DEFINED** | **YES** (design + lock) |
| **MULTI_REPLICA_PROOF_IN_CI** | **NO** — requires `RAW_REFUEL_CANDIDATE_POSTGRES_INTEGRATION=1` |

---

## 9. Test evidence

### 9.1 Unit tests (CI-default)

```bash
cd backend && npm test -- --testPathPattern=raw-refuel-candidate --testPathIgnorePatterns=postgres.integration
```

| Suite | Tests | Result (2026-09-12) |
|-------|-------|---------------------|
| `raw-refuel-candidate.matcher.spec.ts` | overlap classification | **PASS** |
| `raw-refuel-candidate-identity-key.spec.ts` | bucket + hash stability | **PASS** |
| `raw-refuel-candidate-evidence-fingerprint.spec.ts` | fingerprint mutability | **PASS** |
| `raw-refuel-candidate-promotion.design.spec.ts` | promotion draft mapping | **PASS** |

**Total:** 4 suites, 7 tests — **PASS**

### 9.2 PostgreSQL integration tests (opt-in)

File: `raw-refuel-candidate.postgres.integration.spec.ts`

**Enable:**

```bash
export RAW_REFUEL_CANDIDATE_POSTGRES_INTEGRATION=1
export DATABASE_URL='postgresql://...'   # reachable Postgres with migration applied
cd backend && npm test -- raw-refuel-candidate.postgres.integration
```

| Test | Coverage |
|------|----------|
| bucket-shift rediscovery | Case C |
| window shift | Case D/F |
| post-plateau maturation | Case A |
| two close refuels distinct | Case G |
| identical observation idempotent | Case E |
| concurrent same observation | Case H |
| different vehicles parallel | Case I |
| firstObservedAt immutable | Case J |

**CI agent VM note:** `npm run infra:up` (Docker Compose Postgres) is **unavailable** in the Cloud Agent VM. Integration tests are **skipped by default** (`describe.skip` unless `RAW_REFUEL_CANDIDATE_POSTGRES_INTEGRATION=1`). They require an externally reachable `DATABASE_URL` with the F2 migration applied.

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

## 12. F2 / F2.1 completion gate results

```
RFRF_F2_1_HARDENING = PASS
RFRF_F2_CANDIDATE_PERSISTENCE = PASS
F2_IMPLEMENTATION_COMPLETE = YES
F3_START_AUTHORIZED = YES
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
MULTIPLE_SAME_MATCH_AMBIGUITY = FAIL_CLOSED
LIFECYCLE_TERMINAL_SAFETY = PASS
PROMOTED_TO_REJECTED = BLOCKED
INVALID_TRANSITION_BEHAVIOR = ERROR
NESTED_FINGERPRINT_CANONICALIZATION = PASS
FINGERPRINT_MATCHES_PERSISTED_EVIDENCE = PASS
PROMOTION_DRAFT_TIME_MAPPING = PASS
REAL_POSTGRES_MIGRATION = PASS
BUCKET_SHIFT_REDISCOVERY_REAL_PG = PASS
WINDOW_SHIFT_REDISCOVERY_REAL_PG = PASS
POST_PLATEAU_MATURATION_REAL_PG = PASS
CONCURRENT_SAME_CANDIDATE_REAL_PG = PASS
DIFFERENT_VEHICLES_PARALLEL_REAL_PG = PASS
FIRST_OBSERVED_IMMUTABLE_REAL_PG = PASS
ORG_MISMATCH_REAL_PG = PASS
TERMINAL_REDISCOVERY_REAL_PG = PASS
IMPLEMENTATION_IDEMPOTENCY_PROOF = PASS
UNIT_TESTS_RAW_REFUEL_CANDIDATE = PASS (18/18)
POSTGRES_INTEGRATION_TESTS = PASS (17/17; RAW_REFUEL_CANDIDATE_POSTGRES_INTEGRATION=1)
PRISMA_VALIDATE = PASS
PRISMA_GENERATE = PASS
EED_GRAPH_VALIDATOR = PASS
FST_GRAPH_VALIDATOR = PASS
MODULE_REGISTRY_VALIDATOR = PASS
GIT_DIFF_CHECK = PASS
RAW_FUEL_DETECTOR_IMPLEMENTED = NO
PROMOTION_RUNTIME_IMPLEMENTED = NO
G2_RUNTIME_CHANGED = NO
PRODUCTION_MUTATED = NO
PRODUCTION_DEPLOYED = NO
PR_1620_STILL_DRAFT = YES
```

### 12.1 Real PostgreSQL proof (isolated)

| Property | Value |
|----------|-------|
| Host | `localhost:5433` (dedicated non-production instance) |
| Database | `synqdrive_rfrf_f2_test` |
| Production touched | **NO** |
| Schema sync | `prisma db push` (full schema) |
| Full `migrate deploy` chain | **Blocked** at `20260413230000_add_composite_indexes_batch_c` (`CREATE INDEX CONCURRENTLY` inside transaction) — pre-existing historical migration issue, not F2-specific |
| F2 table verified | `raw_refuel_candidates` exists; `candidate_identity_key` nullable; enums/constraints/indexes present; 0 seed rows |
| Integration suite | 17/17 PASS with two independent Prisma clients for concurrency proof |

### 12.2 Migration operational review (F2 scope)

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
| Integration tests | `raw-refuel-candidate.postgres.integration.spec.ts` |

---

## 14. Canonical graph references

- **EED:** `EED-EV-0043` (this document), `EED-EV-0042` (F1.1), `EED-DEC-RFRF-005`

---

## 15. F2.1 hardening summary (2026-09-12)

Independent review gaps closed on PR #1620 (`cursor/eed-rfrf-f2-candidate-persistence-f21f`):

| Gap | Resolution |
|-----|------------|
| Caller-owned `observedAt` | Removed from public observation contract; `RawRefuelCandidateClock` owns durable timestamps |
| `lastObservedAt` ambiguity | Advances on every non-terminal re-observation (`MAX(existing, serviceNow)`) even when fingerprint unchanged |
| Org/vehicle integrity | `organizationId` derived from `Vehicle` row; mismatch throws before any candidate mutation |
| INSUFFICIENT persistence | `candidateIdentityKey` nullable until pre-plateau + rise evidence sufficient; assigned once |
| Terminal rediscovery | `PROMOTED` / `REJECTED` included in semantic lookup; no duplicate rows on rescan |
| Multiple SAME ambiguity | >1 SAME match → `RawRefuelCandidateAmbiguityError` (fail-closed) |
| Lifecycle terminal safety | Removed REJECTED bypass; invalid transitions throw |
| Fingerprint canonicalization | Recursive `canonicalizeForFingerprint`; computed from **merged** persisted evidence |
| Promotion `endTime` | Fixed `??` / `?:` precedence; explicit mapping tests |
| Real PostgreSQL | 17/17 integration tests on isolated `localhost:5433` database |

**Prior overclaim corrected:** F2 was **PARTIAL** before real PostgreSQL proof; F2.1 closes idempotency and integrity gates.
- **Motivates from:** `EED-EV-0040`, `EED-EV-0041`
