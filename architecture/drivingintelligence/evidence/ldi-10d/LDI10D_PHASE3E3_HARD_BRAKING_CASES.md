# Hard braking — three case studies



Not emergency / red-light claims.



## P3E_HARD_BRK_256_merged

```json
{
  "eventId": "P3E_HARD_BRK_256_merged",
  "startUtc": "2026-10-16T03:40:15Z",
  "endUtc": "2026-10-16T03:40:17Z",
  "speedBeforeKmh": 27.14128655115893,
  "speedAfterKmh": 21.51179265162189,
  "deltaKmh": -5.629493899537042,
  "minObservedSpeedKmh": 13.34944358042911,
  "subsequentAcceleration": -8.162349071192779,
  "baselineAssociation": {
    "bucketLabelUtc": "2026-10-16T03:40:15Z",
    "lat": 51.330589,
    "lon": 9.512613,
    "gpsStatus": "PRESENT",
    "headingDeg": 101.1992998225013,
    "outcome": "AMBIGUOUS",
    "osmWayId": null,
    "candidateWayIds": [
      410688039,
      1358349018,
      738657621
    ],
    "ambiguityReasons": [
      "COMPETING_WAYS_WITHIN_5M"
    ],
    "nearestConfirmedJunctionM": 6.086480615312636,
    "confirmedJunctionNodeId": 12571148603,
    "trafficSignalNodeId": 1975690266,
    "trafficSignalDistanceM": 26.032893119895064,
    "temporalContinuityWayId": null,
    "provenance": [
      "LDI10D_TESLA_OSM_FROZEN_SNAPSHOT.json",
      "phase3e1_bucket_association_v1"
    ]
  },
  "candidateAssociation": {
    "bucketLabelUtc": "2026-10-16T03:40:15Z",
    "lat": 51.330589,
    "lon": 9.512613,
    "gpsStatus": "PRESENT",
    "headingDeg": 101.1992998225013,
    "outcome": "AMBIGUOUS",
    "osmWayId": 410688039,
    "candidateWayIds": [
      410688039,
      1358349018,
      738657621
    ],
    "ambiguityReasons": [
      "VITERBI_COMPETING_OR_HIGH_COST"
    ],
    "nearestConfirmedJunctionM": null,
    "confirmedJunctionNodeId": null,
    "trafficSignalNodeId": null,
    "trafficSignalDistanceM": null,
    "temporalContinuityWayId": 410688039,
    "provenance": [
      "phase3e2_viterbi_forward_v1"
    ]
  },
  "junctionProximityM": 6.086480615312636,
  "signalDistanceM": 26.032893119895064,
  "notEmergencyNotRedLight": true,
  "competingExplanations": [
    "not_emergency_without_independent_evidence"
  ]
}
```

## P3E_HARD_BRK_344_merged_merged_merged

```json
{
  "eventId": "P3E_HARD_BRK_344_merged_merged_merged",
  "startUtc": "2026-10-16T03:41:43Z",
  "endUtc": "2026-10-16T03:41:47Z",
  "speedBeforeKmh": 55.08765136545298,
  "speedAfterKmh": 47.48965977055267,
  "deltaKmh": -7.597991594900307,
  "minObservedSpeedKmh": 37.88855332049125,
  "subsequentAcceleration": -9.601106450061422,
  "baselineAssociation": {
    "bucketLabelUtc": "2026-10-16T03:41:43Z",
    "lat": 51.323948,
    "lon": 9.512952,
    "gpsStatus": "PRESENT",
    "headingDeg": 182.4772679006731,
    "outcome": "AMBIGUOUS",
    "osmWayId": null,
    "candidateWayIds": [
      427206838,
      573848031,
      1113727173,
      427113535
    ],
    "ambiguityReasons": [
      "COMPETING_WAYS_WITHIN_5M"
    ],
    "nearestConfirmedJunctionM": 11.786148982737277,
    "confirmedJunctionNodeId": 7783091671,
    "trafficSignalNodeId": null,
    "trafficSignalDistanceM": null,
    "temporalContinuityWayId": null,
    "provenance": [
      "LDI10D_TESLA_OSM_FROZEN_SNAPSHOT.json",
      "phase3e1_bucket_association_v1"
    ]
  },
  "candidateAssociation": {
    "bucketLabelUtc": "2026-10-16T03:41:43Z",
    "lat": 51.323948,
    "lon": 9.512952,
    "gpsStatus": "PRESENT",
    "headingDeg": 182.4772679006731,
    "outcome": "AMBIGUOUS",
    "osmWayId": 427206838,
    "candidateWayIds": [
      427206838,
      573848031,
      1113727173,
      427113535
    ],
    "ambiguityReasons": [
      "VITERBI_COMPETING_OR_HIGH_COST"
    ],
    "nearestConfirmedJunctionM": null,
    "confirmedJunctionNodeId": null,
    "trafficSignalNodeId": null,
    "trafficSignalDistanceM": null,
    "temporalContinuityWayId": 427206838,
    "provenance": [
      "phase3e2_viterbi_forward_v1"
    ]
  },
  "junctionProximityM": 11.786148982737277,
  "signalDistanceM": null,
  "notEmergencyNotRedLight": true,
  "competingExplanations": [
    "not_emergency_without_independent_evidence"
  ]
}
```

## P3E_HARD_BRK_736_merged_merged

```json
{
  "eventId": "P3E_HARD_BRK_736_merged_merged",
  "startUtc": "2026-10-16T03:48:15Z",
  "endUtc": "2026-10-16T03:48:18Z",
  "speedBeforeKmh": 64.44675928519425,
  "speedAfterKmh": 56.46483035798181,
  "deltaKmh": -7.9819289272124365,
  "minObservedSpeedKmh": 47.33271750821854,
  "subsequentAcceleration": -9.132112849763267,
  "baselineAssociation": {
    "bucketLabelUtc": "2026-10-16T03:48:15Z",
    "lat": 51.289476,
    "lon": 9.50288,
    "gpsStatus": "PRESENT",
    "headingDeg": 239.0519072436603,
    "outcome": "CONFIRMED",
    "osmWayId": 390812607,
    "candidateWayIds": [
      390812607
    ],
    "ambiguityReasons": [],
    "nearestConfirmedJunctionM": 42.09307126570641,
    "confirmedJunctionNodeId": 3939471929,
    "trafficSignalNodeId": null,
    "trafficSignalDistanceM": null,
    "temporalContinuityWayId": 390812607,
    "provenance": [
      "LDI10D_TESLA_OSM_FROZEN_SNAPSHOT.json",
      "phase3e1_bucket_association_v1"
    ]
  },
  "candidateAssociation": {
    "bucketLabelUtc": "2026-10-16T03:48:15Z",
    "lat": 51.289476,
    "lon": 9.50288,
    "gpsStatus": "PRESENT",
    "headingDeg": 239.0519072436603,
    "outcome": "CONFIRMED",
    "osmWayId": 390812607,
    "candidateWayIds": [
      390812607
    ],
    "ambiguityReasons": [],
    "nearestConfirmedJunctionM": null,
    "confirmedJunctionNodeId": null,
    "trafficSignalNodeId": null,
    "trafficSignalDistanceM": null,
    "temporalContinuityWayId": 390812607,
    "provenance": [
      "phase3e2_viterbi_forward_v1"
    ]
  },
  "junctionProximityM": 42.09307126570641,
  "signalDistanceM": null,
  "notEmergencyNotRedLight": true,
  "competingExplanations": [
    "not_emergency_without_independent_evidence"
  ]
}
```