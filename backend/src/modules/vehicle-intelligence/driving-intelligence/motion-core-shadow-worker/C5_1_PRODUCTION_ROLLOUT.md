# C5.1 V1.2 production rollout (post-trip motion-core shadow)

## Feature flag (default OFF)

| Variable | Default | Effect |
|----------|---------|--------|
| `DI_V0_MOTION_CORE_C5_1_PREFERRED_SPEED_ENABLED` | unset / false | C4-only shadow bundle `DI_V0_MOTION_CORE_SHADOW_BUNDLE_V1_*` |
| `DI_V0_MOTION_CORE_C5_1_PREFERRED_SPEED_ENABLED=true` | — | C5.1 preferred speed + C4 baseline rows in payload (`BUNDLE_V2_C5_1_*`) |

Existing motion-core shadow gates (`DI_V0_MOTION_CORE_SHADOW_*`) still apply. Rollback: set C5.1 flag false (immediate C4-only intent on new runs).

## Behaviour

- Post-trip only (`POST_TRIP_RETROSPECTIVE`); not a live speed authority.
- C4 computed first; C5.1 selective repair layer when flag enabled.
- FSM remains on C4; manoeuvre events use C5.1 series when flag enabled.
- OBD speed remains non-authoritative (R1 boundary unchanged).

## Regression

Full four-drive parity vs sealed `outputs/v1_2/c5_1_experiment_summary.json`:

```bash
cd backend && npx ts-node --transpile-only scripts/test/c5-1-four-drive-production-regression.harness.ts
```

## Known offline limitations (NOT_VERIFIED gates)

See `di-v0-motion-core-c5-1-known-limitations.ts` — not treated as PASS in evaluation.
