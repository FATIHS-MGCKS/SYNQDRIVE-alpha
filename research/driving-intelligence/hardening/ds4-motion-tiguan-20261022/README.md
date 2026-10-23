# DS4 Motion hardening — Tiguan 2026-10-22

Product fixes for:

1. **GPS 1 s leg quarantine** — absolute 400 km/h 1 s chord backstop (not a speeding law) plus jitter ratio vs local median; stale-hold landing-only quarantine; C1 cannot bridge blocked 1 s legs.
2. **OBD point authority** — R1 `INTERVAL_ONLY` / missing provider instant: `fsmPointAuthority: false`; stop episodes do not treat unbelegte sparse as observed seconds or `SPARSE_VEHICLE_SPEED` source.

Audit reproduction package (read-only): `research/driving-intelligence/audits/ds4-motion-tiguan-20261022-compact/`.

## Verify (project tests)

```bash
cd backend
npx jest src/modules/vehicle-intelligence/driving-intelligence/core/__tests__/motion-core-leg-gate.spec.ts
npx jest src/modules/vehicle-intelligence/driving-intelligence/motion-core-shadow-worker/__tests__/motion-core-tiguan-gps-obd-hardening.spec.ts
npx jest src/modules/vehicle-intelligence/driving-intelligence/r1-obd-acquisition/__tests__/r1-obd-fsm-point-authority.spec.ts
npm run test:di:s4a
```

## Version bumps

- `MOTION_CORE_SPEED_C4_V0_4_DEV`
- `MOTION_CORE_LEG_CONSISTENCY_V0_4_DEV`
- `DI_V0_MOTION_CORE_SHADOW_BUNDLE_V1_LEG_GATE_OBD_POINT_AUTH_V3`

Persisted historical shadow runs are unchanged; new runs get a new bundle/intent fingerprint.

## Before / after

See `BEFORE_AFTER_SUMMARY.json` (baseline vs gps_only vs obd_only vs combined + processor path). Frozen audit `run_audit.sh` replays **pinned research code**, not product HEAD (Node 24).

## Open release point

Unbelegte R1 sparse remains in the export for audit but cannot assert DIRECT FSM or stop time evidence. Six creep STATIONARY seconds documented in `BEFORE_AFTER_SUMMARY.json` → `creepSeconds`.
