# M3.3-HV-H4-A3.3-O2-R4.1 — Executable Phase-A read-only preflight

**Slice:** implementation + isolated PostgreSQL tests only.  
**Boundaries:** `PRODUCTION_DB_ACCESS=NO`, `PRODUCTION_SSH=NO`, `PRODUCTION_DEPLOY=NO`, `ROLE_PROVISIONING=NO`, `MIGRATIONS_APPLIED=NO`, `ISSUER_RUNTIME_ACTIVATION=NO`, `ATTESTATION_ISSUANCE=NO`.

## 1. Purpose

Deliver a **standalone, reusable** Phase-A (`PRE_PROVISION_READ_ONLY`) runner and ops CLI that executes the discovery checks defined in the O2-R3-H1 preflight spec **without** certifying Phase B, **without** Nest/worker coupling, and **without** implicit reuse of application or issuer database credentials.

Isolated fixture tests prove read-only enforcement and classification behavior; they **do not** certify production safety.

## 2. Artifacts

| Artifact | Role |
|----------|------|
| `m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.types.v1.ts` | Contract, statuses, report shape (`phaseBCertified` always false) |
| `m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.query-manifest.v1.ts` | Approved SELECT-only SQL manifest |
| `m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.config.v1.ts` | Fail-closed env parsing (dedicated URL only) |
| `m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.runner.v1.ts` | `SET TRANSACTION READ ONLY` transaction runner |
| `m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.redaction.v1.ts` | URL redaction + report credential leak guard |
| `backend/scripts/ops/m3-3-hv-h4-a3-o2-r4-1-phase-a-preflight.ts` | CLI (exit 0 complete / 1 blocked / 2 error / 3 incomplete) |

Spec alignment: `architecture/battery-v2/scripts/m3-3-hv-h4-a3-o2-r3-production-role-preflight.spec.json` (Phase A discovery).

## 3. Status semantics

| Status | Meaning |
|--------|---------|
| `PASS` | Check executed; expected signal present |
| `NOT_PROVISIONED` | Named future production role does not exist |
| `NOT_PRESENT` | Expected extension/table/function not in catalog |
| `SKIPPED` | Prerequisite role/object missing (e.g. effective privileges) |
| `BLOCKED` | Runner/config refused execution (not used for SQL discovery) |
| `ERROR` | Unexpected failure (connection, privilege on catalog query, etc.) |

`phaseBCertificationStatus` and `productionCertification` are always **`NOT_CERTIFIED`**. Incomplete Phase A (`phaseAExecutionComplete=false`) must not imply Phase B readiness.

## 4. Configuration (repository / isolated DB only)

**Default: OFF.** Both are required to run the CLI:

- `M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ENABLED=1` (or `true` / `yes`)
- `M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_DATABASE_URL` — dedicated URL only

**Rejected:**

- Same target as `DATABASE_URL` or `M3_3_HV_H4_A3_ATTESTATION_ISSUER_DATABASE_URL` (canonical host/db/login key)
- Hostnames matching production blocklist (`app.synqdrive.eu`, `hstgr.cloud`, etc.)

There is **no** fallback to `DATABASE_URL` for execution.

### Operator command (isolated database)

```bash
cd backend
M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ENABLED=1 \
M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_DATABASE_URL='postgresql://audit_login@127.0.0.1:5432/phase_a_isolated' \
  npm run battery:hv-h4:a3-phase-a-preflight
```

Or:

```bash
npx ts-node -r tsconfig-paths/register scripts/ops/m3-3-hv-h4-a3-o2-r4-1-phase-a-preflight.ts
```

**Do not run this slice against production.** Production read-only execution is gated on **O2-R4.2** (human approval + authorized target).

## 5. SQL safety

- All statements come from the manifest; validated as read-only SELECT at load (shared R3-H1 validator).
- Runner rejects multi-statement strings.
- `_prisma_migrations` and battery objects are referenced only after `to_regclass` guards (planning-safe).
- Transaction explicitly `SET TRANSACTION READ ONLY`; mutations cannot commit.

## 6. O2-R4.2 — human approval gate (future, not in R4.1)

Before any **authorized production** Phase-A run:

1. Explicit change ticket + security sign-off recorded out-of-band.
2. Dedicated read-only audit login URL provisioned (not app/issuer pools).
3. `M3_3_HV_H4_A3_PHASE_A_PREFLIGHT_ENABLED` + production-safe URL allowlist policy (separate slice).
4. Operator attests `PRODUCTION_DB_ACCESS=AUTHORIZED_READ_ONLY` in run evidence.
5. Phase B provisioning / post-provision certification remain **separate** slices (no role DDL in R4.1/R4.2 Phase A).

R4.1 does **not** implement R4.2 gates or production hostname allowlisting beyond fail-closed blocklist for accidental misuse.

## 7. Validation

- Unit: config fail-closed, manifest read-only, query rejection, connection failure, redaction.
- PostgreSQL integration (`BATTERY_HV_H4_REPORT_INTEGRATION=1`): read-only mutation proof, role `NOT_PROVISIONED`, empty DB `NOT_PRESENT` for migrations (when `CREATE DATABASE` permitted).

## 8. References

- O2-R3 topology: `M3_3_HV_H4_A3_3_O2_R3_ISSUER_RUNTIME_TOPOLOGY_PREFLIGHT_2026-10-08.md`
- O2-R2 issuance: `M3_3_HV_H4_A3_3_O2_R2_ISSUANCE_AUTHORITY_2026-10-08.md`
- Durable A3: `M3_3_HV_H4_A3_DURABLE_EXPOSURE_MATERIALIZATION_ARCHITECTURE_2026-10-02.md` §16 (A3.3-O2-R4.1 row)
