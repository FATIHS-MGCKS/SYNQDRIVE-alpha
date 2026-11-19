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

## Binding monorepo architecture (owner confirmed — no redesign)

**Epistemic:** **CONFIRMED** owner decision (2026-11-18 documentation alignment). This section **documents** the binding shape; it does **not** introduce a new architecture or restart physical Core/Rental repository extraction.

1. **SYNQDRIVE-alpha** remains the **central active platform repository** (single deployable application runtime + documented VPS production path).
2. **Core** and **Rental** are **separate logical ownership and dependency domains** within the **same** repository, NestJS application runtime, and deployment — not separate production deployables in Alpha today.
3. **Core owns:** Master Admin; IAM and entitlements; canonical vehicles and trips; Trip FSM; DS4 and DBI; tire/battery/service intelligence; shared platform infrastructure (workers, cross-cutting modules registered at composition root); **Communication Center, WhatsApp Business, Voice Assistant Platform, and AI Platform (Fleet Chat & Tools)** — owner-classified Core platform modules (2026-11-19; registry rows remain `NOT_STARTED` until authority audits complete — see [`evidence/POST_P6_BOUNDARY_OWNER_CLASSIFICATION_2026-11-19.md`](evidence/POST_P6_BOUNDARY_OWNER_CLASSIFICATION_2026-11-19.md)).
4. **Rental owns:** bookings; rental customers; rental payments and contracts; rental-specific rules and workflows; product-specific analysis and UI (`frontend/src/rental`, rental backend modules).
5. **Core remains product-neutral:** Core intelligence and platform services **must not** take **direct dependencies** on Rental **business-logic services** (see P4 boundary evidence for the reviewed decoupling scope).
6. **Rental consumes Core** through defined **internal contracts**, **ports**, **NestJS DI**, and **authorized guards**. **External M2M is not required** for co-located Rental in Alpha.
7. **Other independent applications** (VYMOD, Fleet, digital logbook, school transport, etc.) consume **versioned Core APIs** when deployed separately.
8. **External API access** requires the appropriate **authentication, authorization, product grants, organization scope**, and **vehicle permissions** — respect existing activation and security gates (`CORE_APP_M2M_*` defaults remain fail-closed unless explicitly armed).
9. Do **not** claim all external/M2M APIs are **production-ready**; merged code ≠ production validation (see P3 ledger rows).
10. Do **not** restart the former **physical Core/Rental repository extraction** — historical intent is **PAUSED/SUPERSEDED** (§ Historical trajectory).

**Dependency invariants (binding):**

| Invariant | Rule |
|-----------|------|
| Core → Rental business services | **Forbidden** (intelligence/platform must use ports or Rental implements Core-defined interfaces) |
| Rental → Core platform/intelligence | **Allowed** via DI, guards, internal read contracts |
| Co-located Rental ↔ Core | **In-process** — user JWT + org scoping; **not** M2M-mandatory |
| Separate product backends | **M2M + registry grants** when security gates enabled — not required for in-repo Rental |
| Physical split of Core/Rental repos | **PAUSED** — `SYNQDRIVE-CORE` is a **reference fork** only |

Central registry synopsis: [`architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md`](../SYNQDRIVE_RENTAL_ARCHITECTURE.md) (module inventory; Core/Rental ownership per module row).

## Current architecture (verified on `origin/main` — `0a20ccb8f14aa05c679167d4b96d98c0c4a5130e`)

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

### Future application interface readiness (agents — binding clarification)

**Goal:** Core stays **product-neutral** and **contract-ready** for separate consumers (VYMOD, Fleet, digital logbook, other catalog products) — **INTERFACE_READINESS**, not ordinary-agent **LIVE_INTEGRATION**.

| Principle | Rule |
|-----------|------|
| Contracts | Product-neutral Core surfaces; versioned external read/API patterns where merged |
| Security | Tenant/org isolation; product entitlements; vehicle-scoped permissions; fail-closed `CORE_APP_M2M_*` defaults |
| Integration scope | Reuse merged P2/P3 registry + entitlements + guarded APIs — **do not** connect unfinished apps, arm production M2M, or claim readiness without evidence |
| Co-located Rental | In-process — **not** M2M-mandatory (this section does not change Rental runtime) |

Agent enforcement: [`MONOREPO_AGENT_GUARDRAILS.md`](MONOREPO_AGENT_GUARDRAILS.md); [`.cursor/rules/projektregel.mdc`](../../.cursor/rules/projektregel.mdc); root `AGENTS.md` promotion pending owner i18n authority label when edited.

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

### P4 completion scope (not every future decoupling)

**P4 (merged #2423–#2426 + boundary audit)** completed the **reviewed service-boundary scope**: Core vehicle-intelligence modules must not inject Rental **business-logic services**; VI ↔ rental-driving-analysis coupling uses **explicit ports** and composition-root wiring. **P4 does not** close every possible future decoupling (e.g. broader `prisma.booking` persistence reads in VI, additional port slices, or hypothetical split deployables). See [`evidence/P4_BOUNDARY_FINAL_AUDIT_2026-11-18.md`](evidence/P4_BOUNDARY_FINAL_AUDIT_2026-11-18.md) § Out of P4 violation scope.

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
| **P4** | Reviewed Core↔Rental **service** boundary (ports; not all future decoupling) | **P4-PR1–PR4 MERGED** (#2423–#2426); boundary audit **COMPLETE** — [`P4_BOUNDARY_FINAL_AUDIT_2026-11-18.md`](evidence/P4_BOUNDARY_FINAL_AUDIT_2026-11-18.md) | Owner-gated |
| **P5** | Full MA architecture/security audit | **CLOSEOUT_SUFFICIENT** @ `59182a9de` — B1 attestation recorded; B2 [#2428](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2428)–[#2429](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2429); B3 [#2430](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2430)–[#2434](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2434); B3-PR6 dedup **NOT_REQUIRED**; B4 [#2436](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2436) **DRAFT DEFERRED**; MFA/M2M Production **UNSET** (deferred risk — not security PASS); [`P5_CLOSEOUT_P6_READINESS_2026-11-18.md`](evidence/P5_CLOSEOUT_P6_READINESS_2026-11-18.md) | Owner P6 slice |
| **P6** | Rental product completion | **UNBLOCKED** (P5 sufficient per owner 2026-11-18) — co-located Rental, no M2M mandate | Owner-gated |
| **P7** | VYMOD + further products | Owner priority (sequencing unchanged) | Owner-gated |

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

**Owner 2026-11-18:** MFA implementation/activation **deferred** until after Core/Rental workstream; M2M production activation **not authorized**; physical Core extraction **SUPERSEDED**.

**Last updated:** 2026-11-18 (P5 closeout + P6 readiness on `59182a9de`)