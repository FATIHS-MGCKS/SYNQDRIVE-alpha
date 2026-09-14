# VDC RB-019 Phase 2 P2.3 — Evidence Writers + STATEFUL_SHADOW Proof

| Field | Value |
|-------|-------|
| **Date** | 2026-09-14 (hardened same day — independent review blockers A–D) |
| **Authority** | Vehicle & Device Connectivity (`AUDIT_IN_PROGRESS`) |
| **Baseline main** | `4370ea53c4522036099b408f292f5046ca638128` (P2.2 merge #1638) |
| **Epistemic** | **P2_3_IMPLEMENTATION_PRESENT** — pre-cutover; flags default OFF |
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
| `physical-state-reconcile.coordinator.postgres.integration.spec.ts` | Outbox gated on `sideEffectsEnabled` |
| `device-connection-physical-state.postgres.integration.spec.ts` | Phase-1 regression + snapshot PLUG `resolve_plug` intent |

Run: `PHYSICAL_STATE_POSTGRES_INTEGRATION=1 npm test -- physical-state-evidence-writer.postgres.integration physical-state-gt-r1-real-callsite.postgres.integration`

## Validation ledger (hardening)

| Check | Local agent | CI (PR #1640) |
|-------|-------------|---------------|
| P2.3 unit (gt-r1-proof, shadow-orchestration, obd-evidence, shadow-comparator) | PASS | pending HEAD push |
| P2.2 shadow regression | PASS | pending |
| `npx tsc --noEmit` | PASS | pending |
| Prisma validate | PASS | pending |
| Module registry validator | PASS | pending |
| VDC graph validator | PASS | pending |
| Physical-state PostgreSQL suite | **BLOCKED** — no DATABASE_URL/Docker in agent VM | required for P2_3_EXIT_GATE |

## Safety invariants (verified by design)

| Invariant | Status |
|-----------|--------|
| Master flag default OFF | YES — zero writes without explicit env |
| Authority latch default LEGACY | YES |
| Physical writer wired only when master enabled | YES |
| Side effects suppressed in STATEFUL_SHADOW | YES |
| No P2.4/P2.5/P2.6 code paths | YES |
