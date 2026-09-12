# KG-EED Changelog

## 2026-09-12 — RFRF F3 raw fuel rise detector

- Pure STABLE_PRE→RISING→STABLE_POST detector; unit isolation; primary channel authority
- KS MS 661 observed material rise detected; synthetic READY_FOR_PERSIST
- Evidence `EED-EV-0044`; 27 unit tests + F2 test-only handoff PG proof
- No production wiring; F4_START_AUTHORIZED=YES

**Verdict:** RFRF_F3=PASS — detector algorithm complete

---

## 2026-09-12 — RFRF F2.2a final merge closure (PR #1620)

- Rediscovery window: evidence timestamps only anchor min/max; `serviceNow` fallback when no evidence exists
- Delayed telemetry unit cases (24h, 6d) prove evidence-local ±6h bounds
- Migration proof: hard post-schema assertions (indexes by name, FKs, pre-F2 sentinels, zero seed rows)
- Evidence `EED-EV-0043` updated; 25 unit + 19 isolated PostgreSQL integration tests PASS

**Verdict:** RFRF_F2_2A_FINAL_MERGE_CLOSURE=PASS — PR_1620_READY_TO_MERGE=YES; F3_START_AUTHORIZED=YES

---

## 2026-09-12 — RFRF F2.2 final closure (PR #1620)

- Corrected PostgreSQL epistemic labels: separated F2 migration SQL proof, schema proof, integration tests, and full historical chain (`FAIL_PRE_EXISTING`)
- F2 migration SQL proof via `prove-rfrf-f2-migration-sql.sh` on pre-F2 baseline (`503416c82`)
- Historical chain defect recorded: `20260413230000_add_composite_indexes_batch_c` (`CREATE INDEX CONCURRENTLY` in Prisma transaction)
- Nest DI: `@Injectable()` `RawRefuelCandidateService` with `PrismaService` only; static test clock helpers
- Bounded rediscovery: 6-hour lookback window; SAME+INSUFFICIENT fail-closed ambiguity policy
- Evidence `EED-EV-0043` updated; 21 unit + 19 isolated PostgreSQL integration tests PASS

**Verdict:** RFRF_F2_2_FINAL_CLOSURE=PASS — PR_1620_READY_TO_MERGE=YES; F3_START_AUTHORIZED=YES

---

## 2026-09-12 — RFRF F2.1 candidate persistence hardening

- F2.1 hardening on PR #1620: service-owned clocks, org/vehicle integrity, nullable identity key,
  terminal rediscovery, lifecycle fail-closed, merged fingerprint, promotion time mapping fix
- VehicleEnergyEvent `detection_source` / `source_event_key` deferred from F2 migration to F4
- Evidence `EED-EV-0043` updated; 18 unit + 17 isolated PostgreSQL integration tests PASS
- Full historical `prisma migrate deploy` blocked by pre-F2 `CREATE INDEX CONCURRENTLY` migration;
  F2 schema verified via `prisma db push` on isolated localhost:5433 test database

**Verdict:** RFRF_F2_1_HARDENING=PASS — IMPLEMENTATION_IDEMPOTENCY_PROOF=PASS; F3_START_AUTHORIZED=YES

---

## 2026-09-12 — RFRF F2 candidate persistence

- Added `docs/audits/eed-rfrf-f2-candidate-persistence-2026-09-12.md`
- Evidence `EED-EV-0043`; updated `EED-DEC-RFRF-005` with F2 implementation proof (idempotency PARTIAL)
- `raw_refuel_candidates` schema+migration; `RawRefuelCandidateService` semantic rediscovery under `pg_advisory_xact_lock64`
- Promotion contract design only; no detector wiring; flags remain OFF; KS MS 661 not detected by F2

**Verdict:** RFRF_F2_CANDIDATE_PERSISTENCE=PASS — F2_IMPLEMENTATION_COMPLETE=YES; F3_START_AUTHORIZED=YES; FALLBACK_RUNTIME_READY=NO

---

## 2026-09-12 — RFRF F1.2 final architecture closure

- F1.1 addendum §14: semantic candidate rediscovery; four-way identity separation
- F2 readiness decoupled: `F2_START_AUTHORIZED=YES`; `F2_IMPLEMENTATION_COMPLETE=NO`
- EED-OQ-013 remains RESOLVED (design); `IMPLEMENTATION_PROOF_PENDING` F2/F5
- `dimoSegmentId` compatibility ownership: F2 schema/promotion; F5 G2 proof

**Verdict:** RFRF_F1_FINAL_CLOSURE=PASS — PR #1619 merge authorized (architecture/fixtures only)

---

## 2026-09-12 — RFRF F1.1 architecture hardening

