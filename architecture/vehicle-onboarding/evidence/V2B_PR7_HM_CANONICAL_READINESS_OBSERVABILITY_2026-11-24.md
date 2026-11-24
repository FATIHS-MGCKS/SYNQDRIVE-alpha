# V2B-PR7 — HM canonical readiness observation (non-mutating)

**Operation:** `SYNQDRIVE_VEHICLES_V2B_PR7_HM_CANONICAL_READINESS_OBSERVABILITY`  
**Base:** `origin/main` @ `fc801dcf4138965242525bce1604769b2f1a86ca` (PR #2521 merge)  
**Reconciles:** VO-DEC-2B-002 (manual channel retired), VO-DEC-2B-003 (outbox-only registration billing)  
**Flags:** `VEHICLE_REGISTRATION_CONVERGENCE_SHADOW_COMPARE` default **OFF**; canonical HM + billing single-rail remain **NOT_ARMABLE**  
**Explicit non-goal:** No redundant dual-billing shadow — billing field is **predictive read-only** only.

## Phase 0 baseline

| Check | Result |
|-------|--------|
| PR #2521 merge on `main` | **VERIFIED** — `fc801dcf` |
| PR #2518 | **OPEN** docs-only provenance; **do not merge** |
| PG-03 / PG-05 | **Reused** via existing VO5B CI gates; PR7 adds PG gate `V2B_HM_CANONICAL_READINESS_OBSERVATION_PG` |
| VO-DEC-2B-002 | Manual registration retired; legacy HM path still exists until canonical flag arm |
| VO-DEC-2B-003 | Registration billing outbox-only; observation does not touch billing tables |

## HM readiness authority

| Surface | Role |
|---------|------|
| **Legacy path** | `HighMobilityRegistrationService.registerHmOnlyVehicle` (flag OFF) — tenant/org/VIN/clearance gates; inline vehicle + link create |
| **Canonical path** | `HmOnlyCanonicalRegistrationService` — case capture, `evaluateReadinessRules`, activation TX (flag ON) |
| **PR7 observation** | `HmOnlyCanonicalReadinessObservationService` — read-only; reused rule engine on **in-memory projection** |

## Pure evaluation boundary

| Requirement | Implementation |
|-------------|----------------|
| Same readiness semantics | `evaluateReadinessRules` on projected case + `buildHmOnboardingSourceSnapshot` source ref |
| No duplicate rule engine | **NO** — single `readiness-rule-engine.ts` |
| No case / seal / activation | Projection only; no `VehicleOnboardingReadinessService.evaluateAndSealReadiness` |
| No vehicle / link / outbox / billing writes | Verified PG before/after counts |
| No external provider calls | DB read on HM mirror + org entitlement only |
| Legacy HTTP unchanged when shadow OFF | Default config unchanged |

**Shadow hook:** When `isHmOnlyShadowCompareEnabled` (shadow ON **and** canonical OFF), legacy register fires **fire-and-forget** `observeHmOnlyRegistrationAttempt`; failures log-only.

## Legacy / canonical comparison (summary matrix)

| Dimension | Legacy (pre-create) | Canonical (readiness) | Class |
|-----------|----------------------|------------------------|-------|
| Org tenant scope | JWT org match | Same + case org scope rule | **A** |
| Org lifecycle ACTIVE | `assertHighMobilityTenantOperationalOrganization` | `OrganizationStatus.ACTIVE` | **A** |
| Product entitlement | Not checked | `resolveMasterDimoReadinessProduct` + entitlement | **B** |
| HM clearance APPROVED | Yes | `VO-RDY-HM-001` via snapshot | **B** |
| Operator model/year | Ignored (year=0 vehicle) | Mandatory capture + identity rules | **B** |
| Fuel type | Optional enum on vehicle | Identity + powertrain rules | **B** |
| HV battery evidence | Not required on legacy ICE path | Required for BEV/HV per profile | **B** |
| Connection identity | Implicit HM link | `VO-RDY-CONN-001` verified modality | **B** |
| Technical baseline | Partial (inline fields) | `evaluateReadinessRules` baseline sections | **B** |
| Duplicate VIN | Conflict | Identity / legacy classifier | **A** |
| OFFBOARDED/ARCHIVED replay | Not distinguished in legacy throw | Classifier flags + readiness | **B** |
| Billing | None on legacy register | Outbox on activation only (not in observation) | **A** |
| Readiness waivers | N/A | Profile `UNKNOWN_ALLOWED` only where approved | **E** until OWN-3 |

## OWN decision evidence (no approval inferred)

### OWN-3 (readiness waivers)

| Candidate | Required fields | Risk | Recommended disposition |
|-----------|-----------------|------|-------------------------|
| Legacy year=0 fleet | Operator model/year on canonical path | Reporting / readiness skew | **Require capture**; optional read-only inventory (OWN-6) |
| HM mirror model/year null | Operator capture | Identity drift | **No waiver** — operator must supply |
| Tire/brake baseline deferred | Profile DEFERRED rules | Post-activation enrichment | **Keep deferred** (existing profile) |
| Unapproved UNKNOWN_ALLOWED expansion | — | Weakens cutover | **Reject** until owner signs |

### OWN-4 (no retroactive billing)

**Recommendation:** Maintain explicit **no backfill** for legacy HM inline registrations; observation billing fields are **NON_BILLABLE_IF_ACTIVATED** / **BILLABLE_IF_ACTIVATED** predictions only — no quantity events.

### OWN-5 (flags and cutover sequence)

**Recommendation:**

1. Soak `VEHICLE_REGISTRATION_CONVERGENCE_SHADOW_COMPARE=1` (staging/disposable only) — measure divergence metrics.
2. Owner attestation before `VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED`.
3. `VEHICLE_REGISTRATION_CONVERGENCE_BILLING_SINGLE_RAIL` remains **NOT_ARMABLE** (VO-DEC-2B-003).
4. Abort criteria: sustained divergence rate without documented OWN-3 waivers; observation error rate spike.

### OWN-6 (legacy HM registry repair)

**Recommendation:** Read-only inventory query design only (count legacy HM rows with `year=0`, missing links); **no migration** in PR7.

## Observability

| Signal | Mechanism |
|--------|-----------|
| Evaluated requests | In-process counter `hm_observation_evaluated_total` |
| PASS / BLOCKED / NOT_EVALUABLE | Bounded counters + structured JSON log |
| Divergence | `divergenceLegacyOnly` + `hm_observation_divergence_total` |
| Cardinality | Fixed metric key set — **no VIN/PII labels** |
| Sensitive data | Logs: org id, hm id, counts only |

**Flag necessity:** Shadow flag required to attach observation to production legacy path without enabling canonical registration — default **OFF**.

## PostgreSQL certification (PR7 gate)

File: `v2b-hm-canonical-readiness-observation.postgres.integration.spec.ts`  
Env: `V2B_HM_CANONICAL_READINESS_OBSERVATION_PG=1`  
Wired: `vo5b-vehicle-onboarding-postgres-ci.sh`

Scenarios covered in CI: PR7-01…05, 08…11, 13…19 (missing model/year, battery, tenant, org, entitlement, VIN, offboarded, stale mirror, billing prediction, repeat/concurrent/error).

**Non-mutation tables asserted:** vehicles, cases, outbox, quantity events, source links, provider consents, subscription items.

## Reconciliation with PR6 / dual-billing shadow

PR6 retired the notion of comparing legacy **create billing hook** vs outbox. PR7 shadow compares **legacy admission** vs **canonical readiness** only; `expectedBillingClassification` is a **read model prediction**, not a second billing rail.

## Lifecycle

| Stage | Status |
|-------|--------|
| Implementation | **DRAFT PR** |
| Production shadow arm | **FORBIDDEN** in this PR |
| HM canonical cutover | **NO_GO** until OWN-5 |
| Billing cutover single-rail flag | **NO_GO** (redundant) |