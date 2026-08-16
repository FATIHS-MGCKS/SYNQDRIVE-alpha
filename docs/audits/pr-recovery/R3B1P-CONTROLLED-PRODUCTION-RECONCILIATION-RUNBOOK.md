# R3B1P — Controlled Production Reconciliation Runbook

**Phase:** `CI-R3B1P` (read-only preflight — no production mutations executed)
**Generated:** `2026-08-16T08:48:41.934975+00:00`
**Final status:** `CI_R3B1P_CONTROLLED_PRODUCTION_RECONCILIATION_PREFLIGHT_COMPLETED`
**R3B1Q readiness:** `R3B1Q_READY_SEPARATELY_AUTHORIZED_PRODUCTION_EXECUTION`

## Scope

Read-only preflight and frozen execution runbook for the separately authorized R3B1Q production execution phase.
PR #1054 remains unmerged. No resolve, deploy, DDL, or DML was executed against Production during R3B1P.

## Inherited accepted R3B1O state

- `CI_R3B1O4_APPEND_ONLY_TAIL_RECONCILIATION_STRATEGY_COMPLETED`
- `R3B1P_READY_CONTROLLED_RECONCILIATION_PLAN`
- Golden tests 169/169; catalog authority 53/53; repeat deploy idempotent

## Source authority snapshot

- Branch: `audit/ci-r3b1o4-tail-reconciliation-strategy-closure-2026-08`
- HEAD: `f3f780998e1002f7f06fe9b2f1022c95be9ae87b`
- SOURCE_IMMUTABLE: **True**
- Execution set: **22** migrations + append-only tail

## Fresh Production snapshot

- Ledger fingerprint: `6fcda6dc1f83b15d4b70d7be571bfdf8bd0a78b5f1eed7b3f7410ee70be237a7`
- Catalog fingerprint: `38063aba14a7a21e464a5d1aacdeb12de5b65f4a127f43056a746766bfaa32f7`
- Schema semantic match vs R3B1O golden dump: **True**
- M252 table absent: **True**

## R3B authority results

Canonical ambiguity-corrective golden suite re-run locally; production starting state compatible with golden-derived strategy entry.

## M252 parity (pre-execution)

- M252 objects absent: **True**
- Synthetic creator count: **0** (tooling gate)

## Prisma diff classification

- TOTAL_DIFF operations: **399**
- PRE_EXISTING: **394**
- AUTHORIZED_STRATEGY: **5**
- R3B_SCOPE (gate): **0** (total scoped: 1)
- M252_SCOPE (gate): **0** (total scoped: 5)
- NEW_STRATEGY_DRIFT: **0**
- UNATTRIBUTED: **0**

## Golden / negative test result

- TOTAL: **169**
- PASSED: **169**
- FAILED: **0**
- SKIPPED: **0**

## Production immutability proof

- R3B1P_PRODUCTION_MUTATION_COUNT: **0**
- PRODUCTION_IMMUTABLE: **True**

## Exact future execution topology

1. R3B1G resolve --applied
2. R3B1I resolve --applied
3. Normal pending migrations (`prisma migrate deploy`)
4. Append-only 3-task reconciliation tail (`prisma migrate deploy`)
5. Final verification (M252 parity, R3B parity, diff classification)
6. Second deploy idempotency verification (tail remains installed)

## Command-by-command runbook

### Step 1 — RESOLVE

- Command: `prisma migrate resolve --applied "20260716182730_ci_r3b_tire_setup_status_predecessor"`
- Mutation: **MUTATING**
- Stop if: `exit code != 0 OR finished_at IS NULL after resolve`

### Step 2 — RESOLVE

- Command: `prisma migrate resolve --applied "20260721245000_ci_r3b_iam_membership_permissions_predecessor"`
- Mutation: **MUTATING**
- Stop if: `exit code != 0 OR finished_at IS NULL after resolve`

### Step 3 — NORMAL_DEPLOY

- Command: `npm run prisma:migrate:deploy`
- Mutation: **MUTATING**
- Stop if: `exit code != 0 OR new failed ledger rows OR NEW_STRATEGY_DRIFT != 0`

### Step 4 — APPEND_ONLY_TAIL

- Command: `npm run prisma:migrate:deploy`
- Mutation: **MUTATING**
- Stop if: `tail deploy exit != 0 OR stale indexes remain OR M252 parity != 0`

