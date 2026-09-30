# Vehicle Onboarding — Knowledge Graph

Bootstrap graph under `graph/`. Human overview; machine source: `graph/nodes.yaml`, `graph/edges.yaml`, `graph/invariants.yaml`.

## Domain nodes (summary)

| Node ID | Title |
|---------|--------|
| VO-DOM-001 | Vehicle Onboarding / Vehicle Registry domain |
| VO-DATA-VEHICLE-001 | Canonical Vehicle entity |
| VO-DATA-DIMO-MIRROR-001 | DimoVehicle provider mirror |
| VO-DATA-HM-MIRROR-001 | HighMobilityVehicle provider state |
| VO-API-REGISTER-DIMO-001 | register-from-dimo API |
| VO-GAP-001 … VO-GAP-015 | Knowledge gaps (see contradictions/KNOWLEDGE_GAPS.md) |

## Decisions

| Decision ID | Title |
|-------------|--------|
| VO-DEC-0B-001 | VO-0B governance bootstrap and current-state seal |

Validate: `bash architecture/vehicle-onboarding/scripts/validate-graph.sh`
