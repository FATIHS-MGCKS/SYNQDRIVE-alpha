# Evaluations E7 — Recommendations & Actions Authority (2026-08-17)

## Changes

- **E7A (authority freeze, docs-only):** frozen the Recommendations / Actions layer
  for the canonical Evaluations product (`financial-insights` / `EvaluationsPage`).
  No runtime, Prisma, migration, or production changes.
- **E7B (canonical backend, branch):** shared `@synq/evaluations-recommendations`
  contract, pure derivation domain, one-summary orchestration service, tenant-safe
  `GET …/insights/recommendations`, E5 `buildQualityReportFromSummary()` refactor,
  deterministic stable ids, supersession/dedup rules, non-mutating action metadata only.
  Zero Prisma/migration/production changes.
- Documented the E1–E6 input matrix, legacy/salvage inventory, accepted/rejected
  recommendation families, threshold authority (zero invented thresholds),
  status/quality fail-closed behavior, money/privacy boundaries, action model
  (non-mutating initial surface), provenance contract, stable identity/dedup,
  sort authority, proposed backend API, UI placement, 35-case test matrix, and
  E7B/C/D topology.
- Onboarding: `docs/audits/pr-recovery/E7-ONBOARDING.md`
- Authority baseline: `docs/audits/pr-recovery/phase3-e7a-recommendations-actions-authority-baseline-2026-08.md`
- Backend implementation: `docs/audits/pr-recovery/phase3-e7b-canonical-recommendations-backend-implementation-2026-08.md`

### E7B contract clarification addendum (labeled; E7A history preserved)

1. Per-family authoritative source period for stable identity (finance = E3 MTD metric.period)
2. Separate RecommendationCategory vs RecommendationSortBucket (no dual category enums)
3. Deterministic supersession (UNDERUTILIZATION, receivables, quality dedup)
4. Structural FRESHNESS UNKNOWN preserved but does not alone emit DATA_QUALITY_LIMITED
5. Localization via titleKey/explanationKey/copyParams only (no server locale business logic)
6. One E4 summary orchestration — no triple E3/E4/E5 recompute

## Architektur

- **E7 scope.** Operator-facing recommendations answer: what to pay attention to, why,
  with what evidence, and what non-mutating next step is available. They are **not**
  predictive risk (E8), forecasts (E9), or client-derived dashboard insight strings.
- **Authority chain (E7B implemented).** E7 derivation orchestrates existing authorities only:
  E2 scope → E1 period (analytics) + E3 finance via E4 summary sections → E5
  quality/privacy gates (from precomputed summary) → E7 recommendation envelope.
  `PARALLEL_RECOMMENDATION_TRUTH_COUNT = 0` — enforced by service tests.
- **Thresholds.** Only reuse E4 `E4_DETECTION_THRESHOLDS` and observed E3 money facts
  (`amountMinor > 0`). `UNAUTHORIZED_INVENTED_THRESHOLDS = 0`.
- **Money.** Observed canonical `EvaluationsMoney` only; no `estimatedExposure`,
  `expectedBenefit`, or forecast fields.
- **Privacy.** Reuse E5B `piiTier`; driver families fail-closed at `none`; pseudonymous
  stays pseudonymous; no identity join from `driverRef`.
- **E7B.1 (fail-closed hardening, branch):** Finance exact AVAILABLE gate, Driver AVAILABLE+factors gate,
  Cost PARTIAL-only authority, source-scoped quality limitations and supersession, empty-state fail-closed,
  discriminated action targets with runtime validation. See
  `phase3-e7b1-recommendation-authority-conformance-hardening-2026-08.md`.
- **Actions (initial).** Non-mutating only: NAVIGATION / FILTER / OPEN_ENTITY /
  OPEN_WORKFLOW link. E7B.1: discriminated union targets + runtime allowlist validation.
- **Workflow boundary.** Link to existing workflow-automation route with context;
  no hidden action engine inside Evaluations.
- **UI (E7C plan).** New section on `EvaluationsPage` after Executive Summary;
  no second Evaluations page.
- **Proposed API (E7B).** `GET …/evaluations/analytics/insights/recommendations`
  with deterministic stable ids and `recommendations-e7-v1` calculation version.
  **Implemented on branch** (E7B); not merged to main.
- **Legacy rejection.** Historical `origin/cursor/evaluations-recommendation-domain-8427`
  (persistence + monetary benefit fields) and `insights-categories.ts` client strings
  are **not** canonical E7 authority.
- **Boundaries preserved.** E8 predictive risk and E9 forecast UI remain excluded.
