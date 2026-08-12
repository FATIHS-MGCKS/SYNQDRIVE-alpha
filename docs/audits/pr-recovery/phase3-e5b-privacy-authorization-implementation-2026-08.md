# Phase 3 – E5B Privacy & Authorization — Implementation Report (2026-08)

> **SUPERSEDED_BY_E5_1B (2026-08-12).** Two E5B claims were corrected in E5.1B:
> (1) the permission mapping — `invoices.read` no longer grants any person-level
> access; `full` now requires the person-identity authority `customers.read` (or
> admin) and `pseudonymous` requires `evaluations.read`; (2) pseudonymization is
> now a keyed, domain-separated HMAC-SHA-256 (`person-v1-<hex>`) with no
> original-ID fragment, replacing the earlier `person-····<slice>` form. See
> `phase3-e5-1b-privacy-audit-hardening-test-report-2026-08.md` and
> `phase3-e5-person-level-permission-authority-matrix-2026-08.csv`.

## Revision

- `PRE_E5B_HEAD` = `670db7138378948827507a20992a3c236be34929` (E5A; confirmed ancestor)
- Branch = `integration/evaluations-e5-quality-privacy-authorization-audit-2026-08` (PR #1025, OPEN, DRAFT)
- `TESTED_CODE_SHA` = `494bbc51145ad4a6717d5bd50c7ec17af87c2497`
- No Prisma schema change.

## Historical intent

Reconstructed from `cs-evaluations-gdpr` (PR #815, `c8714b1f…`): a PII-tier privacy-by-design policy (`full`/`pseudonymous`/`none`) resolved from membership role + invoice/customer read. Reimplemented as a server-side authorization policy on current architecture (no cherry-pick). The formal RBAC matrix (`cs-evaluations-roles-permissions` #816) and audit logging (`cs-evaluations-audit-logging` #817) remain **E5C** (deferred).

## Server-side authority (no client authz)

The only person-level surface in current evaluations analytics is the E4 driver-influence `driverRef`. E5B adds `EvaluationsPrivacyResolver` (module `evaluations-analytics/privacy/`), which resolves a server-side PII tier and gates that field **before** it leaves the service. Frontend hiding is never authorization (`CLIENT_ONLY_AUTHORIZATION_COUNT = 0`).

- `resolvePiiTier(actor, orgId)` reuses the canonical membership-permission primitives (`permission.util` `evaluateModulePermission`/`normalizeMembershipPermissions`) and the E2/membership lookup — it does **not** create a second scope/authz authority (`PARALLEL_AUTH_SCOPE_COUNT = 0`).
- Tiers: MASTER_ADMIN/ORG_ADMIN → `full`; SUB_ADMIN with invoice+customer read → `full`; invoice read → `pseudonymous`; otherwise (DRIVER/CUSTOMER/no membership/no permission) → `none` (fail closed).

## Person-level gate + field-level exposure

`getDriverInfluence` (and `summary.driverInfluence`) apply the tier:
- `none` → section `UNAVAILABLE`, reason `PERSON_LEVEL_ACCESS_DENIED`, no factors, no references.
- `pseudonymous` → `driverRef` replaced by a deterministic non-reversible pseudonym (`person-····<tail>`); raw id never serialized (`SERVER_SENT_UNAUTHORIZED_FIELD_COUNT = 0`, `UNNECESSARY_PII_EXPOSURE_COUNT = 0`).
- `full` → raw org-scoped id.

The section carries `piiTier` for auditability. Aggregate sections (cost, utilization, strengths, weaknesses, finance, quality) expose no person identifiers.

## Lineage privacy

E5A lineage already exposes only opaque source-class tokens (`org:<orgId>:<Model>`), never per-record person data; station-scoped requests emit no org-wide lineage. Seeing an aggregate never grants per-record personal inspection (`LINEAGE_AUTHORIZATION_BYPASS_COUNT = 0`).

## Tenant / station / role safety

Tenant + station scope remain E2's authority (narrow-only; station-scoped person analytics fail closed). The privacy resolver fails closed for any actor without an active same-tenant membership (`CROSS_TENANT_PRIVACY_LEAKAGE_COUNT = 0`, `CROSS_ROLE_PRIVACY_LEAKAGE_COUNT = 0`). Authorization matrix: `phase3-e5-authorization-matrix-2026-08.csv`.

## Logs / cache

No new logging of PII/tokens/request bodies was introduced; the privacy resolver logs nothing (`SENSITIVE_LOG_PAYLOAD_COUNT = 0`). No cache is introduced by E5B (`CACHE_SCOPE_LEAKAGE_COUNT = 0`).

## GDPR-oriented engineering controls

Data minimization (pseudonymous/none tiers), purpose limitation (person data only when authorized), access restriction (server-side tier), auditability (`piiTier` echoed). These are engineering controls, not a legal-compliance claim.

## Deferrals

E5C (formal roles/permissions matrix + audit logging) and E6–E9 not started. No UI change.
