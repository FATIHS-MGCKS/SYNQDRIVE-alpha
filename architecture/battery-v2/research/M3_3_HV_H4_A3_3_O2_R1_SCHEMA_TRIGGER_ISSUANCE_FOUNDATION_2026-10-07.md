# M3.3-HV-H4-A3.3-O2-R1 — Schema + mutation invalidation + issuance foundation

**Date:** 2026-10-07  
**Status:** **IMPLEMENTATION (R1)** — additive migration + PostgreSQL tests; **hybrid loader OFF**  
**Main anchor:** `564de4a2bff2314a917724d88e2894485e0091ed` (O2 #1914)

## Delivered in R1

| Item | Status |
|------|--------|
| `BatteryHvChargeSessionEvidenceIntegrityAttestation` schema | **YES** |
| Strategy **C_ONLY** invalidation triggers (revision/ACK UPDATE) | **YES** |
| FK CASCADE on revision/ACK DELETE | **YES** |
| `REVOKE ALL` on attestation table from PUBLIC | **YES** |
| `SECURITY DEFINER` issuance function + fixed `search_path` | **YES** (CI-gated parity) |
| SQL ↔ TS golden canonical corpus | **YES** (`m3-3-hv-h4-a3-3-o2-r1-canonical-golden-vectors.v1.ts`) |
| A3.2 writer attestation integration | **NO** (gated) |
| Hybrid durable loader | **NO** |

## Canonicalization parity gate

PostgreSQL builds canonical UTF-8 via explicit tuple concatenation (no JSONB object re-render for tuple slots), then SHA-256. CI golden corpus must show **zero mismatches** vs `buildM3_3HvH4ChargeSessionEvidenceCanonicalUtf8V1` before claiming `SQL_FULL_VERIFY_EQUIVALENT_TO_TS=YES`.

**Open gap (documented):** ECMAScript `JSON.stringify` exponent forms for some finite values (e.g. `1.23e-7`) may not match PostgreSQL `jsonb` numeric text; golden corpus uses decimal subnormal (`0.000000123`) instead until a proven SQL number formatter exists.

## Issuance authority

| Field | R1 value |
|-------|----------|
| `PRODUCTION_ROLE_TOPOLOGY_PROVEN` | **NO** |
| `DB_PRIVILEGE_SEPARATION_IMPLEMENTABLE_FROM_REPO_ALONE` | **PARTIAL** (isolated CI roles only) |
| `ISSUANCE_AUTHORITY_CERTIFIED` | **NO** (`A3_ATTESTATION_ISSUANCE_AUTHORITY_CERTIFIED=false`) |
| `WRITER_ATTESTATION_INTEGRATED` | **NO** |

## Next slice

**O2-R2** — production role topology + writer path behind issuance function only (still no hybrid loader until certified).

## Migration note (TEXT FK parity)

Parent evidence tables use `TEXT` primary keys (`battery_hv_charge_session_evidence_revisions.id`, `battery_hv_charge_session_evidence_acks.id`). Attestation FK columns match **TEXT**, not UUID.

## Safety

No production migration execution, no bootstrap, no loader change.
