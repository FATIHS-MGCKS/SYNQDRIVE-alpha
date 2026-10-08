# M3.3-HV-H4-A3.3-O2-R2 — Issuance authority + canonical parity + role isolation

**Date:** 2026-10-08  
**Status:** **PROTOTYPE (repository + isolated PostgreSQL)** — **not production-certified**  
**Upstream:** O2-R1 merged (#1918) — `FOUNDATION_IMPLEMENTED_ISSUANCE_NOT_CERTIFIED`

## R2 verdict

| Field | Value |
|-------|--------|
| `PREFERRED_ISSUANCE_MODEL` | **B — isolated trusted TypeScript issuer** |
| `SQL_ISSUANCE_SAFE` | **NO** (ECMAScript binary64 text ≠ PostgreSQL `to_json(double precision)` for exponent/boundary corpus + randomized binary64) |
| `ISOLATED_TS_ISSUER_SAFE` | **YES (repository prototype)** — full `verifyDurableEvidenceRevisionForModeALoaderV1` gate, transactional row locks, INSERT under narrow issuer role |
| `ISSUANCE_AUTHORITY_COMPLETE` | **NO** |
| `ISSUANCE_AUTHORITY_CERTIFIED` | **NO** |
| `PRODUCTION_ROLE_TOPOLOGY_PROVEN` | **NO** |
| `PRODUCTION_PGCRYPTO_AUTHORITY_PROVEN` | **NO** |
| `R2_DECISION` | **ISOLATED_TS_ISSUER_PROTOTYPE_ROLE_HARDENING_SQL_ISSUANCE_DEFERRED** (retained after O2-R2-H1) |

## O2-R2-H1 — issuer role + lock authority hardening (2026-10-08)

| Field | Value |
|-------|--------|
| `ISSUER_CALLER_CONTROLLED_ROLE` | **NO** — removed `trustedIssuerPostgresRole` and `SET LOCAL ROLE` from issuer |
| `DYNAMIC_SET_ROLE_IN_ISSUER` | **NO** |
| `ISSUER_FOR_UPDATE_WITH_SELECT_ONLY` | **REJECTED** (PostgreSQL requires table `UPDATE` for `FOR UPDATE`) |
| `ISSUER_ROLE_CAN_ACQUIRE_REQUIRED_LOCKS` | **YES** via `m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1` (`SECURITY DEFINER`, fixed `search_path`, `REVOKE PUBLIC`) |
| `RECOMMENDED_LOCK_AUTHORITY_MODEL` | **SECURITY_DEFINER_NARROW_ROW_LOCK_V1** |
| `GENERIC_APP_CAN_SWITCH_TO_ISSUER` | **NO** (repository CI roles) |
| `GENERIC_APP_CAN_DIRECT_INSERT` | **NO** |
| `ISSUER_CONNECTION_IDENTITY_DISTINCT` | **YES** (separate session-bound Prisma clients in CI — not production-certified) |

**Issuer boundary (explicit):** Isolated TS process + dedicated DB credentials are trusted to call `verifyDurableEvidenceRevisionForModeALoaderV1` before `INSERT`. The database does **not** cryptographically prove the verifier ran; it only enforces privileges, row locks, invalidation triggers, and uniqueness. Generic application pools must not hold issuer credentials.

**Concurrency:** R2_H1_C1–C7 use two-connection overlap (issuer session vs restricted app session), not sequential mislabeling.

## Delivered

1. **Migration R2** — `SECURITY DEFINER` invalidation trigger functions (fixed `search_path`, schema-qualified deletes). Restricted app role may `UPDATE` revision/ACK without `DELETE` on attestation table.
2. **CI role fixture** — `m3_3_hv_h4_a3_r2_app_restricted`, `m3_3_hv_h4_a3_r2_attestation_issuer` with grants proving separation (not production topology).
3. **Isolated TS issuer** — `issueM3_3HvH4A3IntegrityAttestationIsolatedV1(issuerDb, …)` requires infrastructure-bound `issuerDb` (not wired to Nest; `A3_ATTESTATION_ISOLATED_TS_ISSUER_RUNTIME_REACHABLE=false`).
4. **R2-H1 migration** — `m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1` for SELECT-only issuer row locks.
5. **Numeric parity** — decimal-safe FINITE vectors pass SQL↔TS; explicit exponent/boundary + 256 deterministic randomized binary64 cases fail (documented mismatch count > 0).
6. **Concurrency** — R2_H1_C1–C7 true overlap harness on issuer + restricted app sessions.

## SQL issuance (model A)

Not implemented. R1 parity helpers remain **non-authoritative**. No `SECURITY DEFINER` SQL verifier/issuance function added.

Full TS verifier equivalence in SQL would require ECMAScript-identical finite-number formatting and strict JSON-type guards beyond R1 helpers — not proven in R2.

## Production preflight (repo-only)

- **pgcrypto:** R1 migration may require `CREATE EXTENSION` privilege; not rewritten (merged). Document deployment prerequisite or pre-provisioned extension.
- **Roles:** Map `m3_3_hv_h4_a3_r2_*` CI roles to production role names separately; repository tests do **not** certify production grants.
- **Hybrid loader / writer:** unchanged; attestations not consumed by loader.

## Next slice

**O2-R3** — production role topology audit (read-only, authorized), optional narrow SQL numeric formatter research, writer integration behind feature flag only after certification.

## Safety

No production DB, deploy, bootstrap, retention, or hybrid loader changes.
