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

The ephemeral runner’s inline `pg_dump "$DATABASE_URL"` failed pre-mutation because the Prisma URI includes a `schema` query parameter (`invalid URI query parameter: "schema"`). **No rows were deleted to recover.**

Post-canary remediation (URI stripped before `?`):

- **Verified backup:** `/opt/synqdrive/shared/backups/db-pre-erd-e5-4-controlled-persist-20260927143711-retry.sql.gz` (~86 MB, non-empty)
- Inline path recorded by runner (empty/failed): `/opt/synqdrive/shared/backups/db-pre-erd-e5-4-controlled-persist-20260927143711.sql.gz`

Ops should treat the **retry** artifact as the durable snapshot reference for this canary; future runners must strip `DATABASE_URL` query params before `pg_dump`.

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
