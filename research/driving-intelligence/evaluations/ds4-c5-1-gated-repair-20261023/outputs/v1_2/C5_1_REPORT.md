# C5.1 experiment report — V1.2 (safety patch C1–C3)

Generated: 2026-10-23T17:55:36.346Z

Version: `MOTION_CORE_SPEED_C5_1_GATED_REPAIR_V1_2_NULL_NEIGHBOR_FAIL_CLOSED` · prior: `MOTION_CORE_SPEED_C5_1_GATED_REPAIR_V1_1_SAFETY_HARDENED` (sealed under `outputs/v1_1/`)

Verdict: **SAFE_OFFLINE_CANDIDATE** · test verdict: **PASS** · regression vs V1.1 identical outside expected deltas: **true**

Release scope: shadow NOT_APPROVED · production NOT_APPROVED · product code unchanged.

## TIG22 19:04:38 — before / after (video ground truth UNKNOWN)

- TIG22 19:04:38 was an ACCEPTED repair in V1.1 (53f5acebc) without video ground truth (reference ends 19:03:02; 19:04 is UNSCORED_VIDEO_GAP).
- C4 already carried a conspicuous estimate here (SPARSE_SUPPORT 100.11 km/h after 54.06 km/h at 19:04:36 and OUTLIER_REJECTED at 19:04:37).
- V1.1 moved at least one local plausibility violation (74.45 → 98.16 km/h within 1 s ≈ 6.6 m/s²) instead of independently proving its resolution.
- The null-neighbour finding originates from Fable's independent safety audit: tripleAccelViolation() returned 0 when a neighbour speed was null.
- V1.2 (this version) classifies the evidence as INSUFFICIENT_EVIDENCE, rejects the repair and keeps the C4 value. The true speed at 19:04 remains UNKNOWN; this is not a confirmed false alarm.

| Version | C4 km/h (quality) | C5.1 km/h | repairState | Q5 / Q6 evidence |
| --- | --- | --- | --- | --- |
| V1.1 (`53f5acebc`) | 100.11 (SPARSE_SUPPORT) | 74.45 | REPAIR_ACCEPTED | passed on null→0 (vCand=0, vC4=0) |
| V1.2 (this run) | 100.11 (SPARSE_SUPPORT) | 100.11 | REPAIR_REJECTED | INSUFFICIENT_EVIDENCE / INSUFFICIENT_EVIDENCE |

Neighbours examined (V1.2):

```json
[
  {
    "label": "2026-10-22T19:04:35Z",
    "c4Kmh": null,
    "c4Quality": "NO_POSITION",
    "c51Kmh": null,
    "repairState": "PASS_THROUGH_NO_REPAIR",
    "videoReference": "OUTSIDE_VIDEO_REFERENCE_WINDOW"
  },
  {
    "label": "2026-10-22T19:04:36Z",
    "c4Kmh": 54.05766767195516,
    "c4Quality": "SPARSE_SUPPORT",
    "c51Kmh": 54.05766767195516,
    "repairState": "REPAIR_REJECTED",
    "videoReference": "OUTSIDE_VIDEO_REFERENCE_WINDOW"
  },
  {
    "label": "2026-10-22T19:04:37Z",
    "c4Kmh": null,
    "c4Quality": "OUTLIER_REJECTED",
    "c51Kmh": null,
    "repairState": "PASS_THROUGH_NO_REPAIR",
    "videoReference": "OUTSIDE_VIDEO_REFERENCE_WINDOW"
  },
  {
    "label": "2026-10-22T19:04:38Z",
    "c4Kmh": 100.10595401668607,
    "c4Quality": "SPARSE_SUPPORT",
    "c51Kmh": 100.10595401668607,
    "repairState": "REPAIR_REJECTED",
    "videoReference": "OUTSIDE_VIDEO_REFERENCE_WINDOW"
  },
  {
    "label": "2026-10-22T19:04:39Z",
    "c4Kmh": 98.16216281501156,
    "c4Quality": "OK",
    "c51Kmh": 98.16216281501156,
    "repairState": "REPAIR_REJECTED",
    "videoReference": "OUTSIDE_VIDEO_REFERENCE_WINDOW"
  },
  {
    "label": "2026-10-22T19:04:40Z",
    "c4Kmh": 86.9990300101405,
    "c4Quality": "SPARSE_SUPPORT",
    "c51Kmh": 86.9990300101405,
    "repairState": "REPAIR_REJECTED",
    "videoReference": "OUTSIDE_VIDEO_REFERENCE_WINDOW"
  },
  {
    "label": "2026-10-22T19:04:41Z",
    "c4Kmh": null,
    "c4Quality": "NO_POSITION",
    "c51Kmh": null,
    "repairState": "PASS_THROUGH_OUTSIDE_WINDOW",
    "videoReference": "OUTSIDE_VIDEO_REFERENCE_WINDOW"
  }
]
```

