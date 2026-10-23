# C5.1 experiment report

Generated: 2026-10-23T17:12:53.381Z

Verdict: **SAFE_OFFLINE_CANDIDATE**

## Gates

- PASS `A/B1_coverage` (TIG22) {"covC4":0.963,"covC51":0.963}
- PASS `A3_repair_accepted_lt_pass_through` (TIG22) {"repairAccepted":2,"passOutside":2056,"repairRejected":33,"uncertain":3}
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
- NOT_VERIFIED `D5_tig22_1904_unscored_gap` (TIG22) {"note":"19:04 remains UNSCORED_VIDEO_GAP per video reference; not asserted in offline event rows.","unscoredCount":0}
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
- PASS `D4_tes16_false_accel_removed` (TES16) {"c4Events":1,"c51Events":0}
- PASS `C3_tes16_critical_max_err` (TES16) {"maxErrKmh":6.1}
- PASS `TES21_1_brake_120523_not_worsened` (TES21-1) {"c4Kmh":14.858372594105312,"c51Kmh":14.858372594105312,"repairState":"REPAIR_REJECTED"}
- PASS `TES21_1_real_decel_preserved` (TES21-1) {"decelC4":1,"decelC51":1}
- PASS `H_synthetics` (ALL) {"syntheticsOk":true,"supportOk":true}

## Gate counts

{
  "pass": 74,
  "fail": 0,
  "notVerified": 9,
  "scored": 74,
  "total": 83
}

## Test integrity

{
  "algorithmFileSha256": "6aca50a074b09f04ff67a9cdfa7b188bd79c6e18f6780af79e773f30bb171352",
  "algorithmHeadPinned": "53f5acebc13f8ac45498b9ff7311e4152f30f1fe",
  "productionPin": "579ee8b2fed06593d7d2aa57cffb6036dbf53a24",
  "codeSha": "53f5acebc13f8ac45498b9ff7311e4152f30f1fe",
  "commands": [
    "node scripts/c5-1.support.test.cjs",
    "node scripts/c5-1.synthetic.test.cjs",
    "node scripts/run_c5_1_experiment.cjs --code-root <repo>"
  ],
  "syntheticAudit": {
    "schema": "C5_1_SYNTHETIC_TEST_AUDIT_V1",
    "scenarios": {
      "1_constant_cruise": {
        "legKmh": 99.96769340357089,
        "valueKmh": 99.9675553225025
      },
      "2_strong_accel": {
        "meanAccelMps2": 2.9966334953530347,
        "repairAccepted": 0
      },
      "3_strong_brake": {
        "meanAccelMps2": -2.164235302203072,
        "legSpeedsKmh": [
          100.68688544228179,
          89.89900486161817,
          79.1111242752659,
          68.32324369460225,
          57.535363111094306,
          46.74748252758635,
          35.9596019440784,
          25.171721360570448,
          14.383840777062495,
          7.1919203871090875,
          7.191920389953408,
          7.191920389953408,
          7.1919203871090875
        ]
      },
      "4_heading_veto": {
        "cornerRateDegPerS": 38.490588103023256,
        "straightRepairState": "REPAIR_ACCEPTED",
        "gatesWithoutHeading": true,
        "headingRejectOnCornerGeometry": true,
        "vetoBlocksCandidacy": true
      },
      "5_start_from_stop": {
        "vEarlyKmh": 0,
        "vLateKmh": 61.131323304648845
      },
      "6_time_suspect": {
        "attributed": true,
        "accepted": 2
      },
      "7_quarantine": {
        "labels": [
          "2027-01-15T08:03:24Z",
          "2027-01-15T08:03:25Z",
          "2027-01-15T08:03:26Z"
        ]
      },
      "8_missing_bucket": {
        "absent": "2027-01-15T08:03:24Z"
      },
      "9_brake_protection": {
        "unitGuard": {
          "reason": "upward_at_c4_trough_attribution_astern",
          "leftMax": 50.343373185334364,
          "rightMax": 21.575731363924305,
          "c4Kmh": 14.5,
          "cand": 21
        },
        "integration": "VERIFIED",
        "target": {
          "label": "2027-01-15T08:11:46Z",
          "c4": 46.74741795730257,
          "c51": 46.74741795730257,
          "state": "REPAIR_REJECTED"
        }
      }
    }
  },
  "regressionBaseline": "/workspace/.worktrees/ds4-speed-ref/research/driving-intelligence/evaluations/ds4-c5-1-gated-repair-20261023/outputs/baselines/c5_1_v1_1_regression_fingerprint_53f5acebc.json",
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
        "vC4": 4.53397027959494
      },
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
        "vC4": 5.593329485974745
      },
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
        "vC4": 6.052608034532964
      },
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
