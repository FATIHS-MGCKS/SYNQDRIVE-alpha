# M3.3-HV-H4-A3.3-O2 — Historical durable revision integrity attestation architecture

**Date:** 2026-10-07 (final closure)  
**Status:** **ARCHITECTURE AUDIT (O2) — CLOSED** — threat model, issuance authority, mutability audit, Phase-1 strategy; **no migration, no production loader change**  
**Main anchor (integration):** `4c4b6102e6ebb79844604204c812e89c60a8cd5b` (APDS #1913, EXP021 #1912, VO5B #1908; zero H4/A3 overlap vs O2 PR)  
**Upstream:** O1 `NEEDS_INTEGRITY_ATTESTATION_BEFORE_MEANINGFUL_OPTIMIZATION`; frozen loader semantics O1-C1–C10

---

## 0. Executive summary

O2 evaluates whether a **derived integrity attestation** can preserve O1 fail-closed semantics while allowing **non-effective** historical `scientificEvidenceJson` rows to be skipped on later reads when attestation + mutation witness are valid.

| Field | Value |
|-------|--------|
| **O2_DECISION** | **ATTESTATION_ARCHITECTURE_FEASIBLE** |
| **PREFERRED_ARCHITECTURE** | **DERIVED_ATTESTATION** + **DB-enforced mutation invalidation (Strategy C)** + **FULL_VERIFY fallback** + **hybrid loader (future)** + **separate bounded historical bootstrap** |
| **SCHEMA_IMPLEMENTATION_READY** | **NO** (design + pure model only; migration deferred) |
| **NEXT_RECOMMENDED_SLICE** | **O2-R1_SCHEMA_TRIGGER_ISSUANCE_FOUNDATION** — schema + Strategy C triggers + **issuance authority**; loader unchanged |

---

## 1. Threat model (final)

| Class | Description | Mitigation in design | Proven today? |
|-------|-------------|----------------------|---------------|
| **A1** | Legitimate application revision/ACK mutation bug | **Strategy C** invalidation deletes attestation → **FULL_VERIFY** | **NO** (triggers not deployed) |
| **A2** | Bug or misuse that **mints attestation without full verify** | **Issuance authority** (DB role separation + `SECURITY DEFINER` issuance function embedding full verify) | **NO** |
| **B** | Accidental SQL UPDATE/DELETE with triggers active | **Strategy C** invalidation | **NO** (triggers not deployed) |
| **C** | Malicious DB actor rewriting source + ACK + attestation / disabling triggers | Out of scope | N/A |
| **D** | Physical / TOAST / page corruption after attestation (unread JSON) | Out of scope; hybrid path **does not** re-read JSON every time | N/A |

| Field | Value |
|-------|--------|
| **ATTESTATION_THREAT_MODEL_FINAL** | **A1/B design-mitigated post-O2-R1; A2 requires issuance authority before hybrid loader; C/D explicit non-goals** |
| **MALICIOUS_DBA_IN_SCOPE** | **NO** |
| **PHYSICAL_STORAGE_CORRUPTION_IN_SCOPE** | **NO** (accepted trade-off for hybrid IO reduction) |
| **SECURITY_CLAIM_NOT_STRONGER_THAN_PROVEN** | **YES** — only claims aligned with deployed enforcement; issuance and triggers are **design targets**, not production facts |
| **NORMAL_APPLICATION_BUGS_FULLY_MITIGATED** | **NO** until issuance authority + invalidation triggers are implemented and privileged |

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

**Necessary but not sufficient:** “created only after full verification” is an **application contract** until issuance is DB-enforced.

### 3.1 Issuance authority (distinct from source mutation protection)

| Concern | Field |
|---------|--------|
| **SOURCE_MUTATION_PROTECTION** | Strategy C invalidation (post-issuance stale attestation) |
| **ATTESTATION_ISSUANCE_AUTHORITY** | Who may insert attestation rows at all |

**Fraudulent issuance threat:** unverified revision + syntactically valid attestation row + hybrid loader trusts binding → **skips JSON** → **FALSE PASS**. Invalidation triggers do **not** prevent erroneous initial INSERT.

| Insert path (future) | Risk if unconstrained |
|----------------------|------------------------|
| Prisma `create` / generic ORM | Any bug can mint attestation |
| Raw SQL with app `DATABASE_URL` | Same |
| A3.2 writer repository only | Engineering boundary; **not** DB authority |
| Reconciliation / bootstrap jobs | Must use same issuance gate as writer |
| Ops tooling / migrations | Must not bypass verify |

| Option | Assessment |
|--------|------------|
| **A — Application convention only** | **Insufficient** for strong A2 claim |
| **B — Dedicated repository/service only** | **Useful** boundary; **not** sufficient alone |
| **C — DB privilege separation** | App/read roles **denied** `INSERT`/`UPDATE` on attestation; only attestation-writer role or function |
| **D — `SECURITY DEFINER` function** | **Required to embed full verify** inside issuance; hiding INSERT without verify is insufficient |
| **E — Cryptographic seal / WORM** | Stronger future option; not required for O2 feasibility |

| Field | Value |
|-------|--------|
| **ATTESTATION_ISSUANCE_AUTHORITY_REQUIRED** | **YES** |
| **ATTESTATION_ISSUANCE_CURRENTLY_DB_ENFORCED** | **NO** |
| **DIRECT_ARBITRARY_ATTESTATION_INSERT_WOULD_BE_UNSAFE** | **YES** |
| **RECOMMENDED_ATTESTATION_ISSUANCE_MODEL** | **DB_PRIVILEGE_SEPARATION_PLUS_SECURITY_DEFINER_ISSUANCE_WITH_EMBEDDED_FULL_VERIFY** (dedicated service calls function only) |
| **ISSUANCE_MUST_BE_RESOLVED_BEFORE_HYBRID_LOADER** | **YES** |

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

**Phase-1 authoritative target:** **Strategy C only** — attestation **row existence** is the mutation witness; `BEFORE/AFTER UPDATE` on revision/ACK **DELETE** matching attestation; `ON DELETE CASCADE` removes attestation with revision/ACK. **No generation columns required for correctness** in Phase 1.

Strategy B (generation counters) remains a **future optional** diagnostic layer — not part of Phase-1 proof or pure model.

| Field | Value |
|-------|--------|
| **RECOMMENDED_MUTATION_PROTECTION_STRATEGY** | **INVALIDATION_TRIGGER** |
| **PHASE1_MUTATION_STRATEGY** | **C_ONLY** |
| **GENERATION_FIELDS_REQUIRED_IN_PHASE1** | **NO** |
| **PURE_MODEL_MATCHES_PHASE1_STRATEGY** | **YES** (`m3-3-hv-h4-a3-3-o2-integrity-attestation.v1.ts` — binding + MISSING after invalidation) |
| **STRICT_IMMUTABILITY_RECOMMENDED** | **NO** (as sole strategy) |
| **MUTATION_GENERATION_RECOMMENDED** | **NO** for Phase 1 (optional later) |
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

With **Strategy C + full-verify fallback**, explicit relational binding columns are sufficient (invalidation removes row).

| Field | Value |
|-------|--------|
| **ATTESTATION_BINDING_FINGERPRINT_REQUIRED** | **NO** |
| **ATTESTATION_BINDING_FINGERPRINT_SCOPE** | **USEFUL_DEFENSE_IN_DEPTH** — optional `integrityBindingFingerprint` over `(revisionId, org, vehicle, segmentFingerprint, evidenceContractVersion, sourceRevisionFingerprint, ackId, durabilityAckContractVersion, sourceHvChargeSessionId, sourceUpdatedAt, capturedAt, createdAt)` for log/diagnostic parity only |

---

## 8. Read-path target architecture (future hybrid loader)

1. **Narrow scan** — all revision identities (org, vehicle, contract, segmentFingerprint, ordering columns, fingerprints) **without** `scientificEvidenceJson` where possible.
2. Per revision: exact ACK present? attestation row present and binding valid? (invalidation ⇒ missing row)
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

O1 tests model **logical** PostgreSQL-visible mutation/corruption (UPDATE semantics), not silent physical page corruption.

| Case | With attestation + Strategy C invalidation + fallback |
|------|--------------------------------------------------------|
| C1 corrupt after attestation | Attestation invalidated → full verify → **FAIL CLOSED** |
| C2 ACK deleted | Attestation cascaded / ACK missing → full verify → **FAIL CLOSED** |
| C3 ACK mutated | Invalidation → full verify → **FAIL CLOSED** |
| C4 mirror mutated | Fallback full verify → **FAIL CLOSED** |
| C5 top ambiguity | Unchanged — **FAIL CLOSED** |
| C6–C10 | Unchanged |

### 9.1 Storage corruption parity (explicit non-equivalence)

| Field | Value |
|-------|--------|
| **CURRENT_LOADER_REDETECTS_HISTORICAL_JSON_CORRUPTION_ON_READ** | **YES** — every read loads and fingerprint-checks all historical JSON |
| **HYBRID_ATTESTED_LOADER_REDETECTS_UNREAD_HISTORICAL_JSON_PHYSICAL_CORRUPTION_ON_EVERY_READ** | **NO** |
| **PHYSICAL_STORAGE_CORRUPTION_PARITY_WITH_CURRENT_LOADER** | **NO** |

| Field | Value |
|-------|--------|
| **O1_LOGICAL_DB_MUTATION_SEMANTICS_PRESERVABLE_WITH_ATTESTATION** | **YES** (invalidation active + issuance authority + fallback) |
| **O1_STORAGE_CORRUPTION_REDETECTION_PARITY** | **NO** |
| **SEMANTIC_EQUIVALENCE_BOUNDARY** | **LOGICAL_POSTGRES_MUTATIONS_WITH_INVALIDATION_ACTIVE** |

**Future mitigations (not implemented):** bounded periodic full-integrity scrub / re-attestation; PostgreSQL/storage checksum observability; external/WORM integrity.

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
| `m3-3-hv-h4-a3-3-o2-integrity-attestation.v1.ts` | Phase-1 Strategy C binding; MISSING simulates post-UPDATE invalidation |
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