## Accepted repairs per drive (with video-reference status)

- **TIG22**: accepted 1, rejected 34, uncertain 3, insufficient-evidence rejections 3
  - 2026-10-22T18:41:45Z: C4 43.56 → C5.1 51.41 km/h · REF_54_KMH · Q5 VALID / Q6 VALID
- **TES21-1**: accepted 0, rejected 16, uncertain 30, insufficient-evidence rejections 0
- **TES21-2**: accepted 0, rejected 18, uncertain 0, insufficient-evidence rejections 2
- **TES16**: accepted 2, rejected 15, uncertain 0, insufficient-evidence rejections 1
  - 2026-10-16T03:50:20Z: C4 113.10 → C5.1 129.58 km/h · REF_133_KMH · Q5 VALID / Q6 VALID
  - 2026-10-16T03:50:23Z: C4 148.29 → C5.1 125.90 km/h · REF_132_KMH · Q5 VALID / Q6 VALID

## Speed regression (common support vs video reference)

| Drive | n | MAE C4 | MAE C5.1 | P95 C4 | P95 C5.1 | max C4 | max C5.1 | coverage C4 | coverage C5.1 | lost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| TIG22 | 1364 | 2.905 | 2.9 | 5.918 | 5.903 | 14.381 | 14.381 | 0.963 | 0.963 | 0 |
| TES21-1 | 150 | 2.292 | 2.292 | 8.562 | 8.562 | 13.553 | 13.553 | 0.655 | 0.655 | 0 |
| TES21-2 | 179 | 3.605 | 3.605 | 10.954 | 10.954 | 20.649 | 20.649 | 0.746 | 0.746 | 0 |
| TES16 | 808 | 2.272 | 2.239 | 4.485 | 4.478 | 19.895 | 6.104 | 0.83 | 0.83 | 0 |

## Gates

