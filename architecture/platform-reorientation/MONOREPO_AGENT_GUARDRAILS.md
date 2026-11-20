# Core/Rental monorepo — agent guardrails (binding)

**Status:** `BINDING` (mirrors owner monorepo decision; enforce alongside [`SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md`](SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md))  
**Promotion note:** Edits to root `AGENTS.md` that embed this policy require PR label `i18n-governance-authority-change` from owner `FATIHS-MGCKS` per i18n governance CI.

## Platform shape

**SYNQDRIVE-alpha** is the **permanent active platform repository**. `SYNQDRIVE-CORE` is a **paused reference fork** — **no physical repository extraction**, no separate Core/Rental production deployables as the current Alpha shape.

| Shape | Binding |
|-------|---------|
| Repository / runtime / deployment | **One** repo, **one** NestJS application, **one** deployment |
| Database | **One** shared platform database with **documented domain ownership** |
| Core vs Rental | **Logical** domains — separate ownership and dependency rules, **not** separate deployables in Alpha today |

## Domain ownership (summary)

| Domain | Owns (non-exhaustive) |
|--------|------------------------|
| **Core** | Master Admin; IAM and entitlements; canonical vehicles and trips; Trip FSM; vehicle intelligence (DS4/DBI/tire/battery/service); shared product-neutral platform services — including **Communication Center, WhatsApp Business, Voice Assistant Platform, AI Platform** (owner 2026-11-19 — [`evidence/POST_P6_BOUNDARY_OWNER_CLASSIFICATION_2026-11-19.md`](evidence/POST_P6_BOUNDARY_OWNER_CLASSIFICATION_2026-11-19.md); registry `NOT_STARTED` unchanged) |
| **Rental** | Bookings; rental customers; payments and contracts; rental rules; rental workflows; rental-specific analysis; `frontend/src/rental`; **Rental capabilities inside mixed modules** — booking task automation/outbox; booking document bundles + rental-guarded `DocumentsController`; booking invoices (owner 2026-11-20 — [`evidence/POST_P6_PR9_DOMAIN_OWNERSHIP_FINALIZATION_2026-11-20.md`](evidence/POST_P6_PR9_DOMAIN_OWNERSHIP_FINALIZATION_2026-11-20.md)) |
| **Core (mixed slices)** | Generic task/work-order substrate; product-neutral document storage ports; future platform subscription billing where actually implemented — **not** every file under `tasks/`, `documents/`, or `invoices/` |

## Dependency invariants (agents must enforce)

1. **Core → Rental business-logic services:** **Forbidden** (use ports, adapters, composition-root wiring — do not inject rental workflow/domain services into Core intelligence or platform modules).
2. **Rental → Core:** **Allowed** via documented internal contracts, ports, NestJS DI, guards — reuse existing platform services; **do not duplicate** Core functionality inside Rental.
3. **Do not merge** Core and Rental business ownership in a single module without owner decision and registry/authority updates.
4. **Do not move** Rental business logic into product-neutral Core services.
5. **No physical** Core/Rental repository extraction or mandatory **M2M** for **co-located** Rental — user JWT + org scoping + `ProductLicenseGuard` / permission enforcement remain mandatory.
6. **Composition-root** `forwardRef` / port `useExisting` wiring is **allowed** when required for Nest DI — **not** a business-ownership violation by itself (see [`evidence/P4_BOUNDARY_FINAL_AUDIT_2026-11-18.md`](evidence/P4_BOUNDARY_FINAL_AUDIT_2026-11-18.md)).

## Before creating or substantially modifying modules

1. Read [`SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md`](SYNQDRIVE_ALPHA_PLATFORM_MASTER_PLAN.md).
2. Read [`architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md`](../SYNQDRIVE_RENTAL_ARCHITECTURE.md) (central registry).
3. Identify **owning domain** (Core vs Rental vs shared infrastructure).
4. Determine **allowed dependencies**; reuse existing contracts — no silent bidirectional Core↔Rental **business-service** coupling.
5. Update affected **module authority** + append **progress/change evidence** in the same PR when substantive.
6. Run `bash architecture/scripts/validate-module-registry.sh` and applicable module/graph validators.

New modules need **explicit ownership** in registry/authority — do not land orphan code without a domain classification.

## Future application interface readiness (not live integration)

Core must stay **product-neutral** and ready for **future separate** consumers (e.g. VYMOD, Fleet, digital logbook) via versioned APIs, entitlements, org/vehicle scoping, and service-client registry + **fail-closed** M2M gates (`CORE_APP_M2M_*` defaults).

**INTERFACE_READINESS only** — **not** production integration in ordinary agent work:

- Do **not** connect unfinished external applications, activate M2M production flags, create speculative product backends, or claim integration readiness without evidence.
- Reuse merged P2/P3 foundations (entitlements, registry, guarded read APIs) when extending contracts.

Enforcement surfaces: [`.cursor/rules/projektregel.mdc`](../../.cursor/rules/projektregel.mdc), [`.cursor/rules/Architectur-Updates.mdc`](../../.cursor/rules/Architectur-Updates.mdc).