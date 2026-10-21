# EXP-021 — KS MX 2024 canary single-family operator CLI

**Date:** 2026-09-17  
**Starting main SHA:** `04bb817de85201a1017516e2e7bc5f5dd19c504d`  
**Design authority:** `architecture/drivingintelligence/research/EXP_021_LIVE_MATURATION_SHADOW_DESIGN_2026-09-16.md`

## Window-close authority audit (Phase A)

| Authority | Resolution |
|-----------|------------|
| `WINDOW_CLOSE_AUTHORITY` | `REFERENCE_CAPTURE_PHYSICAL_DRIVE_INTERVAL.physicalEndAt` persisted in settlement-shadow experiment `metadataJson` under key `physicalDriveInterval` |
| `CANONICAL_WINDOW_TO_AUTHORITY` | Same physical-end anchor — operator enrollment uses `canonicalWindowTo = physicalEndAt` (never derived from DIMO historical query under test) |
| `ACTIVITY_AUTHORITY` | Independent reference-capture speed observations in each geometry window (`reference_capture_observations`, not maturation-shadow DIMO historical query) → `classifyActivityForGeometry` per 60s/90s |
| `POLICY_DELAY_AUTHORITY` | `resolvePolicyDelayProbeMs` via `resolveHfRecoveryPolicyForToken` from HF recovery V2 config at enrollment time |

HF calibration `phaseEndedAt` and settlement schedule phase boundaries are **supporting** reference-capture lifecycle signals; the safest shared end anchor for maturation shadow enrollment is the persisted physical drive interval end.

## Operator CLI

```bash
npm run exp021:maturation-shadow:canary:enroll -- \
  --token-id 187336 \
  --wait-next-window \
  --execute
```

Dry run (default):

```bash
npm run exp021:maturation-shadow:canary:enroll -- \
  --token-id 187336 \
  --canonical-window-to 2026-09-17T12:00:00.000Z
```

## Safety micro-closure (2026-09-17)

| Checkpoint | Head | Status |
|------------|------|--------|
| Initial operator CLI | `5055dff30088d0dc7a141f33f9c9501756d593ee` | superseded |
| Safety micro-closure | `2d2a30107db23081e1fba4e57f50d9dcf87a0cb7` | superseded |
| Runtime wiring + activity semantics | TBD final head | **current** |

| Requirement | Result |
|-------------|--------|
| `AUTHORITATIVE_TOKEN_EQUALITY_ENFORCED` | YES — `assertCanaryHardGuards` requires resolved token `=== 187336` |
| `TOKEN_BINDING_MISMATCH_CAN_ENROLL` | NO |
| `ACTIVITY_RESOLVED_AFTER_CANONICAL_WINDOW_TO` | YES — CLI loads `reference_capture_observations` only after window anchor frozen |
| `GEOMETRY_60_ACTIVITY_WINDOW_SPECIFIC` | YES — `[canonicalWindowTo − 60s, canonicalWindowTo]` |
| `GEOMETRY_90_ACTIVITY_WINDOW_SPECIFIC` | YES — independent 90s window (+ prefix/suffix split when suffix-only motion) |
| `SINGLE_LATEST_SPEED_DUPLICATED_TO_BOTH_GEOMETRIES` | NO |
| `UNRESOLVED_ACTIVITY_FAILS_TO_UNKNOWN` | YES |
| `ARBITRARY_OPERATOR_TIMESTAMP_CAN_EXECUTE` | NO — execute requires exact persisted `physicalEndAt` |
| `EXPLICIT_WINDOW_REQUIRES_AUTHORITY_MATCH` | YES — `ORCHESTRATOR_CONFIRMED` / `PDI_CANDIDATE` only |
| `TOKEN_ARGUMENT_STRICT_PARSE` | YES — `/^\d+$/` decimal integer only |
| `WAIT_MODE_EXITS_ON_FIRST_STALE_WINDOW` | NO — stale candidates skipped, polling continues |
| `WAIT_MODE_CAN_CONTINUE_TO_NEXT_WINDOW` | YES |
| `WINDOW_DETECTION_LAG_EXPORTED` | YES — `physicalEndAt`, `detectedAt`, `WINDOW_DETECTION_LAG_MS`, `freshnessGuardMs`, `remainingEnrollmentBudgetMs` |
| `PROVIDER_CALL_ZERO_EVIDENCE_TRUTHFUL` | YES — `EXPECTED_PROVIDER_CALLS_DURING_ENROLLMENT=0` (expectation, not observed counter) |

## Runtime wiring + activity semantics closure (2026-09-17)

| Requirement | Result |
|-------------|--------|
| `WAIT_MODE_DB_REFRESH_EACH_POLL` | YES — `loadSettlementShadowExperiments: () => loadCanarySettlementShadowExperiments(prisma)` |
| `WAIT_MODE_USES_FROZEN_STARTUP_SNAPSHOT` | NO — startup snapshot used only for `afterPhysicalEndMs` baseline |
| `ACTIVITY_60_USES_FULL_60S_WINDOW` | YES |
| `ACTIVITY_90_USES_FULL_90S_WINDOW` | YES |
| `ACTIVITY_90_PREFIX_SUBSTITUTION` | NO — removed artificial 30s-prefix override |

### Tests

- `reference-capture-exp021-maturation-shadow-canary-enroll.spec.ts`
- `reference-capture-exp021-maturation-shadow-canary-activity.lib.spec.ts` (CASE 1–4 coherent geometry)
- `reference-capture-exp021-maturation-shadow-canary-cli-wiring.spec.ts` (actual CLI wait DB refresh wiring)

## Production execution status

`PRODUCTION_EXECUTED=NO` — PR adds CLI only; no enrollment against Production in this workstream.
