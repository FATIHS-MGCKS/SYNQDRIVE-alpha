# Hard braking case studies (3 candidates)



Contextual only — not emergency braking claims.



## P3E_HARD_BRK_256_merged

```json
{
  "eventId": "P3E_HARD_BRK_256_merged",
  "eventType": "HARD_BRAKING_CANDIDATE",
  "startUtc": "2026-10-16T03:40:15Z",
  "endUtc": "2026-10-16T03:40:17Z",
  "gps": [
    {
      "utc": "2026-10-16T03:40:15Z",
      "lat": 51.330589,
      "lon": 9.512613
    },
    {
      "utc": "2026-10-16T03:40:16Z",
      "lat": 51.330581,
      "lon": 9.512685
    },
    {
      "utc": "2026-10-16T03:40:17Z",
      "lat": 51.330577,
      "lon": 9.512718
    }
  ],
  "l3QcTimeline": [
    {
      "utc": "2026-10-16T03:40:15Z",
      "qc": "TRUSTED",
      "l3": 21.51179265162189,
      "tags": [
        "POSITION_PRESENT",
        "TRUSTED_SPEED"
      ]
    },
    {
      "utc": "2026-10-16T03:40:16Z",
      "qc": "TRUSTED",
      "l3": 13.34944358042911,
      "tags": [
        "POSITION_PRESENT",
        "TRUSTED_SPEED"
      ]
    },
    {
      "utc": "2026-10-16T03:40:17Z",
      "qc": "TRUSTED",
      "l3": 5.101907095063161,
      "tags": [
        "POSITION_PRESENT",
        "TRUSTED_SPEED"
      ]
    }
  ],
  "accelerationDecelerationEvidence": [
    "observed_L3_delta_kmh=-8.2"
  ],
  "roadAssociation": {
    "dominant": "AMBIGUOUS",
    "wayId": null,
    "candidateConfidence": "CONTEXT_SUPPORTED"
  },
  "junctionDistanceM": [
    6.086480615312636,
    11.164042211017845,
    13.499426895508314
  ],
  "trafficSignal": {
    "nodeId": 1975690266,
    "distanceM": 0.6818353641300935,
    "classification": "VEHICLE_RELEVANT_ROUTE",
    "aheadOnHeading": false,
    "notSignalPhase": true
  },
  "junctionForensic": {
    "nodeId": 12571148603,
    "forensicClass": "GRAPH_TOPOLOGY_NODE",
    "evidence": [
      "node 12571148603: 2 ways; two_way_oneway_pair",
      "confirmed_topology_but_not_near_route_or_low_road_class"
    ]
  },
  "curveContext": [],
  "evidenceClassification": "CONTEXT_SUPPORTED",
  "alternativeExplanations": [
    "not_emergency_without_independent_evidence"
  ],
  "missingEvidence": [],
  "notEmergencyNotSignalPhase": true
}
```

## P3E_HARD_BRK_344_merged_merged_merged

