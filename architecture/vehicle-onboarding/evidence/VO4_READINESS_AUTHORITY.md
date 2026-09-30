# VO-4 / VO-4.1 — Readiness authority, profile engine & sealed input integrity

| Field | Value |
|-------|-------|
| **Scope** | Internal readiness evaluation only — no public cutover |
| **Slice** | VO-4.1 product entitlement authority, fingerprint v1.1, HM refresh, mutation lock |

## Product entitlement authority

| Question | Answer |
|----------|--------|
| `BUSINESS_TYPE_IS_PRODUCT_ENTITLEMENT` | **NO** — `Organization.businessType` is customer/org classification |
| `ORGANIZATION_PRODUCT_IS_PRODUCT_LICENSE_AUTHORITY` | **YES** — `OrganizationProduct` + `Product.slug` + status |
| `ORGANIZATION_BUSINESS_TYPE_ROLE` | `CLASSIFICATION_CONTEXT_ONLY` (stored in snapshot `productContext.organizationBusinessType`) |
| `READINESS_SELECTED_PRODUCT_AUTHORITY` | Explicit `ProductSlug` on `evaluateAndSealReadiness` / `evaluateReadiness`, validated via `assertOrganizationProductEntitled` |
| `READINESS_PRODUCT_ENTITLEMENT_STATUS_POLICY` | **ACTIVE** only (aligned with `ProductLicenseGuard`) |

Multi-product orgs must pass an explicit `selectedProduct`; readiness does not infer product from `businessType`.

## Governed readiness profiles

| profileId | ProductSlug | TAXI / OTHER |
|-----------|-------------|--------------|
| `rental-onboarding-v1` | RENTAL | — |
| `fleet-onboarding-v1` | FLEET | — |

- **TAXI**: `READINESS_PROFILE_UNSUPPORTED` (fail closed; no Fleet fallback)
- **LOGISTICS / OTHER businessType**: do not select profiles without explicit entitled `ProductSlug`
- `listGovernedReadinessProfiles()` matches runtime resolution only (no `generic-operations-onboarding-v1`)

## Contracts

- `VehicleOnboardingReadinessProfileV1` (code-defined, immutable version strings)
- `VehicleOnboardingReadinessSnapshotV2` (`readinessSnapshotVersion = 2`, `productContext` includes selected product + entitlement status + profile id/version)
- `ReadinessInputFingerprintV1` algorithm **`SHA-256-canonical-json-v1.1`**
  - Full readiness-relevant projection of each `OnboardingSourceSnapshotV1` (incl. `sourceEvidence.clearanceStatus` for HM)
  - Excludes volatile `observedAt`
  - Includes `selectedProductSlug`, `productEntitlementStatus`, `organizationBusinessType`, profile id/version

## Source evidence refresh (HM)

`VehicleOnboardingCaseService.refreshHighMobilitySourceEvidence`:

1. Acquires shared readiness mutation lock
2. Reloads authorized HM mirror + existing source ref
3. Rejects silent VIN replacement (`IDENTITY_REVIEW_REQUIRED`)
4. Updates `snapshotMetadataJson` only when readiness-relevant projection changes
5. Invalidates `READY_FOR_ACTIVATION` seal atomically when evidence changes

## Shared readiness mutation lock

- Key: `vehicle-onboarding-readiness:{caseId}` (`readinessMutationLockKey`)
- Used by: readiness evaluate/seal, source attach, HM evidence refresh
- Pattern: lock → reload case → mutate → invalidate READY seal if applicable

`READINESS_MUTATION_SURFACE` (production service APIs): `evaluateReadiness`, `attachDimoSource`, `attachHighMobilitySource`, `refreshHighMobilitySourceEvidence`, governed case open/resume paths that write drafts (orchestrator); direct Prisma writes in tests only for activation fingerprint defense proofs.

## Activation recheck

`ProductionFailClosedReadinessAuthority.assertReadyForActivation` (returns **V2**, async):

- Case status + v2 snapshot + decision READY
- Governed profile id/version matches selected product
- Live `OrganizationProduct` entitlement for `productContext.selectedProductSlug`
- Live `readinessInputFingerprint` matches sealed fingerprint → else `READINESS_SEAL_STALE`
- Entitlement missing → `PRODUCT_ENTITLEMENT_NOT_ACTIVE`

## Seal invalidation

- Readiness-relevant source attach / HM refresh → `READY_FOR_ACTIVATION` → `IN_PROGRESS`, snapshot cleared
- Activation verifies fingerprint and product entitlement (fail closed)

## Gaps / deferred

- `READINESS_CAN_VALIDATE_BUT_ACTIVATION_DOES_NOT_MATERIALIZE_BASELINE=YES` — VO-4.2
- Taxi governed profile — intentional gap until product policy defined

## PostgreSQL proofs (CI)

`VO4_READINESS_PG=1` via `backend/scripts/test/vo2-vehicle-onboarding-postgres-ci.sh`: product entitlement, HM clearance fingerprint stale seal, HM pending→refresh→READY, seal vs attach/refresh races, multi-product explicit selection.
