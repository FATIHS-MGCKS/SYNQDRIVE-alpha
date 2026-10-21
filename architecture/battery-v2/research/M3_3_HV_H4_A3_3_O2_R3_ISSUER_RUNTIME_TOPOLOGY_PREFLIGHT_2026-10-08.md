# M3.3-HV-H4-A3.3-O2-R3 — Issuer process isolation + production role preflight architecture

**Date:** 2026-10-08  
**Status:** **ARCHITECTURE (repository + CI)** — **not production-certified**  
**Upstream:** O2-R2 merged (#1919) — `2e4c46e401abad2480715dd3a84b76235bb4e7b6`  
**Evidence class:** `REPOSITORY_PROVEN` · `CI_PROVEN` · `PRODUCTION_UNVERIFIED`

## R3 verdict

| Field | Value |
|-------|--------|
| `RECOMMENDED_ISSUER_PROCESS_MODEL` | **SEPARATE_TRUSTED_ISSUER_PROCESS** |
| `SAME_PROCESS_TWO_POOLS_ACCEPTABLE` | **NO** (credential isolation; not a trust boundary) |
| `INTERNAL_ADMISSION_AUTHORITY_DESIGNED` | **PARTIAL (R3-H1)** — future contract only; not active |
| `TENANT_SCOPE_VERIFIED_BY_ISSUER` | **YES** (revision row authoritative) |
| `PRODUCTION_ROLE_PREFLIGHT_DEFINED` | **YES** — Phase A/B V2 (`m3-3-hv-h4-a3-o2-r3-production-role-preflight.spec.json`) |
| `PRODUCTION_ROLE_PREFLIGHT_EXECUTED` | **NO** |
| `PRODUCTION_ROLE_TOPOLOGY_PROVEN` | **NO** |
| `ISOLATED_ISSUER_FACTORY_IMPLEMENTED` | **YES (inert prototype)** |
| `FACTORY_RUNTIME_REGISTERED` | **NO** |
| `ISSUER_RUNTIME_REACHABLE` | **NO** |
| `FACTORY_GENERIC_DATABASE_URL_FALLBACK` | **NO** |
| `SQL_ISSUANCE_SAFE` | **NO** |
| `ISSUANCE_AUTHORITY_CERTIFIED` | **NO** |
| `R3_DECISION` | **SEPARATE_PROCESS_ARCHITECTURE_AND_PREFLIGHT_SPEC_ONLY** |

## 1. Main anchor + drift

- **Main SHA:** `2e4c46e401abad2480715dd3a84b76235bb4e7b6` (O2-R2 merged).
- **Preserved:** O2-R2-H1 lock function, O2-R2-H2 issuer-login isolation, normative TS verifier, invalidation triggers, CI role fixture.
- **No overlap regression:** reconciliation (A3.5), writer (A3.2), hybrid loader, bootstrap, retention unchanged and still unreachable/disabled per constants.

## 2. Current runtime topology audit (repository only)

### `CURRENT_RUNTIME_DB_IDENTITY_MODEL`

| Surface | DB identity source | Notes |
|---------|-------------------|--------|
| Nest `PrismaService` | `process.env.DATABASE_URL` via `registerAs('database')` | Single global `PrismaClient` in `PrismaModule` (`@Global`) |
| API (`main.ts` → `AppModule`) | Same `PrismaService` | HTTP handlers inject shared pool |
| Workers (`WorkersModule` in `AppModule`) | Same `PrismaService` | Schedulers/processors share credentials with API in one process |
| Ad-hoc scripts/tests | `DATABASE_URL` on `new PrismaClient()` | Ops and integration tests |

No second production credential path exists in repository configuration today.

### `CURRENT_API_WORKER_CREDENTIAL_ISOLATION`

**NONE** — API and workers cohabit the same Nest application graph and the same global `PrismaService` bound to `DATABASE_URL`. Deployment scripts on VPS link a single `backend.env` with one database URL pattern (not inspected in R3).

### `CURRENT_ISSUER_PROCESS_EXISTS`

**NO** — isolated issuer functions exist as TypeScript modules only (`issueM3_3HvH4A3IntegrityAttestationIsolatedV1`, O2-R3 admission wrapper). Not registered in any Nest module.

### `CURRENT_ISSUER_RUNTIME_REACHABLE`

**NO** — `A3_ATTESTATION_ISOLATED_TS_ISSUER_RUNTIME_REACHABLE=false`; no env wiring, no worker entrypoint, no HTTP route.

### `APP_CAN_ACCESS_ISSUER_CREDENTIALS`

**YES (if mis-deployed)** — any code in the API/worker process can read environment variables. A second Prisma pool in-process would still expose issuer credentials to full process compromise. **Mitigation:** separate OS process + separate secret injection surface.

## 3. Trust boundary comparison

| Model | Credential isolation | Survives API compromise | R3 verdict |
|-------|---------------------|-------------------------|------------|
| **A** Second Prisma pool in API/worker process | No — same env + memory | No | Reject |
| **B** Dedicated Nest provider in same process | No | No | Reject |
| **C** Separate trusted worker/process + dedicated DB login | Yes | Yes (issuer secret not in API env) | **Select** |
| **D** Standalone internal microservice | Yes | Yes | Valid alternative; higher ops cost |

**Threat model (summary):**

- **Trusted:** issuer process code path, dedicated DB login, internal queue/job admission, audit logs (no secrets).
- **Untrusted:** public HTTP, generic worker jobs, caller-supplied `organizationId` without revision verification.
- **Process identity:** distinct deployment unit (e.g. PM2 app `synqdrive-attestation-issuer` or dedicated worker binary) with `M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL` only on that unit.
- **No public issuer endpoint** — internal job contract only.
- **Failure:** verification mismatch → rollback; no scientific repair; no ACK fabrication.
- **Audit:** log `correlationId`, `requestedBy`, `revisionId`, outcome code — never connection strings.

## 4. Issuance admission authority

**Problem:** `revisionId`-only issuance allows a trusted-but-buggy caller to target another tenant's revision if IDs leak.

**Contract (`M3_3HvH4A3IssuerAdmissionRequestV1`):**

- `organizationId`, `vehicleId`, `revisionId`
- `requestedBy` (trusted workflow identity)
- `correlationId`

**Gate:** `issueM3_3HvH4A3IntegrityAttestationWithAdmissionV1` loads the revision row and `assertM3_3HvH4A3IssuerAdmissionMatchesRevisionV1` before lock/verify/INSERT.

**Repository:** `m3-3-hv-h4-a3-3-o2-r3-issuer-admission.authority.v1.ts`  
**CI:** postgres integration denies wrong `organizationId`; accepts matching scope.

## 5. Production database role topology (design)

Roles are **not** created by application startup. Migrations run as **MIGRATION_OWNER** (existing Prisma migrate identity).

| Role | Minimum privileges |
|------|-------------------|
| **MIGRATION_OWNER** | Own tables/functions; `CREATE EXTENSION` (pgcrypto); deploy migrations |
| **GENERAL_APP_RUNTIME** | `SELECT`/`UPDATE` revision + ACK; **no** attestation `INSERT`/`DELETE`; **no** `EXECUTE` on lock function; **no** `SET ROLE` to issuer |
| **TRUSTED_ATTESTATION_ISSUER** | `SELECT` revision/ACK/attestation; `INSERT` attestation; `EXECUTE` `m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1`; **no** direct `UPDATE` revision/ACK |

**Repository migrations** define trusted `SECURITY DEFINER` functions with `REVOKE PUBLIC`; **CI fixture** `m3_3_hv_h4_a3_r2_*` demonstrates intended grants — **not** production role names.

**Invalidation:** trigger owner must retain `DELETE` on attestation table (migration owner).

## 6. Read-only production preflight

Machine-readable spec:  
`architecture/battery-v2/scripts/m3-3-hv-h4-a3-o2-r3-production-role-preflight.spec.json`

- Permitted future queries: session identity, `pg_roles`, `pg_auth_members`, grants, function owners, `pg_extension`, `_prisma_migrations`, schema `CREATE` privilege.
- **R3:** spec validated in unit test only; **not executed** against Production.

## 7. Inert issuer factory prototype

**Module:** `m3-3-hv-h4-a3-3-o2-r3-issuer-runtime-factory.inert.v1.ts`

- Credential env: `M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL` (no `DATABASE_URL` fallback).
- Fail-closed if missing or equal to `DATABASE_URL`.
- Optional `M3_3_HV_H4_A3_ATTESTATION_ISSUER_EXPECTED_DB_LOGIN` identity check.
- Verifies `session_user` after connect; brands `M3_3HvH4A3IntegrityAttestationIssuerDbV1`.
- **Not** registered in Nest; **not** started in R3.

## 8. Attestation transaction semantics (preserved)

- Normative `verifyDurableEvidenceRevisionForModeALoaderV1` before INSERT.
- Lock via `m3_3_hv_h4_a3_lock_revision_and_ack_for_issuance_v1`.
- Idempotency: unique constraints + concurrent issuance tests (O2-R2-H2) — duplicate concurrent attempts fail closed on verification/constraint, not silent double-issue.

## 9. Scientific safety contract

| Constant | Value |
|----------|--------|
| `CURRENT_VERIFY_ALL_REVISIONS_BEFORE_COLLAPSE` | **YES** (unchanged loader semantics) |
| `SQL_ISSUANCE_SAFE` | **NO** |
| `ISSUER_PRODUCTION_CERTIFIED` / `ISSUANCE_AUTHORITY_CERTIFIED` | **NO** |
| `A3_HYBRID_DURABLE_LOADER_RUNTIME_REACHABLE` | **false** |
| `A3_ATTESTATION_BOOTSTRAP_RUNTIME_REACHABLE` | **false** |

## 10. O2-R3-H1 — admission boundary + preflight phase closure (2026-10-08)

| Field | Value |
|-------|--------|
| `REVISION_TENANT_SCOPE_MATCH_VERIFIED` | **YES** (`issueM3_3HvH4A3IntegrityAttestationWithTenantScopeGateV1`) |
| `REQUESTED_BY_AUTHENTICATED` | **NO** (`requestedBy` is audit metadata only) |
| `INTERNAL_WORKFLOW_ORIGIN_AUTHORIZED` | **NO** (no allowlisted workload gate active) |
| `PRODUCTION_ADMISSION_AUTHORITY_COMPLETE` | **NO** |
| `FUTURE_ADMISSION_AUTHORITY_CONTRACT_DEFINED` | **YES** (`m3-3-hv-h4-a3-3-o2-r3-h1-future-admission-authority.contract.v1.ts`) |
| `FACTORY_EXPECTED_DB_LOGIN_REQUIRED` | **YES** |
| `PRE_PROVISION_PREFLIGHT_DEFINED` | **YES** (Phase A) |
| `POST_PROVISION_CERTIFICATION_DEFINED` | **YES** (Phase B) |
| `EFFECTIVE_PRIVILEGES_CHECKED` | **YES** (spec uses `has_table_privilege` / `has_function_privilege` / `pg_has_role`) |
| `MIGRATION_OWNER_LOGIN_REQUIRED` | **NO** |

**pgcrypto + migration order:** documented in preflight spec `migrationOrder` — R1 `CREATE EXTENSION IF NOT EXISTS pgcrypto` remains a deployment prerequisite; extension owner and migration-owner capability are **production-unverified** until Phase A/B execution.

## 11. Next slice

**O2-R4.1 (2026-10-08):** Executable Phase-A read-only preflight runner + CLI — repository/isolated DB only; see `M3_3_HV_H4_A3_3_O2_R4_1_PHASE_A_EXECUTABLE_PREFLIGHT_2026-10-08.md`.

**O2-R4.2 (recommended):** Human approval gate + authorized read-only **production** Phase-A execution (still no role provisioning / no issuance activation).

**O2-R4.3+ (recommended):** Role provisioning runbook + Phase-B post-provision certification (separate slices).

## Safety

No Production DB/SSH, no deploy, no env mutation in repository, no runtime activation.
