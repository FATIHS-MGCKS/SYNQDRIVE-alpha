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

## 3. Target identity (O2-R4.2A-H1)

Target spec JSON (`M3_3_HV_H4_A3_PHASE_A_PRODUCTION_TARGET_SPEC_JSON`):

- Explicit hostname, port, database, `expectedAuditLogin`
- **`forbidSuperuserSession` must be `true`** — missing/false rejected at parse time
- TLS (H1-A): **only** `sslmode=verify-full` with non-empty `sslrootcert`; rejects `disable`, `allow`, `prefer`, `require`, `verify-ca`, and missing `sslmode`
- Runtime TLS evidence: `pg_stat_ssl` for current backend PID must show `ssl=true` (`verifyPhaseAProductionTlsNegotiationV1`) — URL inspection alone is insufficient
- Tunnel ambiguity: URL host loopback vs non-loopback spec host → `PHASE_A_PRODUCTION_TUNNEL_IDENTITY_AMBIGUOUS`
- Post-connect: `session_user`, `current_user`, `current_database()` must match spec; deny superuser and `rolcreaterole` / `rolcreatedb` / `rolbypassrls`

### H1 certification limits (superseded by H2 for CI)

See **O2-R4.2A-H2** for TLS fixture + same-session authority.

## 4. O2-R4.2A-H2 — TLS identity certification + same-session authority

| Control | Behavior |
|---------|----------|
| TLS fixture | `backend/scripts/test/m3-3-hv-h4-a3-phase-a-tls-postgres-fixture.sh` — ephemeral CA/certs, Docker PostgreSQL 16 SSL on `:5433` |
| Driver proof | Prisma + `@prisma/adapter-pg` with explicit `pg` TLS (`rejectUnauthorized`, CA file, `servername`) for verify-full URLs; connect matrix in CI |
| Production client factory | `createPhaseAProductionPrismaClientV1` **fail-closed** — invalid/missing verify-full or unreadable `sslrootcert` throws stable `PHASE_A_*` codes; **no** default-engine `PrismaClient` fallback |
| `tlsIdentityCertified` | **Not** `pg_stat_ssl.ssl` alone — requires verify-full URL policy re-check + successful verify-full connect + encrypted session on **same** `pg_backend_pid()` as discovery |
| Same session | Production TLS + identity + approval consume + Phase-A discovery share one interactive `READ ONLY` transaction connection |
| PID evidence | `PHASE_A_SESSION_CONTEXT` check data includes `productionSameSessionAnchorPid` / `discoveryBackendPid` on production path |

## 3.1 Connection lifecycle (H1-C)

- `PrismaClient.$disconnect()` in `finally` on every runner path
- Production approval consumption **after** connect, TLS probe, and session identity — **before** `SET TRANSACTION READ ONLY`
- Early `BLOCKED` outcomes must not execute Phase-A discovery SQL

## 3.2 Approval consumption store (H1-D)

- Directory must be absolute, pre-provisioned, non-ephemeral (rejects `/tmp`, etc.)
- Marker file `.synqdrive_phase_a_production_consumption_store_v1` required — **mkdtemp without marker is rejected**
- Atomic exclusive consume via `openSync(..., 'wx')`; approval IDs validated before path join
- **Trust limits:** filesystem replay protection depends on OS permissions, backup/restore discipline, and absence of hostile symlink races on the store path; it does not prove historical human approval cryptographically

## 3.3 Approval validation (H1-E)

- Validity window: reject reversed `validFrom`/`validUntil`, expired, or lifetime **> 72h**
- Malformed JSON / wrong field types → stable reason codes (no raw parse throws to caller)
- `cryptographicAuthentication` remains **false**; `DOCUMENTED_HUMAN_APPROVAL` only
- Evidence `operationStatus`: `ATTEMPTED` → `ADMITTED` (post-identity) → `COMPLETED` (successful report) or blocked/rejected earlier

Shared physical database is allowed; authorization is **audit login identity**, not exclusive database name.

## 4. Read-only execution

Unchanged R4.1 guarantees: manifest SELECT-only, `SET TRANSACTION READ ONLY`, no DDL/DML/`SET ROLE`, sanitized JSON report, `productionCertification=NOT_CERTIFIED`, `phaseBCertified=false`.

## 5. Artifacts

| Artifact | Role |
|----------|------|
| `m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-approval.v1.ts` | Approval load/validate |
| `m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-admission.v1.ts` | Production admission gate |
| `m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-target.v1.ts` | Target + mandatory verify-full TLS URL policy |
| `m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-tls-probe.v1.ts` | Runtime `pg_stat_ssl` negotiation evidence |
| `m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-consumption-store.v1.ts` | Durable consumption store validation + atomic consume |
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
