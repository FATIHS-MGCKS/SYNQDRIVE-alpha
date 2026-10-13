# VO-SIG-01 B1 — Legacy connection identity reconciliation (implementation)

| Field | Value |
|-------|-------|
| Status | `IMPLEMENTED_NOT_DEPLOYED` |
| Production execution | **Not authorized** — dry-run + executor code only |
| B0 baseline SHA | `6d68289018b65ce0c061dc5dbf8c66db7954ab29` |
| Cohort | DIMO tokens `186946`, `187361`, `187784`, `192922` (single tenant) |

## Contract

- **v1** (`vo-source-link-connection-identity-v1`): unchanged onboarding activation records; `preActivationProviderSourceRefId` required.
- **v2** (`vo-source-link-connection-identity-v2`): `origin=LEGACY_RECONCILIATION`, `preActivationProviderSourceRefId=null`, `preActivationScope=LEGACY_NO_ONBOARDING_SOURCE_REF`, `reconciliationProvenance`, `sourceEvidenceFingerprint`, `physicalEpisodeAttestation.independentlyProven=false`.

Parsers: `readConnectionIdentityFromLinkMetadata` (v1 only), `readConnectionIdentityFromLinkMetadataV2`, `parseConnectionIdentityFromLinkMetadata`.

Activation parity: legacy v2 links fail closed with `LEGACY_RECONCILED_DIMO_LINK_NOT_ONBOARDING_ACTIVATION` if VO activation snapshot parity runs against them.

## Ops

- Dry-run: `npm run ops:vo-sig-b1:legacy-reconcile:dry-run` (env: `VO_SIG_B1_ORGANIZATION_ID`, optional `VO_SIG_B1_LINK_IDS`, `VO_SIG_B1_ALLOWLIST_LINK_IDS`).
- Execute (non-production default): `applyLegacyConnectionIdentityReconciliation` requires `mode=EXECUTE`, operator admission HMAC (`VO_SIG_B1_OPERATOR_ADMISSION_SECRET`), committed trusted release registry, operator + tenant scope, exact cohort link IDs, allowlisted links, and **non-empty deterministic approval manifest** (`computeCohortApprovalManifestFingerprint` — stable across idempotent repeat execute).
- Approval manifest hashes immutable evidence + link/tenant scope + current metadata fingerprint (excludes execution timestamps / DRY_RUN provenance).

## Audit

Table `vehicle_connection_identity_reconciliation_audits` — atomic with metadata `UPDATE` (`FOR UPDATE` + conditional `connectionIdentity` absent + metadata fingerprint CAS). FK `source_link_id` **ON DELETE RESTRICT**; rollback snapshots stored in `before_metadata_json` / `before_last_verified_at`.

## Tests

- Unit: `connection-identity-metadata-v2.unit.spec.ts`
- PostgreSQL: `vo-sig-01-b1-legacy-reconciliation.postgres.integration.spec.ts` (`VO_SIG_B1_LEGACY_RECONCILE_PG=1`, wired in `vo2-vehicle-onboarding-postgres-ci.sh`)

## Validation (2026-10-13 PG runtime closure)

- `dimo_vehicles.id` row locks and mirror fixtures use **TEXT** ids (not `::uuid`) — fixes PostgreSQL `42883 text = uuid` during `FOR UPDATE`.
- Cohort manifest is **fail-closed**: ineligible plan rows, consent drift, and pre-execute metadata drift reject with `LEGACY_RECONCILE_COHORT_INELIGIBLE` / `LEGACY_RECONCILE_MANIFEST_FINGERPRINT_MISMATCH` (not per-link `SKIPPED` downgrade).
- Cross-tenant coverage splits **DB** `uq_vdsl_active_dimo_vehicle` rejection vs **service** `DIMO_MIRROR_ACTIVE_IN_OTHER_TENANT` via `evaluateLegacyDimoLinkProviderEvidence`.
- Metadata storage: `resolveLinkMetadataStorageState` distinguishes SQL `NULL` vs jsonb `'null'` for fingerprints and audit provenance.
- Ephemeral migrate + B1 suite: **26/26 PASS** (local VO-2 integration DB).
