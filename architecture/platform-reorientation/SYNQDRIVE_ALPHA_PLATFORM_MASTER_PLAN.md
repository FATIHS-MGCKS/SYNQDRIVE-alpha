# SYNQDRIVE Alpha — Platform Master Plan

**Status:** `BINDING` (owner decision 2026-11-16, documented 2026-11-17)  
**Repository:** `FATIHS-MGCKS/SYNQDRIVE-alpha`  
**Central registry:** [`architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md`](../SYNQDRIVE_RENTAL_ARCHITECTURE.md)  
**Progress ledger:** [`PROGRESS_LEDGER.md`](PROGRESS_LEDGER.md)

## Historical trajectory (pre–owner pause — not claimed as completed)

**Epistemic:** Repository and owner decision records — **CONFIRMED** for intent; no claim that full extraction shipped or that automated merges ran.

1. **SYNQDRIVE-alpha** was **copied into** the **SYNQDRIVE-CORE** repository as a parallel line of development.
2. **Core** was **intended** to become a **separate central backend** (distinct deployable).
3. **Rental** was **intended** to become a **separate application** deployable.
4. **Secured API / M2M** was **planned between those separate deployments** (Core backend ↔ Rental application) — historical intent only; not the co-located Alpha default.
5. **Owner decision 2026-11-16:** that extraction trajectory is **PAUSED**. Alpha remains the permanent platform repo; Core remains a **reference fork** for selective manual ports only — **no** automated cherry-pick, merge-back, or continuation of the old extraction roadmap; **no** historical automatic merge-back to Alpha is claimed.
6. **No** historical or binding requirement that **co-located Rental** use M2M — in-process consumption remains the default in Alpha.

## Owner decision — superseded trajectories (binding)

| Previous trajectory | Current binding |
|--------------------|-----------------|
| Post–copy-out extraction as primary path: **separate** Core backend + **separate** Rental application + secured API/M2M **between separate deployments** (no automatic merge-back to Alpha claimed) | **PAUSED** — logical Core/Rental **domains** in **one** Alpha deployment; co-located Rental **not** M2M-required; M2M for **other** separately deployed product backends when gates are armed |
| Rental as co-located app forced through external M2M to Core | **REJECTED** — Rental is **first-class** and uses **in-process** shared platform services + user JWT |
| TAXI as operational `ProductSlug` | **RETIRED** — historical rows preserved; `BusinessType.TAXI` and legal scope `TAXI` remain distinct |

## Current architecture (verified on `origin/main` — `7f243d0fe30ba87e9225f5b3a454d901d5fef934`)

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

## Service client product binding (P3-PR1 registry — product-neutral)

Eligible `ProductSlug` values on a service client record (`isEligibleServiceClientProductSlug`): **`RENTAL`**, **`FLEET`**, **`VYMOD`** — same catalog model; retired slugs (e.g. **TAXI**) are excluded.

| Slug | Role in Alpha | M2M when co-located in Alpha | M2M when separate backend |
|------|---------------|------------------------------|---------------------------|
| **RENTAL** | First-class operational product | **Not required** — user JWT + existing guards | Allowed binding if a split deploy is introduced later |
| **FLEET** | In preparation | N/A until external repo ships | **Required** when connected as separate application |
| **VYMOD** | In preparation | N/A until external repo ships | **Required** when connected as separate application |
| **TAXI** | **Retired** platform product slug | N/A | N/A — historical rows/grants preserved; no new assigns (P2-PR4C) |

Implementation reference: `backend/src/modules/core-app-m2m/core-app-service-registry.policy.ts` (on `main` post #2415).

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

| Requirement | P3-PR1 state on `main` (merged #2415 — **inactive runtime**) |
|-------------|----------------------------------------------------------------|
| Registry tables | `core_app_service_clients`, `core_app_service_org_grants` — **merged**; module **not** wired in `AppModule` |
| Client default | `DISABLED`; org grant default `REVOKED`; credentials **hash-only** |
| Runtime enabled | `CORE_APP_M2M_ENABLED=false` default — **fail-closed** |
| Production ready | `CORE_APP_M2M_PRODUCTION_READY=false` default |
| Token exchange | **MERGED** #2418 (`core.app.token.v1`) |
| Scopes (canonical) | `core:entitlements:read`, `core:app:vehicle:read` (rejects `core:app:vehicles:read`) |
| Eligible product slugs | `RENTAL`, `FLEET`, `VYMOD` (registry-neutral); **RENTAL not M2M-required** for in-process consumption |
| Redis rate limits | **MERGED** #2419 (`c9a4042dd`); required when M2M enabled |
| Master Admin client UI | **MERGED** #2421 (`b05a2bbd3`); runtime still default OFF |
| Production deploy | **NOT_CLAIMED** for P3-PR1 merge |

Evidence: [`CHANGE_RECORD_P3_PR1_2026-11-17.md`](../platform-product-catalog/CHANGE_RECORD_P3_PR1_2026-11-17.md).

**Tenant safety:** Org grants FK to `organizations`; validation enforces client+org pairing (`CoreAppServiceRegistryService`).

## Intelligence contracts

- Module authorities under `architecture/` remain source of truth per module.
- Cross-module aggregation and product-specific assessments belong to **application** layers (Rental, future Fleet/VYMOD), not ad hoc in shared guards.

## Roadmap milestones (acceptance = owner + architecture review)

| Phase | Scope | Merge to `main` (ledger) | Production deploy |
|-------|--------|---------------------------|-------------------|
| **P2** | Catalog, entitlements read, vehicle access/grants, MA product UI, TAXI retirement, entitlement alignment | PR #2408–#2414 **MERGED** | **Not claimed** by these PRs alone |
| **P3-PR1** | Inactive service-client registry (runtime default OFF) | PR #2415 **MERGED** (`7f243d0fe`) | **NOT_CLAIMED** |
| **P3-PR2** | Token exchange + authZ (`core.app.token.v1`) | **MERGED** #2418 (`c68b6618c`) | **NOT_CLAIMED** |
| **P3-PR3** | Redis rate limits (token endpoint) | **MERGED** #2419 | **NOT_CLAIMED** |
| **P3-PR4** | Versioned vehicle read APIs (`core.read.vehicles.v1`) | **MERGED** #2420 (`0bdaa54f4`) | **NOT_CLAIMED** |
| **P3-PR5** | MA service-client management UI + admin APIs | **MERGED** #2421 (`b05a2bbd3`) | **NOT_CLAIMED** |
| **P3 integration cert** | Cross-slice security + harness evidence | **MERGED** #2422 (`19fae93b9`) | **NOT_CLAIMED** |
| **P4** | Complete contracts without Rental disruption | **P4-PR1 MERGED** #2423; **P4-PR2 MERGED** #2424 (`acb87a29f`); **P4-PR3 OPEN** — rental recompute job handler port | Owner-gated |
| **P5** | Full MA architecture/security audit | Planned | Owner sign-off |
| **P6** | Rental product completion | **Blocked on P5** | Owner-gated |
| **P7** | VYMOD + further products | Owner priority | Owner-gated |

## Non-goals

- Resume the paused Core-extraction roadmap or claim automatic merge-back from SYNQDRIVE-CORE into Alpha.
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

**Last updated:** 2026-11-17 (P4-PR2 merged #2424; P4-PR3 draft — rental recompute job handler port)