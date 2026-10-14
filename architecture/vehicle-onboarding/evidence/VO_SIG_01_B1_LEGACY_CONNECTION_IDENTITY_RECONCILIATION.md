# VO-SIG-01 B1 — Legacy connection identity reconciliation (implementation)

| Field | Value |
|-------|-------|
| Status | `IMPLEMENTED_DEPLOYED_AWAITING_EXECUTE_ADMISSION` |
| Production execution | **Not authorized** — requires owner-signed short-lived admission + runtime `SYNQDRIVE_RELEASE_GIT_SHA` (no committed per-release SHA registry) |
| B0 baseline SHA | `6d68289018b65ce0c061dc5dbf8c66db7954ab29` |
| Cohort | DIMO tokens `186946`, `187361`, `187784`, `192922` (single tenant) |

## Contract

- **v1** (`vo-source-link-connection-identity-v1`): unchanged onboarding activation records; `preActivationProviderSourceRefId` required.
- **v2** (`vo-source-link-connection-identity-v2`): `origin=LEGACY_RECONCILIATION`, `preActivationProviderSourceRefId=null`, `preActivationScope=LEGACY_NO_ONBOARDING_SOURCE_REF`, `reconciliationProvenance`, `sourceEvidenceFingerprint`, `physicalEpisodeAttestation.independentlyProven=false`.

Parsers: `readConnectionIdentityFromLinkMetadata` (v1 only), `readConnectionIdentityFromLinkMetadataV2`, `parseConnectionIdentityFromLinkMetadata`.

Activation parity: legacy v2 links fail closed with `LEGACY_RECONCILED_DIMO_LINK_NOT_ONBOARDING_ACTIVATION` if VO activation snapshot parity runs against them.

## Ops

- Dry-run / CLI (default): `npm run ops:vo-sig-b1:legacy-reconcile:cli` (`VO_SIG_B1_CLI_MODE=DRY_RUN`).
- Owner authorization issuer (offline): `npm run ops:vo-sig-b1:issue-owner-execute-authorization` → `VO_SIG_B1_OWNER_EXECUTE_AUTHORIZATION` token (short TTL; bound to exact release SHA, org, four link UUIDs, manifest).
- Execute: `VO_SIG_B1_CLI_MODE=EXECUTE` + runtime `SYNQDRIVE_RELEASE_GIT_SHA` + operator HMAC + owner token; **fail-fast** partial batch policy (`PARTIAL_FAILURE_POLICY.md`).
- Rollback: separate owner rollback token + operator rollback HMAC per audit id (`issue-owner-rollback-authorization`).
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
