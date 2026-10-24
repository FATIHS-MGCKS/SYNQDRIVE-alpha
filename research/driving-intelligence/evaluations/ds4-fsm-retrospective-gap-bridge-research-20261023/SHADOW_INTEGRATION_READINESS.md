# DS4 motion FSM gap-bridge V1 — shadow integration readiness (pre-activation)

**Not activated in this workstream.** Flag remains default OFF in `di-v0-motion-core-shadow-processor.ts`.

## Versioning (required before flag ON)

| Artifact | Current | Shadow requirement |
|----------|---------|-------------------|
| `MOTION_FSM_GAP_BRIDGE_V1_VERSION` | `MOTION_FSM_GAP_BRIDGE_V1_V1_2` | Must appear in `payload.contract.algorithmVersions` (or dedicated field) when bridge enabled |
| `motionFsmVersionId(V0_4)` | Appends `+retrospectiveGapBridgeV1` | Must match persisted `algorithmVersions.fsm` |
| `resolveMotionCoreShadowBundleVersion` | Unchanged while flag OFF | Bump bundle when FSM output contract changes |

## DI-V0 auxiliary (`STATIONARY_SUPPORTED`)

- Frozen-stand path requires `MotionFsmGapBridgeAuxiliary.stationarySupportedLabels` from DI-V0 interval replay.
- Derivable in-processor from `verified.parsed` via `buildDiV0S4dS1InputFromParsedContainer` + `computeDiV0TripIntervals` (pure).
- **Must** use the work item `computeBinding.versions` / `calibration` — not research `DEFAULT_DI_V0_VERSION_TUPLE` / `CALIBRATION_UNSET_V0_BUNDLE`.
- Missing or empty aux: frozen-stand inactive; in-gap `FROZEN_POSITION` still vetoes MOVING bridge (fail-closed).

## Validation before activation

1. Four-drive gate (TIG22/TES16/TES21-1/2): Δ falseMotion/falseStill = 0.
2. `npm run test:di:motion-fsm-gap-bridge-safety` (CI job `DS4 motion FSM gap-bridge safety gate`).
3. Explicit owner decision + bundle version bump in same release as processor wiring.
