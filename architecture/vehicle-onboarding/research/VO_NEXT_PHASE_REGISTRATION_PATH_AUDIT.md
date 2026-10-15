# VO next phase — registration path audit (read-only)

**Date:** 2026-10-15  
**Repository anchor:** `main` includes production release `f5bb7bb0b35ca2ca1ccd69a24e73038d968761fb` (VO-SIG P2).  
**Mode:** Architecture audit only — **no implementation** in this slice.

## Path comparison (current runtime)

| Dimension | DIMO Master `register-from-dimo` (P2 prod) | HM_ONLY `registerHmOnlyVehicle` | Manual `VehiclesService.create` |
|-----------|---------------------------------------------|----------------------------------|-----------------------------------|
| **Entry** | `POST …/register-from-dimo` | `POST vehicles/register/hm-only` | `POST organizations/:orgId/vehicles` |
| **OnboardingCase** | **Yes** — adoption → capture → readiness → activation | **No** — direct `Vehicle` + link TX | **No** |
| **Connection identity** | Activation-time `assertTelemetryConnectionIdentityForActivationTx` + link metadata v1/v2 | Link metadata only (no VO-SIG activation assertions) | None at create |
| **Readiness seal** | `VehicleOnboardingReadinessService` (RENTAL/FLEET entitlement) | None | None |
| **Activation TX** | `VehicleOnboardingActivationService` (materialize baseline, registry lifecycle ACTIVE) | Inline Prisma TX (vehicle + HM link + HM state) | Single `vehicle.create` |
| **Billing** | **Single** `VEHICLE_ACTIVATED` registry outbox → VO5B-AB1 consumer | **No** registry outbox; **no** `onVehicleProvisioned` in HM service | Fire-and-forget `billingQuantity.onVehicleProvisioned` (**legacy**) |
| **Tenant isolation** | Org-scoped case + cross-org `SOURCE_ALREADY_REGISTERED` | Org + VIN uniqueness within org | Org + VIN uniqueness |
| **Duplicate protection** | Source claim lock, idempotency key, payload fingerprint, resume | HM `registrationState`, VIN conflict | Prisma `vin+organizationId` unique |
| **OFFBOARDED / ARCHIVED** | Fail-closed; `requiresReOnboard` | Not governed by same resume rules | N/A at create |

**Reference standard:** DIMO Master path (P2) is the **intended template** for convergence. HM and manual paths remain **legacy parallel** ingress (see `vo3-legacy-paths.characterization.spec.ts` — HM entry still exists).

## Open lifecycle processes (target vs code)

| Process | Target ([TARGET_ARCHITECTURE.md](../TARGET_ARCHITECTURE.md)) | Current code signal |
|---------|--------------------------------------------------------------|---------------------|
| **Device swap** (e.g. R1→Smart5) | Deactivate old link + activate new + audit | Link **episodes** in schema/tests (`vo2-persistence`); **no** product HTTP workflow for swap on live vehicle |
| **Provider change** (DIMO↔HM policy) | Governed attach + readiness re-seal | `attachDimoSource` / `attachHighMobilitySource` on **case** (VO-3.2); not wired to HM_ONLY or manual create |
| **Explicit re-onboarding** | New case after OFFBOARD | P2 resume **blocks** OFFBOARDED/ARCHIVED with `requiresReOnboard`; **no** public re-onboard API |
| **Organization transfer** | `ORG_TRANSFER_FAIL_CLOSED` until event-time isolation | **Blocked by architecture**; no production transfer workflow |

## Security gaps (still open, code-backed)

1. **Billing dual rail:** Manual create still uses direct `onVehicleProvisioned`; DIMO uses registry outbox only — inconsistent activation economics and idempotency surface.
2. **HM_ONLY bypass:** No readiness, no connection-identity activation gate, no registry outbox — highest **parity gap** after P2 DIMO.
3. **Manual create bypass:** No onboarding case; no connection identity; immediate billable hook — tenant fleet API risk surface unchanged.
4. **Re-onboard / swap / transfer:** Documented fail-closed or partial primitives only — **no end-to-end governed HTTP** for operators.
5. **Cross-module:** Device family / modality truth remains **VDC** (`VDC-GAP-013`); onboarding seeds hints only.

## Automated tests without a real vehicle

| Suite | Covers |
|-------|--------|
| `vo-sig-p2-master-dimo-registration.postgres.integration.spec.ts` | Full DIMO canonical path, idempotency, ARCHIVED block, billing outbox |
| `vo-sig-01-connection-identity.postgres.integration.spec.ts` | Identity + HM attach on **case** |
| `vo3-orchestrator.postgres.integration.spec.ts` | Case orchestration + HM attach races |
| `vo4-readiness.postgres.integration.spec.ts` | HM_ONLY readiness on **case** (not HM_ONLY register API) |
| `vo49-source-adoption*.postgres.integration.spec.ts` | Adoption locks, suppression, offboard hints |
| `high-mobility-registration.service` (unit/integration as present) | HM_ONLY legacy path only |
| Characterization `vo3-legacy-paths.characterization.spec.ts` | Proves split paths still exist |

## Recommended next implementation phase (owner decision)

**Primary:** **HM_ONLY registration cutover** to the same stack as P2 DIMO (adapter + `MasterHmOnlyCanonicalRegistrationService` or generalized `CanonicalProviderRegistrationService`), reusing:

- `VehicleOnboardingSourceAdoptionService` / HM mirror adoption pattern
- `VehicleOnboardingCaptureService` + readiness + `VehicleOnboardingActivationService`
- Registry `VEHICLE_ACTIVATED` outbox (retire parallel billing hooks for that path)

**Secondary:** **Manual create** — either (a) thin wrapper that opens a case + minimal readiness for manual-only sources, or (b) restrict manual create to non-telemetry vehicles and force provider paths for connected fleets.

**Tertiary (workflow):** **Explicit re-onboard** HTTP + case factory for OFFBOARDED vehicles (prerequisite before device swap UX).

**Do not change** P2 DIMO registration behavior in these phases except shared extraction/refactor behind the same contracts.

## Cross-workstream dependencies

| Workstream | Dependency |
|------------|------------|
| **VO5B / Billing** | Align manual + HM paths to registry outbox; deprecate duplicate `onVehicleProvisioned` |
| **VDC / VSI** | Connection identity metadata consumption; device swap semantics |
| **VO5C** | Offboard HTTP admission still default-OFF; re-onboard must compose with OFFBOARDED lifecycle |
| **IAM** | Master MFA for adoption/offboard; tenant RBAC for capture API |
| **i18n** | Any new operator/tenant surfaces need 9-locale keys |

## Owner decisions required

1. Approve **HM_ONLY** as next canonical cutover (vs manual-first).
2. Whether manual create remains for **disconnected** fleet only.
3. Priority of **re-onboard API** vs **device swap** workflow.
4. Schedule **natural E2E** DIMO registration when a vehicle is available (evidence only).
