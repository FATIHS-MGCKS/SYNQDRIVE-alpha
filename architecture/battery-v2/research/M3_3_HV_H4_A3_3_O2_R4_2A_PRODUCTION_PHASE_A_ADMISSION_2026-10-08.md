# M3.3-HV-H4-A3.3-O2-R4.2A — Authorized production Phase-A admission (preparation)

**Slice:** implementation + isolated PostgreSQL tests + operator runbook.  
**Boundaries:** `PRODUCTION_DB_ACCESS=NO`, `PRODUCTION_SSH=NO`, `PRODUCTION_DEPLOY=NO`, `PRODUCTION_ENV_MUTATION=NO`, `PRODUCTION_ROLE_PROVISIONING=NO`, `PRODUCTION_MIGRATIONS=NO`, `ISSUER_ACTIVATION=NO`, `ATTESTATION_ISSUANCE=NO`, `HYBRID_LOADER_ACTIVATION=NO`.

## 1. Purpose

Prepare a **separate**, fail-closed admission path for **authorized production** Phase-A read-only preflight execution. Reuses the O2-R4.1 SQL runner (`runM3_3HvH4A3PhaseAPreflightV1`) with `admissionPolicy: PRODUCTION_AUTHORIZED_R4_2A`.

This slice does **not** execute against production and does **not** certify issuer architecture or Phase B.

## 2. Admission contract (default DENY)

| Control | Behavior |
|---------|----------|
| Enable flag | `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_PREFLIGHT_ENABLED=1` — **insufficient alone** |
| Approval record | JSON (`M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_RECORD_JSON` or `_PATH`) with change ticket, approving authority, bounded validity, approved target key, execute nonce |
| Execute ack | `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_EXECUTE_ACK=1` + matching `EXECUTE_APPROVAL_ID` + `EXECUTE_NONCE` |
| One-time use | Consumption marker under `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_APPROVAL_CONSUMPTION_DIR` |
| Authentication | `DOCUMENTED_HUMAN_APPROVAL` only — **not** cryptographically authenticated |
| Harness | `M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_INTEGRATION_HARNESS_ACTIVE` **forbidden** on production path |
| Credentials | Rejects canonical reuse of `DATABASE_URL` and issuer URL |

R4.1 isolated loopback policy is **unchanged** for default admission.

## 3. Target identity

Target spec JSON (`M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_JSON`):

- Explicit hostname, port, database, `expectedAuditLogin`
- TLS: when `requireTlsIdentityVerification`, URL must use `sslmode=verify-full` or `verify-ca` (not `disable` / `require` alone)
- Tunnel ambiguity: URL host loopback vs non-loopback spec host → `PHASE_A_PRODUCTION_TUNNEL_IDENTITY_AMBIGUOUS`
- Post-connect: `session_user`, `current_user`, `current_database()`, optional superuser denial

Shared physical database is allowed; authorization is **audit login identity**, not exclusive database name.

## 4. Read-only execution

Unchanged R4.1 guarantees: manifest SELECT-only, `SET TRANSACTION READ ONLY`, no DDL/DML/`SET ROLE`, sanitized JSON report, `productionCertification=NOT_CERTIFIED`, `phaseBCertified=false`.

## 5. Artifacts

| Artifact | Role |
|----------|------|
| `m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.v1.ts` | Approval load/validate |
| `m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-admission.v1.ts` | Production admission gate |
| `m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-target.v1.ts` | Target + TLS policy |
| `m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-session-identity.v1.ts` | Session identity checks |
| `scripts/ops/m3-3-hv-h4-a3-o2-r4-2a-phase-a-production-preflight.ts` | Ops CLI (preparation) |
| `operations/M3_3_HV_H4_A3_PHASE_A_PRODUCTION_PREFLIGHT_RUNBOOK_2026-10-08.md` | Operator runbook |

## 6. Outstanding gaps (R4.2B+)

- Cryptographic approval attestation (optional future)
- Production hostname allowlist registry integration
- Phase-B post-provision certification execution
- Role provisioning runbooks

## 7. References

- R4.1: `M3_3_HV_H4_A3_3_O2_R4_1_PHASE_A_EXECUTABLE_PREFLIGHT_2026-10-08.md`
- O2-R3: `M3_3_HV_H4_A3_3_O2_R3_ISSUER_RUNTIME_TOPOLOGY_PREFLIGHT_2026-10-08.md`
- Preflight spec: `architecture/battery-v2/scripts/m3-3-hv-h4-a3-o2-r3-production-role-preflight.spec.json`
