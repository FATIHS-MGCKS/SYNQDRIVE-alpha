# DS4 Motion hardening — Tiguan 2026-10-22

Product fixes for:

1. **GPS 1 s leg quarantine** — `detectImplausibleOneSecondLegEndpointLabels` + `withImplausibleLegEndpointsQuarantined` (250 km/h ceiling, not a speeding law).
2. **OBD point authority** — R1 sparse samples without `measurementTimeUtc` keep audit export but `fsmPointAuthority: false` (no DIRECT FSM from bucket label alone).

Audit reproduction package (read-only): `research/driving-intelligence/audits/ds4-motion-tiguan-20261022-compact/`.

## Verify (project tests)

```bash
cd backend
npx jest src/modules/vehicle-intelligence/driving-intelligence/core/__tests__/motion-core-tiguan-gps-obd-hardening.spec.ts
```

## Version bumps

- `MOTION_CORE_SPEED_C4_V0_3_DEV`
- `MOTION_CORE_LEG_CONSISTENCY_V0_3_DEV`
- `DI_V0_MOTION_CORE_SHADOW_BUNDLE_V1_LEG_GATE_OBD_POINT_AUTH_V2`

Persisted historical shadow runs are unchanged; new runs get a new bundle/intent fingerprint.

## Before / after

See `BEFORE_AFTER_SUMMARY.json`. Audit `run_audit.sh`: **NOT_RUN** on Node 22 (requires Node 24); use project Jest regressions on this branch.

## Open release point

Unbelegte R1 sparse remains in the export for audit but cannot assert DIRECT FSM. Full sparse removal (ablation B) is documented in the audit package only — not product-default.