```json
{
  "eventId": "P3E_HARD_BRK_344_merged_merged_merged",
  "eventType": "HARD_BRAKING_CANDIDATE",
  "startUtc": "2026-10-16T03:41:43Z",
  "endUtc": "2026-10-16T03:41:47Z",
  "gps": [
    {
      "utc": "2026-10-16T03:41:43Z",
      "lat": 51.323948,
      "lon": 9.512952
    },
    {
      "utc": "2026-10-16T03:41:44Z",
      "lat": 51.323841,
      "lon": 9.512943
    },
    {
      "utc": "2026-10-16T03:41:45Z",
      "lat": 51.323759,
      "lon": 9.512935
    },
    {
      "utc": "2026-10-16T03:41:46Z",
      "lat": 51.3237,
      "lon": 9.512929
    },
    {
      "utc": "2026-10-16T03:41:47Z",
      "lat": 51.323663,
      "lon": 9.512925
    }
  ],
  "l3QcTimeline": [
    {
      "utc": "2026-10-16T03:41:43Z",
      "qc": "TRUSTED",
      "l3": 47.48965977055267,
      "tags": [
        "POSITION_PRESENT",
        "TRUSTED_SPEED"
      ]
    },
    {
      "utc": "2026-10-16T03:41:44Z",
      "qc": "TRUSTED",
      "l3": 37.88855332049125,
      "tags": [
        "POSITION_PRESENT",
        "TRUSTED_SPEED"
      ]
    },
    {
      "utc": "2026-10-16T03:41:45Z",
      "qc": "TRUSTED",
      "l3": 28.27556947130537,
      "tags": [
        "POSITION_PRESENT",
        "TRUSTED_SPEED"
      ]
    },
    {
      "utc": "2026-10-16T03:41:46Z",
      "qc": "TRUSTED",
      "l3": 19.25518693558073,
      "tags": [
        "POSITION_PRESENT",
        "TRUSTED_SPEED"
      ]
    },
    {
      "utc": "2026-10-16T03:41:47Z",
      "qc": "TRUSTED",
      "l3": 10.83421131374419,
      "tags": [
        "POSITION_PRESENT",
        "TRUSTED_SPEED"
      ]
    }
  ],
  "accelerationDecelerationEvidence": [
    "observed_L3_delta_kmh=-9.6"
  ],
  "roadAssociation": {
    "dominant": "AMBIGUOUS",
    "wayId": null,
    "candidateConfidence": "CONTEXT_SUPPORTED"
  },
  "junctionDistanceM": [
    11.786148982737277,
    19.700099616212903,
    13.876786211722507,
    7.496111284964911,
    3.8312251014829437
  ],
  "trafficSignal": {
    "nodeId": 3580338394,
    "distanceM": 2.5379667996959188,
    "classification": "PEDESTRIAN_ONLY",
    "aheadOnHeading": false,
    "notSignalPhase": true
  },
  "junctionForensic": {
    "nodeId": 7783091671,
    "forensicClass": "GRAPH_TOPOLOGY_NODE",
    "evidence": [
      "node 7783091671: 2 ways; two_way_oneway_pair",
      "confirmed_topology_but_not_near_route_or_low_road_class"
    ]
  },
  "curveContext": [],
  "evidenceClassification": "CONTEXT_SUPPORTED",
  "alternativeExplanations": [
    "not_emergency_without_independent_evidence"
  ],
  "missingEvidence": [],
  "notEmergencyNotSignalPhase": true
}
```

## P3E_HARD_BRK_736_merged_merged

```json
{
  "eventId": "P3E_HARD_BRK_736_merged_merged",
  "eventType": "HARD_BRAKING_CANDIDATE",
  "startUtc": "2026-10-16T03:48:15Z",
  "endUtc": "2026-10-16T03:48:18Z",
  "gps": [
    {
      "utc": "2026-10-16T03:48:15Z",
      "lat": 51.289476,
      "lon": 9.50288
    },
    {
      "utc": "2026-10-16T03:48:16Z",
      "lat": 51.289407,
      "lon": 9.502703
    },
    {
      "utc": "2026-10-16T03:48:17Z",
      "lat": 51.289351,
      "lon": 9.502559
    },
    {
      "utc": "2026-10-16T03:48:18Z",
      "lat": 51.289305,
      "lon": 9.502448
    }
  ],
  "l3QcTimeline": [
    {
      "utc": "2026-10-16T03:48:15Z",
      "qc": "TRUSTED",
      "l3": 56.46483035798181,
      "tags": [
        "POSITION_PRESENT",
        "TRUSTED_SPEED"
      ]
    },
    {
      "utc": "2026-10-16T03:48:16Z",
      "qc": "TRUSTED",
      "l3": 47.33271750821854,
      "tags": [
        "POSITION_PRESENT",
        "TRUSTED_SPEED"
      ]
    },
    {
      "utc": "2026-10-16T03:48:17Z",
      "qc": "TRUSTED",
      "l3": 37.89320592144995,
      "tags": [
        "POSITION_PRESENT",
        "TRUSTED_SPEED"
      ]
    },
    {
      "utc": "2026-10-16T03:48:18Z",
      "qc": "TRUSTED",
      "l3": 29.51763267850422,
      "tags": [
        "POSITION_PRESENT",
        "TRUSTED_SPEED"
      ]
    }
  ],
  "accelerationDecelerationEvidence": [
    "observed_L3_delta_kmh=-9.1"
  ],
  "roadAssociation": {
    "dominant": "AMBIGUOUS",
    "wayId": null,
    "candidateConfidence": "CONTEXT_SUPPORTED"
  },
  "junctionDistanceM": [
    42.09307126570641,
    56.59107138550754,
    68.38024236723217,
    61.431998920306576
  ],
  "trafficSignal": null,
  "junctionForensic": {
    "nodeId": 3939471929,
    "forensicClass": "GRAPH_TOPOLOGY_NODE",
    "evidence": [
      "node 3939471929: 2 ways; two_way_oneway_pair",
      "confirmed_topology_but_not_near_route_or_low_road_class"
    ]
  },
  "curveContext": [],
  "evidenceClassification": "CONTEXT_SUPPORTED",
  "alternativeExplanations": [
    "not_emergency_without_independent_evidence"
  ],
  "missingEvidence": [],
  "notEmergencyNotSignalPhase": true
}
```