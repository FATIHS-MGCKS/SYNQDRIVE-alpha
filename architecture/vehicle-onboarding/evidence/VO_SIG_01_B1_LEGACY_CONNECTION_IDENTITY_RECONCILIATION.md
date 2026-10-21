# VO-SIG-01 B1 — Legacy connection identity reconciliation

| Field | Value |
|-------|-------|
| Status | `PRODUCTION_EXECUTE_COMPLETE` (one-time cohort; **do not re-run**) |
| Authority module status | `AUDIT_IN_PROGRESS` (unchanged — **not** promoted to `AUTHORITY_ACTIVE`) |
| Application baseline on GitHub `main` (independent) | `a4c3b1fc1de0480d7caab5897242b67bb3f7044e` (2026-10-14) |
| Production deploy attestation (independent, read-only SSH) | P4B16 gen 11, `DEPLOYED_SHA=a4c3b1fc1de0480d7caab5897242b67bb3f7044e` |

## Evidence classification

| Source | What it proves |
|--------|----------------|
| **Operator-reported (2026-10-14)** | One-time B1 execute outcome, cohort link identities, manifest fingerprint, backup path, `RUN_ID` |
| **GitHub `main` (agent-verified)** | B1 executor/dry-run code + audit table migration present; **no** `VO_SIG_B1_SIMPLE_REPAIR_REVIEW_V3.sql` on `main` at `a4c3b1` |
| **GitHub commit `81d588039d7a75de41bb694793751a255883b779` (agent-verified, not on `main`) | SQL V3 review artifact + generator/test harness only — **not merged**; operator path referenced this review commit |

## Production closure (operator-reported — 2026-10-14)

Authorized operator one-time execute. **Not re-verified row-by-row in this documentation pass** (read-only DB audit out of scope for doc-only PR).

| Field | Value |
|-------|-------|
| `RUN_ID` | `3ff43d40-cb14-4546-8427-c73957e95473` |
| `UPDATED_LINKS` | 4 |
| `APPLIED_AUDITS` | 4 |
| `UNEXPECTED_MUTATIONS` | NONE |
| Approval manifest fingerprint | `f9f2a17be4c361be04dc88afd4e12bb3034a4b64e84a504641a999a06cddef73` |
| Operator backup (reported) | `/opt/synqdrive/shared/backups/postgresql/daily/synqdrive-daily-20261014T142920Z.dump.gpg` |

### Cohort (operator-reported source-link identities)

| DIMO token | Source link UUID | Verified modality | Telemetry family | Notes |
|------------|------------------|-----------------|------------------|-------|
| 186946 | `805b271c-ba87-4776-9e39-23e24d595c53` | SOFTWARE_INTEGRATION | API_SYNTHETIC | Tesla — `hardwareType` unchanged; historically LTE_R1 |
| 187361 | `71b75519-3053-4836-8bcd-554680d592b2` | HARDWARE_DEVICE | Ruptela R1 | |
| 187784 | `6fcca9d4-99d5-4be8-8985-e9369c53b7f6` | HARDWARE_DEVICE | Ruptela R1 | |
| 192922 | `9ff5e350-cd4b-4e3a-956a-4f1770b017f2` | HARDWARE_DEVICE | Ruptela R1 | |

### Semantic guarantees (contract — not independent field audit)

- `origin=LEGACY_RECONCILIATION` — **not** a fabricated historical onboarding episode.
- `preActivationProviderSourceRefId=null`, `preActivationScope=LEGACY_NO_ONBOARDING_SOURCE_REF`.
- `physicalEpisodeAttestation.independentlyProven=false` — physical install **not** independently proven.
- Existing link metadata outside `connectionIdentity` preserved; `last_verified_at` **unchanged** on apply (SQL V3 / service contract).
- **No further B1 execute** required for this cohort (`EXISTING_B1_AUDIT_FOR_COHORT` guard on re-attempt).

## SQL V3 review artifact (GitHub — not on `main`)

