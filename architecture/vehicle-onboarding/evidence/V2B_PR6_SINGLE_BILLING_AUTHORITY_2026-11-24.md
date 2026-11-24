# V2B-PR6 — Single registration billing authority

**Operation:** `SYNQDRIVE_VEHICLES_V2B_PR6_SINGLE_BILLING_AUTHORITY`  
**Base:** `origin/main` @ `e9d19857e6c2c978ff72fc323895e77c89166bb0` (includes [#2520](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2520) V2B-PR5 merge)  
**Prerequisite:** VO-DEC-2B-002 manual registration retirement; V2B-PR5 PG-05 certification  
**Flags:** None armed; `VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL` remains **NOT_ARMABLE**  
**Closeout:** `SYNQDRIVE_VEHICLES_V2B_PR6_AUTHORITY_FINAL_CLOSEOUT` — PR [#2521](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/2521)

## Phase 0 baseline

| Check | Result |
|-------|--------|
| PR #2520 merge ancestry on `main` | **VERIFIED** — `e9d19857` |
| PG-03 evidence | **CERTIFIED** on PR5 branch CI (18/18); re-use on main via merged PG harness |
| PG-05 evidence | **CERTIFIED** PG-05-A…L in `v2b-provider-billing-outbox-parity.postgres.integration.spec.ts` |
| PR #2518 disposition | **OPEN** docs-only; unique runner-loss note; **do not merge**; provenance preserved in PR5/PR6 evidence |

## Authority matrix (registration vs non-registration)

| Call site / symbol | Entrypoint | Class | Notes |
|--------------------|------------|-------|-------|
| `BillingQuantityVehicleIntegration.onVehicleProvisioned` | `VehicleRegistryLifecycleOutboxProcessor` on `VEHICLE_ACTIVATED` | **A** | Canonical registration billing rail |
| `VehiclesService.create` → (none) | HTTP retired | **E** | Throws `MANUAL_VEHICLE_REGISTRATION_RETIRED`; no billing |
| `createVehicleRowForIntegrationHarness` + optional `onVehicleProvisioned` | Test/E2E harness only | **D** | **Default:** production `NODE_ENV` → 409 `VEHICLE_ROW_INTEGRATION_HARNESS_FORBIDDEN`. **Override:** `ALLOW_VEHICLE_ROW_INTEGRATION_HARNESS=1` (explicit env; not in deploy scripts / `.env.example`) |
| `shouldSuppressLegacyVehicleCreateBillingHook` | Routing helper | **E** | Always `false`; no production create hook to suppress post-PR4 |
| `billingSingleRailEnabled` / env flag | Startup validation | **E** (for registration) | Fatal if `true`; no arm path; redundant for registration billing |
| `HighMobilityRegistrationService` legacy (flag OFF) | HM register HTTP | **B** (register) / **no billing** | Vehicle row only; PG-05-C |
| `HighMobilityRegistrationService` canonical (flag ON) | HM register | **A** | Outbox + processor |
| DIMO `MasterDimoCanonicalRegistrationService` / P2 | Master register-from-dimo | **A** | Outbox + processor |
| `recordVehicleLicenseAdded` | Billing quantity service, org transfer, tests | **C** / **D** | Legitimate non-registration quantity mutations |
| `recordVehicleOrgTransfer` etc. | Billing domain | **C** | Subscription/assignment domain — preserved |
| `tenant-billing-vehicle-licenses` mappers | UI projection | **C** | Read-side; not registration |
| V2A/V2B characterization specs | Jest | **D** | Documents contract |

**BILLING_CALLSITE_COUNT (scoped symbols):** 123+ repository references across `backend/src` for the discovery set; **one** production registration writer to `onVehicleProvisioned` (outbox processor).

## Phase 2 reconciliation answers

1. **Reachable production registration + direct legacy create billing hook?** **NO** — manual create retired; DIMO/HM canonical do not call `onVehicleProvisioned` inline.
2. **Canonical + legacy activation billing same event?** **NO** for new provider activations — single outbox idempotency namespace; harness may simulate legacy hook in tests only.
3. **Single-rail flag necessary?** **REDUNDANT for registration** after VO-DEC-2B-002; env remains fail-closed until OWN-5 documents removal vs retention.
4. **Obsolete routing helpers retired?** **Safe to document as inert**; physical delete deferred (OWN-5 / PR10) — no production behavior change in PR6.
5. **Harness reachable from production HTTP/deploy?** **NO** — no controller/service import outside `backend/src/**/testing/**` and test specs; **no** deploy script references `ALLOW_VEHICLE_ROW_INTEGRATION_HARNESS`.
6. **Harness weakens provider-only invariant?** **NO** for HTTP registration; isolated test seam only (override exists for break-glass/E2E only — not unconditional fail-closed).

## F1 — Integration harness inventory (reproducible)

### Discovery commands (from repository root)

```bash
rg -l -F 'createVehicleRowForIntegrationHarness' --glob '**/*' --glob '!**/node_modules/**'
rg -l -F 'ALLOW_VEHICLE_ROW_INTEGRATION_HARNESS' --glob '**/*' --glob '!**/node_modules/**'
rg -l -F 'vehicle-row-integration.harness' --glob 'backend/src/**/*.ts'
```

### Call sites (`createVehicleRowForIntegrationHarness`)

| File | Reachability |
|------|----------------|
| `backend/src/modules/vehicles/testing/vehicle-row-integration.harness.ts` | Definition |
| `backend/src/modules/vehicle-onboarding/v2b-provider-billing-outbox-parity.postgres.integration.spec.ts` | PG test (gated) |
| `backend/src/modules/organizations/testing/org-e2e-activation-p5b1-pg.harness.ts` | E2E/PG harness |
| `backend/src/modules/vehicle-onboarding/characterization/v2a-registration-billing-safety.characterization.spec.ts` | Jest |
| `backend/src/modules/vehicles/vehicles.service.create-billing-convergence.spec.ts` | Jest |
| `backend/src/modules/vehicles/vehicles.service.manual-registration-retired.spec.ts` | Jest |
| `backend/src/modules/vehicles/vehicles.service.ts` | **Comment reference only** (no `import` of harness) |

**Nest module wiring:** not imported from any `*.module.ts`.

### Override semantics

| Condition | Behavior |
|-----------|----------|
| `NODE_ENV !== 'production'` | Harness may run (tests, local PG) |
| `NODE_ENV === 'production'` and **no** `ALLOW_VEHICLE_ROW_INTEGRATION_HARNESS=1` | **409** `VEHICLE_ROW_INTEGRATION_HARNESS_FORBIDDEN` before DB write |
| `NODE_ENV === 'production'` and `ALLOW_VEHICLE_ROW_INTEGRATION_HARNESS=1` | Harness executes — **explicit break-glass**; not configured in repository deploy paths |

**Executable tests:** `vehicle-row-integration.harness.spec.ts`, `v2b-pr6-production-billing-callers.characterization.spec.ts`.

## F4 — Registration billing caller discovery (reproducible)

```bash
rg -l 'onVehicleProvisioned\\(' backend/src --glob '!**/*.spec.ts' --glob '!**/*.integration.spec.ts'
```

**Expected production-runtime `.onVehicleProvisioned(` callers (2026-11-24):**

1. `backend/src/modules/vehicle-onboarding/registry-lifecycle/vehicle-registry-lifecycle-outbox.processor.ts` — **canonical registration billing**
2. `backend/src/modules/vehicles/testing/vehicle-row-integration.harness.ts` — **harness optional hook** (not HTTP registration)

**Registration entrypoints → billing writer trace:**

| Entry | Activation | Billing writer |
|-------|------------|----------------|
| Master DIMO register / VO-SIG P2 | `VehicleOnboardingActivationService` → `VEHICLE_ACTIVATED` outbox | Outbox processor |
| HM canonical (flag ON) | Same | Outbox processor |
| HM legacy (flag OFF) | Inline vehicle TX | **None** |
| Manual HTTP create | Retired 409 | **None** |
| Integration harness | Direct `prisma.vehicle.create` | Optional hook in harness only |

## Revised PR6 / PR7 / PR10 contract

| Original plan slice | Reconciled intent (post-PR4) |
|---------------------|------------------------------|
| V2B-PR6 suppress legacy hook behind `BILLING_SINGLE_RAIL` | **Evidence + characterization** — authority already single-rail via outbox; no new transition flag |
| V2B-PR7 shadow compare | Unchanged dependency; no registration dual-billing to compare |
| V2B-PR10 remove legacy hook | **Largely satisfied** for public `create`; remaining harness + inert helpers = cleanup slice after owner approval |

## Certification (repository)

| Gate | Result |
|------|--------|
| `v2b-pr6-single-billing-authority.characterization.spec.ts` | Production path contracts |
| `v2b-pr6-production-billing-callers.characterization.spec.ts` | rg-backed caller inventory |
| `vehicle-row-integration.harness.spec.ts` | Production default deny + override |
| `v2b-provider-billing-parity.characterization.spec.ts` | Updated narrative post-PR4 |
| `architecture/vehicle-onboarding/validate-graph.sh` | **EXECUTED PASS** (graph includes VO-DEC-2B-003 / VO-EVID-2B-006) |
| PG-05 / PG-03 | **CI on PR branch** (see closeout report) |
| VO-5B AB1 postgres suite | Unchanged; registry bridge still authoritative |

## F2 — Graph validator root cause

Top-level `architecture/vehicle-onboarding/validate-graph.sh` resolved `ROOT` to **parent of repository** (`../../..` from authority dir) and invoked **dimo-integration** copy of `validate-graph.mjs`. **Fix:** delegate to `scripts/validate-graph.sh` / `scripts/validate-graph.mjs` (vehicle-onboarding graph). Validator **must be executed** — not assumed from central registry pass.

## Owner decisions (unchanged — not inferred)

| ID | State |
|----|--------|
| OWN-1 | SUPERSEDED |
| OWN-2 | NOT_APPLICABLE |
| OWN-3 | OWNER_APPROVAL_REQUIRED |
| OWN-4 | OWNER_APPROVAL_REQUIRED |
| OWN-5 | OWNER_APPROVAL_REQUIRED (flag retention/removal, soak order) |
| OWN-6 | OWNER_APPROVAL_REQUIRED |

## Verdicts

| Field | Value |
|-------|--------|
| SINGLE_BILLING_AUTHORITY_VERDICT | **CONFIRMED** — registration billing only via `VEHICLE_ACTIVATED` outbox processor |
| SINGLE_RAIL_FLAG_NECESSITY | **NOT_REQUIRED_FOR_REGISTRATION** |
| SINGLE_RAIL_FLAG_RECOMMENDATION | Keep NOT_ARMABLE until OWN-5; do not introduce new arm path in PR6 |
| DUAL_BILLING_RISK | **LOW** for provider registration; harness isolated |
| BILLING_CUTOVER_READINESS | **NO_GO** |
| MERGE_READINESS | Engineering draft when CI green |
| FLAGS_ARMED | **NO** |