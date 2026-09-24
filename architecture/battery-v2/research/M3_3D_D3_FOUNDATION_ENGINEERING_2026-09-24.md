# M3.3D D3 — Foundation engineering (append-only materialization)

**Date:** 2026-09-24  
**Status:** **ENGINEERING DRAFT PR** (not on main until merge)  
**Architecture baseline:** PR #1744 @ `7919bdd5c` · post-merge seal PR #1745 @ `b62cc2c19`  
**Scope:** Prisma + migration + scientific projection + fingerprint + repository + internal service + tests  
**Reachability:** **`D3_RUNTIME_REACHABLE=NO`** — service **not** registered in Nest modules  

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
| Ephemeral Postgres CI | `backend/scripts/test/battery-longitudinal-profile-materialization-postgres-ci.sh` → `npm run test:battery:v2:longitudinal-profile-materialization:postgres` |

---

## Foundation hardening (PR #1746 amend)

| Contract | Implementation |
|----------|----------------|
| **`PERSISTENCE_SINGLE_DERIVATION_SOURCE=YES`** | `buildLongitudinalProfileMaterializationPersistenceInput(fingerprint)` derives JSON + metadata from `fingerprint.scientificProjection` only |
| **`READ_COMMITTED_EXPLICIT=YES`** | `insertIdempotent()` uses `Prisma.TransactionIsolationLevel.ReadCommitted` |
| **Application fingerprint validation** | Repository validates `/^[0-9a-f]{64}$/` before INSERT (`INVALID_PROFILE_FINGERPRINT`) |
| **DB CHECK matrix (PG-B)** | Reject uppercase / 63 / 65 / non-hex; accept 64 lowercase hex |
| **Full metadata mirror (PG-O)** | All mirrored columns verified vs persistence input + canonical UTF-8 equivalence |
| **Duplicate metadata drift** | EXISTING path throws `PROFILE_MATERIALIZED_METADATA_DRIFT` (PG-Q) |
| **REPOSITORY_SINGLE_SCIENTIFIC_SOURCE** | `insertIdempotent(input)` only — canonical UTF-8 derived from `input.scientificProfileJson` |
| **Incoming fingerprint coherence** | Recompute SHA-256 before INSERT; `PROFILE_FINGERPRINT_PAYLOAD_MISMATCH` if inconsistent |
| **Policy/contract identity tests** | Synthetic `*_V2_TEST` versions prove fingerprint namespace separation |
| **Postgres execution** | Script **`npm run test:battery:v2:longitudinal-profile-materialization:postgres`** — **`LOCAL_EPHEMERAL_ONLY`**, **`D3_POSTGRES_CI_ENFORCED=NO`** (no `.github` workflow change in PR #1746) |
| **D1 regression evidence** | `npm run test:battery:v2:longitudinal-input:postgres` — 5/5 on final head |

---

## Authority preserved

- Source chain: C3 → D1 reader → D2 assembler → D3 projection/fingerprint/persist only  
- **`CANONICAL_SCIENTIFIC_PROFILE_PROJECTION`** fingerprint (omit `window.profileGeneratedAt` by property removal)  
- **`CANONICAL_SCIENTIFIC_UTF8_STORED=NO`** — compare via `canonicalFeatureInputUtf8`  
- Postgres idempotency: **`INSERT … ON CONFLICT DO NOTHING RETURNING`** + canonical UTF-8 verify  
- **`DELETE_CASCADE_POLICY=ORG_AND_VEHICLE_CASCADE__NO_C3_ROW_CASCADE`**  
- No sequential revision number, no current pointer, no C3 row FK  

---

## Golden vectors

| Vector | Value |
|--------|-------|
| C3 key-order SHA-256 | `e7b6e05a14a7bece2b8568b716d7dfc2ff360507b7a9f308c5771f648fd8dff3` (unchanged) |
| D3 two-DEFAULT fixture fingerprint | `e2d39c602370c92a7b4304d01ee0f0d102aa4ce033c38a03f72187a3afbcaecb` |

---

## Non-effects (this slice)

No Nest provider registration, no feature flag, no C3 hook, no scheduler/worker/API/UI, no production deploy, **`PRODUCTION_MATERIALIZATION_READY=NO`** until **M3.3F**.

---

## Boundaries

- **D4:** no digest/rebuildability enforcement on persist  
- **M3.3E:** no health/SOH/risk  
- **M3.3F:** required before any production materialization trigger or module registration  
