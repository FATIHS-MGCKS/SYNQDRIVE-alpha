# M3.3-HV-H4-A3.3-O2 — Historical durable revision integrity attestation architecture

**Date:** 2026-10-07  
**Status:** **ARCHITECTURE AUDIT (O2)** — threat model, mutability audit, candidate schema, rollout; **no migration, no production loader change**  
**Main anchor:** `5a9570158e9b35c65aa6590e58f48f72d8e494b1` (A3.3-O1 #1910 merged)  
**Upstream:** O1 `NEEDS_INTEGRITY_ATTESTATION_BEFORE_MEANINGFUL_OPTIMIZATION`; frozen loader semantics O1-C1–C10

---

## 0. Executive summary

O2 evaluates whether a **derived integrity attestation** can preserve O1 fail-closed semantics while allowing **non-effective** historical `scientificEvidenceJson` rows to be skipped on later reads when attestation + mutation witness are valid.

| Field | Value |
|-------|--------|
| **O2_DECISION** | **ATTESTATION_ARCHITECTURE_FEASIBLE** |
| **PREFERRED_ARCHITECTURE** | **DERIVED_ATTESTATION** + **DB-enforced mutation invalidation (Strategy C)** + **FULL_VERIFY fallback** + **hybrid loader (future)** + **separate bounded historical bootstrap** |
| **SCHEMA_IMPLEMENTATION_READY** | **NO** (design + pure model only; migration deferred) |
| **NEXT_RECOMMENDED_SLICE** | **O2-R1** — Prisma schema + invalidation triggers + writer same-tx attestation (Phase 1), still loader OFF |

---

## 1. Threat model

| Class | Description | In O2 scope? |
|-------|-------------|--------------|
| **A** | Normal application writes / bugs | **YES** — attestation created only after full verifier; hybrid path falls back to full verify |
| **B** | Accidental SQL UPDATE/DELETE under normal DB privileges (triggers active) | **YES** — **Strategy C** invalidates or generation mismatch |
| **C** | Malicious DB superuser rewriting revision + ACK + attestation coherently | **NO** — same limitation as today |
| **D** | Physical storage corruption outside PostgreSQL semantics | **NO** — not solved by in-DB attestation |

| Field | Value |
|-------|--------|
| **ATTESTATION_THREAT_MODEL** | **A/B mitigated with invalidation + fallback; C/D out of scope** |
| **MALICIOUS_DBA_IN_SCOPE** | **NO** |
| **PHYSICAL_STORAGE_CORRUPTION_IN_SCOPE** | **NO** |
| **SECURITY_CLAIM_NOT_STRONGER_THAN_CURRENT** | **YES** — current loader cannot detect coherent superuser rewrite of JSON + fingerprint + mirror + ACK either |

---

## 2. Current mutability audit

**Normative schema:** `backend/prisma/schema.prisma` — `BatteryHvChargeSessionEvidenceRevision`, `BatteryHvChargeSessionEvidenceAck`.

### 2.1 Production-reachable application writes

| Surface | Revision | ACK | Classification |
|---------|----------|-----|----------------|
| `M3_3HvH4ChargeSessionEvidenceMaterializationRepository.persistIdempotent` | `INSERT … ON CONFLICT DO NOTHING` (raw SQL) | `INSERT … ON CONFLICT DO NOTHING` (raw SQL) | **PRODUCTION_REACHABLE** (A3.2 writer; flags OFF by default) |
| `loadM3_3HvH4DurableModeAChargeSessionsV1` | `findMany` | `findMany` | **PRODUCTION_REACHABLE** (read) |
| A3.4 retention gate | `findUnique` | `findUnique` | **PRODUCTION_REACHABLE** (read) |
| A3.5 reconciliation | read + A3.2 writer | via writer | **PRODUCTION_REACHABLE** when enabled |

**No production application path** calls `revision.update`, `revision.delete`, `ack.update`, or `ack.delete` (repository-wide grep 2026-10-07).

### 2.2 Non-production writes

| Surface | Op | Classification |
|---------|-----|----------------|
| Postgres integration specs (O1, durable loader, writer, retention, reconciliation, revision schema) | create/update/delete | **TEST_ONLY** |
| `m3-3-hv-h4-a3-6-r0-benchmark.harness.v1.ts` | create | **TEST_ONLY** (opt-in benchmark) |
| Initial migration `20261002120000_*` | CREATE TABLE | **MIGRATION_ONLY** |

### 2.3 Parent cascades

| Relationship | Effect |
|--------------|--------|
| `Organization` → revision | `onDelete: Cascade` — **REVISION_PARENT_CASCADE_DELETE_EXISTS=YES** |
| `Vehicle` → revision | `onDelete: Cascade` |
| `revision` → ACK | `onDelete: Cascade` — **ACK_REVISION_CASCADE_DELETE_EXISTS=YES** |
| ACK FK | `ON UPDATE CASCADE` (migration SQL) |

Tenant/org or vehicle deletion **is** a production-reachable delete path for revisions and ACKs (by cascade), not an in-place UPDATE.

### 2.4 Append-only enforcement

| Field | Value |
|-------|--------|
| **APPEND_ONLY_CURRENTLY_DB_ENFORCED** | **NO** — no `BEFORE UPDATE` deny rules; PostgreSQL allows UPDATE/DELETE |
| **APPEND_ONLY_CURRENTLY_APPLICATION_ENFORCED** | **YES** — A3.2 writer insert-only idempotency |

| Field | Value |
|-------|--------|
| **REVISION_PRODUCTION_UPDATE_PATH_EXISTS** | **NO** (application); **YES** (raw SQL / ORM possible with DB credentials) |
| **REVISION_PRODUCTION_DELETE_PATH_EXISTS** | **YES** (org/vehicle cascade; direct SQL) |
| **ACK_PRODUCTION_UPDATE_PATH_EXISTS** | **NO** (application); **YES** (SQL + ON UPDATE CASCADE) |
| **ACK_PRODUCTION_DELETE_PATH_EXISTS** | **YES** (revision cascade; direct SQL) |

---

## 3. Attestation fundamental contract — `M3_3_HV_H4_A3_HISTORY_INTEGRITY_ATTESTATION_V1`

Created **only after** existing `verifyDurableEvidenceRevisionForModeALoaderV1` equivalence:

- supported `evidenceContractVersion`
- `scientificEvidenceJson` ↔ `sourceRevisionFingerprint`
- projection ↔ relational mirror coherence
- exact durability ACK exists
- ACK identity mirrors revision (`assertAckMirrorsRevisionV1`)
- supported `durabilityAckContractVersion`

| Field | Value |
|-------|--------|
| **ATTESTATION_REQUIRED_FOR_SCIENTIFIC_CORRECTNESS** | **NO** |
| **ATTESTATION_IS_SOURCE_AUTHORITY** | **NO** |
| **ATTESTATION_IS_DERIVED_REBUILDABLE** | **YES** — recomputable by full verify + insert |

Attestation is **DERIVED_VERIFICATION_ARTIFACT** — not source evidence, scientific authority, retention authority, ground truth, or ACK replacement.

---

## 4. Critical mutation problem

Without invalidation or immutability:

`verify@T1 → attestation → mutate JSON@T2 → trust attestation` ⇒ **UNSAFE**.

| Field | Value |
|-------|--------|
| **STALE_ATTESTATION_AFTER_SOURCE_MUTATION_POSSIBLE_CURRENTLY** | **YES** (no attestation table today; any future attestation without invalidation would be unsafe) |
| **MUTATION_INVALIDATION_REQUIRED** | **YES** |

---

## 5. Mutation-protection strategies

| Strategy | Summary | O2 assessment |
|----------|---------|---------------|
| **A — Strict DB immutability** | Deny UPDATE/DELETE on revision/ACK | Blocks naive SQL corruption (**B**); conflicts with org/vehicle cascade delete, GDPR tenant wipe, test fixtures, future repair unless separate archival flow |
| **B — Mutation generation** | Trigger bumps generation; attestation stores generation | **Feasible**; requires schema column + trigger discipline |
| **C — Invalidation trigger** | DELETE attestation on revision/ACK UPDATE; CASCADE on DELETE | **Feasible**; allows repair (attestation disappears → full verify) |
| **D — Application convention** | No DB witness | **UNSAFE** for skipping JSON |
| **E — External WORM / signature** | Out-of-band | Stronger **future** option for **C** threat; not implemented |

**Recommendation:** **Strategy C** primary (invalidate on integrity-relevant UPDATE; cascade on DELETE), optionally **combine with B** (generation column) for clearer diagnostics — invalidation can be implemented as `DELETE FROM attestation WHERE revision_id = …` on revision UPDATE.

| Field | Value |
|-------|--------|
| **RECOMMENDED_MUTATION_PROTECTION_STRATEGY** | **INVALIDATION_TRIGGER** (with optional generation witness) |
| **STRICT_IMMUTABILITY_RECOMMENDED** | **NO** (as sole strategy) |
| **MUTATION_GENERATION_RECOMMENDED** | **OPTIONAL** (defense-in-depth alongside C) |
| **INVALIDATION_TRIGGER_RECOMMENDED** | **YES** |

---

## 6. Candidate attestation identity (no migration)

**Candidate table:** `BatteryHvChargeSessionEvidenceIntegrityAttestation`

| Column | Role |
|--------|------|
| `id` | UUID PK |
| `revisionId` | FK → revision, `ON DELETE CASCADE` |
| `durabilityAckId` | FK → ACK, `ON DELETE CASCADE` |
| `organizationId`, `vehicleId`, `segmentFingerprint` | tenant + session scope |
| `evidenceContractVersion`, `sourceRevisionFingerprint` | scientific identity |
| `durabilityAckContractVersion` | exact ACK contract |
| `integrityAttestationContractVersion` | attestation contract evolution |
| `attestedAt` | audit timestamp |
| `revisionMutationGeneration`, `ackMutationGeneration` | optional witness (Strategy B) |

**Unique identity (recommended):**

`(revisionId, integrityAttestationContractVersion)`

Rationale: one attestation row per revision per attestation contract generation; new `integrityAttestationContractVersion` can coexist for migration windows. ACK contract evolution that changes fence identity should bump attestation contract or invalidate via trigger when ACK row changes.

| Field | Value |
|-------|--------|
| **ATTESTATION_UNIQUE_IDENTITY** | **`(revisionId, integrityAttestationContractVersion)`** |
| **ATTESTATION_REFERENCES_EXACT_REVISION** | **YES** |
| **ATTESTATION_REFERENCES_EXACT_ACK** | **YES** (`durabilityAckId` + mirrored fence fields) |

---

## 7. Binding fingerprint

Storing duplicate SHA-256 over narrow relational identity does **not** prove `scientificEvidenceJson` if mutation can occur without invalidation.

With **Strategy C + full-verify fallback**, explicit columns + mutation witness are sufficient.

| Field | Value |
|-------|--------|
| **ATTESTATION_BINDING_FINGERPRINT_REQUIRED** | **NO** |
| **ATTESTATION_BINDING_FINGERPRINT_SCOPE** | **USEFUL_DEFENSE_IN_DEPTH** — optional `integrityBindingFingerprint` over `(revisionId, org, vehicle, segmentFingerprint, evidenceContractVersion, sourceRevisionFingerprint, ackId, durabilityAckContractVersion, sourceHvChargeSessionId, sourceUpdatedAt, capturedAt, createdAt)` for log/diagnostic parity only |

---

## 8. Read-path target architecture (future hybrid loader)

1. **Narrow scan** — all revision identities (org, vehicle, contract, segmentFingerprint, ordering columns, fingerprints) **without** `scientificEvidenceJson` where possible.
2. Per revision: exact ACK present? attestation valid? mutation witness match?
3. **Valid attestation** → skip historical JSON read for that revision.
4. **Missing/invalid attestation** → **FULL_VERIFY** (current `verifyDurableEvidenceRevisionForModeALoaderV1` including JSON).
5. MODE_A collapse unchanged (`sourceUpdatedAt` → `capturedAt` → `createdAt`; ambiguity fail closed).
6. Fetch full JSON for **effective** rows needed for reconstruction (may still full-verify effective rows).
7. Population: effective → `startAt <= evaluationAt` → sort → 5000 + truncation unchanged.

| Field | Value |
|-------|--------|
| **ATTESTATION_MISS_POLICY** | **FULL_VERIFY** |
| **ATTESTATION_INVALID_POLICY** | **FULL_VERIFY** |
| **ATTESTATION_CORRUPTION_BECOMES_SOURCE_FAILURE** | **NO** |

Pure model: `m3-3-hv-h4-a3-3-o2-integrity-attestation.v1.ts` + unit tests.

---

## 9. O1 C1–C10 preservation matrix

| Case | With attestation + invalidation + fallback |
|------|---------------------------------------------|
| C1 corrupt after attestation | Invalidated or generation mismatch → full verify → **FAIL CLOSED** |
| C2 ACK deleted | Attestation cascaded or ACK missing → full verify → **FAIL CLOSED** |
| C3 ACK mutated | Invalidation → full verify → **FAIL CLOSED** |
| C4 mirror mutated | Full verify detects → **FAIL CLOSED** (attestation does not skip mirror/json checks on fallback) |
| C5 top ambiguity | Unchanged — **FAIL CLOSED** |
| C6–C10 | Unchanged |

| Field | Value |
|-------|--------|
| **O1_C1_TO_C10_PRESERVABLE_WITH_ATTESTATION** | **YES** (requires invalidation + never trusting stale attestation) |

---

## 10. New revision write path (A3.2)

`persistIdempotent` transaction order today: insert revision → load row → verify stored → `ensureDurabilityAckV1`.

**Future same-transaction attestation (not wired in O2):**

1. Insert revision (or idempotent hit)
2. Ensure ACK
3. Run full verifier (same as loader)
4. Insert attestation

| Field | Value |
|-------|--------|
| **NEW_REVISION_ATTESTATION_SAME_TX_FEASIBLE** | **YES** |
| **PARTIAL_REVISION_ACK_ATTESTATION_STATE_POSSIBLE** | **NO** if attestation insert is last and gated on verify |
| **TRANSACTION_ORDER_RECOMMENDATION** | **revision → ACK → full verify → attestation insert** |

---

## 11. Historical bootstrap

| Option | Assessment |
|--------|------------|
| A bounded ops tool | **Good** for controlled backfill |
| B leader-guarded reconciliation | Reuse A3.5 patterns; separate job recommended |
| C extend A3.5 | Couples current-state reconciliation to history — **avoid** |
| D dedicated attestation reconciliation | **Preferred** |
| E lazy read-time creation | **Violates read-only loader** — **reject** |

| Field | Value |
|-------|--------|
| **HISTORICAL_BOOTSTRAP_RECOMMENDATION** | **DEDICATED_BOUNDED_ATTESTATION_RECONCILIATION** (leader guard, tenant scope, idempotent) |
| **READ_PATH_WRITES_ATTESTATION** | **NO** |
| **BOOTSTRAP_REQUIRED_BEFORE_HYBRID_LOADER** | **NO** for correctness (fallback); **YES** for performance gain on history |
| **BOOTSTRAP_REQUIRED_BEFORE_FULL_IO_BENEFIT** | **YES** |

Bootstrap rules: full verify before create; fail individual corrupt rows closed; never fabricate ACK; never mutate scientific evidence.

---

## 12. Rollout model

| Phase | Behavior |
|-------|----------|
| **0** | Current loader only (**today**) |
| **1** | Schema + triggers + writer attestation; loader unchanged |
| **2** | Bounded historical attestation reconciliation |
| **3** | Hybrid loader (attested narrow path + fallback) |
| **4** | SQL effective selection + effective-only JSON fetch (O1 prototype) |

| Field | Value |
|-------|--------|
| **ROLLBACK_TO_CURRENT_LOADER_ALWAYS_POSSIBLE** | **YES** (ignore attestation table) |
| **ATTESTATION_COVERAGE_REQUIRED_FOR_CORRECTNESS** | **NO** |
| **ATTESTATION_COVERAGE_REQUIRED_FOR_PERFORMANCE_GAIN** | **YES** |

---

## 13. Performance model (row counts, illustrative)

Let **R** = revision rows, **S** = effective sessions after collapse, **H** = non-effective revisions = **R − S**.

After **100%** attestation coverage and hybrid loader:

| Scenario | CURRENT full JSON reads | TARGET full JSON reads | Narrow history rows |
|----------|-------------------------|------------------------|---------------------|
| 5000×1 | R=5000 | S=5000 ≈ 5000 | R narrow scan still |
| 5000×2 | R=10000 | S=5000 (effective only) | ~5000 historical JSON skipped |
| 5000×5 | R=25000 | S=5000 | ~20000 historical JSON skipped |

| Field | Value |
|-------|--------|
| **FULL_JSON_ROW_REDUCTION_5000x1** | **~0%** (all rows effective) |
| **FULL_JSON_ROW_REDUCTION_5000x2** | **~50%** of revision JSON rows (H/R) |
| **FULL_JSON_ROW_REDUCTION_5000x5** | **~80%** (H/R) |
| **NARROW_HISTORY_SCAN_STILL_REQUIRED** | **YES** |

No byte/latency % claims without payload measurement.

---

## 14. Database indexes (future)

| Index | Purpose |
|-------|---------|
| Revision composite (O1) | `(org, vehicle, evidence_contract_version, segment_fingerprint, source_updated_at DESC, captured_at DESC, created_at DESC)` |
| Attestation | `(revision_id, integrity_attestation_contract_version)` UNIQUE |
| ACK | existing fence + `revision_id` |

| Field | Value |
|-------|--------|
| **ATTESTATION_INDEX_REQUIRED** | **YES** (for hybrid loader lookups) |
| **MODE_A_COMPOSITE_INDEX_STILL_RECOMMENDED** | **YES** |

---

## 15. Test-only prototype

| Artifact | Role |
|----------|------|
| `m3-3-hv-h4-a3-3-o2-integrity-attestation.v1.ts` | Binding + mutation witness validity |
| `m3-3-hv-h4-a3-3-o2-integrity-attestation.spec.ts` | Unit coverage |

---

## 16. Validation commands

```bash
cd backend && npm test -- --testPathPattern='m3-3-hv-h4-a3-3-o2-integrity-attestation'
cd backend && npm test -- --testPathPattern='m3-3-hv-h4-a3-3-o1'
cd backend && npm test -- --testPathPattern='m3-3-hv-h4-a3-durable'
cd backend && npm run test:battery:hv-h4:unit
# postgres suites: CI HV-H4 job
cd backend && npx tsc -p tsconfig.build.json --noEmit
cd backend && npm run build
bash architecture/scripts/validate-module-registry.sh
```

---

## 17. Safety checklist (O2)

| Item | Value |
|------|--------|
| **NEW_MIGRATION_CREATED** | **NO** |
| **PRODUCTION_LOADER_CHANGED** | **NO** |
| **PRODUCTION_DEPLOYED** | **NO** |
| **PRODUCTION_DB_TOUCHED** | **NO** |
| **ENV_CHANGED** | **NO** |
