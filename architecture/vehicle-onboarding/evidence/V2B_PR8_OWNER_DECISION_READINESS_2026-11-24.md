# V2B-PR8 — Owner decision readiness package

**Operation:** `SYNQDRIVE_VEHICLES_V2B_PR8_ARCHITECTURE_OWNER_DECISION_READINESS`  
**Repository baseline:** `origin/main` @ `ff90ff14a6db64bc27d284beface47dc90a018d2` (PR #2522 merge)  
**Scope:** Architecture governance and owner decision package only — **no** runtime behavior, **no** flag arm, **no** production writes.  
**Status:** OWN-3 … OWN-6 **OWNER_APPROVED** @ 2026-11-24 — see [V2B_PR8_OWNER_ATTESTATION_2026-11-24.md](./V2B_PR8_OWNER_ATTESTATION_2026-11-24.md). Operational cutover gates remain **NOT MET**.

---

## Step 1 — Baseline verification (2026-11-24)

| Assertion | Result | Evidence |
|-----------|--------|----------|
| `origin/main` HEAD (PR7 merge) | **VERIFIED** | `PR7_MERGE_SHA=ff90ff14a6db64bc27d284beface47dc90a018d2` — PR #2522 |
| V2B-PR1 … PR7 merged | **VERIFIED** | #2499, #2510, #2515, #2519, #2520, #2521, #2522 |
| PR #2518 | **CLOSED** without merge | Docs-only closeout superseded on main |
| PR7 final branch HEAD (pre-merge) | **VERIFIED** | `FINAL_PR7_HEAD=f31b3c252e95aeb3c65fd7fabe4eacf5d1681a50` |
| PR7 workflows (branch) | **VERIFIED** | `PR7_WORKFLOWS=24/24_SUCCESS` on `FINAL_PR7_HEAD` — GitHub Actions PR #2522 check runs |

### PostgreSQL certification counts (discrete matrices — do not conflate)

| Metric | Count | Scope |
|--------|-------|--------|
| `PR7_POSTGRESQL` | **30/30** | VO-5B `V2B_HM_CANONICAL_READINESS_OBSERVATION_PG` matrix (`v2b-hm-canonical-readiness-observation.postgres.integration.spec.ts`) |
| `PG03_POSTGRESQL` | **18/18** | HM_ONLY canonical harness (`V2B_PG03_*` in same VO-5B job family) |
| `PG05_POSTGRESQL` | **12/12** | Provider billing / outbox parity PostgreSQL suite |
| `TOTAL_SELECTED_POSTGRESQL` | **60/60** | Sum of the three matrices above (30+18+12) |

Additional CI job or unit-test counts are **out of band** for this table and require a **separate** evidence artifact (workflow run URL + SHA) if cited.

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

## Step 3 — OWN-3 readiness policy (OWNER_APPROVED — OWN-3-A)

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

## Step 4 — OWN-4 billing policy (OWNER_APPROVED — OWN-4-A)

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

## Step 5 — OWN-5 cutover policy

**Active policy (2026-11-24 strategy revision):** [V2B_PR8_DIRECT_CUTOVER_POLICY_2026-11-24.md](./V2B_PR8_DIRECT_CUTOVER_POLICY_2026-11-24.md) — `VO-DEC-OWN-5B` — **direct controlled production cutover without shadow soak**.

**Superseded policy:** `VO-DEC-OWN-5` shadow/staging observation track from [attestation](./V2B_PR8_OWNER_ATTESTATION_2026-11-24.md) — **SUPERSEDED**; historical text retained in git history only; **not** a release gate.

**Flag semantics (repository truth):**

| Env var | Default | Cutover role |
|---------|---------|--------------|
| `VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED` | **OFF** | **OWNER_GATED** — target ON after explicit deploy/activation authorization (PR9B/C) |
| `VEHICLE_REGISTRATION_CONVERGENCE_SHADOW_COMPARE` | **OFF** | **Not required** for cutover; may remain OFF in production |
| `VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL` | **OFF** | **NOT_ARMABLE** / **REDUNDANT** |

**Engineering merge readiness:** **YES** (PR1–PR7 on `ff90ff14`).  
**Accepted PostgreSQL certification:** PG03 18/18, PG05 12/12, PR7 30/30, **total 60/60**; PR7 workflows 24/24 — engineering contracts, **not** production environment attestation.  
**HM canonical cutover readiness:** **NO_GO** until PR9A–C release gates + owner authorization — **no** calendar soak required.

**Direct production release gates (summary):** verify release/production SHA; CI/build; migrations; read-only inventory; registration/billing invariants; dual-replica config; routing rollback; owner deploy authorization; controlled cutover; targeted prod smoke. Detail: direct cutover evidence doc.

### Rollback contract (routing rollback — not data rollback)

Disabling `VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED` is **routing rollback only**. It does **not** undo durable onboarding, vehicles, links, outbox facts, or billing ledger entries.

| Step | Action |
|------|--------|
| Admission | **Stop** new HM registration requests during rollback window (maintenance banner / ops runbook) |
| Drain | Allow in-flight registration operations to complete or fail closed per existing contracts |
| Config | Verify flag **OFF** on **all** runtime replicas; no mixed routing |
| Mixed routing | **Prevent** concurrent canonical + legacy HM register paths across replicas during transition |
| Preserve | Completed canonical cases, `vehicle.id`, source links, `metadata.connectionIdentity`, committed lifecycle outbox events, authoritative billing quantities |
| Partial cases | Reconcile in-flight / partial cases per VO-3 idempotency; **do not** auto-delete vehicles or reverse billing |
| Resume | Validate legacy routing on **all** replicas before resuming normal HM registration traffic |

**Explicitly forbidden on rollback:** automatic vehicle deletion, billing reversal, removal of completed cases, or outbox erasure.

---

## Step 6 — OWN-6 legacy fleet inventory (OWNER_APPROVED — OWN-6-A policy; execution separate)

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

## Step 7 — PR9 cutover contract (revised — direct production path)

| Gate | Status |
|------|--------|
| **ENGINEERING_MERGE_READINESS** | **MET** — PR1–PR7 on main; PG 60/60 |
| **STAGING_OBSERVATION_READINESS** | **NOT_APPLICABLE** (shadow soak superseded) |
| **PRODUCTION_RELEASE_READINESS** | **NOT MET** — PR9A–C gates open |
| **HM_CANONICAL_CUTOVER_READINESS** | **NOT MET** until PR9B authorization + PR9C execution |

**PR9 phases (replaces shadow-infrastructure roadmap):**

| Phase | Title |
|-------|--------|
| **PR9A** | Final production readiness + read-only legacy fleet inventory |
| **PR9B** | Explicit owner release authorization (deploy + production activation) |
| **PR9C** | Direct production cutover + targeted smoke tests |

**PR10:** After successful cutover — evaluate/remove obsolete legacy and shadow **helpers** where safe; **preserve** routing rollback capability. Not required for billing single-rail (VO-DEC-2B-003).

**Superseded PR9 prerequisites (historical):** multi-replica shadow metrics, staging shadow soak, canary, calendar soak — see `VO-DEC-OWN-5` **SUPERSEDED**.

---

## Step 8 — Governance status

| Decision ID | Status |
|-------------|--------|
| OWN-3 (`VO-DEC-OWN-3`) | **OWNER_APPROVED** (OWN-3-A) @ 2026-11-24 |
| OWN-4 (`VO-DEC-OWN-4`) | **OWNER_APPROVED** (OWN-4-A) @ 2026-11-24 |
| OWN-5 shadow track (`VO-DEC-OWN-5`) | **SUPERSEDED** @ 2026-11-24 strategy revision |
| OWN-5 direct cutover (`VO-DEC-OWN-5B`) | **OWNER_APPROVED** — direct production path |
| OWN-6 (`VO-DEC-OWN-6`) | **OWNER_APPROVED** (OWN-6-A) @ 2026-11-24 |
| VO-DEC-2B-004 | **VALIDATED (repository)** after PR7 merge |

**Attestation:** [V2B_PR8_OWNER_ATTESTATION_2026-11-24.md](./V2B_PR8_OWNER_ATTESTATION_2026-11-24.md) — **no** production activation, deploy, or feature-flag authorization.

**Owner decisions pending:** **Production activation/deploy** authorization (PR9B); **OWN-3-B/C, OWN-4-B, OWN-6-B** remain unselected.

**Flags armed:** **NONE**.  
**Production readiness:** **NO_GO** until PR9A–C.

---

## Step 9 — PR9 handoff (supersedes shadow metrics engineering track)

Next operational track: **PR9A → PR9B → PR9C** per [direct cutover policy](./V2B_PR8_DIRECT_CUTOVER_POLICY_2026-11-24.md). **No** new shadow infrastructure workstream.