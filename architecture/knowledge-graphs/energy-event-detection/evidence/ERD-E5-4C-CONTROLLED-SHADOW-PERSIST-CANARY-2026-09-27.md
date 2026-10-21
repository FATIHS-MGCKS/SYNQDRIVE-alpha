# ERD E5.4C — Controlled single-vehicle shadow persist canary (Production)

**Status:** PROVEN_IN_PRODUCTION (bounded authorized mutation only)  
**Evidence ID:** EED-EV-0095  
**Production SHA:** `9322a5d6b6d10240f9af8491cc0106ad8c7ea98d`  
**Production release:** `20260927132448_v4994`  
**Classification:** `CONTROLLED_PERSIST_CANARY_PASS`

## Authorization scope

This evidence proves **only** direct ops invocation of `ErdRechargeShadowParityService.evaluateVehicleWindow({ persist: true })` for one org/vehicle/window. It does **not** authorize global `ERD_RECHARGE_SHADOW_PARITY_ENABLED` or automatic runtime hook persistence.

| Field | Value |
|-------|--------|
| Organization | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| Vehicle | `68868291-5478-42cd-b0c4-cc77b2a78e21` |
| Window from | `2026-09-18T17:33:50.599Z` |
| Window to | `2026-09-26T00:26:23.525Z` |

## Live release seal (Phase A)

- Both `current` and release `20260927132448_v4994` at SHA `9322a5d6…`
- Comparator `erd_recharge_shadow_comparator_v2`
- Pairing `erd_recharge_shadow_pairing_v1`
- Parity classification v2
- Projection meta version **2**

## Safety flags (Phase B — read only, unchanged)

All required ERD/E6.3 cutover and shadow-global flags **absent/false**. Effective RECHARGE write authority remained **LEGACY**.

## Pre-write durable snapshot (Phase C)

| Metric | Pre |
|--------|-----|
| Global shadow rows | 0 |
| Scope shadow rows | 0 |
| Canonical ERD RECHARGE VEE | 0 |
| HV charge sessions | 6 |
| E6.3 enrichment rows | 0 |
| Legacy RECHARGE VEE (org-wide table count) | 176 |

## Database backup (Phase D)

### Pre-write backup (intended, before authorized mutation)

| Field | Value |
|-------|--------|
| `PRE_WRITE_DB_BACKUP_ATTEMPTED` | YES |
| `PRE_WRITE_DB_BACKUP_VERIFIED` | NO |
| `PRE_WRITE_DB_BACKUP_FAILURE_REASON` | `PRISMA_URI_SCHEMA_QUERY_PARAM_UNSUPPORTED_BY_PG_DUMP` |
| Intended path (invalid / do not use) | `/opt/synqdrive/shared/backups/db-pre-erd-e5-4-controlled-persist-20260927143711.sql.gz` |

The ephemeral runner invoked `pg_dump "$DATABASE_URL"` with the Prisma `DATABASE_URL`, which includes a query parameter such as `?schema=…`. `pg_dump` rejected the URI: `invalid URI query parameter: "schema"`. The file at the intended path is **not** a valid backup and must not be used for rollback.

`AUTHORIZED_MUTATION_PROCEEDED_WITHOUT_VALID_PREWRITE_DB_BACKUP=YES` — the canary mutation ran after this failure. **No rows were deleted to recover.**

### Post-canary backup (after mutation completed)

| Field | Value |
|-------|--------|
| `POST_CANARY_DB_BACKUP_VERIFIED` | YES |
| `POST_CANARY_DB_BACKUP_PATH` | `/opt/synqdrive/shared/backups/db-pre-erd-e5-4-controlled-persist-20260927143711-retry.sql.gz` |
| Size | ~86 MB, non-empty gzip |
| `POST_CANARY_BACKUP_IS_VALID_ROLLBACK_SNAPSHOT_FOR_PRE_CANARY_STATE` | **NO** |

This retry used a pg_dump-compatible PostgreSQL URI (Prisma-only query parameters stripped before `?`). It confirms a corrected `pg_dump` invocation works on Production. It was captured **after** the 12 shadow rows were persisted. It is a valid **post-canary** database backup only; it **cannot** reconstruct the exact pre-canary database state (pre-canary had zero shadow rows; post-canary has twelve).

## Operational control deviation

This section records process deviation separately from the functional canary outcome.

| Field | Value |
|-------|--------|
| `PREWRITE_BACKUP_CONTROL` | FAILED |
| `CANARY_EXECUTION_AFTER_BACKUP_FAILURE` | YES |
| `FUNCTIONAL_CANARY_RESULT` | PASS (`CONTROLLED_PERSIST_CANARY_PASS`) |
| `ROLLBACK_SNAPSHOT_PRE_CANARY_AVAILABLE` | NO |

Classification: **operational process deviation**, not a runtime correctness failure. Durable behavior was still independently proven (12 authorized rows, idempotent dedupe, stable fingerprints/row IDs, no product/provider mutation, global flag off, LEGACY write authority).

## Future Production mutation hard gate

Before **any** further EED Production mutation that requires a database backup:

