# SYNQDRIVE Alpha — Platform Master Plan

**Status:** `BINDING` (owner decision 2026-11-16, documented 2026-11-17)  
**Repository:** `FATIHS-MGCKS/SYNQDRIVE-alpha`  
**Central registry:** [`architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md`](../SYNQDRIVE_RENTAL_ARCHITECTURE.md)  
**Progress ledger:** [`PROGRESS_LEDGER.md`](PROGRESS_LEDGER.md)

## Owner decision — superseded trajectories

| Previous trajectory | Current binding |
|--------------------|-----------------|
| SYNQDRIVE-CORE as mandatory separate runtime with automated merge into Alpha | **PAUSED** — CORE is a **historical reference fork** only; selective manual ports allowed; no automated cherry-pick/merge |
| Rental as future extractable app forced through external M2M while co-located | **REJECTED** — Rental is **first-class** and uses **in-process** Core platform services + user JWT |
| TAXI as operational `ProductSlug` | **RETIRED** — historical rows preserved; `BusinessType.TAXI` and legal scope `TAXI` remain distinct |

## Current architecture (verified on `origin/main`)

**Epistemic:** Repository layout and module inventory are **CONFIRMED** from tree + registry. Production runtime details for new platform slices require separate Production read-only evidence per [`MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md).

| Layer | Location | Notes |
|-------|----------|-------|
| Deployable unit | Single NestJS monolith + Vite SPA(s) in this repo | One VPS production deployment documented in DSRG runbooks |
| **Core** (logical domain) | `backend/src/modules/*` shared services, Master Admin, products/entitlements, IAM patterns | Not a separate deployable in Alpha |
| **Rental** (logical domain) | `backend/src/modules` rental surfaces + `frontend/src/rental` | Same runtime and database as Core |
| **Intelligence** | Vehicle intelligence, onboarding, DIMO, etc. | Algorithms, evidence, versioned outputs — applications aggregate |
| **Master Admin** | `frontend/src/master` + privileged APIs | Central catalog, org products, grants (P2-PR4A/B) |
| External consumers (future) | Fleet, VYMOD separate repos | **M2M** + versioned APIs when separately deployed |

## Target architecture (directional — not all implemented)

- Versioned **read** contracts for intelligence and platform data (product-scoped).
- **Service client registry** + org grants + scoped credentials for **external** backends only when security gates are armed (P3+).
- Master Admin as control plane for products, entitlements, vehicle access, and (future) service clients.
- No new universal Core health aggregator (explicit non-goal).

## Product map

| Product | `ProductSlug` | Status in Alpha | External M2M |
|---------|---------------|-----------------|--------------|
| Rental | `RENTAL` | Operational — first-class in-repo | **Not required** when co-located |
| Fleet | `FLEET` | In preparation (catalog + entitlements) | Required when separate backend ships |
| VYMOD | `VYMOD` | In preparation (catalog row; no default org assign) | Required when separate backend ships |
| Taxi (platform product) | `TAXI` | **Retired** slug; write gates on assign/grants (P2-PR4C) | N/A |

Shared governance: Master Admin, `OrganizationProduct`, entitlements policy (`entitlements-policy.ts`), `ProductVehicleAccessService`, `VehicleProductGrantService`, `ProductLicenseGuard` (ACTIVE-only operational).

## Core / Rental logical boundaries (same runtime)

| Concern | Core ownership | Rental ownership |
|---------|----------------|------------------|
| Org & product licensing | Products module, entitlements API, guards | Consumes via DI/guards — no duplicate entitlement store |
| Vehicle platform access | Grants, vehicle access resolver | Rental routes stay org-scoped |
| Business workflows | Shared workers only when registered cross-cutting | Rental-specific FSMs, UI, policies |
| Authentication | User JWT, org scoping | Same — **no M2M** for in-process Rental |

**Invariant:** Preserve all current Rental endpoints and runtime behavior unless an owner-approved PR explicitly changes them.

## Entitlements and vehicle access (P2 baseline — merged)

- Declared capabilities: `core.entitlements.v1` (JWT; `m2mProductionReady=false` until P3).
- Operational guards: ACTIVE-only (`ORGANIZATION_PRODUCT_OPERATIONAL_ENTITLEMENT_STATUSES`).
- TRIAL: UI capability declared; operational/activation fail-closed.
- `expiresAt`: factual on read API; **not** enforced at runtime (`NOT_ENFORCED_STATUS_ONLY_PARITY`).
- Evidence: [`architecture/platform-product-catalog/`](../platform-product-catalog/) change records P2-PR1 … P2-PR5.

## M2M (external applications — P3+)

| Requirement | P3-PR1 state (`main` + open PR #2415) |
|-------------|--------------------------------------|
| Registry tables | Planned in PR #2415 — **not on `main` at ledger init** |
| Runtime enabled | `CORE_APP_M2M_ENABLED=false` default |
| Production ready | `CORE_APP_M2M_PRODUCTION_READY=false` default |
| Token exchange | **Not implemented** (P3-PR2) |
| Scopes (canonical) | `core:entitlements:read`, `core:app:vehicle:read` (per Core reference; PR #2415) |
| Redis rate limits | **Not implemented** (P3-PR3) |
| Master Admin client UI | **Not implemented** (P3-PR5) |

**Tenant safety:** Org grants FK to `organizations`; validation must enforce client+org pairing (domain service in PR #2415).

## Intelligence contracts

- Module authorities under `architecture/` remain source of truth per module.
- Cross-module aggregation and product-specific assessments belong to **application** layers (Rental, future Fleet/VYMOD), not ad hoc in shared guards.

## Roadmap milestones (acceptance = owner + architecture review)

| Phase | Scope | Merge to `main` (ledger) | Production deploy |
|-------|--------|---------------------------|-------------------|
| **P2** | Catalog, entitlements read, vehicle access/grants, MA product UI, TAXI retirement, entitlement alignment | PR #2408–#2414 **MERGED** | **Not claimed** by these PRs alone |
| **P3-PR1** | Inactive service-client registry | PR #2415 **OPEN** (head `1ccce4167`) | **NO** |
| **P3-PR2** | Token exchange + authZ | Planned | NO |
| **P3-PR3** | Redis rate limits | Planned | NO |
| **P3-PR4** | Versioned product/vehicle APIs | Planned | NO |
| **P3-PR5** | MA service-client UI | Planned | NO |
| **P4** | Complete contracts without Rental disruption | Planned | Owner-gated |
| **P5** | Full MA architecture/security audit | Planned | Owner sign-off |
| **P6** | Rental product completion | **Blocked on P5** | Owner-gated |
| **P7** | VYMOD + further products | Owner priority | Owner-gated |

## Non-goals

- Resume full Core extraction merge pipeline.
- Force co-located Rental through M2M.
- New universal Core health aggregator.
- Remove Rental from Alpha.
- Silent TAXI→RENTAL entitlement conversion.
- Claim **PRODUCTION_VALIDATED** without explicit evidence records.

## Immutable compatibility requirements

- Multi-tenant org scoping.
- Rental API stability unless explicitly scoped.
- DIMO segments as canonical trip boundaries (per existing architecture rules).
- i18n nine-locale policy unchanged by platform docs.

## Module authority cross-links

| Module | Registry status (2026-11-17) | Authority path |
|--------|------------------------------|----------------|
| Platform product catalog | `AUDIT_IN_PROGRESS` | [`architecture/platform-product-catalog/`](../platform-product-catalog/) |
| (others) | See central registry | Per [`SYNQDRIVE_RENTAL_ARCHITECTURE.md`](../SYNQDRIVE_RENTAL_ARCHITECTURE.md) |

Do **not** promote to `AUTHORITY_ACTIVE` without [`MODULE_AUTHORITY_STANDARD.md`](../MODULE_AUTHORITY_STANDARD.md) gates.

## Maintenance instructions (agents)

1. Before platform/product/M2M work: read **this plan** + affected **module authority** + relevant **ledger rows**.
2. Substantive implementation PR: update module authority + **append** ledger row in the **same PR** (or immediate follow-up doc PR if docs-only).
3. Platform/owner decision changes: update **this plan** in the same PR; mark prior text `SUPERSEDED` with pointer — do not delete history.
4. After merge/deploy: reconcile ledger `merge_status` / `deploy_status` in the next authorized documentation update only — never infer deploy from merge alone.
5. Run `bash architecture/scripts/validate-module-registry.sh` when registry metadata changes.

**Last updated:** 2026-11-17 (foundation documentation PR)