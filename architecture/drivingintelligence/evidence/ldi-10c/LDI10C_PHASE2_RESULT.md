# LDI10C Phase 2 — Result

## Acceptance

- UNCLEAR groups audited: **8/8**
- Groups / candidates unchanged: **32** / **75**
- UNTRUSTED ∩ UNCLEAR: **8** (identical sets)
- Confidence upgrades: **none**

## Comparison (all 8 cases)

| Group | UNTRUSTED | CONFLICTED steps | Uncertainty | Continuous neighbor |
|-------|-----------|------------------|-------------|---------------------|
| MANEUVER_ACCELERATION_2 | 1 | 2 | MULTIPLE_CAUSES+GPS_QC_FAILURE+SIGNAL_CONFLICT | false |
| MANEUVER_ACCELERATION_3 | 2 | 3 | MULTIPLE_CAUSES+GPS_QC_FAILURE+SIGNAL_CONFLICT | false |
| MANEUVER_ACCELERATION_4 | 1 | 2 | MULTIPLE_CAUSES+GPS_QC_FAILURE+SIGNAL_CONFLICT | false |
| MANEUVER_ACCELERATION_6 | 2 | 2 | MULTIPLE_CAUSES+GPS_QC_FAILURE+SIGNAL_CONFLICT | false |
| MANEUVER_ACCELERATION_8 | 3 | 3 | MULTIPLE_CAUSES+GPS_QC_FAILURE+SIGNAL_CONFLICT | false |
| MANEUVER_ACCELERATION_9 | 1 | 1 | MULTIPLE_CAUSES+GPS_QC_FAILURE+SIGNAL_CONFLICT | false |
| MANEUVER_ACCELERATION_12 | 1 | 1 | MULTIPLE_CAUSES+GPS_QC_FAILURE+SIGNAL_CONFLICT | false |
| MANEUVER_ACCELERATION_13 | 1 | 2 | MULTIPLE_CAUSES+GPS_QC_FAILURE+SIGNAL_CONFLICT | false |

## Owner next action

1. Schedule independent Ruptela test drive with dense GPS + TRUSTED L3 QC on maneuver windows (see LDI10B_CAPTURE_REQUIREMENTS).
2. Capture video or wheel-speed reference for the eight UTC windows listed in `LDI10C_PHASE2_UNCLEAR_GROUPS.json`.
3. Do **not** merge LDI-10D or change EXP021 thresholds until new evidence is frozen.

## Repro

```bash
cd backend && npm run ldi10c:phase2-unclear-forensics
```

```
LDI10C_PHASE=2
LDI10C_PHASE2_RESULT=UNCLEAR_FORENSICS_COMPLETE
UNCLEAR_GROUPS_AUDITED=8
UNTRUSTED_INTERSECTION_SIZE=8
GROUPING_UNCHANGED=32_groups_75_candidates
PRODUCTION_MUTATIONS=NONE
STOP=LDI10C_phase2_complete_no_LDI10D_no_deploy
```