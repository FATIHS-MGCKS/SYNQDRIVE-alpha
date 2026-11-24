# V2B-PR8 — Owner decision readiness package

**Operation:** `SYNQDRIVE_VEHICLES_V2B_PR8_ARCHITECTURE_OWNER_DECISION_READINESS`  
**Repository baseline:** `origin/main` @ `ff90ff14a6db64bc27d284beface47dc90a018d2` (PR #2522 merge)  
**Scope:** Architecture governance and owner decision package only — **no** runtime behavior, **no** flag arm, **no** production writes.  
**Status:** `PENDING_OWNER_APPROVAL` (OWN-3 … OWN-6)

---

## Step 1 — Baseline verification (2026-11-24)

| Assertion | Result | Evidence |
|-----------|--------|----------|
| `origin/main` HEAD | **VERIFIED** `ff90ff14a6db64bc27d284beface47dc90a018d2` | `git log origin/main -1` |
| V2B-PR1 … PR7 merged | **VERIFIED** | #2499, #2510, #2515, #2519, #2520, #2521, #2522 |
| PR #2518 | **CLOSED** without merge | Docs-only closeout superseded by main evidence |
| PR7 PostgreSQL matrix | **30/30 PASS** (VO-5B job after merge) | CI run on branch → main merge attestation in #2522 |
| PG-03 (HM canonical) | **18/18 PASS** | VO-5B postgres workflow |
| PG-05 (billing outbox) | **12/12 PASS** | VO-5B postgres workflow |
| PR7 workflow checks | **78/78 PASS** on final repair SHA (`f31b3c252` → merged `ff90ff14`) | GitHub Actions branch CI (Vehicle Detail flake retrigger) |

**Reconciled artifacts:** `CURRENT_STATE.md`, `DECISION_REGISTER.md`, `V2B_CANONICAL_REGISTRATION_CONVERGENCE_PLAN_2026-11-22.md`, `V2B_PR7_*`, `PROGRESS_LEDGER.md`, vehicle-onboarding knowledge graph.

---

## Step 2 — Final architecture authority (registration domain)

Authoritative **runtime** ownership as of main @ PR7 (documentation contract — not owner sign-off):

| Concern | Authority (module / service) | Legacy path still live? | Retirement prerequisite |
|---------|------------------------------|-------------------------|------------------------|
| **DIMO vehicle registration** | `MasterDimoCanonicalRegistrationService` → VO capture/readiness/activation | **No** parallel DIMO inline create (VO-SIG P2) | N/A — canonical |
| **HM canonical registration** | `HmOnlyCanonicalRegistrationService` via `VehicleRegistrationConvergencePort` | Behind `VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED` (**default OFF**) | OWN-5 arm + PG soak + PR9 attestation |
| **HM legacy registration** | `HighMobilityRegistrationService.registerHmOnlyVehicle` (inline TX) | **Yes** when canonical flag OFF | Canonical flag ON + shadow soak clean |
| **Onboarding lifecycle** | `VehicleOnboardingCaseService`, `VehicleOnboardingActivationService` | VO-3 stack | N/A |
| **Technical readiness** | `VehicleOnboardingReadinessService` + `readiness-rule-engine.ts` | Shared by canonical + observation projection | OWN-3 waivers explicit only |
| **Provider identity / source links** | `VehicleOnboardingSourceAdoptionService`, connection-identity `metadata` | VO-SIG rules on canonical path | Legacy HM link without VO activation = reconciliation (OWN-6) |
| **Organization / entitlement** | `assertHighMobilityTenantOperationalOrganization`; `resolveMasterDimoReadinessProduct` + `isOrganizationProductEntitled` | Enforced on canonical; partial on legacy | No waiver without OWN-3 |
| **Registry lifecycle outbox** | `vehicleRegistryLifecycleOutbox` + `VehicleRegistryLifecycleOutboxProcessor` | **Single** registration billing consumer (VO-DEC-2B-003) | N/A |
| **Registration billing** | `onVehicleProvisioned` via outbox idempotency `vehicle-registry:*` | Legacy manual hook **removed** (PR4/PR6) | `BILLING_SINGLE_RAIL` **NOT_ARMABLE** — redundant |
| **Existing vehicle enrichment** | Post-activation tasks (tires/brakes), AI upload, identity P2/P3 | Deferred baselines per profile | Not a registration cutover blocker when profile allows DEFERRED |
| **Offboarding / re-onboarding** | `VehicleOffboardingService`, registry lifecycle `OFFBOARDED`/`ARCHIVED` | Guards on registration + observation | Supersedes naive re-register |

**Manual vehicle registration:** **REMOVED** (VO-DEC-2B-002, V2B-PR4). `VehiclesService.create` fail-closed; harness-only rows for tests.

**Remaining legacy paths (explicit):**

1. HM inline register (flag OFF) — no `VEHICLE_ACTIVATED` outbox / no registration billing (PG-05-C documented gap).
2. Inert convergence routing helpers — optional PR10 cleanup post OWN-5 (not required for billing authority).
3. `createVehicleRowForIntegrationHarness` — integration only; production default deny.

---

## Step 3 — OWN-3 readiness policy (PENDING_OWNER_APPROVAL)

**Recommendation:** Preserve mandatory readiness requirements. No undocumented waivers. Tire/brake deferral only via existing profile `DEFERRED` rules.

| Vehicle / input class | Authoritative rule | Proposed waiver? | Risk | Recommended disposition |
|----------------------|-------------------|------------------|------|-------------------------|
| **ICE** | Operator model/year + fuel type; profile baseline sections | None | Low | **Require capture** — no waiver |
| **BEV** | HV battery reference + substantiated document (VO-RDY-HV-BATTERY-001) | None | High if waived | **Reject waiver** |
| **Hybrid (PHEV/HEV)** | Fuel type + powertrain rules in readiness engine | None | Medium | **Require capture**; use profile rules |
| **Operator identity** | `parseHmOnlyOperatorIdentityCapture` | None | Identity drift | **No waiver** |
| **Fuel type** | `normalizeHmOnlyFuelType` + readiness powertrain class | None | Billing/readiness skew | **No waiver** |
| **HV battery reference** | `resolveHmOnlyHvBatteryReference` + document substantiation | Forged MANUAL without doc | Fraudulent capacity | **Reject** (PR2/PR7 certified) |
| **Document substantiation** | Confirmed extraction scope `hv`; capacity match | Blind inherit English keys | Compliance | **No waiver** |
| **Tire / brake baseline** | Profile allows **DEFERRED** post-activation | Expand UNKNOWN_ALLOWED | Weak cutover signal | **Keep existing DEFERRED only** |
| **Missing provider metadata** | HM mirror stale / null fields | Skip mirror freshness | Wrong admission | **No waiver** — operator capture + STALE flagged |
| **Incomplete legacy vehicle rows** | year=0, missing links | Auto PASS readiness | Reporting debt | **OWN-6 inventory**; per-vehicle enrichment not batch waiver |

**Owner decision options (OWN-3):**

| Option | Meaning |
|--------|---------|
| **OWN-3-A (Recommended)** | Adopt recommendation table; no new UNKNOWN_ALLOWED profiles. |
| **OWN-3-B** | Approve named waiver list (must cite rule id, vehicle class, expiry) — engineering implements only after written list. |
| **OWN-3-C** | Reject cutover until fleet inventory (OWN-6) below agreed thresholds. |

---

## Step 4 — OWN-4 billing policy (PENDING_OWNER_APPROVAL)

**Recommendation:** **`NO_AUTOMATIC_RETROACTIVE_BILLING`** — no backfill quantity events for pre-canonical HM inline registrations.

| Scenario | Registration billing | Retroactive quantity? |
|----------|---------------------|------------------------|
| Existing legacy HM vehicle (inline, no outbox) | Historical gap documented | **NO** (recommended) |
| New activation (canonical path) | Outbox → processor | N/A (forward only) |
| Canonical idempotent replay | No new outbox event | **NO** |
| Reconnection / new link | Not registration billing | **NO** without separate product decision |
| Re-onboarding after offboard | New case activation only | Forward at activation time only |
| Billing reconciliation (Stripe/contracts) | Finance ops | **Out of scope** — not automated in V2B |
| Existing contractual obligations | Manual / finance | **No code backfill** |

**Owner decision options (OWN-4):**

| Option | Meaning |
|--------|---------|
| **OWN-4-A (Recommended)** | Explicit no retroactive registration billing backfill; finance handles legacy commercially off-platform. |
| **OWN-4-B** | Approved one-time migration program (separate project; not V2B-PR9). |

---

## Step 5 — OWN-5 cutover policy (PENDING_OWNER_APPROVAL)

**Flag semantics (repository truth):**

| Env var | Default | Armable? | Role |
|---------|---------|----------|------|
| `VEHICLE_REGISTRATION_CONVERGENCE_SHADOW_COMPARE` | **OFF** | Staging/disposable only until export gate | Fire-and-forget readiness observation on legacy HM register |
| `VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED` | **OFF** | **OWNER_GATED** (PR9) | Route HM register → canonical VO stack |
| `VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL` | **OFF** | **NOT_ARMABLE** (startup fatal) | **REDUNDANT** post PR6 |

**Engineering merge readiness:** **YES** (PR1–PR7 on main).  
**Staging observation readiness:** **CONDITIONAL** — requires multi-replica metrics export (not in PR7).  
**Production observation readiness:** **NO_GO** (`PROCESS_LOCAL` metrics).  
**HM canonical cutover readiness:** **NO_GO** until OWN-3/4/5/6 + PR9.

**Mandatory prerequisites before production flag arm:**

1. Multi-replica observation aggregation (Prometheus/OpenTelemetry — bounded labels).
2. Bounded reason-code observability (no VIN labels).
3. Observation completeness measurement (`evaluationCompleteness` distribution).
4. Snapshot consistency certification (PR7 RR + fingerprint gates) **sustained** in staging.
5. PG-03 / PG-05 / PR7 regression on release candidate SHA.
6. Provider onboarding + idempotent replay validation (PG-03-M, PR7-12b).
7. **Rollback procedure:** set canonical flag OFF; legacy path remains; no data migration required.
8. **Explicit owner authorization** recorded (PR9 attestation artifact).

**Soak policy (volume-aware — not time-only):**

| Metric | Minimum evidence volume | Success threshold | Abort |
|--------|-------------------------|-------------------|-------|
| Shadow observations | ≥ **200** completed evaluations **or** ≥ **14 calendar days** with ≥ **20 evals/day**, whichever is later | `NOT_EVALUABLE` + error rate < **2%**; admission/readiness divergence documented | Error rate ≥ **5%** over 24h; sustained `OBSERVATION_SNAPSHOT_RACE` without explainable load tests |
| Divergence (`divergenceLegacyOnly`) | Same window | ≥ **95%** of divergences mapped to known rule ids (OWN-3 doc) | Unmapped divergence class > **10%** of evals |
| Billing prediction mismatch | Same window | Informational only — **no billing writes** | N/A (no abort on prediction alone) |
| Canonical flag soak (post shadow) | ≥ **50** disposable PG activations + **10** staging dry-runs | 0 duplicate vehicle.id; 1 outbox per case | Any double outbox or billing quantity duplicate |

**Proposed staging soak duration:** **14 days minimum** *and* volume gates above — insufficient registration traffic **extends** soak (no calendar-only sign-off).

---

## Step 6 — OWN-6 legacy fleet inventory (PENDING_OWNER_APPROVAL)

**Specification:** read-only SQL/report contract — **no** production agent execution in PR8; operator runs in approved read-only session when authorized.

**Cohort queries (conceptual):**

| Cohort | Detection sketch | Classification |
|--------|------------------|----------------|
| HM legacy inline vehicles | HM `registrationState=REGISTERED`, vehicle via HM path, no `COMPLETED` HM canonical case | **REQUIRES_RECONCILIATION** or **SAFE** if outbox retroactive N/A |
| Missing model/year | `vehicles.year = 0` OR null model in canonical-candidate cohort | **REQUIRES_ENRICHMENT** |
| Missing source links | No active `vehicle_data_source_link` for HM/DIMO scope | **REQUIRES_ENRICHMENT** |
| HM registration state inconsistent | `REGISTERED` without `synqdriveVehicleId` or inverse | **REQUIRES_RECONCILIATION** |
| Missing technical baselines | Readiness profile fail on replay projection | **REQUIRES_ENRICHMENT** |
| Missing connection identity | `metadata.connectionIdentity` absent on active link | **REQUIRES_ENRICHMENT** |
| Billing reconciliation candidates | Active registry + no matching quantity timeline (finance) | **REQUIRES_OWNER_DECISION** |
| OFFBOARDED / ARCHIVED | `registryLifecycle` terminal | **SAFE** (blocked from re-register) |

**Owner decision options (OWN-6):**

| Option | Meaning |
|--------|---------|
| **OWN-6-A (Recommended)** | Inventory spec approved; execute read-only report before cutover; **no** automated repair migration in V2B. |
| **OWN-6-B** | Approve optional repair migration (separate PR; default OFF flag). |

---

## Step 7 — PR9 cutover contract (ordered prerequisites)

| Gate | Status @ PR8 |
|------|----------------|
| **ENGINEERING_MERGE_READINESS** | **MET** — PR1–PR7 on main; CI matrix green |
| **STAGING_OBSERVATION_READINESS** | **NOT MET** — metrics export + soak |
| **PRODUCTION_OBSERVATION_READINESS** | **NOT MET** |
| **HM_CANONICAL_CUTOVER_READINESS** | **NOT MET** |

**PR9 mandatory blockers (ordered):**

1. OWN-3 disposition recorded (waivers or strict A).
2. OWN-4 disposition recorded.
3. OWN-6 inventory executed (read-only) OR explicit owner waive with risk acceptance.
4. Staging shadow soak passes volume + threshold table (§ Step 5).
5. Multi-replica observability merged + deployed to staging.
6. Owner-signed flag arm checklist (`VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED`).
7. Post-arm smoke: PG-03 subset on staging org; rollback drill documented.

**PR10:** Optional inert-helper cleanup — **not** a prerequisite for single billing authority (VO-DEC-2B-003).

---

## Step 8 — Governance status

| Decision ID | Status |
|-------------|--------|
| OWN-3 | **PENDING_OWNER_APPROVAL** |
| OWN-4 | **PENDING_OWNER_APPROVAL** |
| OWN-5 | **PENDING_OWNER_APPROVAL** |
| OWN-6 | **PENDING_OWNER_APPROVAL** |
| VO-DEC-2B-004 | **VALIDATED (repository)** after PR7 merge |

**Owner decisions approved:** **NONE** (no inferred approval).  
**Flags armed:** **NONE**.  
**Production readiness:** **NO_GO**.