# FSM Gap Bridge V1.3.1 — production rollout (shadow worker)

**Default:** `DI_V0_MOTION_CORE_FSM_GAP_BRIDGE_V1_ENABLED` unset / false → FSM remains `MOTION_FSM_V0_3_CANDIDATE_OPTIONS` (unchanged).

| Env | Role |
|-----|------|
| `DI_V0_MOTION_CORE_FSM_GAP_BRIDGE_V1_ENABLED` | Master switch for gap-bridge FSM in post-trip motion-core shadow |
| `DI_V0_MOTION_CORE_FSM_GAP_BRIDGE_V1_ACTIVATION_SINCE` | Required when flag true; trips completed before cutoff keep V1/V2 bundles (no historical V3/V4 backlog) |

Combines orthogonally with C5.1 (`DI_V0_MOTION_CORE_C5_1_*`). Intent keys and bundle versions:

| C5.1 | Gap bridge | Bundle |
|------|------------|--------|
| off | off | `DI_V0_MOTION_CORE_SHADOW_BUNDLE_V1_*` |
| on | off | `DI_V0_MOTION_CORE_SHADOW_BUNDLE_V2_*` |
| off | on | `DI_V0_MOTION_CORE_SHADOW_BUNDLE_V3_FSM_GAP_BRIDGE_V1_3_1` |
| on | on | `DI_V0_MOTION_CORE_SHADOW_BUNDLE_V4_C5_1_AND_FSM_GAP_BRIDGE_V1_3_1` |

## Separation of concerns

| Layer | What runs today |
|-------|-----------------|
| Algorithm | `MOTION_FSM_GAP_BRIDGE_V1_V1_3_1` in `motion-fsm-gap-bridge-v1.ts` (merged via PR #2150) |
| Worker FSM | V0.3 until flag ON + activation cutoff |
| Persistence | `di_v0_motion_core_shadow_runs_v1` (shadow only) |
| Product UI | Trip map read API (`DiV0MotionCoreShadowTripMapReadService`) — preview label **S4 Motion · vorläufig**; not general fleet customer analytics |

## Go-live sequence (no multi-day shadow hold when gates pass)

1. Merge integration PR after CI + Fable signoff.
2. Deploy with `DI_V0_MOTION_CORE_FSM_GAP_BRIDGE_V1_ENABLED=false`.
3. Smoke both replicas: scheduler, outbox discovery, intent idempotency, C4/C5.1 paths unchanged.
4. Owner sets `ACTIVATION_SINCE` + enables flag for **new** post-trip trips only.
5. Verify trip-map read shows `gapBridgeV1` + `fsmAuxBinding` on new runs.
6. Monitor first runs for duplicate intents, `INTENT_MISMATCH`, aux bind skips.
7. Rollback: set flag false (instant V0.3 FSM on new discoveries).

## Validation

```bash
cd backend && npm run test:di:motion-fsm-gap-bridge-safety
cd backend && npm test -- di-v0-motion-core-fsm-gap-bridge-integration
cd backend && npx ts-node --transpile-only scripts/test/fsm-gap-bridge-four-drive-production-regression.harness.ts
```

Four-drive sealed expectations: `research/driving-intelligence/evaluations/ds4-fsm-retrospective-gap-bridge-research-20261023/outputs/run_v2_native_fsm/summary.json`.
