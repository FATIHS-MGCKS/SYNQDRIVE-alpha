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

## Production execution status

`PRODUCTION_EXECUTED=NO` — PR adds CLI only; no enrollment against Production in this workstream.