- PASS `A/B1_coverage` (TIG22) {"covC4":0.963,"covC51":0.963}
- PASS `A3_repair_accepted_lt_pass_through` (TIG22) {"repairAccepted":1,"passOutside":2056,"repairRejected":34,"uncertain":3}
- PASS `A4_no_c4_numeric_to_null` (TIG22) {"lost":0}
- PASS `B2_no_numeric_loss` (TIG22) {"lost":0}
- PASS `A_pass_through_fields` (TIG22) {"violations":0}
- PASS `F1_quarantine_parity` (TIG22) {}
- PASS `F2_no_new_gt_250_kmh` (TIG22) {"maxC4Kmh":142.08802935867215,"maxC51Kmh":142.08802935867215}
- PASS `F3_max_support_offset` (TIG22) {"max":4,"maxAttributionOffsetS":4}
- PASS `G1_eligibility_pct` (TIG22) {"pct":1.81,"eligible":38,"grid":2094}
- NOT_VERIFIED `C4_residual_pass_through_risk_documented` (TIG22) {"note":"Residual C4>|8| km/h on pass-through documented in drive speed tables; not a pass/fail gate."}
- PASS `C1_common_mae` (TIG22) {"maeC4":2.905,"maeC51":2.9,"n":1364}
- PASS `C2_common_p95` (TIG22) {"p95C4":5.918,"p95C51":5.903}
- PASS `D1_confirmed_recall` (TIG22) {"oracleHardMissedC4":1,"oracleHardMissedC51":1}
- NOT_VERIFIED `D3_unknown_oracle_reported` (TIG22) {"c4EventRows":20,"c51EventRows":20}
- PASS `D2_hard_false_alarms` (TIG22) {"hardFalseAlarmsC4":0,"hardFalseAlarmsC51":0}
- PASS `D6_no_event_drop_without_oracle_gain` (TIG22) {"eventsC4":20,"eventsC51":20,"recallImproved":false}
- PASS `E1_false_motion_still` (TIG22) {"c4":0,"c51":0}
- PASS `E2_false_still_motion` (TIG22) {"c4":0,"c51":0}
- PASS `PRODUCTION_C4_REPLAY_PARITY` (TIG22) {"mismatches":0}
- PASS `C1_no_accept_without_valid_q5_q6_evidence` (TIG22) {"accepted":1,"acceptedWithoutValidEvidence":[],"insufficientEvidenceRejections":3}
- NOT_VERIFIED `D5_tig22_1904_unscored_gap` (TIG22) {"note":"19:04 remains UNSCORED_VIDEO_GAP per video reference (reference ends 19:03:02); true speed at 19:04:38 is unknown. V1.1 accepted a repair here without ground truth (see tig22_19_04_38); V1.2 fails closed. This is not a confirmed false alarm.","unscoredCount":0}
- PASS `C1_tig22_190438_null_neighbor_fail_closed` (TIG22) {"before":{"version":"MOTION_CORE_SPEED_C5_1_GATED_REPAIR_V1_1_SAFETY_HARDENED","algorithmHead":"53f5acebc13f8ac45498b9ff7311e4152f30f1fe","c4Kmh":100.10595401668607,"c4Quality":"SPARSE_SUPPORT","c51Kmh":74.45209167284705,"repairState":"REPAIR_ACCEPTED","attributionP":"2026-10-22T19:04:40Z","q5Detail":{"vCand":0,"vC4":0},"neighbourNote":"19:04:37 OUTLIER_REJECTED (null speed) → tripleAccelViolation() returned 0 for both C4 and candidate; Q5/Q6 passed without evidence.","localStepAfterRepairKmhPerS":{"from":74.45209167284705,"to":98.16216281501156,"label":"2026-10-22T19:04:39Z"},"provenance":"FABLE_SIGNOFF_READ_ONLY_RECOMPUTE_2026-10-23"},"after":{"version":"MOTION_CORE_SPEED_C5_1_GATED_REPAIR_V1_2_NULL_NEIGHBOR_FAIL_CLOSED","c4Kmh":100.10595401668607,"c4Quality":"SPARSE_SUPPORT","c51Kmh":100.10595401668607,"repairState":"REPAIR_REJECTED","candidateKmh":74.45209167284705,"attributionP":"2026-10-22T19:04:40Z","q":{"Q1":true,"Q2":true,"Q3":true,"Q4":true,"Q5":false,"Q6":false},"q5Evidence":"INSUFFICIENT_EVIDENCE","q6Evidence":"INSUFFICIENT_EVIDENCE","q5Reason":"insufficient_evidence_fail_closed","evidenceReason":"neighbor_speed_null","neighborsExamined":[{"side":"prev","label":"2026-10-22T19:04:37Z","offsetS":-1,"present":true,"speedKmh":null,"c4Quality":"OUTLIER_REJECTED","usable":false},{"side":"next","label":"2026-10-22T19:04:39Z","offsetS":1,"present":true,"speedKmh":98.16216281501156,"c4Quality":"OK","usable":true}]},"videoGroundTruth":"UNKNOWN_UNSCORED_VIDEO_GAP","c4ValuePreserved":true}
- PASS `A/B1_coverage` (TES21-1) {"covC4":0.655,"covC51":0.655}
- PASS `A3_repair_accepted_lt_pass_through` (TES21-1) {"repairAccepted":0,"passOutside":487,"repairRejected":16,"uncertain":30}
- PASS `A4_no_c4_numeric_to_null` (TES21-1) {"lost":0}
- PASS `B2_no_numeric_loss` (TES21-1) {"lost":0}
- PASS `A_pass_through_fields` (TES21-1) {"violations":0}
- PASS `F1_quarantine_parity` (TES21-1) {}
- PASS `F2_no_new_gt_250_kmh` (TES21-1) {"maxC4Kmh":56.19229495903836,"maxC51Kmh":56.19229495903836}
- PASS `F3_max_support_offset` (TES21-1) {"max":4,"maxAttributionOffsetS":3}
- PASS `G1_eligibility_pct` (TES21-1) {"pct":8.63,"eligible":46,"grid":533}
- NOT_VERIFIED `C4_residual_pass_through_risk_documented` (TES21-1) {"note":"Residual C4>|8| km/h on pass-through documented in drive speed tables; not a pass/fail gate."}
- PASS `C1_common_mae` (TES21-1) {"maeC4":2.292,"maeC51":2.292,"n":150}
- PASS `C2_common_p95` (TES21-1) {"p95C4":8.562,"p95C51":8.562}
- PASS `D1_confirmed_recall` (TES21-1) {"oracleHardMissedC4":1,"oracleHardMissedC51":1}
- NOT_VERIFIED `D3_unknown_oracle_reported` (TES21-1) {"c4EventRows":4,"c51EventRows":4}
- PASS `D2_hard_false_alarms` (TES21-1) {"hardFalseAlarmsC4":1,"hardFalseAlarmsC51":1}
- PASS `D6_no_event_drop_without_oracle_gain` (TES21-1) {"eventsC4":4,"eventsC51":4,"recallImproved":false}
- PASS `E1_false_motion_still` (TES21-1) {"c4":0,"c51":0}
- PASS `E2_false_still_motion` (TES21-1) {"c4":0,"c51":0}
- PASS `PRODUCTION_C4_REPLAY_PARITY` (TES21-1) {"mismatches":0}
- PASS `C1_no_accept_without_valid_q5_q6_evidence` (TES21-1) {"accepted":0,"acceptedWithoutValidEvidence":[],"insufficientEvidenceRejections":0}
- PASS `A/B1_coverage` (TES21-2) {"covC4":0.746,"covC51":0.746}
- PASS `A3_repair_accepted_lt_pass_through` (TES21-2) {"repairAccepted":0,"passOutside":517,"repairRejected":18,"uncertain":0}
- PASS `A4_no_c4_numeric_to_null` (TES21-2) {"lost":0}
- PASS `B2_no_numeric_loss` (TES21-2) {"lost":0}
- PASS `A_pass_through_fields` (TES21-2) {"violations":0}
- PASS `F1_quarantine_parity` (TES21-2) {}
- PASS `F2_no_new_gt_250_kmh` (TES21-2) {"maxC4Kmh":51.74734893386582,"maxC51Kmh":51.74734893386582}
- PASS `F3_max_support_offset` (TES21-2) {"max":4,"maxAttributionOffsetS":0}
- PASS `G1_eligibility_pct` (TES21-2) {"pct":3.36,"eligible":18,"grid":535}
- NOT_VERIFIED `C4_residual_pass_through_risk_documented` (TES21-2) {"note":"Residual C4>|8| km/h on pass-through documented in drive speed tables; not a pass/fail gate."}
- PASS `C1_common_mae` (TES21-2) {"maeC4":3.605,"maeC51":3.605,"n":179}
- PASS `C2_common_p95` (TES21-2) {"p95C4":10.954,"p95C51":10.954}
- PASS `D1_confirmed_recall` (TES21-2) {"oracleHardMissedC4":0,"oracleHardMissedC51":0}
- NOT_VERIFIED `D3_unknown_oracle_reported` (TES21-2) {"c4EventRows":4,"c51EventRows":4}
- PASS `D2_hard_false_alarms` (TES21-2) {"hardFalseAlarmsC4":0,"hardFalseAlarmsC51":0}
- PASS `D6_no_event_drop_without_oracle_gain` (TES21-2) {"eventsC4":4,"eventsC51":4,"recallImproved":false}
- PASS `E1_false_motion_still` (TES21-2) {"c4":0,"c51":0}
- PASS `E2_false_still_motion` (TES21-2) {"c4":0,"c51":0}
- PASS `PRODUCTION_C4_REPLAY_PARITY` (TES21-2) {"mismatches":0}
- PASS `C1_no_accept_without_valid_q5_q6_evidence` (TES21-2) {"accepted":0,"acceptedWithoutValidEvidence":[],"insufficientEvidenceRejections":2}
- PASS `A/B1_coverage` (TES16) {"covC4":0.83,"covC51":0.83}
- PASS `A3_repair_accepted_lt_pass_through` (TES16) {"repairAccepted":2,"passOutside":1119,"repairRejected":15,"uncertain":0}
- PASS `A4_no_c4_numeric_to_null` (TES16) {"lost":0}
- PASS `B2_no_numeric_loss` (TES16) {"lost":0}
- PASS `A_pass_through_fields` (TES16) {"violations":0}
- PASS `F1_quarantine_parity` (TES16) {}
- PASS `F2_no_new_gt_250_kmh` (TES16) {"maxC4Kmh":148.2894329471151,"maxC51Kmh":129.78856651286918}
- PASS `F3_max_support_offset` (TES16) {"max":4,"maxAttributionOffsetS":4}
- PASS `G1_eligibility_pct` (TES16) {"pct":1.5,"eligible":17,"grid":1136}
- PASS `G2_tes16_gap_window_covers_cluster` (TES16) {"window":{"start":"2026-10-16T03:50:18Z","end":"2026-10-16T03:50:26Z","width":9}}
- NOT_VERIFIED `C4_residual_pass_through_risk_documented` (TES16) {"note":"Residual C4>|8| km/h on pass-through documented in drive speed tables; not a pass/fail gate."}
- PASS `C1_common_mae` (TES16) {"maeC4":2.272,"maeC51":2.239,"n":808}
- PASS `C2_common_p95` (TES16) {"p95C4":4.485,"p95C51":4.478}
- PASS `D1_confirmed_recall` (TES16) {"oracleHardMissedC4":0,"oracleHardMissedC51":0}
- NOT_VERIFIED `D3_unknown_oracle_reported` (TES16) {"c4EventRows":17,"c51EventRows":16}
- PASS `D2_hard_false_alarms` (TES16) {"hardFalseAlarmsC4":1,"hardFalseAlarmsC51":0}
- PASS `D6_no_event_drop_without_oracle_gain` (TES16) {"eventsC4":17,"eventsC51":16,"recallImproved":false}
- PASS `E1_false_motion_still` (TES16) {"c4":0,"c51":0}
- PASS `E2_false_still_motion` (TES16) {"c4":0,"c51":0}
- PASS `PRODUCTION_C4_REPLAY_PARITY` (TES16) {"mismatches":0}
- PASS `C1_no_accept_without_valid_q5_q6_evidence` (TES16) {"accepted":2,"acceptedWithoutValidEvidence":[],"insufficientEvidenceRejections":1}
- PASS `D4_tes16_false_accel_removed` (TES16) {"c4Events":1,"c51Events":0}
- PASS `C3_tes16_critical_max_err` (TES16) {"maxErrKmh":6.1}
- PASS `TES21_1_brake_120523_not_worsened` (TES21-1) {"c4Kmh":14.858372594105312,"c51Kmh":14.858372594105312,"repairState":"REPAIR_REJECTED"}
- PASS `TES21_1_real_decel_preserved` (TES21-1) {"decelC4":1,"decelC51":1}
- PASS `H_synthetics` (ALL) {"syntheticsOk":true,"supportOk":true,"syntheticAuditSchema":"C5_1_SYNTHETIC_TEST_AUDIT_V2_ACTIVE_REPAIR_PATH"}
- PASS `C3_in_window_manoeuvre_tests_active_repair_path` (SYNTHETIC) {"scenarios":[{"scenario":"10_accel_time_suspect","present":true,"eligible":5,"candidates":5,"q5Evaluated":5,"q6Evaluated":5,"accepted":3,"insufficientEvidenceRejections":0},{"scenario":"11_brake_suspect_fix","present":true,"eligible":5,"candidates":5,"q5Evaluated":5,"q6Evaluated":5,"accepted":3,"insufficientEvidenceRejections":0},{"scenario":"12_start_from_stop_suspect","present":true,"eligible":5,"candidates":5,"q5Evaluated":5,"q6Evaluated":5,"accepted":3,"insufficientEvidenceRejections":0},{"scenario":"13_outlier_neighbour_fail_closed","present":true,"eligible":7,"candidates":6,"q5Evaluated":6,"q6Evaluated":6,"accepted":3,"insufficientEvidenceRejections":2}]}

