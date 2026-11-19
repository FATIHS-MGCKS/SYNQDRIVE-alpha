# Post-P6 — Core platform module ownership (owner decision)

**Date:** 2026-11-19 (Europe/Berlin)  
**Operation:** `SYNQDRIVE_ALPHA_POST_P6_BOUNDARY_OWNER_CLASSIFICATION`  
**Mode:** `MINIMAL_OWNER_DECISION_DOCUMENTATION`  
**Owner decision:** **EXPLICITLY_GRANTED** (binding for agents; not a module authority audit)

**Repository baseline:** `origin/main` @ `65a76e63b200b5d9110324a32620e2096bfac77f`  
**Audit context:** [`POST_P6_CORE_RENTAL_BOUNDARY_AUDIT_2026-11-19.md`](POST_P6_CORE_RENTAL_BOUNDARY_AUDIT_2026-11-19.md)

## Core-owned platform modules (logical domain)

The following registry inventory modules are **Core** — shared, product-neutral platform capabilities in the Alpha monorepo:

| Registry module | Backend module path (primary) |
|-----------------|--------------------------------|
| Communication Center | `backend/src/modules/communication` |
| WhatsApp Business | `backend/src/modules/whatsapp` |
| Voice Assistant Platform | `backend/src/modules/voice-mcp-gateway` (+ voice runtime siblings at composition root) |
| AI Platform (Fleet Chat & Tools) | `backend/src/modules/ai` |

**Registry coverage status:** each row remains **`NOT_STARTED`**. Owner classification is **not** promotion to `AUTHORITY_ACTIVE` or completion of a module authority audit.

## Binding rules (owner)

1. These modules are part of the shared **product-neutral Core platform**.
2. Rental-specific booking operations, workflows, and business rules remain **Rental-owned** (e.g. `bookings`, `rental-rules`, rental analysis).
3. **Core must not directly inject Rental business-logic services** (e.g. `BookingsService`, `VehicleBookingContextService`).
4. Core consumes Rental-specific capabilities through **narrow internal contracts and ports** where required.
5. **Rental implements** the corresponding adapters at the composition root.
6. Dependency injection remains **in-process** (single NestJS app).
7. **No M2M** is required between Core and co-located Rental.
8. **No** separate repository or deployment.

## Audit consequence (same date)

With consumer domain **CONFIRMED Core**, direct injections documented in the post-P6 boundary audit are **`CONFIRMED_ARCHITECTURE_VIOLATION`** (see reconciled findings in audit evidence — P0 platform channels + AI; P1 vehicle-intelligence findings unchanged).

## Authority references

- [`SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md`](../SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md) § Binding monorepo architecture
- [`MONOREPO_AGENT_GUARDRAILS.md`](../MONOREPO_AGENT_GUARDRAILS.md)
- [`architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md`](../../SYNQDRIVE_RENTAL_ARCHITECTURE.md) (inventory mini descriptions updated; status unchanged)