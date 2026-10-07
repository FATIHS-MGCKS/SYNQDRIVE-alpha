# M3.3-HV-H4-A3.3-O1 — MODE_A effective revision SQL optimization architecture

**Date:** 2026-10-07  
**Status:** **ARCHITECTURE AUDIT (O1)** — semantics freeze + test characterization + test-only SQL prototype  
**Main anchor (expected):** `3fe991963a92bc8e2e59ae8289abe266de5ae19d` (A3.6-R0 #1905)  
**Main anchor (integration):** `87fa2f62f7a8bfa3a8a7d45b12f9e115e77c21a0` (no H4/A3 file overlap vs `3fe991963..`)  
**Upstream:** `m3-3-hv-h4-a3-durable-charge-session-loader.v1.ts`, `m3-3-hv-h4-a3-mode-a-effective-revision.v1.ts`

---

## 1. Frozen current semantics

| Field | Value |
|-------|--------|
| **CURRENT_VERIFY_ALL_REVISIONS_BEFORE_COLLAPSE** | **YES** |
| **CURRENT_NON_EFFECTIVE_REVISION_INTEGRITY_AFFECTS_READ** | **YES** |
| **CURRENT_NON_EFFECTIVE_ACK_REQUIRED** | **YES** |

Loader order: load all revisions → load all ACKs → **verify every revision** (contract, JSON fingerprint, mirror, ACK fence) → collapse MODE_A → reconstruct → population filter → sort → 5000 cap.

---

## 2. O1 characterization tests (PostgreSQL)

| Case | Intent | Expected |
|------|--------|----------|
| **O1-C1** | Non-effective corrupt fingerprint | Fail closed |
| **O1-C2** | Non-effective missing ACK | Fail closed |
| **O1-C3** | Non-effective ACK mismatch | Fail closed |
| **O1-C4** | Non-effective mirror drift | Fail closed |
| **O1-C5** | Top tuple ambiguity | `H4EvidenceEffectiveRevisionAmbiguityError` |
| **O1-C6** | Collapse before `evaluationAt` filter | No fallback to older revision |
| **O1-C7** | Effective `sourceHvChargeSessionId` in sort | A1 `id ASC` uses effective row |
| **O1-C8** | 5001 effective sessions | Truncation flags |
| **O1-C9** | Tenant isolation | Empty for other vehicle |
| **O1-C10** | Zero revisions | Empty population |

File: `m3-3-hv-h4-a3-3-o1-semantics.postgres.integration.spec.ts`

---

## 3. SQL prototype (TEST-ONLY)

File: `m3-3-hv-h4-a3-3-o1-mode-a-sql-effective-selection.v1.ts`

- `ROW_NUMBER()` partition by `segment_fingerprint`
- `ORDER BY source_updated_at DESC, captured_at DESC, created_at DESC, id ASC`
- Ambiguity CTE: count distinct `source_revision_fingerprint` among rows sharing winner tuple

| Field | Value |
|-------|--------|
| **SQL_MODE_A_ORDER_EXACT** | **YES** |
| **LEXICAL_FINGERPRINT_TIEBREAK_USED** | **NO** |
| **AMBIGUITY_DETECTED_EXPLICITLY** | **YES** |

**Not wired to production loader in O1.**

---

## 4. Verify-all vs effective-only (key O1 decision)

| Strategy | Assessment |
|----------|------------|
| **A EFFECTIVE_ONLY** | **Not equivalent** — O1-C1–C4 prove non-effective integrity affects reads |
| **B EFFECTIVE + narrow ACK scan** | ACK-only scan insufficient — fingerprint/mirror need `scientificEvidenceJson` |
| **C EFFECTIVE + full-history verify** | **Semantically equivalent** — can SQL-pick effective IDs but must still read/verify all **R** JSON rows |
| **D Integrity attestation** | Future; may need migration — out of O1 scope |
| **E Change semantics to effective-only** | **Forbidden** in O1 |

| Field | Value |
|-------|--------|
| **EFFECTIVE_ONLY_IS_CURRENTLY_SEMANTICALLY_EQUIVALENT** | **NO** |
| **CAN_ALL_HISTORY_INTEGRITY_BE_PRESERVED_WITHOUT_FULL_JSON_READ** | **NO** (canonical fingerprint + mirror coherence require JSON) |
| **PRIMARY_OPTIMIZATION_LIMITER** | **ALL_HISTORY_FULL_INTEGRITY_VERIFICATION** (JSON I/O bound) |

---

## 5. ACK SQL audit

ACK authority (`assertAckMirrorsRevisionV1`): `revisionId`, `organizationId`, `vehicleId`, `segmentFingerprint`, `evidenceContractVersion`, `sourceRevisionFingerprint`, `durabilityAckContractVersion`.

**`revisionId` join alone is insufficient** — prototype/production must enforce full fence.

| Field | Value |
|-------|--------|
| **EXACT_ACK_JOIN_PROVEN** | **YES** (predicate documented; TS verifier is normative) |

---

## 6. Population after collapse

| Field | Value |
|-------|--------|
| **POPULATION_FILTER_AFTER_EFFECTIVE_SELECTION** | **YES** |
| **HARD_LIMIT_AFTER_EFFECTIVE_SELECTION** | **YES** |
| **FETCH_5001_PROBE_EQUIVALENT** | **YES** for durable in-memory population (`filtered.length > 5000`); live path uses DB probe — semantics aligned, mechanism differs |

---

## 7. Index audit (no migration in O1)

Existing: `(organizationId, vehicleId, segmentFingerprint, evidenceContractVersion)`.

Window ordering uses `(source_updated_at, captured_at, created_at)` — not leading in current index.

| Field | Value |
|-------|--------|
| **CURRENT_INDEX_SUFFICIENT_FOR_TARGET_QUERY** | **PARTIAL** (tenant scope yes; per-partition sort may sort in memory) |
| **CANDIDATE_INDEX_RECOMMENDED** | **YES** — `(organization_id, vehicle_id, evidence_contract_version, segment_fingerprint, source_updated_at DESC, captured_at DESC, created_at DESC)` |
| **MIGRATION_REQUIRED_FOR_MEANINGFUL_OPTIMIZATION** | **NO** for correctness; **OPTIONAL** for latency at scale |

---

## 8. Amplification model (illustrative)

Let **S** = canonical sessions after collapse, **R** = revision rows.

| Scenario | CURRENT full JSON rows | PROPOSED effective JSON rows | History integrity rows |
|----------|------------------------|------------------------------|-------------------------|
| 5000×1 | R=5000 | S=5000 | R=5000 verify |
| 5000×2 | R=10000 | S=5000 | R=10000 verify |
| 5000×5 | R=25000 | S=5000 | R=25000 verify |

| Field | Value |
|-------|--------|
| **FULL_JSON_IO_REDUCTION_POSSIBLE** | **NO** under frozen semantics (strategy C); **YES** only with future attestation (strategy D) or forbidden semantic change |

---

## 9. SQL vs TS parity (prototype tests)

| Field | Value |
|-------|--------|
| **SQL_VS_TS_EFFECTIVE_SELECTION_PARITY** | **PASS** (postgres integration) |
| **SQL_AMBIGUITY_PARITY** | **PASS** |
| **SQL_POPULATION_PARITY** | **PASS** (after verify-equivalent data; prototype applies population on SQL-selected effective rows) |

---

## 10. O1 decision

| Field | Value |
|-------|--------|
| **O1_DECISION** | **`NEEDS_INTEGRITY_ATTESTATION_BEFORE_MEANINGFUL_OPTIMIZATION`** |
| **IMPLEMENTATION_RECOMMENDED_NEXT** | **O1-R1:** optional loader refactor **SQL effective ID selection + unchanged full-history verify** (CPU/grouping win only); parallel track **integrity attestation** design before promising large JSON I/O reduction |
| **MIGRATION_RECOMMENDED_NEXT** | **Optional** composite index (§7); **no** schema required for attestation design in O1 |

**A3.6 cache remains DEFERRED.** `A3_3_DURABLE_LOADER_RUNTIME_REACHABLE` and `H4_AUTOMATIC_RUNTIME_REACHABLE` unchanged.

---

## 11. Validation

- O1 postgres characterization + SQL prototype tests
- Existing A3.3 durable loader postgres corpus
- A3.6 multi-lifecycle parity (on main)
- HV-H4 unit + postgres CI

**No production loader change. No migration. No deploy.**
