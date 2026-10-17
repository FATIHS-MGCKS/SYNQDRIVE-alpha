# LDI10C — Per-group audit

**Groups:** 32 · **Candidates traced:** 75

## MANEUVER_ACCELERATION_1

### Evidence

```json
{
  "candidates": [
    "L3_ACCEL_1",
    "L3_ACCEL_2"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 3,
    "trusted": 3,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.6687783,
      51.4078733
    ],
    [
      9.66877,
      51.4078283
    ],
    [
      9.668765,
      51.40776
    ]
  ],
  "pathLengthM": 12.639307426571095
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_DECELERATION_17

### Evidence

```json
{
  "candidates": [
    "L3_DECEL_1",
    "L3_DECEL_2",
    "L3_DECEL_3"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 4,
    "trusted": 4,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.668745,
      51.4075983
    ],
    [
      9.6687383,
      51.40753
    ],
    [
      9.6687283,
      51.4074683
    ],
    [
      9.6687266,
      51.407425
    ]
  ],
  "pathLengthM": 19.320701493702504
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_ACCELERATION_2

### Evidence

```json
{
  "candidates": [
    "L3_ACCEL_3",
    "L3_ACCEL_4",
    "L3_ACCEL_5",
    "L3_ACCEL_6",
    "L3_ACCEL_7"
  ],
  "ldi10bPlausibility": "UNCLEAR_QC_OR_GAPS",
  "qcInWindow": {
    "bucketsInWindow": 6,
    "trusted": 5,
    "trustedLimited": 0,
    "untrusted": 1,
    "rowAbsentGps": 0,
    "trustedFraction": 0.8333333333333334
  },
  "coordinates": [
    [
      9.66874,
      51.4073916
    ],
    [
      9.668775,
      51.4073583
    ],
    [
      9.668845,
      51.4073316
    ],
    [
      9.6689416,
      51.407325
    ],
    [
      9.6690516,
      51.4073266
    ],
    [
      9.669175,
      51.40733
    ]
  ],
  "pathLengthM": 33.05837011355818
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [
    {
      "evaluationIndexUtc": "2026-10-13T15:53:15Z",
      "bearingDeltaDeg": 25.30527256222348,
      "epistemic": "OBSERVED_GPS_BEARING_CHANGE",
      "notMapVerifiedCurve": true
    },
    {
      "evaluationIndexUtc": "2026-10-13T15:53:16Z",
      "bearingDeltaDeg": 25.194232048750507,
      "epistemic": "OBSERVED_GPS_BEARING_CHANGE",
      "notMapVerifiedCurve": true
    }
  ],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- UNTRUSTED L3 QC overlaps maneuver — speed/coordinate coupling uncertain
- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_DECELERATION_18

### Evidence

```json
{
  "candidates": [
    "L3_DECEL_4",
    "L3_DECEL_5"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 3,
    "trusted": 3,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.6696016,
      51.4073566
    ],
    [
      9.6697283,
      51.40737
    ],
    [
      9.66983,
      51.4073733
    ]
  ],
  "pathLengthM": 15.977027010630444
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_ACCELERATION_3

### Evidence

