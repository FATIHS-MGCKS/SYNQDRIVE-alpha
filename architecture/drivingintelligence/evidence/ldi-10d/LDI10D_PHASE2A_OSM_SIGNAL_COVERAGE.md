# LDI-10D Phase 2A — OSM traffic signal coverage audit

**No new Overpass fetch.** Analysis of frozen snapshot only.

## Conclusion: `NO_MAPPED_SIGNALS_IN_BBOX`

### Rationale
- Zero nodes with highway=traffic_signals in frozen Overpass response elements (complete extract for query).
- Crossing nodes (highway=crossing) are pedestrian/cycle crossing points — not signalized intersections.

### Raw element counts
```json
{
  "nodes": 8,
  "ways": 155,
  "relations": 3,
  "nodesWithHighwayTag": 8,
  "nodesHighwayTrafficSignals": 0,
  "nodesHighwayCrossing": 8,
  "nodesWithJunctionTag": 0,
  "nodesHighwayOther": []
}
```

### Query included traffic_signals filter
true

### Bounding box (Phase 2)
```json
{
  "south": 51.399314566618756,
  "north": 51.40860533338124,
  "west": 9.655036597188841,
  "east": 9.67302160281116,
  "marginM": 75
}
```

**TRAFFIC_SIGNAL_ZERO_CAUSE:** No `highway=traffic_signals` nodes returned in complete Overpass response for the Phase 2 bbox query — consistent with **sparse/absent OSM signal mapping** in this corridor, not a parser drop (crossing nodes present).

## Crossing / intersection semantics (task 6)

Features audited: **8** crossing/junction-tagged nodes in frozen extract.

| OSM id | Class | highway | crossing | Road intersection? | Notes |
| --- | --- | --- | --- | --- | --- |
| 613111950 | PEDESTRIAN_CROSSING | crossing | zebra | false | Tagged crossing — describes pedestrian/cycle crossing geometry, not a drivable intersection node. |
| 1363012743 | PEDESTRIAN_CROSSING | crossing | zebra | false | Tagged crossing — describes pedestrian/cycle crossing geometry, not a drivable intersection node. |
| 2028001701 | PEDESTRIAN_CROSSING | crossing | zebra | false | Tagged crossing — describes pedestrian/cycle crossing geometry, not a drivable intersection node. |
| 2133990617 | PEDESTRIAN_CROSSING | crossing | — | false | Tagged crossing — describes pedestrian/cycle crossing geometry, not a drivable intersection node. |
| 2134001943 | PEDESTRIAN_CROSSING | crossing | — | false | Tagged crossing — describes pedestrian/cycle crossing geometry, not a drivable intersection node. |
| 2134022381 | PEDESTRIAN_CROSSING | crossing | zebra | false | Tagged crossing — describes pedestrian/cycle crossing geometry, not a drivable intersection node. |
| 2180087821 | PEDESTRIAN_CROSSING | crossing | zebra | false | Tagged crossing — describes pedestrian/cycle crossing geometry, not a drivable intersection node. |
| 2185728618 | PEDESTRIAN_CROSSING | crossing | — | false | Tagged crossing — describes pedestrian/cycle crossing geometry, not a drivable intersection node. |

**INTERSECTION_SEMANTICS:** Phase 2 “8 intersections” = **8 `highway=crossing` nodes** (pedestrian crossings), **0** junction-tagged nodes, **0** traffic signals — **not** 8 signalized drivable intersections.