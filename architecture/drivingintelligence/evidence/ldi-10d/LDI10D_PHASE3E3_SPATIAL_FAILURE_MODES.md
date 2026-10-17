# Spatial failure modes

[
  {
    "mode": "PARALLEL_OR_SERVICE_ROADS",
    "layer": "ASSOCIATION",
    "bucketHits": 386
  },
  {
    "mode": "ROW_ABSENT_GPS",
    "layer": "GPS",
    "bucketHits": 269
  },
  {
    "mode": "QC_UNTRUSTED",
    "layer": "QC",
    "bucketHits": 347
  },
  {
    "mode": "BEARING_MISMATCH",
    "layer": "ASSOCIATION",
    "bucketHits": 126
  },
  {
    "mode": "NO_WAY_IN_RADIUS",
    "layer": "OSM_OR_GPS",
    "bucketHits": 0
  },
  {
    "mode": "GRAPH_DISCONTINUITY",
    "layer": "ASSOCIATION",
    "bucketHits": 173
  }
]

Errors may combine GPS source, OSM geometry, association policy, and QC abstention.