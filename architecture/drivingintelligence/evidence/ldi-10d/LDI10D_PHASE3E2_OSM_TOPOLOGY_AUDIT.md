# OSM topology forensic audit (Tesla extract)

Phase 3E.1 headline 3226 counts OSM graph nodes with CONFIRMED_TOPOLOGY in the extract — not unique drivable intersections visited by the trip. Forensic reclassification separates graph connectivity from route-relevant drivable junctions.

| Metric | Count |
| --- | --- |
| Raw junction candidates (graph) | 9381 |
| Phase 2B CONFIRMED_TOPOLOGY (3E.1 headline) | 3226 |
| Unique geographical locations (5 dp) | 9375 |
| Forensic drivable intersections (route-relevant) | 147 |
| Ambiguous (Phase 2B) | 6155 |

## Forensic class histogram

{
  "CONFIRMED_DRIVABLE_INTERSECTION": 147,
  "GRAPH_TOPOLOGY_NODE": 2712,
  "ROUNDABOUT": 0,
  "GRADE_SEPARATED": 224,
  "SERVICE_CONNECTION": 2234,
  "BRANCH_MERGE_AMBIGUOUS": 4056,
  "DUPLICATE_GEOLOCATION": 8,
  "REJECTED_NOT_DRIVABLE": 0
}

## Sample rejections / non-intersection nodes

[
  {
    "nodeId": 937604,
    "forensicClass": "GRADE_SEPARATED",
    "evidence": [
      "node 937604: 2 ways; layers=0,1",
      "GRADE_SEPARATION_LAYER_MISMATCH"
    ]
  },
  {
    "nodeId": 937603,
    "forensicClass": "GRADE_SEPARATED",
    "evidence": [
      "node 937603: 2 ways; layers=0,1",
      "GRADE_SEPARATION_LAYER_MISMATCH"
    ]
  },
  {
    "nodeId": 5299526984,
    "forensicClass": "GRAPH_TOPOLOGY_NODE",
    "evidence": [
      "node 5299526984: 2 ways; two_way_oneway_pair",
      "confirmed_topology_but_not_near_route_or_low_road_class"
    ]
  },
  {
    "nodeId": 209010560,
    "forensicClass": "GRAPH_TOPOLOGY_NODE",
    "evidence": [
      "node 209010560: 3 ways; degree>=3",
      "confirmed_topology_but_not_near_route_or_low_road_class"
    ]
  },
  {
    "nodeId": 21050405,
    "forensicClass": "GRADE_SEPARATED",
    "evidence": [
      "node 21050405: 2 ways; layers=0,1",
      "GRADE_SEPARATION_LAYER_MISMATCH"
    ]
  },
  {
    "nodeId": 18640505,
    "forensicClass": "GRADE_SEPARATED",
    "evidence": [
      "node 18640505: 2 ways; layers=1,0",
      "GRADE_SEPARATION_LAYER_MISMATCH"
    ]
  },
  {
    "nodeId": 18640451,
    "forensicClass": "GRAPH_TOPOLOGY_NODE",
    "evidence": [
      "node 18640451: 3 ways; degree>=3",
      "confirmed_topology_but_not_near_route_or_low_road_class"
    ]
  },
  {
    "nodeId": 260210999,
    "forensicClass": "GRADE_SEPARATED",
    "evidence": [
      "node 260210999: 2 ways; layers=0,1",
      "GRADE_SEPARATION_LAYER_MISMATCH"
    ]
  },
  {
    "nodeId": 25765021,
    "forensicClass": "GRAPH_TOPOLOGY_NODE",
    "evidence": [
      "node 25765021: 4 ways; degree>=3",
      "confirmed_topology_but_not_near_route_or_low_road_class"
    ]
  },
  {
    "nodeId": 2528191453,
    "forensicClass": "GRAPH_TOPOLOGY_NODE",
    "evidence": [
      "node 2528191453: 2 ways; two_way_oneway_pair",
      "confirmed_topology_but_not_near_route_or_low_road_class"
    ]
  },
  {
    "nodeId": 245033196,
    "forensicClass": "BRANCH_MERGE_AMBIGUOUS",
    "evidence": [
      "node 245033196: 2 ways; two_way_merge_or_split"
    ]
  },
  {
    "nodeId": 6768615921,
    "forensicClass": "BRANCH_MERGE_AMBIGUOUS",
    "evidence": [
      "node 6768615921: 2 ways; two_way_merge_or_split"
    ]
  }
]