# VO-4 — Readiness authority, profile engine & sealed input integrity

| Field | Value |
|-------|-------|
| **Scope** | Internal readiness evaluation only — no public cutover |

## Authorities

| Topic | Authority |
|-------|-----------|
| Product / profile selection | `Organization.businessType` → governed code profiles |
| Jurisdiction | `Organization.country` when ISO-2 present; else `JURISDICTION_UNKNOWN` (no TÜV/BOKraft blockers in VO-4) |
| DIMO tenant ownership | **Not** inferred from mirror row (`VO-INV-DIMO-CUTOVER-AUTH-001`) |

## Contracts

- `VehicleOnboardingReadinessProfileV1` (code-defined)
- `VehicleOnboardingReadinessSnapshotV2` (`readinessSnapshotVersion = 2`)
- `ReadinessInputFingerprintV1` — SHA-256 canonical JSON

## Profile matrix (v1)

| Profile | Product | VIN | Plate | Station | Tires | Brakes | BEV HV battery | Telemetry pending |
|---------|---------|-----|-------|---------|-------|--------|----------------|-------------------|
| rental-onboarding-v1 | RENTAL | Provider nullable; manual required | OPTIONAL | OPTIONAL | DEFERRED | DEFERRED | REQUIRED | non-blocking |
| fleet-onboarding-v1 | FLEET | Provider nullable; manual required | OPTIONAL | OPTIONAL | DEFERRED | DEFERRED | DEFERRED | non-blocking |

## Gaps

- `READINESS_CAN_VALIDATE_BUT_ACTIVATION_DOES_NOT_MATERIALIZE_BASELINE=YES` — VO-4 validates `draftTechnicalBaselineJson` reference keys; VO-3 activation does not yet materialize `VehicleTireSetup` / brake / battery rows.

## Seal invalidation

- Readiness-relevant source attach → `READY_FOR_ACTIVATION` → `IN_PROGRESS`, snapshot cleared
- Activation verifies `readinessInputFingerprint` → `READINESS_SEAL_STALE` on mismatch