1. Convert Prisma `DATABASE_URL` into a pg_dump-compatible PostgreSQL URI by safely removing Prisma-only query parameters (e.g. `schema`) without logging or printing credentials.
2. Run `pg_dump`, gzip output, and verify the artifact exists and is non-empty **before** the mutation starts.

`FUTURE_PRODUCTION_MUTATION_WITHOUT_VERIFIED_PREWRITE_BACKUP_ALLOWED=NO`

## Backup tooling follow-up (no implementation in this evidence PR)

Register follow-up (separate workstream): create or reuse a safe helper aligned with existing deployment backup patterns (e.g. `vps-deploy-release.sh` uses `sudo -u postgres pg_dump synqdrive`) that:

- Preserves host, port, user, password, and database name
- Strips Prisma-only URI query parameters
- Never prints credentials
- Fails closed on empty or missing gzip output

No Production mutation is authorized by this follow-up note alone.

## Step 3 prewrite seal (`persist: false`)

| Field | Value |
|-------|--------|
| Result | `SKIPPED_FLAG_OFF` |
| Observations | 12 |
| Settled parity | 6 / 6 (rate 1) |
| Report | Matches Step 3 (`canonicalPhysicalEpisodeCount=6`, `legacyRowCount=70`, `legacyFragmentRowCount=64`, `pairedExactCount=4`, `pairedSemanticCount=2`, `fieldMismatchCount=0`) |

### Authorized fingerprints (12 unique)

```
042fb11765d53eed26007f68d80719367a3a5776ab297f1268c9eb91ead4fbce
16a0b8477e966a56fad69f8213c8243a43a64d98a6b75f0202e5984b6665711b
1827866293bb0c889049d600bbfaa60cfa7e34540d45af09f357a0ca2d3fe3a6
6adb1a8f53eba7ecb96ba822b351239df3dd6e8b9312e26d607eb25b4a4f51bf
6dce2ddb8c190616825b185e5bc1f2e99d67f3fce0111ee2448e0dce966cc55d
7137e84459ca89302d8b5ed1d1ba7b2d28be610fd321037792706534855189e4
8aa257e4168af130c474c18552a4b9945a03d2d29979de2667da5de1c4b0ecb8
958ef01d2019694baa76dd8a6cfb33a3e8775ddcd6a90a828f9c584c159792a4
dea6ba3402a1051a476491830b0034461b98f62a4ebb55b1093ee784ab014d3c
e0569b450457286db28cbe9b51530f325de4756bda71bf4f988e9e54d41cbbfa
f8664052c9da930a4492184584bcf866e87f9f392bddc76ca3ee08beda4b4520
ffb818a250d32ab4152c1851875802b3d98a151f37ea6788430cda15cbbd5056
```

### Observation composition

- Primary: 4 `EXACT_MATCH`, 2 `SEMANTIC_MATCH`, 0 `FIELD_MISMATCH` (all `pairingEvidence=EXACT_NATIVE_DIMO_ID`, `finality=SETTLED`)
- Topology: 6 `MULTIPLE_LEGACY_ONE_CANONICAL` (64 unique fragment IDs across `fieldDiff.relatedLegacyVehicleEnergyEventIds`)
- Other classes: 0

## Run 1 — `persist: true` (direct service, no runtime hook)

| Field | Value |
|-------|--------|
| Service result | `PERSISTED` |
| Created / updated / deduped | 12 / 0 / 0 |
| Scope + global shadow rows | 12 |
| Durable fingerprint set | Equals authorized set |
| Draft field parity | PASS |
| Primary stored-energy totals (six pairs) | 48.75999891012907 kWh canonical vs legacy snapshots (per-row parity PASS) |

## Run 2 — identical `persist: true`

| Field | Value |
|-------|--------|
| Service result | `DEDUPED` |
| Created / updated / deduped | 0 / 0 / 12 |
| Row count delta | 0 (remains 12) |
| Fingerprints | Identical prewrite / run1 / run2 / DB |
| Row ids + createdAt + updatedAt + evaluatedAt | Stable across run 2 |

## Product and provider firewall (Phases T, U, W)

| Table / signal | Delta |
|----------------|-------|
| Canonical ERD RECHARGE VEE | 0 |
| Legacy RECHARGE VEE | 0 |
| HV charge sessions | 0 |
| E6.3 enrichment | 0 |
| DIMO provider calls / mutations | 0 |
| Webhook mutations | 0 |
| Env changes | 0 |
| `ERD_RECHARGE_SHADOW_PARITY_ENABLED` post-canary | false |

## Explicit non-goals (honored)

No global shadow flag, no deploy/restart, no cutover/dedupe/E6.3 enablement, no canonical VEE writes, no legacy/HV mutation, no provider access, no other org/vehicle/window, no deletion of pre-existing shadow rows.

## Machine-readable artifact

Production runner output (ephemeral script, not committed): `/tmp/erd-e5-4-controlled-persist-evidence.json` on VPS; copy archived at `/opt/cursor/artifacts/erd-e5-4-controlled-persist-evidence.json` in Cloud Agent artifacts.

## Next stage

`ERD_E5_4_GLOBAL_SHADOW_PERSIST_FLAG_DECISION_OR_SCOPED_RUNTIME` — separate decision required before any global automatic persistence.
