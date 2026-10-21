# M3.3D D3 — Foundation engineering (append-only materialization)

**Date:** 2026-09-24  
**Status:** **COMPLETE ON MAIN** — merged PR #1746 @ merge `c5c1129f62e11eb68c8fc6566fd7fecef376743b` (PR head `944a6839ed18dd57244897924d72ac49b9a968a2`)  
**Architecture baseline:** PR #1744 @ `7919bdd5c` · D3.1 persistence contract · post-merge seals PR #1745 @ `b62cc2c19`  
**Scope:** Prisma + migration + scientific projection + fingerprint + repository + internal service + tests  
**Reachability:** **`D3_SERVICE_CODE_EXISTS=YES`** · **`D3_RUNTIME_REACHABLE=NO`** — service **not** registered in Nest modules  

**Next phase:** **M3.3E E1** pure adapter (**NEXT**). **M3.3E E0/E0.1/E0.2 COMPLETE ON MAIN** PR #1761 @ merge `658b804d7`. D4 Engineering V1 **COMPLETE ON MAIN** PR #1754 @ merge `9a3e457d9`. D4 architecture **COMPLETE ON MAIN** PR #1751 @ `158f9c516f` (not M3.3F — production materialization authorization remains later).

---

## Implementation map

| Component | Path |
|-----------|------|
| Prisma model | `BatteryLongitudinalProfileRevision` in `backend/prisma/schema.prisma` |
| Migration | `20260924110000_battery_longitudinal_profile_revisions` |
| Scientific projection | `longitudinal-profile-scientific-projection.ts` |
| Fingerprint wrapper | `longitudinal-profile-fingerprint.ts` |
| Persistence mapper | `longitudinal-profile-materialization.mapper.ts` (single-source: fingerprint only) |
| Metadata mirror guard | `longitudinal-profile-materialization.metadata-mirror.ts` |
| Repository (ON CONFLICT) | `longitudinal-profile-materialization.repository.ts` (explicit `ReadCommitted`) |
| Internal service | `longitudinal-profile-materialization.service.ts` |
| Unit tests | `longitudinal-profile-fingerprint.spec.ts`, `*.mapper/repository/service.spec.ts` |
| Postgres integration | `longitudinal-profile-materialization.integration.spec.ts` (`BATTERY_V2_LONGITUDINAL_PROFILE_MATERIALIZATION_INTEGRATION=1`) |
| Ephemeral Postgres runner | `backend/scripts/test/battery-longitudinal-profile-materialization-postgres-ci.sh` → `npm run test:battery:v2:longitudinal-profile-materialization:postgres` |

---

## Source of truth

Persisted C3 → D1 → D2 → D3 projection / fingerprint / persistence only.

D3 materialized revisions are **DERIVED**, **REPRODUCIBLE**, **APPEND_ONLY**, **REBUILDABLE**. D3 is **not** a second scientific computation authority.

---

## Schema authority (merged)

| Field | Contract |
|-------|----------|
| Model / table | `BatteryLongitudinalProfileRevision` / `battery_longitudinal_profile_revisions` |
| Fingerprint column | SHA-256 lowercase hex, exactly 64 chars — `@db.Char(64)` + DB CHECK `^[0-9a-f]{64}$` |
| Scientific unique identity | `organizationId` + `vehicleId` + `longitudinalProfileContractVersion` + `profilePolicyVersion` + `canonicalProfileFingerprint` |
| Forbidden in V1 | sequential revision number, current pointer, normalized child tables, direct C3/rest-session FK |
| Delete semantics | **`DELETE_CASCADE_POLICY=ORG_AND_VEHICLE_CASCADE__NO_C3_ROW_CASCADE`** |

---

## Scientific projection / fingerprint

| Invariant | Value |
|-----------|--------|
| Fingerprint authority | **`CANONICAL_SCIENTIFIC_PROFILE_PROJECTION`** |
| Algorithm | (1) `M3_3D_LONGITUDINAL_PROFILE_V1` → (2) omit `window.profileGeneratedAt` by property removal → (3) `canonicalFeatureInputUtf8(scientificProjection)` → (4) `sha256HexLowercaseUtf8(...)` |
| `profileGeneratedAt` | **Not** in scientific fingerprint |
| `scientificProfileJson` | JSONB semantic payload; raw JSONB bytes **not** canonical authority |
| Canonical comparison | `canonicalFeatureInputUtf8(storedJson)` |
| Stored canonical UTF-8 column | **NO** (`CANONICAL_SCIENTIFIC_UTF8_STORED=NO`) |