### Step 5 — FINAL_VERIFICATION

- Command: `['npm run prisma:migrate:deploy', 'prisma migrate diff classification', 'M252 exact parity', 'R3B exact parity']`
- Mutation: **READ_ONLY except second deploy command is MUTATING idempotency proof**
- Stop if: `second deploy new ledger rows != 0 OR catalog delta != 0`

## Resolve semantics

Both resolves use `--applied` because predecessor effects already exist in the production catalog and only ledger reconciliation is required.

## Pending migration inventory

Frozen execution set count: **22** (see `ci-r3b1p-source-authority-2026-08.json`).

## Append-only tail identity

- Tail SQL SHA256: `c158dcbbd2eb78d081d4851714dec28b0e304374eb272ec7cfe88f999cdcd899`
- Exactly three tasks: M252 forward, invoice stale drop, WhatsApp stale drop

## Stale index identities

- `org_invoices_invoice_number_key` — invoice stale recovery index
- `whatsapp_conversations_organization_id_contact_phone_key` — WhatsApp stale recovery index

## Transaction / failure semantics

Each Prisma migration runs in its own transaction unless the SQL block contains explicit transaction control.
A failed tail deploy may leave partial catalog objects; stop immediately and escalate — do not retry without classifying ledger + catalog state.

## Concurrency / quiescence

Schema-only DDL reconciliation requires brief write quiescence or maintenance window for deterministic lock behavior.
Pause deploy pipelines and background schema mutators during R3B1Q execution.

## Target / environment guard

Before R3B1Q: confirm `PRODUCTION_TARGET_CONFIRMED=true` via instance fingerprint, database name, and host allowlist.
Use placeholder `<PRODUCTION_DATABASE_URL>` in operator scripts; never commit secrets.

## Backup / recovery prerequisite

Mandatory fresh PostgreSQL backup immediately before R3B1Q mutating steps.
Verify restore drill ownership and rollback path before resolve/deploy.

## GO / NO-GO matrix

| Gate | Status |
|------|--------|
| PR_UNMERGED | GO |
| SOURCE_IMMUTABLE | GO |
| PRODUCTION_TARGET_CONFIRMED | GO |
| PRODUCTION_IMMUTABLE | GO |
| R3B_AUTHORITY_PARITY | GO |
| M252_PARITY | GO |
| GOLDEN_TESTS | GO |
| FULL_DIFF_CLASSIFICATION | GO |
| R3B_SCOPE_ZERO | GO |
| M252_SCOPE_ZERO | GO |
| UNKNOWN_SCOPE_ZERO | GO |
| NEW_STRATEGY_DRIFT_ZERO | GO |
| UNATTRIBUTED_ZERO | GO |
| UNAUTHORIZED_ZERO | GO |
| AMBIGUOUS_ZERO | GO |
| STATEMENT_UNBOUND_ZERO | GO |
| KEY_ONLY_AUTHORIZATION_ZERO | GO |
| STATEMENT_SHA_MATCH | GO |
| EVIDENCE_CODE_MATCH | GO |
| R3B1G_RESOLVE_UNAMBIGUOUS | GO |
| R3B1I_RESOLVE_UNAMBIGUOUS | GO |
| PENDING_MIGRATION_SET_FROZEN | GO |
| TAIL_SHA_FROZEN | GO |
| STALE_INDEX_IDENTITIES_CONFIRMED | GO |
| FAILURE_SEMANTICS_DOCUMENTED | GO |
| OPERATOR_TARGET_GUARD_DEFINED | GO |
| BACKUP_REQUIREMENT_DEFINED | GO |
| EXECUTION_RUNBOOK_COMPLETE | GO |

## Final machine-readable status

`CI_R3B1P_CONTROLLED_PRODUCTION_RECONCILIATION_PREFLIGHT_COMPLETED`
`R3B1Q_READINESS = R3B1Q_READY_SEPARATELY_AUTHORIZED_PRODUCTION_EXECUTION`

## Explicit statement

**Production mutations executed during R3B1P: 0**

**PR #1054 MUST NOT BE MERGED YET. NO PRODUCTION EXECUTION WAS PERFORMED.**

**Changes / Architektur:** not updated (preflight evidence scope only).
