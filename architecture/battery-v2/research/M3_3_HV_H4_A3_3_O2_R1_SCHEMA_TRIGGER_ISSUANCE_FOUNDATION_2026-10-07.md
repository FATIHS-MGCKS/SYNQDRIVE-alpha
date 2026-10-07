# M3.3-HV-H4-A3.3-O2-R1 — Schema + mutation invalidation + issuance foundation

**Date:** 2026-10-07  
**Status:** **FOUNDATION (R1 closure)** — schema + Strategy C invalidation + parity measurement; **SQL issuance NOT deployed**; **hybrid loader OFF**  
**PR:** #1918

## Delivered in R1 (closure)

| Item | Status |
|------|--------|
| `BatteryHvChargeSessionEvidenceIntegrityAttestation` schema | **YES** |
| Strategy **C_ONLY** invalidation triggers (revision/ACK UPDATE) | **YES** |
| FK CASCADE on revision/ACK DELETE | **YES** |
| `REVOKE ALL` on attestation table from PUBLIC | **YES** |
| Schema-qualified trigger targets (`public.battery_hv_*`) | **YES** |
| Parity SQL helpers (`canonical_utf8`, fingerprint) — **non-authoritative** | **YES** |
| `SECURITY DEFINER` SQL issuance function | **NO** (removed — parity not proven) |
| Exponent / boundary numeric golden corpus | **YES** (documents TS/SQL divergence) |
| JSON-type adversarial TS verifier tests | **YES** |
| Timestamp literal + session timezone fingerprint tests | **YES** |
| R1-C11 / R1-C12 invalidation race (two-connection postgres) | **YES** |
| A3.2 writer attestation integration | **NO** |
| Hybrid durable loader | **NO** |

## Closure verdict (2026-10-07)

| Field | Value |
|-------|--------|
| `SQL_FULL_VERIFY_EQUIVALENT_TO_TS` | **NO_NOT_YET_PROVEN** (exponent ECMAScript formatting; no certified SQL verifier) |
| `SQL_TS_CANONICAL_UTF8_PARITY` (decimal-safe corpus) | **PASS** |
| `SQL_TS_CANONICAL_UTF8_PARITY` (exponent corpus) | **FAIL** (expected; blocks issuance) |
| `SQL_MUST_NOT_ACCEPT_ANY_ROW_TS_REJECTS` | **YES** (vacuous: no SQL issuance; TS adversarial cases reject) |
| `TIMESTAMP_LITERAL_PARITY_WITH_TS` | **YES** (TS rejects non-canonical literals; fingerprint stable across UTC/Berlin/NY session TZ) |
| `ISSUANCE_TIMEZONE_INDEPENDENT` | **YES** (for parity helpers on stored JSON projections) |
| `R1_DECISION` | **FOUNDATION_IMPLEMENTED_ISSUANCE_NOT_CERTIFIED** |

## Canonicalization parity gate

PostgreSQL builds canonical UTF-8 via explicit tuple concatenation, then SHA-256 (`pgcrypto.digest`). Decimal-safe golden corpus must match `buildM3_3HvH4ChargeSessionEvidenceCanonicalUtf8V1` exactly.

**Proven gap:** ECMAScript finite-number text (`1e-7`, `1e21`, `Number.MAX_VALUE`, etc.) does not match PostgreSQL `to_json(double precision)` formatting for the energy `FINITE` slot. Issuance was **not** shipped with a weakened contract.

## Issuance authority

| Field | R1 closure value |
|-------|------------------|
| `PRODUCTION_ROLE_TOPOLOGY_PROVEN` | **NO** |
| `PRODUCTION_PGCRYPTO_CREATE_AUTHORITY_PROVEN` | **NO** (`CREATE EXTENSION IF NOT EXISTS pgcrypto` in migration — deployment prerequisite undocumented for prod role) |
| `ISSUANCE_AUTHORITY_COMPLETE` | **NO** |
| `ISSUANCE_AUTHORITY_CERTIFIED` | **NO** |
| `WRITER_ATTESTATION_INTEGRATED` | **NO** |
| `A3_ATTESTATION_SQL_ISSUANCE_DEPLOYED` | **false** |

## Migration note (TEXT FK parity)

Parent evidence tables use `TEXT` primary keys. Attestation FK columns match **TEXT**, not UUID.

## Next slice

**O2-R2** — proven SQL number formatter + `jsonb_typeof`-hardened verifier (or alternate issuance authority), production role topology, then writer path — still no hybrid loader until certified.

## Safety

No production migration execution, no bootstrap, no loader change.