| Item | SHA / path |
|------|------------|
| Review commit | `81d588039d7a75de41bb694793751a255883b779` |
| Generated SQL (review tree) | `architecture/vehicle-onboarding/evidence/VO_SIG_B1_SIMPLE_REPAIR_REVIEW_V3.sql` |
| Ephemeral test evidence doc | `architecture/vehicle-onboarding/evidence/VO_SIG_B1_SIMPLE_REPAIR_V3_TEST_EVIDENCE.md` (same commit) |

**Retention policy:** Document closure references the review commit; **do not** copy SQL V3 onto `main` without a separate owner-reviewed merge. At `a4c3b1fc1de`, `main` does not contain this file (GitHub contents API 404).

## Contract (implementation on `main`)

- **v1** (`vo-source-link-connection-identity-v1`): unchanged onboarding activation records; `preActivationProviderSourceRefId` required.
- **v2** (`vo-source-link-connection-identity-v2`): `origin=LEGACY_RECONCILIATION`, honest null source ref, `reconciliationProvenance`, `sourceEvidenceFingerprint`, `physicalEpisodeAttestation.independentlyProven=false`.

Parsers: `readConnectionIdentityFromLinkMetadata` (v1 only), `readConnectionIdentityFromLinkMetadataV2`, `parseConnectionIdentityFromLinkMetadata`.

Activation parity: legacy v2 links fail closed with `LEGACY_RECONCILED_DIMO_LINK_NOT_ONBOARDING_ACTIVATION` if VO activation snapshot parity runs against them.

## Ops (code paths — production execute already done for cohort)

- Dry-run: `npm run ops:vo-sig-b1:legacy-reconcile:dry-run` (env: `VO_SIG_B1_ORGANIZATION_ID`, optional `VO_SIG_B1_LINK_IDS`, `VO_SIG_B1_ALLOWLIST_LINK_IDS`).
- Service execute: `applyLegacyConnectionIdentityReconciliation` (`mode=EXECUTE`, operator admission, cohort guards) — **cohort complete**; repeat execute should fail closed.
- Draft PR **#2018** (`cursor/vo-sig-b1-execution-admission-hardening-dafe`): owner HMAC + CLI admission layering for the same one-time action — **closed without merge** (superseded by operator SQL V3 execute + existing guards).

## Audit

Table `vehicle_connection_identity_reconciliation_audits` — atomic with metadata `UPDATE` (`FOR UPDATE` + conditional `connectionIdentity` absent + metadata fingerprint CAS). FK `source_link_id` **ON DELETE RESTRICT**; rollback snapshots in `before_metadata_json` / `before_last_verified_at`.

## Tests (repository)

- Unit: `connection-identity-metadata-v2.unit.spec.ts`
- PostgreSQL: `vo-sig-01-b1-legacy-reconciliation.postgres.integration.spec.ts` (`VO_SIG_B1_LEGACY_RECONCILE_PG=1`, wired in `vo2-vehicle-onboarding-postgres-ci.sh`)

## Validation (2026-10-13 PG runtime closure — pre-production)

- `dimo_vehicles.id` row locks and mirror fixtures use **TEXT** ids (not `::uuid`).
- Cohort manifest fail-closed: ineligible rows / drift → `LEGACY_RECONCILE_COHORT_INELIGIBLE` / `LEGACY_RECONCILE_MANIFEST_FINGERPRINT_MISMATCH`.
- Ephemeral migrate + B1 suite: **26/26 PASS** (local VO-2 integration DB).

## Proposed follow-up (out of scope — P2)

**VO-SIG-01 P2 — Master Admin DIMO registration/activation parity**

- Master Connected Vehicles registration still calls `VehiclesService.registerFromDimo` (`POST …/register-from-dimo`).
- Canonical onboarding activation persists `VehicleDataSourceLink.metadata.connectionIdentity` via `VehicleOnboardingActivationService` and `assertTelemetryConnectionIdentityForActivationTx`.
- **Gap:** new DIMO registrations through Master Admin may not receive the same connection-identity contract as orchestrated activation until P2 is designed and implemented.
- **This document does not implement P2.**
