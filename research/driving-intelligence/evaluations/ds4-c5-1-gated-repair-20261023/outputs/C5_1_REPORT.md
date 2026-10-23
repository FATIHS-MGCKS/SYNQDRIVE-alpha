# C5.1 experiment report

Generated: 2026-10-23T16:03:01.169Z

Verdict: **PROVEN_FOR_LOCAL_REPAIR**

## Gates

- PASS `A/B1_coverage` (TIG22) {"covC4":0.963,"covC51":0.963}
- PASS `B2_no_numeric_loss` (TIG22) {"lost":0}
- PASS `A_pass_through_fields` (TIG22) {"violations":0}
- PASS `F1_quarantine_parity` (TIG22) {}
- PASS `F3_max_support_offset` (TIG22) {"max":4}
- PASS `G1_eligibility_pct` (TIG22) {"pct":1.81,"eligible":38,"grid":2094}
- PASS `C1_common_mae` (TIG22) {"maeC4":2.905,"maeC51":2.9,"n":1364}
- PASS `C2_common_p95` (TIG22) {"p95C4":5.918,"p95C51":5.903}
- PASS `D1_confirmed_recall` (TIG22) {"oracleHardMissedC4":1,"oracleHardMissedC51":1}
- PASS `D2_hard_false_alarms` (TIG22) {"hardFalseAlarmsC4":0,"hardFalseAlarmsC51":0}
- PASS `E1_false_motion_still` (TIG22) {"c4":0,"c51":0}
- PASS `E2_false_still_motion` (TIG22) {"c4":0,"c51":0}
- PASS `PRODUCTION_C4_REPLAY_PARITY` (TIG22) {"mismatches":0}
- PASS `A/B1_coverage` (TES21-1) {"covC4":0.655,"covC51":0.655}
- PASS `B2_no_numeric_loss` (TES21-1) {"lost":0}
- PASS `A_pass_through_fields` (TES21-1) {"violations":0}
- PASS `F1_quarantine_parity` (TES21-1) {}
- PASS `F3_max_support_offset` (TES21-1) {"max":4}
- PASS `G1_eligibility_pct` (TES21-1) {"pct":8.63,"eligible":46,"grid":533}
- PASS `C1_common_mae` (TES21-1) {"maeC4":2.292,"maeC51":2.333,"n":150}
- PASS `C2_common_p95` (TES21-1) {"p95C4":8.562,"p95C51":8.562}
- PASS `D1_confirmed_recall` (TES21-1) {"oracleHardMissedC4":1,"oracleHardMissedC51":1}
- PASS `D2_hard_false_alarms` (TES21-1) {"hardFalseAlarmsC4":1,"hardFalseAlarmsC51":1}
- PASS `E1_false_motion_still` (TES21-1) {"c4":0,"c51":0}
- PASS `E2_false_still_motion` (TES21-1) {"c4":0,"c51":0}
- PASS `PRODUCTION_C4_REPLAY_PARITY` (TES21-1) {"mismatches":0}
- PASS `A/B1_coverage` (TES21-2) {"covC4":0.746,"covC51":0.746}
- PASS `B2_no_numeric_loss` (TES21-2) {"lost":0}
- PASS `A_pass_through_fields` (TES21-2) {"violations":0}
- PASS `F1_quarantine_parity` (TES21-2) {}
- PASS `F3_max_support_offset` (TES21-2) {"max":4}
- PASS `G1_eligibility_pct` (TES21-2) {"pct":3.36,"eligible":18,"grid":535}
- PASS `C1_common_mae` (TES21-2) {"maeC4":3.605,"maeC51":3.605,"n":179}
- PASS `C2_common_p95` (TES21-2) {"p95C4":10.954,"p95C51":10.954}
- PASS `D1_confirmed_recall` (TES21-2) {"oracleHardMissedC4":0,"oracleHardMissedC51":0}
- PASS `D2_hard_false_alarms` (TES21-2) {"hardFalseAlarmsC4":0,"hardFalseAlarmsC51":0}
- PASS `E1_false_motion_still` (TES21-2) {"c4":0,"c51":0}
- PASS `E2_false_still_motion` (TES21-2) {"c4":0,"c51":0}
- PASS `PRODUCTION_C4_REPLAY_PARITY` (TES21-2) {"mismatches":0}
- PASS `A/B1_coverage` (TES16) {"covC4":0.83,"covC51":0.83}
- PASS `B2_no_numeric_loss` (TES16) {"lost":0}
- PASS `A_pass_through_fields` (TES16) {"violations":0}
- PASS `F1_quarantine_parity` (TES16) {}
- PASS `F3_max_support_offset` (TES16) {"max":4}
- PASS `G1_eligibility_pct` (TES16) {"pct":1.5,"eligible":17,"grid":1136}
- PASS `C1_common_mae` (TES16) {"maeC4":2.272,"maeC51":2.239,"n":808}
- PASS `C2_common_p95` (TES16) {"p95C4":4.485,"p95C51":4.478}
- PASS `D1_confirmed_recall` (TES16) {"oracleHardMissedC4":0,"oracleHardMissedC51":0}
- PASS `D2_hard_false_alarms` (TES16) {"hardFalseAlarmsC4":1,"hardFalseAlarmsC51":0}
- PASS `E1_false_motion_still` (TES16) {"c4":0,"c51":0}
- PASS `E2_false_still_motion` (TES16) {"c4":0,"c51":0}
- PASS `PRODUCTION_C4_REPLAY_PARITY` (TES16) {"mismatches":0}
- PASS `D4_tes16_false_accel_removed` (TES16) {"c4Events":1,"c51Events":0}
- PASS `C3_tes16_critical_max_err` (TES16) {"maxErrKmh":6.1}
- PASS `H_synthetics` (ALL) {}

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
      "support": {
        "h": 4,
        "totalForRule": 8,
        "left": 4,
        "right": 2,
        "slopeSupportLabels": [
          "2026-10-16T03:50:16Z",
          "2026-10-16T03:50:17Z",
          "2026-10-16T03:50:18Z",
          "2026-10-16T03:50:19Z",
          "2026-10-16T03:50:20Z",
          "2026-10-16T03:50:23Z",
          "2026-10-16T03:50:24Z"
        ],
        "centerIncludedInCount": true
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
      "support": {
        "h": 4,
        "totalForRule": 7,
        "left": 3,
        "right": 4,
        "slopeSupportLabels": [
          "2026-10-16T03:50:18Z",
          "2026-10-16T03:50:19Z",
          "2026-10-16T03:50:20Z",
          "2026-10-16T03:50:23Z",
          "2026-10-16T03:50:24Z",
          "2026-10-16T03:50:25Z",
          "2026-10-16T03:50:26Z"
        ],
        "centerIncludedInCount": true
      },
      "candidateKmh": 126.71268354059747,
      "q": {
        "Q1": true,
        "Q2": true,
        "Q3": true,
        "Q4": true,
        "Q5": true,
        "Q6": false
      },
      "headingReject": false
    },
    "q": {
      "Q1": true,
      "Q2": true,
      "Q3": true,
      "Q4": true,
      "Q5": true,
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
      "support": {
        "h": 4,
        "totalForRule": 8,
        "left": 2,
        "right": 4,
        "slopeSupportLabels": [
          "2026-10-16T03:50:19Z",
          "2026-10-16T03:50:20Z",
          "2026-10-16T03:50:23Z",
          "2026-10-16T03:50:24Z",
          "2026-10-16T03:50:25Z",
          "2026-10-16T03:50:26Z",
          "2026-10-16T03:50:27Z"
        ],
        "centerIncludedInCount": true
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
