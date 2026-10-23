# C5.1 V1.2 production rollout (post-trip motion-core shadow)

## Feature flag (default OFF)

| Variable | Default | Effect |
|----------|---------|--------|
| `DI_V0_MOTION_CORE_C5_1_PREFERRED_SPEED_ENABLED` | unset / false | C4-only shadow bundle `DI_V0_MOTION_CORE_SHADOW_BUNDLE_V1_*` |
| `DI_V0_MOTION_CORE_C5_1_PREFERRED_SPEED_ENABLED=true` | — | Enables C5.1 path only for admitted vehicles and trips after activation cutoff |
| `DI_V0_MOTION_CORE_C5_1_ACTIVATION_SINCE` | required when C5.1 flag true | ISO-8601 cutoff; completed trips before this stay on V1 C4 bundle (no historical V2 backlog) |

Existing motion-core shadow gates (`DI_V0_MOTION_CORE_SHADOW_*`) still apply. Shadow vehicle allowlist is unchanged; C5.1 admission is explicit (Tesla + Tiguan make/model match only). Rollback: set C5.1 flag false (immediate C4-only intent on new runs).

Algorithm fingerprint at runtime hashes the compiled `c5-1-gated-repair-v1-2.js` in dist (`.ts` fallback in dev).

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