```json
{
  "candidates": [
    "L3_ACCEL_8",
    "L3_ACCEL_9",
    "L3_ACCEL_10"
  ],
  "ldi10bPlausibility": "UNCLEAR_QC_OR_GAPS",
  "qcInWindow": {
    "bucketsInWindow": 4,
    "trusted": 2,
    "trustedLimited": 0,
    "untrusted": 2,
    "rowAbsentGps": 0,
    "trustedFraction": 0.5
  },
  "coordinates": [
    [
      9.6699783,
      51.4073333
    ],
    [
      9.6700283,
      51.4072816
    ],
    [
      9.6700583,
      51.4072066
    ],
    [
      9.6700866,
      51.4071216
    ]
  ],
  "pathLengthM": 24.9624041816885
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- UNTRUSTED L3 QC overlaps maneuver — speed/coordinate coupling uncertain
- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_ACCELERATION_4

### Evidence

```json
{
  "candidates": [
    "L3_ACCEL_11",
    "L3_ACCEL_12"
  ],
  "ldi10bPlausibility": "UNCLEAR_QC_OR_GAPS",
  "qcInWindow": {
    "bucketsInWindow": 3,
    "trusted": 2,
    "trustedLimited": 0,
    "untrusted": 1,
    "rowAbsentGps": 0,
    "trustedFraction": 0.6666666666666666
  },
  "coordinates": [
    [
      9.669735,
      51.4065633
    ],
    [
      9.6696033,
      51.4065716
    ],
    [
      9.6694533,
      51.406585
    ]
  ],
  "pathLengthM": 19.692007582871952
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- UNTRUSTED L3 QC overlaps maneuver — speed/coordinate coupling uncertain
- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_DECELERATION_19

### Evidence

```json
{
  "candidates": [
    "L3_DECEL_6",
    "L3_DECEL_7",
    "L3_DECEL_8"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 4,
    "trusted": 4,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.668645,
      51.4066366
    ],
    [
      9.6685016,
      51.4066533
    ],
    [
      9.6683716,
      51.4066683
    ],
    [
      9.668265,
      51.406675
    ]
  ],
  "pathLengthM": 26.71987396776127
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_ACCELERATION_5

### Evidence

```json
{
  "candidates": [
    "L3_ACCEL_13",
    "L3_ACCEL_14"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 3,
    "trusted": 3,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.6681166,
      51.4066166
    ],
    [
      9.6680883,
      51.4065516
    ],
    [
      9.6680683,
      51.4064666
    ]
  ],
  "pathLengthM": 17.042318223690234
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [
    {
      "evaluationIndexUtc": "2026-10-13T15:53:50Z",
      "bearingDeltaDeg": 26.714831123872045,
      "epistemic": "OBSERVED_GPS_BEARING_CHANGE",
      "notMapVerifiedCurve": true
    }
  ],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_DECELERATION_20

### Evidence

```json
{
  "candidates": [
    "L3_DECEL_9",
    "L3_DECEL_10",
    "L3_DECEL_11"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 4,
    "trusted": 4,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.6679633,
      51.406185
    ],
    [
      9.6679116,
      51.406105
    ],
    [
      9.667865,
      51.4060433
    ],
    [
      9.6678283,
      51.4060016
    ]
  ],
  "pathLengthM": 22.46489241338925
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_ACCELERATION_6

### Evidence

```json
{
  "candidates": [
    "L3_ACCEL_15",
    "L3_ACCEL_16",
    "L3_ACCEL_17",
    "L3_ACCEL_18"
  ],
  "ldi10bPlausibility": "UNCLEAR_QC_OR_GAPS",
  "qcInWindow": {
    "bucketsInWindow": 5,
    "trusted": 3,
    "trustedLimited": 0,
    "untrusted": 2,
    "rowAbsentGps": 0,
    "trustedFraction": 0.6
  },
  "coordinates": [
    [
      9.6677983,
      51.4059416
    ],
    [
      9.667825,
      51.4059033
    ],
    [
      9.6679016,
      51.4058633
    ],
    [
      9.6680216,
      51.4058316
    ],
    [
      9.6681683,
      51.4058016
    ]
  ],
  "pathLengthM": 31.32084823548405
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [
    {
      "evaluationIndexUtc": "2026-10-13T15:54:05Z",
      "bearingDeltaDeg": 25.777120649884495,
      "epistemic": "OBSERVED_GPS_BEARING_CHANGE",
      "notMapVerifiedCurve": true
    },
    {
      "evaluationIndexUtc": "2026-10-13T15:54:06Z",
      "bearingDeltaDeg": 26.564076295979135,
      "epistemic": "OBSERVED_GPS_BEARING_CHANGE",
      "notMapVerifiedCurve": true
    }
  ],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- UNTRUSTED L3 QC overlaps maneuver — speed/coordinate coupling uncertain
- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_ACCELERATION_7

### Evidence

```json
{
  "candidates": [
    "L3_ACCEL_19",
    "L3_ACCEL_20"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 3,
    "trusted": 3,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.6688666,
      51.4055883
    ],
    [
      9.669005,
      51.4055316
    ],
    [
      9.66916,
      51.4054683
    ]
  ],
  "pathLengthM": 24.335655388254576
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_DECELERATION_21

### Evidence

```json
{
  "candidates": [
    "L3_DECEL_12"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 2,
    "trusted": 2,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.6717283,
      51.4045833
    ],
    [
      9.6718283,
      51.4045416
    ]
  ],
  "pathLengthM": 8.343600080228592
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_ACCELERATION_8

### Evidence

```json
{
  "candidates": [
    "L3_ACCEL_21",
    "L3_ACCEL_22",
    "L3_ACCEL_23"
  ],
  "ldi10bPlausibility": "UNCLEAR_QC_OR_GAPS",
  "qcInWindow": {
    "bucketsInWindow": 4,
    "trusted": 1,
    "trustedLimited": 0,
    "untrusted": 3,
    "rowAbsentGps": 0,
    "trustedFraction": 0.25
  },
  "coordinates": [
    [
      9.6719416,
      51.404435
    ],
    [
      9.671925,
      51.40436
    ],
    [
      9.6718866,
      51.4042716
    ],
    [
      9.67185,
      51.4041683
    ]
  ],
  "pathLengthM": 30.366532802480606
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [
    {
      "evaluationIndexUtc": "2026-10-13T15:54:36Z",
      "bearingDeltaDeg": 28.694555555384767,
      "epistemic": "OBSERVED_GPS_BEARING_CHANGE",
      "notMapVerifiedCurve": true
    }
  ],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- UNTRUSTED L3 QC overlaps maneuver — speed/coordinate coupling uncertain
- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_DECELERATION_22

### Evidence

```json
{
  "candidates": [
    "L3_DECEL_13",
    "L3_DECEL_14",
    "L3_DECEL_15",
    "L3_DECEL_16"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 5,
    "trusted": 5,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.6653133,
      51.400765
    ],
    [
      9.6651333,
      51.4007416
    ],
    [
      9.6649716,
      51.400725
    ],
    [
      9.6648333,
      51.4007083
    ],
    [
      9.6647166,
      51.4006933
    ]
  ],
  "pathLengthM": 42.160918521233
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_DECELERATION_23

### Evidence

```json
{
  "candidates": [
    "L3_DECEL_17"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 2,
    "trusted": 2,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.6627966,
      51.4004
    ],
    [
      9.6627183,
      51.4003866
    ]
  ],
  "pathLengthM": 5.632458496641545
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_DECELERATION_24

### Evidence

```json
{
  "candidates": [
    "L3_DECEL_18"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 2,
    "trusted": 2,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.6602833,
      51.4000466
    ],
    [
      9.6601783,
      51.4000333
    ]
  ],
  "pathLengthM": 7.432693776793221
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_ACCELERATION_9

### Evidence

```json
{
  "candidates": [
    "L3_ACCEL_24",
    "L3_ACCEL_25",
    "L3_ACCEL_26"
  ],
  "ldi10bPlausibility": "UNCLEAR_QC_OR_GAPS",
  "qcInWindow": {
    "bucketsInWindow": 4,
    "trusted": 3,
    "trustedLimited": 0,
    "untrusted": 1,
    "rowAbsentGps": 0,
    "trustedFraction": 0.75
  },
  "coordinates": [
    [
      9.6601016,
      51.4000233
    ],
    [
      9.6600183,
      51.400015
    ],
    [
      9.65991,
      51.4000066
    ],
    [
      9.659775,
      51.4000016
    ]
  ],
  "pathLengthM": 22.80453285787
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- UNTRUSTED L3 QC overlaps maneuver — speed/coordinate coupling uncertain
- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_DECELERATION_25

### Evidence

```json
{
  "candidates": [
    "L3_DECEL_19",
    "L3_DECEL_20",
    "L3_DECEL_21"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 4,
    "trusted": 4,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.6593033,
      51.399995
    ],
    [
      9.6591433,
      51.3999916
    ],
    [
      9.6590116,
      51.3999883
    ],
    [
      9.65892,
      51.3999883
    ]
  ],
  "pathLengthM": 26.604189710039467
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_ACCELERATION_10

### Evidence

```json
{
  "candidates": [
    "L3_ACCEL_27",
    "L3_ACCEL_28",
    "L3_ACCEL_29"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 4,
    "trusted": 4,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.658785,
      51.3999883
    ],
    [
      9.6587066,
      51.39999
    ],
    [
      9.6585966,
      51.3999966
    ],
    [
      9.6584683,
      51.4000116
    ]
  ],
  "pathLengthM": 22.163618422153522
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_DECELERATION_26

### Evidence

```json
{
  "candidates": [
    "L3_DECEL_22",
    "L3_DECEL_23"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 3,
    "trusted": 3,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.65775,
      51.4001966
    ],
    [
      9.6576233,
      51.4002383
    ],
    [
      9.6575233,
      51.40027
    ]
  ],
  "pathLengthM": 17.718854996307112
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_ACCELERATION_11

### Evidence

```json
{
  "candidates": [
    "L3_ACCEL_30",
    "L3_ACCEL_31"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 3,
    "trusted": 3,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.657335,
      51.4003066
    ],
    [
      9.6572216,
      51.4003183
    ],
    [
      9.6570883,
      51.40033
    ]
  ],
  "pathLengthM": 17.311932228238437
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_DECELERATION_27

### Evidence

```json
{
  "candidates": [
    "L3_DECEL_24"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 2,
    "trusted": 2,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.6568033,
      51.4003633
    ],
    [
      9.6566733,
      51.40038
    ]
  ],
  "pathLengthM": 9.20751622636344
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_ACCELERATION_12

### Evidence

```json
{
  "candidates": [
    "L3_ACCEL_32",
    "L3_ACCEL_33"
  ],
  "ldi10bPlausibility": "UNCLEAR_QC_OR_GAPS",
  "qcInWindow": {
    "bucketsInWindow": 3,
    "trusted": 2,
    "trustedLimited": 0,
    "untrusted": 1,
    "rowAbsentGps": 0,
    "trustedFraction": 0.6666666666666666
  },
  "coordinates": [
    [
      9.656465,
      51.40044
    ],
    [
      9.6563766,
      51.4004916
    ],
    [
      9.6563033,
      51.400565
    ]
  ],
  "pathLengthM": 18.014200572638366
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- UNTRUSTED L3 QC overlaps maneuver — speed/coordinate coupling uncertain
- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_ACCELERATION_13

### Evidence

```json
{
  "candidates": [
    "L3_ACCEL_34",
    "L3_ACCEL_35"
  ],
  "ldi10bPlausibility": "UNCLEAR_QC_OR_GAPS",
  "qcInWindow": {
    "bucketsInWindow": 3,
    "trusted": 2,
    "trustedLimited": 0,
    "untrusted": 1,
    "rowAbsentGps": 0,
    "trustedFraction": 0.6666666666666666
  },
  "coordinates": [
    [
      9.656245,
      51.400655
    ],
    [
      9.6561966,
      51.40075
    ],
    [
      9.65616,
      51.4008616
    ]
  ],
  "pathLengthM": 23.750706385287202
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- UNTRUSTED L3 QC overlaps maneuver — speed/coordinate coupling uncertain
- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_DECELERATION_28

### Evidence

```json
{
  "candidates": [
    "L3_DECEL_25",
    "L3_DECEL_26",
    "L3_DECEL_27",
    "L3_DECEL_28"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 5,
    "trusted": 5,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.6561316,
      51.4016
    ],
    [
      9.6561316,
      51.4017183
    ],
    [
      9.656125,
      51.4018166
    ],
    [
      9.65612,
      51.401905
    ],
    [
      9.6561166,
      51.4019666
    ]
  ],
  "pathLengthM": 40.78382151024873
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_ACCELERATION_14

### Evidence

```json
{
  "candidates": [
    "L3_ACCEL_36",
    "L3_ACCEL_37"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 3,
    "trusted": 3,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.65642,
      51.4020466
    ],
    [
      9.6564616,
      51.401995
    ],
    [
      9.6564883,
      51.4019183
    ]
  ],
  "pathLengthM": 15.149935426931545
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [
    {
      "evaluationIndexUtc": "2026-10-13T15:57:13Z",
      "bearingDeltaDeg": 30.877509023165032,
      "epistemic": "OBSERVED_GPS_BEARING_CHANGE",
      "notMapVerifiedCurve": true
    }
  ],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_DECELERATION_29

### Evidence

```json
{
  "candidates": [
    "L3_DECEL_29",
    "L3_DECEL_30",
    "L3_DECEL_31"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 4,
    "trusted": 4,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.6565233,
      51.40175
    ],
    [
      9.65654,
      51.4016666
    ],
    [
      9.6565566,
      51.4015933
    ],
    [
      9.656575,
      51.4015333
    ]
  ],
  "pathLengthM": 24.369965079914692
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_DECELERATION_30

### Evidence

```json
{
  "candidates": [
    "L3_DECEL_32",
    "L3_DECEL_33"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 3,
    "trusted": 3,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.657085,
      51.4014466
    ],
    [
      9.6571666,
      51.4014516
    ],
    [
      9.657225,
      51.4014566
    ]
  ],
  "pathLengthM": 9.77701632448316
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_DECELERATION_31

### Evidence

```json
{
  "candidates": [
    "L3_DECEL_34"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 2,
    "trusted": 2,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.65727,
      51.4014616
    ],
    [
      9.657305,
      51.4014633
    ]
  ],
  "pathLengthM": 2.4352985027131977
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_ACCELERATION_15

### Evidence

```json
{
  "candidates": [
    "L3_ACCEL_38",
    "L3_ACCEL_39"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 3,
    "trusted": 3,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.657325,
      51.401465
    ],
    [
      9.6573633,
      51.4014683
    ],
    [
      9.657425,
      51.4014783
    ]
  ],
  "pathLengthM": 7.104301597480341
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_DECELERATION_32

### Evidence

```json
{
  "candidates": [
    "L3_DECEL_35"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 2,
    "trusted": 2,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.6577666,
      51.40154
    ],
    [
      9.6578016,
      51.4015466
    ]
  ],
  "pathLengthM": 2.5364373665547992
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox

## MANEUVER_ACCELERATION_16

### Evidence

```json
{
  "candidates": [
    "L3_ACCEL_40"
  ],
  "ldi10bPlausibility": "PLAUSIBLE",
  "qcInWindow": {
    "bucketsInWindow": 2,
    "trusted": 2,
    "trustedLimited": 0,
    "untrusted": 0,
    "rowAbsentGps": 0,
    "trustedFraction": 1
  },
  "coordinates": [
    [
      9.6578616,
      51.4015533
    ],
    [
      9.65792,
      51.4015633
    ]
  ],
  "pathLengthM": 4.201031042410711
}
```

### Spatial context

```json
{
  "mapFeatures": "UNAVAILABLE_FROZEN_OSM",
  "observedCurvatureProxies": [],
  "observedLowSpeedBuckets": [],
  "notBrakeCauseNotIntent": true
}
```

### Unresolved

- Road network context requires owner-approved frozen OSM capture for bbox
