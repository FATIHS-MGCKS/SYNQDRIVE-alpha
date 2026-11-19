# Bookings — Knowledge Graph

Machine-readable graph: [`graph/`](graph/). Human overview:

## Domain

**BKG-DOM-BOOKINGS-001** — Rental booking lifecycle from wizard through handover, coupled to payments, documents, eligibility, health, and RDA.

## Primary components

| Node | Role |
|------|------|
| BKG-API-CONTROLLER-001 | HTTP API + guard stack |
| BKG-ORCH-CORE-SVC-001 | BookingsService orchestration |
| BKG-PIPE-WIZARD-001 | Draft → confirm + payments |
| BKG-PIPE-ELIGIBILITY-001 | Gatekeeper + recheck |
| BKG-PIPE-HANDOVER-001 | Pickup/return protocols |
| BKG-PERSIST-BOOKING-001 | Prisma booking aggregate |
| BKG-QUEUE-DOC-GEN-001 | Async document generation |
| BKG-PORT-DI-RESOLUTION-001 | Core VI booking lookup port |

## Policies

- **BKG-POL-TENANT-001** — org scope + permissions
- **BKG-POL-PRODUCT-LICENSE-001** — ACTIVE RENTAL (P6-PR3)

## Consumers

- **BKG-CONS-RENTAL-UI-001** — rental SPA
- **BKG-CONS-OPERATOR-001** — operator routes

## Epistemic legend

| State | Use |
|-------|-----|
| CONFIRMED | Code/test or cited doc + inspection |
| INFERRED | Reasonable from structure; not fully traced |
| UNKNOWN | Not audited |
| CONTRADICTED | Recorded in OPEN_CONTRADICTIONS.md |

Validate: `bash architecture/bookings/scripts/validate-graph.sh`