- Added `docs/audits/eed-rfrf-f1-1-hardening-2026-09-12.md` (pre-F2 closure addendum)
- Evidence `EED-EV-0042`; decision `EED-DEC-RFRF-005` (Option D; supersedes Option C / EED-DEC-RFRF-002)
- Closed `EED-OQ-013` at design level (identity = candidateIdentityKey + G2 matcher)
- KS MS 661 fixture split: observed vs synthetic; production IDs removed from executable fixtures
- FST cross-ref `FST-EVID-RFRF-F1-1-2026-09-12-001`

**Verdict:** F1.1 PASS — F2_IMPLEMENTATION_READY=NO (Option D schema + dimoSegmentId compatibility proof)

---

## 2026-09-12 — RFRF F1 architecture discovery

- Added `docs/audits/eed-rfrf-f1-architecture-2026-09-12.md` (design-only raw-fuel fallback contract)
- Evidence `EED-EV-0041`; decisions `EED-DEC-RFRF-001` … `EED-DEC-RFRF-004`; open question `EED-OQ-014`
- Motivated by production incident `EED-EV-0040` (KS MS 661)
- KS MS 661 offline positive fixture for F3 detector tests
- FST cross-ref `FST-EVID-RFRF-F1-2026-09-12-001`

**Verdict:** F1 complete — F2 blocked pending F1.1 hardening (see F1.1 addendum)

---

## 2026-09-01 — Phase 2B.2 final authority closure

- Merged `origin/main` @ `814a7e009` (P1.8.3.1 scaling #1487) — no EED runtime delta
- `status` / `authority_state` → `APPROVED_FOR_CANONICAL_MERGE` (pre-merge)
- Severity register corrected (P0=0, P1=4, P2=5, P3=1, total 10)
- Added `architecture/KG_EED_FINAL_AUTHORITY_CLOSURE_2026-09-01.md`
- Validator: lifecycle + closure artifact gates

**Verdict:** READY_TO_MERGE (human merge pending)

---

## 2026-09-01 — Phase 2B.1 independent authority review

**Reviewer:** adversarial gate (not implementation agent)  
**Pre-review SHA:** `cc2ff60f01d0499aaa9078ad77f601ef98696bd3`  
**Artifact:** `architecture/KG_EED_INDEPENDENT_AUTHORITY_REVIEW_2026-09-01.md`

### Corrections

- Added `authority_review` gate to `GRAPH.yaml`
- Split KS MX provenance: `EED-EV-0018` (fixture/TEST) + `EED-EV-0025` (production/P1.3-S6)
- Downgraded epistemic inflation on EED-EV-0016/0019/0021/0022 and `EED-EXT-003`
- Added `EED-ST-001` (current scheduler coupling fact), `EED-FB-001` (optional inject skip), `EED-COMP-008` (fuel station enqueue)
- Strengthened `validate-graph.mjs` with epistemic and authority-gate checks
- Corrected open-question accounting in `OPEN_QUESTIONS.md`

### Verdict

`APPROVE_WITH_DOCUMENTED_OPEN_QUESTIONS` — ready for human merge review

---

## 2026-09-01 — Phase 2B canonicalization (initial)

**Base SHA:** `da959784f835a31482852d506daa137c90389b87` (main after KG-ATE PR #1484 merge)

### Created

- `architecture/knowledge-graphs/energy-event-detection/` full canonical structure
- `GRAPH.yaml`, `graph/schema.yaml`, `graph/nodes.yaml`, `graph/edges.yaml`, `graph/invariants.yaml`
- Governance: `AGENT_PROTOCOL.md`, `AUTHORITY_BOUNDARIES.md`
- `decisions/DECISIONS.md` (12 decisions)
- `evidence/EVIDENCE_REGISTRY.md` (24 evidence nodes)
- `open-questions/OPEN_QUESTIONS.md` (12 classified)
- `scripts/validate-graph.mjs`
- `architecture/KG_EED_CANONICALIZATION_2026-09-01.md`

### Discovery audit

| Action | Count |
|--------|------:|
| Discovery components referenced | 52 |
| Canonicalized as operational nodes | 58 |
| Evidence nodes created | 24 |
| Decision nodes | 12 |
| Invariants | 13 |
| Edges | 97 |
| Open questions | 12 |

### Verified / corrected from discovery

- **CONFIRMED:** minIncreasePercent 5, coalesce 300s/1800s, persist gate liters>1.0, mechanism isolation
- **CONFIRMED:** KS MX 4818s from DIMO envelope; coalesce single-segment pass-through; 685s sibling reconcile
- **CONFIRMED:** ATE step 5 MAY_TRIGGER only; EED owns semantics (ATE-EXT-006 reciprocal)
- **POLICY RESOLVED:** No historical backfill (EED-DEC-009 / EED-OQ-002)
- **DEFERRED:** FM-007 and ATE multi-replica — referenced only, not expanded

### Not changed

- Application runtime code
- Production data
- KG-ATE canonical graph (no cross-authority corrections required)

### Validation

- `node architecture/knowledge-graphs/energy-event-detection/scripts/validate-graph.mjs` — see canonicalization report
