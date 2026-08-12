# Phase 3 – E5 Final: Quality, Privacy, Authorization & Audit — Implementation Report (2026-08)

> **SUPERSEDED_BY_E5_1A (quality semantics only, 2026-08-12).** The E5A quality
> freshness/roll-up/provenance semantics referenced here were corrected in E5.1A
> (freshness `UNKNOWN` vs `businessEventRecency`; conservative roll-up; composite
> provenance; quality calc v2). See
> `phase3-e5-1a-quality-truth-provenance-test-report-2026-08.md`.
>
> **SUPERSEDED_BY_E5_1B (privacy & audit, 2026-08-12).** The E5B/E5C privacy and
> audit claims here were hardened in E5.1B: keyed HMAC pseudonyms (no original-ID
> fragment); person-level tier requires `customers.read` (full) / `evaluations.read`
> (pseudonymous), `invoices.read` grants nothing; and successful person-level
> disclosure is durable-audit-critical (fail closed if the canonical audit cannot
> persist). See `phase3-e5-1b-privacy-audit-hardening-test-report-2026-08.md`.
>
> **SUPERSEDED_BY_E5_1 (final acceptance, 2026-08-12).** Integrated E5 acceptance
> (quality truth, provenance, privacy, audit, real-DB adversarial, E1–E4 + full E5
> regression, all gates, all counters = 0) is recorded in
> `phase3-e5-1-final-quality-privacy-audit-acceptance-2026-08.md`
> (TESTED_CODE_SHA `121e127b`). Outcome: E5_READY_FOR_FINAL_MERGE_AUDIT.
>
> **SUPERSEDED_BY_E5_2 (2026-08-12).** E5.2 closed two follow-up blockers:
> production pseudonym-secret fail-closed (no dev fallback in production) and honest
> quality VALIDITY (never fabricated COMPLETE). See
> `phase3-e5-2-pseudonym-secret-validity-closure-2026-08.md` (TESTED_CODE_SHA `9e9e4060`).
>
> **SUPERSEDED_BY_E5_2_1 (2026-08-12).** E5.2.1 hard-denies the DRIVER membership
> from person-level Evaluations analytics (→ none) regardless of module
> permissions. See `phase3-e5-2-1-driver-role-authorization-closure-2026-08.md`
> (TESTED_CODE_SHA `568d9220`).

Consolidated E5 (E5A + E5B + E5C) on branch
`integration/evaluations-e5-quality-privacy-authorization-audit-2026-08` (PR #1025, Draft).

## Revision

- `E5_BASE_MAIN_SHA` = `960365a9b095a54f4656947ac2067a104e56bd8a` (E4 merge)
- `PRE_E5C_HEAD` = `3a886dc588e7f0f6511b3cad2a35f1e0ec56f17a`
- `TESTED_CODE_SHA` = `9e083f8a3c651bf1cbfeaf29d510ae68afeda7f7`
- No Prisma schema change.

## Historical source reconstruction (unambiguous)

From the Phase-2.6 recovery-authority branch `audit/repository-pr-recovery-evaluations-phase2-6-2026-08`. E5 package changesets:

| Changeset | PR | Sub-package | Status |
|---|---|---|---|
| `cs-evaluations-data-quality` | #788 | E5A | Implemented (quality dimensions) |
| `cs-evaluations-freshness-lineage` | #790 | E5A | Implemented (freshness + lineage) |
| `cs-evaluations-metric-state-ux` | #792 | E5A/E6 | Truthful-availability intent adopted; UI badges → E6 |
| `cs-evaluations-gdpr` | #815 | E5B | Implemented (PII-tier privacy policy) |
| `cs-evaluations-roles-permissions` | #816 | E5B | Reused existing RBAC + PII tiers (no bespoke evaluations RBAC matrix invented) |
| `cs-evaluations-audit-logging` | #817 | E5C | Implemented via the canonical BusinessAudit outbox |

Historical commits are evidence only — no cherry-pick / stack merge.

## Architecture

`request → E2 scope → E1 period → E4 EvaluationsInsightsService → E5 governance (privacy tier gate + audit) + E5A EvaluationsQualityService`. E5 adds governance around the E1–E4 truths; it is not a second calculation, scope, or audit engine (`PARALLEL_QUALITY_TRUTH_COUNT = 0`, `PARALLEL_AUTH_SCOPE_COUNT = 0`, `PARALLEL_AUDIT_TRUTH_COUNT = 0`).

## E5A — Quality / Freshness / Lineage

Module `evaluations-analytics/e5/`, endpoint `…/insights/quality`. Distinct dimensions (no global score); freshness against the period boundary for historical periods; conservative aggregation; status never upgraded; tenant-safe opaque source-class lineage; station scope emits no org-wide freshness/lineage. (See `phase3-e5a-*`.)

## E5B — Privacy & Authorization

Module `evaluations-analytics/privacy/`. Server-side PII tier (`full`/`pseudonymous`/`none`) reusing the canonical membership-permission primitives; gates the only person-level field (driver `driverRef`) in `driver-analysis` + `summary.driverInfluence`: none → `PERSON_LEVEL_ACCESS_DENIED`; pseudonymous → non-reversible pseudonyms; full → raw. Fails closed. (See `phase3-e5b-*`.)

## E5C — Auditability & Evidence

Module `evaluations-analytics/audit/`. `EvaluationsAuditService.recordPersonLevelAccess` REUSES the canonical durable `BusinessAudit` outbox (extended its taxonomy with `EVALUATIONS_PERSON_ANALYTICS_ACCESSED`/`_DENIED` + entity type `EVALUATIONS_DRIVER_ANALYTICS`). Every sensitive person-level driver-analytics access is recorded with the outcome (`SUCCEEDED`/`DENIED`), the authenticated server actor, org + scope, tier, aggregate factor count, and calculationVersion — and **no PII** (no driver refs/names/payloads). Auditing is targeted to the sensitive person-level surface (not ordinary aggregate reads) and is best-effort on the read path (a write failure never breaks the read; denied/succeeded outcomes are recorded honestly).

- Actor integrity: `actorUserId` is the authenticated server actor, never caller-supplied (`CALLER_SUPPLIED_AUDIT_ACTOR_ACCEPT_COUNT = 0`).
- No PII shadow log (`AUDIT_PII_DUPLICATION_COUNT = 0`); the canonical sanitizer + non-PII metadata guarantee it.
- No evaluations audit-read endpoint is added; audit records inherit the canonical BusinessAudit lifecycle/retention (no new retention policy invented). Tenant isolation and retention follow the existing audit domain (`CROSS_TENANT_AUDIT_READ_LEAKAGE_COUNT = 0`).

## Evidence traceability

An authorized reviewer can connect: analytics result → `calculationVersion` (per section) → quality status/dimensions (E5A) → lineage source category (E5A) → audit event for person-level access (E5C) — without exposing unauthorized raw records.

## Export/evidence boundary

No export/preview endpoint is implemented in E5 (the historical export/evidence surfaces belong to E6 UI / later packages). Documented as DEFERRED.

## Deferrals / boundaries

E6 (UI), E7 (recommendations/actions), E8 (predictive), E9 (forecast UI) — not started (`E6/E7/E8/E9_SCOPE_LEAK_COUNT = 0`). No UI redesign, no recommendations, no prediction.