## Gate counts

{
  "pass": 80,
  "fail": 0,
  "notVerified": 9,
  "scored": 80,
  "total": 89
}

## Regression vs V1.1 baseline

```json
{
  "identicalOutsideExpectedDeltas": true,
  "expectedDeltas": [
    {
      "path": ".c51Version",
      "reason": "V1.1 → V1.2 version string"
    },
    {
      "path": ".tig22_19_04_38",
      "reason": "new fingerprint field (V1.1 baseline did not pin 19:04:38); V1.1 value documented in tig22_19_04_38.before"
    }
  ],
  "unexpectedMismatches": []
}
```


## Test integrity

{
  "algorithmFileSha256": "9e464d4891d740b0ff182b1c780be9b0848a51b028d42f497bf3ed2c8b610859",
  "algorithmBaselineHead": "53f5acebc13f8ac45498b9ff7311e4152f30f1fe",
  "algorithmPatch": "C1 null-neighbour tri-state (Q5/Q6 fail-closed); acceleration limits, FROZEN parameters and gates Q1–Q4/heading unchanged",
  "productionPin": "579ee8b2fed06593d7d2aa57cffb6036dbf53a24",
  "codeSha": "5718af17c54e22f00c6dcf088d6b5ae7db7d6520",
  "commands": [
    "node scripts/c5-1.support.test.cjs",
    "node scripts/c5-1.synthetic.test.cjs",
    "node scripts/run_c5_1_experiment.cjs --code-root <repo>"
  ],
  "syntheticAudit": "(see c5_1_synthetic_test_audit.json)",
  "regressionBaseline": "/workspace/.worktrees/ds4-speed-ref/research/driving-intelligence/evaluations/ds4-c5-1-gated-repair-20261023/outputs/baselines/c5_1_v1_1_regression_fingerprint_53f5acebc.json",
  "regressionBaselineV1_2": "/workspace/.worktrees/ds4-speed-ref/research/driving-intelligence/evaluations/ds4-c5-1-gated-repair-20261023/outputs/baselines/c5_1_v1_2_regression_fingerprint.json",
  "regressionVsV1_1": {
    "identicalOutsideExpectedDeltas": true,
    "expectedDeltas": [
      {
        "path": ".c51Version",
        "reason": "V1.1 → V1.2 version string"
      },
      {
        "path": ".tig22_19_04_38",
        "reason": "new fingerprint field (V1.1 baseline did not pin 19:04:38); V1.1 value documented in tig22_19_04_38.before"
      }
    ],
    "unexpectedMismatches": []
  },
  "regressionUnchanged": true,
  "regressionMismatches": []
}

