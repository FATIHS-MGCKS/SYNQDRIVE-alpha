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

## O2-R2-H2 — true issuer-login isolation + lock-observed concurrency (2026-10-08)

| Field | Value |
|-------|--------|
| `ISSUER_FACTORY_USES_REAL_ISSUER_LOGIN` | **YES** — `createIssuerLoginPostgresClientV1` authenticates as `m3_3_hv_h4_a3_r2_issuer_login` (CI fixture only) |
| `ADMIN_ROLE_SWITCH_USED_FOR_H2_ISSUANCE` | **NO** — H2 corpus uses issuer-login + app-login clients; admin seeds/cleans only |
| `REAL_ISSUER_LOGIN_ISSUANCE` | **PASS_POSTGRES** (isolated CI) |
| `REVISION_UPDATE_ACTUALLY_BLOCKED` | **YES** — `pg_blocking_pids` observer (H2-C1) |
| `ACK_UPDATE_ACTUALLY_BLOCKED` | **YES** — `pg_blocking_pids` observer (H2-C3) |
| `ISSUER_TYPE_BOUNDARY_HARDENED` | **PARTIAL** — branded `M3_3HvH4A3IntegrityAttestationIssuerDbV1` + `brandM3_3HvH4A3IntegrityAttestationIssuerDbV1`; no Nest runtime factory yet |
| `ISSUANCE_AUTHORITY_CERTIFIED` | **NO** — production credentials/topology not independently certified |

**H2 corpus:** H2-C1–C7 on issuer-login issuance; H2-C8 on app-login denial (identity spec). H1 admin `SET LOCAL ROLE` harness retained as regression only.

**SECURITY DEFINER lock review (`m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1`):** fixed `search_path = pg_catalog, public`; schema-qualified revision/ACK `FOR UPDATE`; no dynamic SQL; `REVOKE ALL FROM PUBLIC`; app login `EXECUTE` denied; issuer login `EXECUTE` granted in CI fixture; locks held until issuer transaction ends; rollback releases locks. Issuer roles do not receive broad `UPDATE` on revision/ACK — locks remain via definer function only.

## Delivered

1. **Migration R2** — `SECURITY DEFINER` invalidation trigger functions (fixed `search_path`, schema-qualified deletes). Restricted app role may `UPDATE` revision/ACK without `DELETE` on attestation table.
2. **CI role fixture** — `m3_3_hv_h4_a3_r2_app_restricted`, `m3_3_hv_h4_a3_r2_attestation_issuer` with grants proving separation (not production topology).
3. **Isolated TS issuer** — `issueM3_3HvH4A3IntegrityAttestationIsolatedV1(issuerDb, …)` requires infrastructure-bound `issuerDb` (not wired to Nest; `A3_ATTESTATION_ISOLATED_TS_ISSUER_RUNTIME_REACHABLE=false`).
4. **R2-H1 migration** — `m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1` for SELECT-only issuer row locks.
5. **Numeric parity** — decimal-safe FINITE vectors pass SQL↔TS; explicit exponent/boundary + 256 deterministic randomized binary64 cases fail (documented mismatch count > 0).
6. **Concurrency** — R2_H1_C1–C7 (admin role-switch regression); O2-R2-H2 H2-C1–C8 on true issuer-login + app-login with `pg_blocking_pids` evidence.

## SQL issuance (model A)

Not implemented. R1 parity helpers remain **non-authoritative**. No `SECURITY DEFINER` SQL verifier/issuance function added.

Full TS verifier equivalence in SQL would require ECMAScript-identical finite-number formatting and strict JSON-type guards beyond R1 helpers — not proven in R2.

## Production preflight (repo-only)

- **pgcrypto:** R1 migration may require `CREATE EXTENSION` privilege; not rewritten (merged). Document deployment prerequisite or pre-provisioned extension.
- **Roles:** Map `m3_3_hv_h4_a3_r2_*` CI roles to production role names separately; repository tests do **not** certify production grants.
- **Hybrid loader / writer:** unchanged; attestations not consumed by loader.

## Next slice

**O2-R3** — **COMPLETE (architecture, 2026-10-08)** — separate trusted issuer process model, admission authority, inert factory, read-only preflight spec; see `M3_3_HV_H4_A3_3_O2_R3_ISSUER_RUNTIME_TOPOLOGY_PREFLIGHT_2026-10-08.md`. **O2-R4.1** — **COMPLETE (repository runner, 2026-10-08)** — executable Phase-A read-only preflight (isolated tests only); see `M3_3_HV_H4_A3_3_O2_R4_1_PHASE_A_EXECUTABLE_PREFLIGHT_2026-10-08.md`. **Next: O2-R4.2** — human approval gate + authorized production read-only Phase A (no provisioning / no issuance activation).

## Safety

No production DB, deploy, bootstrap, retention, or hybrid loader changes.
