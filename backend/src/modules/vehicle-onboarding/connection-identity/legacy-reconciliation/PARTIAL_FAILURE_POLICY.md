# VO-SIG-01 B1 — partial batch execution policy

B1 legacy connection identity reconciliation is **not** a single four-link database transaction.

## Semantics

- Each source link is applied in its **own** `prisma.$transaction` with row locks and metadata CAS.
- Processing order follows the caller-supplied `linkIds` array (sorted for manifest fingerprint only).
- **Fail-fast:** any unexpected `SKIPPED` outcome aborts the batch immediately via `LegacyReconcileFailFastError`.
- **Idempotent `NO_OP`:** when an `APPLIED` audit already exists for a link with matching authorization, that link returns `NO_OP` and processing continues.
- **Up-front cohort gates** (`LEGACY_RECONCILE_COHORT_INELIGIBLE`, manifest mismatch, authorization failures) reject the entire run before any link mutation.
- **Post-approval drift:** if evidence changes after the owner signed a manifest, the fresh cohort fingerprint no longer matches → `LEGACY_RECONCILE_MANIFEST_FINGERPRINT_MISMATCH` (no mutation).

## Operator expectations

- A fail-fast stop may leave **some** links `APPLIED` and others untouched.
- Continue requires a **new** owner authorization + fresh manifest for remaining links only.
- Roll back applied links individually with a separate owner rollback authorization per audit id.
