# Vehicle Onboarding / Vehicle Registry — Module Authority (Bootstrap)

| Field | Value |
|-------|-------|
| **Module key** | `VEHICLE_ONBOARDING` |
| **Registry coverage status** | `AUDIT_IN_PROGRESS` |
| **Authority-native status** | VO-0B governance bootstrap · current-state sealed from VO-0A · **not** implementation-complete |
| **Authority directory** | `architecture/vehicle-onboarding/` |
| **Last updated** | 2026-09-30 |

## Status banner

This authority is **not complete** and **must not** be treated as `AUTHORITY_ACTIVE`.

VO-0B establishes governed documentation and boundaries only. **No runtime, schema, or API changes** are authorized by this workstream until VO-1+.

## Abbreviation

**VO** = **Vehicle Onboarding** (workstream); **Vehicle Registry** = canonical tenant-operational vehicle identity and onboarding-established facts.

## Purpose

Own the governed path by which a **provider-discovered** or **manually introduced** vehicle becomes a **canonical tenant-operational** SynqDrive `Vehicle`, and by which canonical vehicle identity, provider mappings, administrative assignment, and onboarding baseline are established.

## Scope (intended)

- Provider candidate semantics (discovery → registration gate)
- Canonical `Vehicle` identity establishment and identity policy (VIN, registration identity)
- Provider mapping into canonical `Vehicle` (`VehicleDataSourceLink`, `Vehicle.dimoVehicleId`, HM linkage)
- Organization and station baseline assignment at onboarding
- Administrative and technical specification baseline orchestration (without owning health conclusions)
- Onboarding readiness contract and activation transition (design — not fully implemented)
- Lifecycle history required to preserve identity and assignment truth (design gaps documented)

## Explicit non-scope

| Neighbor | Continues to own |
|----------|------------------|
| [DIMO Integration](../dimo-integration/) | DIMO auth, Identity GraphQL sync, telemetry transport, webhooks, provider gateway |
| [High Mobility Integration](../SYNQDRIVE_RENTAL_ARCHITECTURE.md) (inventory) | HM clearance, MQTT/REST ingestion, HM webhooks — **substantial runtime exists** |
| [Vehicle & Device Connectivity](../vehicle-device-connectivity/) | Provider/device connectivity interpretation, telemetry freshness semantics, physical plug authority |
| [Trip Detection & Lifecycle](../trip-detection-lifecycle/) | Trip FSM, segment boundaries, wake handoff |
| [Driving Intelligence](../drivingintelligence/) | Driving conclusions, `VehicleDrivingCapability` empirical evidence |
| [Battery V2](../battery-v2/) | Battery health, reference capacity authority, `VehicleBatteryCapability` |
| KG-EED / Tankstellenerkennung | Energy events, fuel-station enrichment |
| Vehicle Health (inventory) | Health conclusions, rental health aggregation |
| Bookings / Rental Operations (inventory) | Booking lifecycle, rental readiness gates |
| [Billing](../SYNQDRIVE_RENTAL_ARCHITECTURE.md) (inventory) | Billable quantity policy and Stripe semantics |
| Documents (inventory) | Document storage lifecycle |
| Maintenance / service conclusions | Health and service-event intelligence beyond onboarding baseline facts |

**Vehicles (Fleet Operations)** (registry `NOT_STARTED`) remains the inventory label for ongoing fleet CRUD, fleet map, and operational projections — distinct from this onboarding/registry authority.

## External governing references (Book II — not materialized in repository)

Recorded as **external** requirement identifiers; exact normative text is **not** in this repository at VO-0B anchor SHA.

| ID | Topic (external label only) |
|----|----------------------------|
| B2-04-013 | Canonical vehicle identity |
| B2-04-014 | Controlled onboarding |
| B2-05-020 | Vehicle registry authority |
| B2-05-021 | No provider-only vehicle authority |
| B2-06-023 | Vehicle identity composition |
| B2-06-024 | Candidate separation |
| B2-06-025 | Assignment history |
| B2-06-026 | Reassignment isolation |

## Mandatory entry documents

| Document | Role |
|----------|------|
| [CURRENT_STATE.md](./CURRENT_STATE.md) | VO-0A sealed current state (evidence-backed) |
| [AUDIT_MANIFEST.md](./AUDIT_MANIFEST.md) | Audit metadata |
| [governance/AUTHORITY_BOUNDARIES.md](./governance/AUTHORITY_BOUNDARIES.md) | Provisional cross-module boundaries |
| [AGENT_CONTRACT.md](./AGENT_CONTRACT.md) | Agent rules for this workstream |
| [KNOWLEDGE_GRAPH.md](./KNOWLEDGE_GRAPH.md) | Graph overview |
| [contradictions/KNOWLEDGE_GAPS.md](./contradictions/KNOWLEDGE_GAPS.md) | VO-GAP register |
| [research/OPEN_QUESTIONS.md](./research/OPEN_QUESTIONS.md) | VO-1 design questions |
| [research/ONBOARDING_PROCESS_BOUNDARIES.md](./research/ONBOARDING_PROCESS_BOUNDARIES.md) | Semantic process stages (non-DB) |

## Validation

```bash
bash architecture/scripts/validate-module-registry.sh
bash architecture/vehicle-onboarding/scripts/validate-graph.sh
```

## Neighboring authorities

- DIMO Integration — provider ingress (DIMO)
- Vehicle & Device Connectivity — connectivity/freshness (see **VDC-GAP-013** cross-ref)
- Battery V2, Driving Intelligence — post-onboarding capability and health evidence
- Fleet Operations (inventory) — operational CRUD surfaces