## TES16 trace

```json
[
  {
    "label": "2026-10-16T03:50:20Z",
    "refKmh": 133,
    "c4Kmh": 113.10468732349274,
    "c51Kmh": 129.584682365988,
    "repairState": "REPAIR_ACCEPTED",
    "eligibilitySignals": [
      "S3"
    ],
    "trace": {
      "label": "2026-10-16T03:50:20Z",
      "eligibilitySignals": [
        "S3"
      ],
      "inWindow": true,
      "timeSuspects": [
        "2026-10-16T03:50:22Z"
      ],
      "attributionP": "2026-10-16T03:50:22Z",
      "attributionOffsetS": 2,
      "looDetail": {
        "v1Kmh": 64.51306933814512,
        "v2Kmh": 255.9605404619024,
        "crossM": 0.16932214692751835,
        "vAbKmh": 128.3281733406095
      },
      "manoeuvreGuard": {
        "pass": true,
        "detail": {
          "vAbKmh": 128.3281733406095,
          "vPreKmh": 129.23934981289565,
          "vPostKmh": 126.92532305839849
        }
      },
      "manoeuvreTroughGuard": {
        "pass": true,
        "cand": 129.584682365988,
        "detail": {
          "trough": true,
          "leftMax": 129.78856651286918,
          "rightMax": 148.2894329471151
        }
      },
      "support": {
        "h": 4,
        "totalForRule": 7,
        "left": 4,
        "right": 2,
        "supportLabelsUsed": [
          "2026-10-16T03:50:16Z",
          "2026-10-16T03:50:17Z",
          "2026-10-16T03:50:18Z",
          "2026-10-16T03:50:19Z",
          "2026-10-16T03:50:20Z",
          "2026-10-16T03:50:23Z",
          "2026-10-16T03:50:24Z"
        ],
        "slopeSupportLabels": [
          "2026-10-16T03:50:16Z",
          "2026-10-16T03:50:17Z",
          "2026-10-16T03:50:18Z",
          "2026-10-16T03:50:19Z",
          "2026-10-16T03:50:20Z",
          "2026-10-16T03:50:23Z",
          "2026-10-16T03:50:24Z"
        ],
        "centerInUsed": true
      },
      "candidateKmh": 129.584682365988,
      "q": {
        "Q1": true,
        "Q2": true,
        "Q3": true,
        "Q4": true,
        "Q5": true,
        "Q6": true
      },
      "q5Detail": {
        "vCand": 0.1987827178308284,
        "vC4": 4.53397027959494,
        "neighborsExamined": [
          {
            "side": "prev",
            "label": "2026-10-16T03:50:19Z",
            "offsetS": -1,
            "present": true,
            "speedKmh": 129.42698033003452,
            "c4Quality": "OK",
            "usable": true
          },
          {
            "side": "next",
            "label": "2026-10-16T03:50:22Z",
            "offsetS": 2,
            "present": true,
            "speedKmh": 128.15344679760602,
            "c4Quality": "JITTER_SUSPECT",
            "usable": true
          }
        ]
      },
      "q5Evidence": "VALID",
      "q6Detail": {
        "reason": null,
        "vCandEffective": 0.1987827178308284,
        "vC4": 4.53397027959494,
        "c4Evidence": "VALID",
        "neighborsExamined": [
          {
            "side": "prev",
            "label": "2026-10-16T03:50:19Z",
            "offsetS": -1,
            "present": true,
            "speedKmh": 129.42698033003452,
            "c4Quality": "OK",
            "usable": true
          },
          {
            "side": "next",
            "label": "2026-10-16T03:50:22Z",
            "offsetS": 2,
            "present": true,
            "speedKmh": 128.15344679760602,
            "c4Quality": "JITTER_SUSPECT",
            "usable": true
          }
        ]
      },
      "q6Evidence": "VALID",
      "heading": {
        "reject": false,
        "rateDegPerS": 0.11413247114161133,
        "dt": 3
      },
      "headingReject": false
    },
    "q": {
      "Q1": true,
      "Q2": true,
      "Q3": true,
      "Q4": true,
      "Q5": true,
      "Q6": true
    }
  },
  {
    "label": "2026-10-16T03:50:22Z",
    "refKmh": 132,
    "c4Kmh": 128.15344679760602,
    "c51Kmh": 128.15344679760602,
    "repairState": "REPAIR_REJECTED",
    "eligibilitySignals": [
      "S2",
      "S3",
      "S4"
    ],
    "trace": {
      "label": "2026-10-16T03:50:22Z",
      "eligibilitySignals": [
        "S2",
        "S3",
        "S4"
      ],
      "inWindow": true,
      "timeSuspects": [
        "2026-10-16T03:50:22Z"
      ],
      "attributionP": "2026-10-16T03:50:22Z",
      "attributionOffsetS": 0,
      "looDetail": {
        "v1Kmh": 64.51306933814512,
        "v2Kmh": 255.9605404619024,
        "crossM": 0.16932214692751835,
        "vAbKmh": 128.3281733406095
      },
      "manoeuvreGuard": {
        "pass": true,
        "detail": {
          "vAbKmh": 128.3281733406095,
          "vPreKmh": 129.23934981289565,
          "vPostKmh": 126.92532305839849
        }
      },
      "manoeuvreTroughGuard": {
        "pass": true,
        "cand": 126.71268354059747
      },
      "support": {
        "h": 4,
        "totalForRule": 7,
        "left": 3,
        "right": 4,
        "supportLabelsUsed": [
          "2026-10-16T03:50:18Z",
          "2026-10-16T03:50:19Z",
          "2026-10-16T03:50:20Z",
          "2026-10-16T03:50:23Z",
          "2026-10-16T03:50:24Z",
          "2026-10-16T03:50:25Z",
          "2026-10-16T03:50:26Z"
        ],
        "slopeSupportLabels": [
          "2026-10-16T03:50:18Z",
          "2026-10-16T03:50:19Z",
          "2026-10-16T03:50:20Z",
          "2026-10-16T03:50:23Z",
          "2026-10-16T03:50:24Z",
          "2026-10-16T03:50:25Z",
          "2026-10-16T03:50:26Z"
        ],
        "centerInUsed": false
      },
      "candidateKmh": 126.71268354059747,
      "q": {
        "Q1": true,
        "Q2": true,
        "Q3": true,
        "Q4": true,
        "Q5": false,
        "Q6": false
      },
      "q5Detail": {
        "reason": "worsens_triple_accel",
        "vCand": 5.993541501810454,
        "vC4": 5.593329485974745,
        "neighborsExamined": [
          {
            "side": "prev",
            "label": "2026-10-16T03:50:20Z",
            "offsetS": -2,
            "present": true,
            "speedKmh": 113.10468732349274,
            "c4Quality": "SPARSE_SUPPORT",
            "usable": true
          },
          {
            "side": "next",
            "label": "2026-10-16T03:50:23Z",
            "offsetS": 1,
            "present": true,
            "speedKmh": 148.2894329471151,
            "c4Quality": "JITTER_SUSPECT",
            "usable": true
          }
        ]
      },
      "q5Evidence": "VALID",
      "q6Detail": {
        "reason": "worsens_effective_triple_accel",
        "vCandEffective": 5.993541501810454,
        "vC4": 5.593329485974745,
        "c4Evidence": "VALID",
        "neighborsExamined": [
          {
            "side": "prev",
            "label": "2026-10-16T03:50:20Z",
            "offsetS": -2,
            "present": true,
            "speedKmh": 129.584682365988,
            "c4Quality": "SPARSE_SUPPORT",
            "usable": true
          },
          {
            "side": "next",
            "label": "2026-10-16T03:50:23Z",
            "offsetS": 1,
            "present": true,
            "speedKmh": 148.2894329471151,
            "c4Quality": "JITTER_SUSPECT",
            "usable": true
          }
        ]
      },
      "q6Evidence": "VALID",
      "heading": {
        "reject": false,
        "rateDegPerS": 0.13563327141239748,
        "dt": 3
      },
      "headingReject": false
    },
    "q": {
      "Q1": true,
      "Q2": true,
      "Q3": true,
      "Q4": true,
      "Q5": false,
      "Q6": false
    }
  },
  {
    "label": "2026-10-16T03:50:23Z",
    "refKmh": 132,
    "c4Kmh": 148.2894329471151,
    "c51Kmh": 125.89577000351147,
    "repairState": "REPAIR_ACCEPTED",
    "eligibilitySignals": [
      "S1",
      "S2",
      "S4"
    ],
    "trace": {
      "label": "2026-10-16T03:50:23Z",
      "eligibilitySignals": [
        "S1",
        "S2",
        "S4"
      ],
      "inWindow": true,
      "timeSuspects": [
        "2026-10-16T03:50:22Z"
      ],
      "attributionP": "2026-10-16T03:50:22Z",
      "attributionOffsetS": 1,
      "looDetail": {
        "v1Kmh": 64.51306933814512,
        "v2Kmh": 255.9605404619024,
        "crossM": 0.16932214692751835,
        "vAbKmh": 128.3281733406095
      },
      "manoeuvreGuard": {
        "pass": true,
        "detail": {
          "vAbKmh": 128.3281733406095,
          "vPreKmh": 129.23934981289565,
          "vPostKmh": 126.92532305839849
        }
      },
      "manoeuvreTroughGuard": {
        "pass": true,
        "cand": 125.89577000351147
      },
      "support": {
        "h": 4,
        "totalForRule": 7,
        "left": 2,
        "right": 4,
        "supportLabelsUsed": [
          "2026-10-16T03:50:19Z",
          "2026-10-16T03:50:20Z",
          "2026-10-16T03:50:23Z",
          "2026-10-16T03:50:24Z",
          "2026-10-16T03:50:25Z",
          "2026-10-16T03:50:26Z",
          "2026-10-16T03:50:27Z"
        ],
        "slopeSupportLabels": [
          "2026-10-16T03:50:19Z",
          "2026-10-16T03:50:20Z",
          "2026-10-16T03:50:23Z",
          "2026-10-16T03:50:24Z",
          "2026-10-16T03:50:25Z",
          "2026-10-16T03:50:26Z",
          "2026-10-16T03:50:27Z"
        ],
        "centerInUsed": true
      },
      "candidateKmh": 125.89577000351147,
      "q": {
        "Q1": true,
        "Q2": true,
        "Q3": true,
        "Q4": true,
        "Q5": true,
        "Q6": true
      },
      "q5Detail": {
        "vCand": 0.6271324428040417,
        "vC4": 6.052608034532964,
        "neighborsExamined": [
          {
            "side": "prev",
            "label": "2026-10-16T03:50:22Z",
            "offsetS": -1,
            "present": true,
            "speedKmh": 128.15344679760602,
            "c4Quality": "JITTER_SUSPECT",
            "usable": true
          },
          {
            "side": "next",
            "label": "2026-10-16T03:50:24Z",
            "offsetS": 1,
            "present": true,
            "speedKmh": 126.50004402279643,
            "c4Quality": "OK",
            "usable": true
          }
        ]
      },
      "q5Evidence": "VALID",
      "q6Detail": {
        "reason": null,
        "vCandEffective": 0.6271324428040417,
        "vC4": 6.052608034532964,
        "c4Evidence": "VALID",
        "neighborsExamined": [
          {
            "side": "prev",
            "label": "2026-10-16T03:50:22Z",
            "offsetS": -1,
            "present": true,
            "speedKmh": 128.15344679760602,
            "c4Quality": "JITTER_SUSPECT",
            "usable": true
          },
          {
            "side": "next",
            "label": "2026-10-16T03:50:24Z",
            "offsetS": 1,
            "present": true,
            "speedKmh": 126.50004402279643,
            "c4Quality": "OK",
            "usable": true
          }
        ]
      },
      "q6Evidence": "VALID",
      "heading": {
        "reject": false,
        "rateDegPerS": 0.39627638172019175,
        "dt": 2
      },
      "headingReject": false
    },
    "q": {
      "Q1": true,
      "Q2": true,
      "Q3": true,
      "Q4": true,
      "Q5": true,
      "Q6": true
    }
  }
]
```
