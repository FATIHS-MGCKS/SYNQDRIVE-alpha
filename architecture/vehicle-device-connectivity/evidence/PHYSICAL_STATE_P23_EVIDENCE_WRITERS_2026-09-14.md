# VDC RB-019 Phase 2 P2.3 — Evidence Writers + STATEFUL_SHADOW Proof

| Field | Value |
|-------|-------|
| **Date** | 2026-09-14 |
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

### GT-R1 persisted proof

- `physical-state-evidence-writer.postgres.integration.spec.ts` — full UNPLUG → snapshot PLUG → webhook UNPLUG sequence
- Validates `EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT` with `provenExpectedFix=true`
- Zero episodes, zero outbox rows under `sideEffects=false`

## Observability

- `synqdrive_connectivity_physical_state_evidence_writer_total{source,decision,mode}`
- `synqdrive_connectivity_physical_state_stateful_shadow_evaluation_total{mode}`
- `synqdrive_connectivity_physical_state_gt_r1_expected_fix_total{source}`

## Tests

| Suite | Scope |
|-------|-------|
| `device-connection-physical-state.obd-evidence.spec.ts` | Extractor timestamp policy, source neutrality |
| `physical-state-evidence-writer.postgres.integration.spec.ts` | GT-R1 sequence, concurrency, conflict, APPLIED-only event history |
| `physical-state-reconcile.coordinator.postgres.integration.spec.ts` | Outbox gated on `sideEffectsEnabled` |
| `device-connection-physical-state.postgres.integration.spec.ts` | Phase-1 regression + snapshot PLUG `resolve_plug` intent |

Run: `PHYSICAL_STATE_POSTGRES_INTEGRATION=1 npm test -- physical-state-evidence-writer.postgres.integration`

## Safety invariants (verified by design)

| Invariant | Status |
|-----------|--------|
| Master flag default OFF | YES — zero writes without explicit env |
| Authority latch default LEGACY | YES |
| Physical writer wired only when master enabled | YES |
| Side effects suppressed in STATEFUL_SHADOW | YES |
| No P2.4/P2.5/P2.6 code paths | YES |
