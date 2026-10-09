# M3.3-HV-H4-A3.3-O2-R4.2B-P0 — Production Phase-A operational readiness (offline)

**Slice:** governance + offline tooling only.  
**Boundaries:** `PRODUCTION_DB_ACCESS=NO`, `PRODUCTION_SSH=NO`, `PRODUCTION_DEPLOY=NO`, `PRODUCTION_ENV_MUTATION=NO`, `PRODUCTION_ROLE_DDL=NO`, `PRODUCTION_MIGRATIONS=NO`, `PRODUCTION_PHASE_A_EXECUTED=NO`, `ISSUER_RUNTIME_ACTIVATION=NO`, `ATTESTATION_ISSUANCE=NO`, `HYBRID_LOADER_ACTIVATION=NO`.

Upstream: merged **R4.2A** (PR #1941) — production admission, TLS/same-session closure, Jest 30 security gate.

## P0-A — Operational readiness audit (evidence matrix)

| Requirement | Repository-proven | CI-proven (isolated) | Production-unverified |
|-------------|-------------------|----------------------|------------------------|
| Explicit change ticket + bounded maintenance window | GO/NO-GO contract + approval `validFrom`/`validUntil` (≤72h) + maintenance window in readiness evaluator | Unit tests on window/maintenance alignment | Real change-system ticket linkage |
| Exact target hostname/port/database/audit login | `parsePhaseAProductionTargetSpecFromEnvV1`, URL↔spec matchers | Postgres integration + TLS fixture | Live production hostname registry |
| Dedicated read-only audit credentials (≠ app / migration / issuer) | `PHASE_A_CANNOT_REUSE_DATABASE_URL`, `PHASE_A_CANNOT_REUSE_ISSUER_DATABASE_URL` | Admission + readiness unit tests | Org provisioning of audit login on prod |
| TLS verify-full + CA + hostname | URL policy + `createPhaseAProductionPrismaClientV1` + `certifyPhaseAProductionTlsIdentityV1` | TLS negative matrix on fixture `:5433` | Production CA trust store on operator host |
| Session identity + privilege denial | `runPhaseAProductionSameSessionGateV1`, session identity module | Postgres integration same PID | Live `session_user` on prod |
| Single-session READ ONLY transaction + manifest-only SQL | R4.1 runner manifest + `SET TRANSACTION READ ONLY` | Runner integration specs | Prod statement timeout tuning |
| One-time approval + replay prevention | Consumption store marker + atomic `wx` consume | Consumption store unit/integration | Ops filesystem permissions on prod store path |
| Secret-free reporting | `redactPostgresDatabaseTargetV1`, `assertNoSecretsInReportPayloadV1` | Redaction unit tests | Operator discipline |
| No prod app flag / schema / issuance changes | GO/NO-GO `authorizationLimits` (all false) | Readiness negative tests | Change board enforcement |

**Claim discipline:** `READY` from offline readiness means **artifact and contract parity only** — not operational readiness to touch production.

## P0-B — GO/NO-GO authorization contract

Contract: `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_V1` (`m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-go-no-go.types.v1.ts`).

| Field group | Purpose |
|-------------|---------|
| `authorizedReleaseSha` | Exact deployed source/release SHA for P1 |
| `changeTicket` + `authorizedHumanApprover` | Human change authorization (documented, not cryptographic) |
| `independentAuthorizationVerification` | **Required** separate verifier identity — must differ from approval author and authorized approver |
| `productionTarget` + `approvalBinding` | Must align with R4.2A approval record and target spec JSON |
| `consumptionStore` | Absolute path + operational owner + marker file name |
| `readOnlySqlScope` | Manifest-only, READ ONLY transaction, bounded timeout |
| `authorizationLimits` | Explicit false for schema, issuance, hybrid loader, attestation writes, app flags |
| `stopConditions`, `incidentHandling`, `evidenceStorageDestination` | Operator stop/evidence contract |

Authentication remains `DOCUMENTED_HUMAN_APPROVAL` on the R4.2A approval record. Possession of a self-authored JSON file is **not** independent verification — the GO/NO-GO record must name a distinct `verifierIdentity`.

## P0-C — Offline dry-run tooling

| Command | Role |
|---------|------|
| `npm run battery:hv-h4:a3-phase-a-production-operational-readiness` | Offline readiness (this slice) |
| `npm run battery:hv-h4:a3-phase-a-production-preflight` | **Future P1 executor** — connects to PostgreSQL when fully authorized |

Readiness evaluator: `evaluatePhaseAProductionOperationalReadinessV1` — no `PrismaClient`, no DNS/TCP to PostgreSQL, no approval consumption, no execute-ack requirement (pre-execution).

Env inputs (non-secret paths/JSON): `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_GO_NO_GO_RECORD_{JSON,PATH}`, existing R4.2A approval/target/URL/consumption env vars, optional `M3_3_HV_H4_A3_PHASE_A_PRODUCTION_AUTHORIZED_RELEASE_SHA`.

Output: `M3_3_HV_H4_A3_PHASE_A_OPERATIONAL_READINESS_REPORT_V1` JSON (`decision`: `READY` | `NO_GO`).

## P0-D — P1 runbook

See `architecture/battery-v2/operations/M3_3_HV_H4_A3_PHASE_A_R4_2B_P1_EXECUTION_RUNBOOK_2026-10-09.md`.

## P0-E — Regression / isolation

No changes to hybrid loader activation, issuer runtime, attestation DML paths, retention/reconciliation, or R4.2A TLS/same-session code paths beyond additive R4.2B modules. No new Prisma migrations.

## P0-F — Validation commands

```bash
cd backend && npm run test:battery:v2:hv-h4
cd backend && npm run test:battery:v2:hv-h4:postgres:ci
cd backend && npm test -- m3-3-hv-h4-a3-3-o2-r4-2b-phase-a-production-operational-readiness
```

## Remaining production gaps (post-P0)

- Independent human verification is a **documented attestation** — not cryptographic proof
- Production audit login provisioning and CA distribution are org-operational
- P1 execution still requires separate human merge/deploy authorization and explicit execute ack
- Phase-B certification and issuer architecture remain out of scope

## References

- R4.2A: `M3_3_HV_H4_A3_3_O2_R4_2A_PRODUCTION_PHASE_A_ADMISSION_2026-10-08.md`
- R4.2A runbook: `operations/M3_3_HV_H4_A3_PHASE_A_PRODUCTION_PREFLIGHT_RUNBOOK_2026-10-08.md`
