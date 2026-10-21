# VDC RB-019 Phase 2 P2.3 — Evidence Writers + STATEFUL_SHADOW Proof

| Field | Value |
|-------|-------|
| **Date** | 2026-09-14 (hardened same day — independent review blockers A–D; semantic + binding-identity micro-closure same day) |
| **Authority** | Vehicle & Device Connectivity (`AUDIT_IN_PROGRESS`) |
| **Baseline main** | `4370ea53c4522036099b408f292f5046ca638128` (P2.2 merge #1638) |
| **Accepted pre-doc runtime HEAD** | `6658634e9a3a884ed3b415b8a79f2ff8b3028cf4` (PR #1640 — micro-closure runtime) |
| **Epistemic** | **P2_3_IMPLEMENTATION_PRESENT** — semantic correctness closure complete; pre-cutover; flags default OFF |
| **Production** | **NOT_DEPLOYED / NOT_ENABLED** |

## Explicit non-claims

- LIVE authority cutover = NO
- `AUTHORITY_MODE_IN_PRODUCTION` = LEGACY / UNCHANGED
- `SIDE_EFFECTS_EXECUTED` = NO
- `PRODUCTION_DEPLOYED` = NO
- `AUTHORITY PHYSICAL LATCH ACTIVATED` = NO
- P2.4 pre-seed = NOT STARTED
- P2.5 cutover = NOT STARTED

## Implemented

### Unified OBD physical evidence extraction

- Canonical module: `device-connection-physical-state.obd-evidence.ts`
- Single timestamp policy: `obdIsPluggedIn.timestamp` only (snapshot + webhook + VLS payload)
- `device-connection-episode-resolution.snapshot-evaluator.ts` delegates to canonical extractor

### Webhook evidence writer

- `PhysicalStateEvidenceWriterService.writeWebhookEvidence()`
- Wired in `DeviceConnectionWebhookService.processValidatedWebhookEvent()` when master flag enabled
- STATEFUL_SHADOW path: physical projection + shadow compare; legacy gate diagnostic only
- Event history: coordinator upserts `dimo_device_connection_event` **only** on APPLIED physical webhook transitions

### Snapshot evidence writer

- `PhysicalStateEvidenceWriterService.writeSnapshotEvidence()`
- Wired in `dimo-snapshot.processor.ts` **before** VLS monotonic early return
- Snapshot UNPLUG: projection update allowed; no episode/alert intents
- Snapshot APPLIED PLUG: `resolve_plug` intent (suppressed when `sideEffects=false`)

### STATEFUL_SHADOW mode

Effective policy equation (unchanged from P2.2):

```
authorityMode=LEGACY ∧ projectionWrite ∧ shadowCompare ∧ ¬sideEffects → statefulShadow=true
```

### Repository fix (audit §5)

- `resolveEpisodeAction()` separates projection self-heal from lifecycle resolution
- Snapshot APPLIED PLUG emits `resolve_plug` even when `selfHeal=true`
- Coordinator skips outbox enqueue when `sideEffectsEnabled=false`

### MASTER OFF zero-write invariant (blocker A)

- `resolveRuntimePolicy()` checks `masterEnabled` **before** any `ensureAuthorityRow()` transaction
- `writeWebhookEvidence()` / `writeSnapshotEvidence()` return disabled result without DB access when master=false
- PG proof: zero rows in authority cutover, projection, transition, event-history, outbox

### GT-R1 independent proof contract (blocker B)

- `physical-state-gt-r1-proof.ts` — canonical `GtR1ExpectedFixProof` object
- Legacy diagnostic reasons (`no_state_change`, `baseline_already_plugged`, `no_open_episode`) are **never** sufficient alone
- `isProvenExpectedFix()` validates full proof structure

### Real legacy shadow evidence (blocker C)

- `physical-state-legacy-shadow-decision.ts` — `LegacyShadowDecision` with `effectivePlugState`, `evidenceObservedAt`, `bindingKey`
- Shadow comparator receives actual legacy fields; never substitutes physical candidate for legacy state

### GT-R1 persisted proof (blocker D)

- **Writer-level:** `physical-state-evidence-writer.postgres.integration.spec.ts`
- **Real call-site:** `physical-state-gt-r1-real-callsite.postgres.integration.spec.ts`
  - Snapshot: `evaluateSnapshotPlugResolution` → `buildLegacySnapshotShadowDecision` → `buildSnapshotPlugRepairGtR1Proof` → writer
  - Webhook: `DeviceConnectionWebhookService.processValidatedWebhookEvent` → internal proof builder → writer
- Zero episodes, zero outbox rows under `sideEffects=false`

### Snapshot orchestrator (semantic closure)

- `PhysicalStateSnapshotEvidenceOrchestrator` — production call graph shared with `DimoSnapshotProcessor`
- `physical-state-snapshot-real-callsite.postgres.integration.spec.ts` — genuine orchestrator PG proof (GT-R1, stale, conflict, binding divergence, master-off)

### Final semantic closure — legacy binding identity (micro-closure)

Correctness hardening of the accepted P2.3 design — **not** a new authority architecture.

#### A. Legacy persisted binding resolution (`resolveLegacyBindingKey`)

Canonical order:

1. **Episode hash** — when relevant persisted episode has `providerDeviceIdHash`, derive binding via `buildDeviceConnectionBindingKey({ provider, providerDeviceIdHash })`.
2. **Persisted DIMO event token** — when last legacy `dimoDeviceConnectionEvent` has `tokenId` (+ `provider`), derive:
   - `hashProviderDeviceId(provider, tokenId)` (same canonical production function used elsewhere)
   - then `buildDeviceConnectionBindingKey({ provider, providerDeviceIdHash })`
3. **Else** — `legacyBindingKey = null`

**Explicit invariant:** NEVER derive legacy binding identity from the incoming/current physical token.

`PhysicalStateSnapshotEvidenceOrchestrator` selects `tokenId` and `provider` from persisted `dimoDeviceConnectionEvent` (not only `eventType` / `observedAt`).

#### B. GT-R1 snapshot `EXPECTED_FIX` proof gate

`buildSnapshotPlugRepairGtR1Proof()` requires, in addition to all existing GT-R1 preconditions:

```
legacyBindingKey === physicalBindingScope.bindingKey
```

Therefore:

- **Different binding** → no `EXPECTED_FIX` (proof returns `null`)
- **Null / unknown legacy binding** → no `EXPECTED_FIX` (fail-closed; do not assume equality)
- **Same independently established binding** → eligible, subject to all other existing GT-R1 conditions (`no_open_episode`, physical UNPLUGGED baseline, newer snapshot PLUG, OBD hardware/source checks, etc.)

`isSnapshotBindingAlignedWithEpisode()` returning `true` when `episode === null` is **not** sufficient alone; proof must receive explicitly resolved `legacyBindingKey`.

#### C. Comparator null semantics (`resolveComparatorLegacyBinding`)

| `legacyBindingKey` value | Semantics |
|--------------------------|-----------|
| `undefined` | Caller did not supply binding semantics; compatibility fallback to `bindingKey` may be used |
| `null` | Explicitly unknown legacy binding; **MUST NOT** substitute current physical binding |
| non-null `string` | Proven legacy binding; unequal proven physical binding → `BINDING_DIVERGENCE` |

P2.2 classification precedence otherwise unchanged.

## Real PostgreSQL orchestrator regressions (CASE A / B / C)

File: `physical-state-snapshot-real-callsite.postgres.integration.spec.ts` via `PhysicalStateSnapshotEvidenceOrchestrator`.

| Case | Setup | Expected |
|------|-------|----------|
| **CASE A** | Persisted legacy event on **OLD_TOKEN** (UNPLUGGED); **no** open episode; physical projection on **NEW_TOKEN** = UNPLUGGED; snapshot PLUG on **NEW_TOKEN** | `legacyBindingKey` from OLD_TOKEN; physical binding from NEW_TOKEN; classification **`BINDING_DIVERGENCE`**; **not** `EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT`; GT-R1 proof null; zero side effects |
| **CASE B** | Persisted legacy UNPLUG event on **TOKEN_A**; no open episode; physical projection **TOKEN_A** = UNPLUGGED; snapshot PLUG **TOKEN_A** | Bindings equal; canonical `no_open_episode` GT-R1 proof remains valid; **`EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT`** |
| **CASE C** | No open episode; **no** binding-capable persisted legacy event; physical UNPLUGGED baseline present | `legacyBindingKey = null`; comparator does **not** substitute physical binding; **fail-closed** — not `EXPECTED_FIX`, no false `MATCH` |

**Final physical-state PostgreSQL integration suite:** **66 / 66 PASS** (7 suites), including CASE A/B/C.

## Observability

- `synqdrive_connectivity_physical_state_evidence_writer_total{source,decision,mode}`
- `synqdrive_connectivity_physical_state_stateful_shadow_evaluation_total{mode}`
- `synqdrive_connectivity_physical_state_gt_r1_expected_fix_total{source}`

## Tests

| Suite | Scope |
|-------|-------|
| `device-connection-physical-state.obd-evidence.spec.ts` | Extractor timestamp policy, source neutrality |
| `physical-state-gt-r1-proof.spec.ts` | Legacy reason-only → UNEXPLAINED; canonical proof contract |
| `physical-state-evidence-writer.shadow-orchestration.spec.ts` | BOTH_ACCEPT, BINDING_DIVERGENCE, TIMESTAMP_DIVERGENCE, real legacy state |
| `physical-state-evidence-writer.postgres.integration.spec.ts` | Writer-level GT-R1, concurrency, conflict, master-off zero-write, APPLIED-only event history |
| `physical-state-gt-r1-real-callsite.postgres.integration.spec.ts` | Real webhook/snapshot orchestration → writer → PostgreSQL |
| `physical-state-snapshot-real-callsite.postgres.integration.spec.ts` | Production snapshot orchestrator PG proof incl. CASE A/B/C binding regressions |
| `physical-state-legacy-shadow-decision.spec.ts` | `resolveLegacyBindingKey` — episode hash, event tokenId, null |
| `physical-state-reconcile.coordinator.postgres.integration.spec.ts` | Outbox gated on `sideEffectsEnabled` |
| `device-connection-physical-state.postgres.integration.spec.ts` | Phase-1 regression + snapshot PLUG `resolve_plug` intent |

Run: `npm run test:physical-state:postgres` (or CI `test:boundary-repair:postgres` step 3)

## Validation ledger (final — PR #1640)

| Check | Result | CI evidence |
|-------|--------|-------------|
| Accepted pre-doc runtime HEAD | `6658634e9a3a884ed3b415b8a79f2ff8b3028cf4` | PR #1640 branch — runtime micro-closure (CI `34826543494`, 66 PG) |
| Final documentation HEAD | PR #1640 branch tip at documentation closure | closure report `FINAL_HEAD_SHA` |
| P2.3 unit (gt-r1-proof, legacy-shadow-decision, shadow-orchestration, obd-evidence, shadow-comparator) | PASS | Backend unit tests |
| P2.2 shadow regression | PASS | included in unit tests |
| `npx tsc --noEmit` | PASS | Typecheck |
| Prisma validate | PASS | Prisma validate |
| Module registry validator | PASS | validate-module-registry |
| VDC graph validator | PASS | local + CI |
| Physical-state PostgreSQL suite | **66 / 66 PASS** (7 suites) | Backend boundary repair PostgreSQL tests |
| CI gate (all critical jobs) | PASS | Vehicle Detail — Production Readiness CI |

**Associated CI run** for final documentation HEAD: recorded in closure report `FINAL_GITHUB_CI` (must be green on actual final branch tip).

### Historical validation (superseded — do not treat as current final)

| Pass | HEAD | CI run | PG count | Notes |
|------|------|--------|----------|-------|
| Initial hardening | `5a619fdf0` | `34794611457` | 56 | Pre-semantic-closure; stale as final ledger |
| Semantic closure | `e83c52153` | `34823524916` | 63 | Pre binding-identity micro-closure |
| Runtime micro-closure | `6658634e9a3a884ed3b415b8a79f2ff8b3028cf4` | `34826543494` | 66 | Accepted runtime before documentation closure |

## Safety invariants (verified by design)

| Invariant | Status |
|-----------|--------|
| Master flag default OFF | YES — zero writes without explicit env |
| Authority latch default LEGACY | YES |
| Physical writer wired only when master enabled | YES |
| Side effects suppressed in STATEFUL_SHADOW | YES |
| No P2.4/P2.5/P2.6 code paths | YES |