---

## Single-source persistence contract (final)

**Mapper:** `buildLongitudinalProfileMaterializationPersistenceInput(fingerprint)` — all mirror metadata + `scientificProfileJson` from `fingerprint.scientificProjection` only.

**Repository:** `insertIdempotent(input)` — does **not** accept external canonical UTF-8.

Before INSERT:

1. Validate fingerprint format `/^[0-9a-f]{64}$/` → else `INVALID_PROFILE_FINGERPRINT`
2. `incomingCanonicalUtf8 = canonicalFeatureInputUtf8(input.scientificProfileJson)`
3. Recompute SHA-256; require match → else **`PROFILE_FINGERPRINT_PAYLOAD_MISMATCH`**

**Multi-replica idempotency:** explicit **`READ COMMITTED`**; DB unique constraint is correctness authority; `INSERT … ON CONFLICT DO NOTHING RETURNING`.

On EXISTING path after canonical JSON equality:

- mismatch stored vs incoming canonical JSON → **`PROFILE_FINGERPRINT_COLLISION_OR_CANONICALIZATION_DRIFT`**
- mismatch mirror metadata → **`PROFILE_MATERIALIZED_METADATA_DRIFT`**
- conflict with no row → **`PROFILE_IDEMPOTENCY_CONFLICT_ROW_NOT_FOUND`**

No Redis lock, no Serializable requirement, no in-place update/repair of immutable revisions.

---

## Final test evidence (PR #1746)

| Suite | Result |
|-------|--------|
| D3 unit specs | PASS |
| D3 PostgreSQL (ephemeral script) | PASS |
| D1 unit | 36/36 PASS |
| D1 PostgreSQL | 5/5 PASS |
| D2 assembler | 37/37 PASS |
| Final merge-gate PR head | `944a6839ed18dd57244897924d72ac49b9a968a2` |
| Final PR GitHub CI | 46/46 SUCCESS; 0 pending; 0 failed |

**Postgres execution mode:** **`D3_POSTGRES_EXECUTION_MODE=LOCAL_EPHEMERAL_ONLY`** · **`D3_POSTGRES_CI_ENFORCED=NO`** (safe script + package entrypoint exist; no `.github` workflow job added for D3 PG suite).

---

## Golden vectors (sealed)

| Vector | Value |
|--------|-------|
| C3 key-order SHA-256 | `e7b6e05a14a7bece2b8568b716d7dfc2ff360507b7a9f308c5771f648fd8dff3` |
| D3 two-DEFAULT fixture fingerprint | `e2d39c602370c92a7b4304d01ee0f0d102aa4ce033c38a03f72187a3afbcaecb` |

---

## Runtime boundary (still sealed)

| Gate | Value |
|------|-------|
| `D3_NEST_PROVIDER_REGISTERED` | **NO** |
| `D3_MODULE_EXPORTED` | **NO** |
| `D3_RUNTIME_CALL_SITES` | **0** (implementation + tests only) |
| Feature flag / trigger / C3 hook / scheduler / queue / API | **NO** |
| `PRODUCTION_MATERIALIZATION_READY` | **NO** until **M3.3F** |

---

## Open decisions (unchanged)

`RETENTION_POLICY=DECISION_REQUIRED` · `MATERIALIZATION_FLAG_NAME=DECISION_REQUIRED` · `M3_3F_WIRING_STATUS=PENDING` · `DEC-M3.3D-001=DECISION_REQUIRED`

---

## Boundaries

- **D4 architecture (complete on main):** digest/revision/source-evidence integrity inspection contract — **not** production materialization activation  
- **M3.3E E0/E0.1/E0.2 (complete on main):** `M3_3E_E0_LONGITUDINAL_ASSESSMENT_CONSUMPTION_ARCHITECTURE_2026-09-25.md` (PR #1761)
- **M3.3E E1 (next):** pure `buildLongitudinalAssessmentInputV1` adapter (no DB/Nest/health)
- **M3.3E:** health/SOH/risk/confidence — pending  
- **M3.3F:** explicit future authorization for Nest registration, materialization flag, triggers, production shadow materialization  
