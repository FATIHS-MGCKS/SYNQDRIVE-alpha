# Evaluations E8 — Predictive Risk Authority (2026-08-17)

## Changes

- **E8A (authority freeze, docs-only):** froze Predictive Risk governance before any
  runtime implementation. E7 merged @ `bd732a8`. No Prisma, migration, or production
  changes.
- E8A selected initial predictive target name `FLEET_UNPLANNED_MAINTENANCE_DISRUPTION` /
  horizon `NEXT_30_DAYS` at org/station scope — **E8B0 corrected target name** (see below).
- **E8B0 (synthetic certification):** superseded by E8B0.1 for empirical authority.
- **E8B0.1 (Production read-only):** corrected leakage harness (mutant-sensitive), reconciled E8B0 evidence drift, closed target semantics to **`FLEET_NEW_SERVICE_CASE_DOWNTIME_DISRUPTION`** (`EVENT_TRUTH_WITHIN_HORIZON`; no mutable `blocksRental`/`status` in label). Production read-only audit: `transaction_read_only=on`, **0 ServiceCase rows** — horizon recommendation **`NONE`**, E8B blocked pending real label history.
- **estimatedExposure deferred** — insufficient authority for EXPECTED LOSS or
  standalone monetary field; E3 observed receivables remain Class A facts only.
- Model governance: DETERMINISTIC_POLICY_RULE + STATISTICAL_BASELINE first; no ML/LLM;
  no numeric probability until offline calibration; no decorative confidence %.
- Strict separation: Observed Fact / Risk Indicator / Forward-Risk Rule / Statistical
  Prediction. E7 recommendations unchanged; separate Predictive Risk section proposed.
- E9 forecast salvage classified E9_ONLY; no forecast UI in E8.

## Architektur

- **E8 scope.** Canonical **predictive risk** about a defined future operational event
  — not E7 observed recommendations, not E9 time-series forecasts.
- **Certified target (E8B0.1).** `FLEET_NEW_SERVICE_CASE_DOWNTIME_DISRUPTION` — `openedAt`
  + `downtimeStart` within horizon; ambiguous when downtime missing; no `blocksRental`/
  `status` in label.
- **Scope (E8B0).** `ORGANIZATION_ONLY` for MVP; station filtering
  `NOT_SUPPORTED_FOR_E8_MVP` until vehicle/station PIT history is complete.
- **Horizon (E8B0).** `NEXT_30_DAYS` recommended empirically; **product approval
  required** before runtime (`HORIZON_PRODUCT_AUTHORITY`).
- **Authority chain (planned E8B).** E2 org scope → historical ServiceCase features
  (≤ featureCutoffAt, PIT-safe subset) → E5 quality fail-closed → risk category
  output. No E7 recommendation features. No live unbounded freshness features.
- **Outputs (E8B MVP).** `RISK_CATEGORY` (`ELEVATED` / `NORMAL`) + provenance +
  quality limitations. **No** `eventProbability`, **no** `estimatedExposure`, **no**
  `confidenceScore`.
- **Freshness.** Stricter than E7: structural E5 FRESHNESS UNKNOWN blocks live-dependent
  claims; historical closed windows only for MVP features.
- **Privacy.** Aggregate fleet/vehicle operational signals only in MVP; no person-level
  driver predictive profiling; E5B piiTier preserved.
- **Persistence.** DERIVED_ON_READ; optional ephemeral cache later — no new Prisma in
  initial E8.
- **API (proposed).** `GET …/evaluations/analytics/insights/predictive-risk`
- **UI (proposed E8C).** New section on `EvaluationsPage` after Recommendations;
  presentation-only; labels distinguish Observed / Predicted / Potential.
- **Docs:** `docs/audits/pr-recovery/E8-ONBOARDING.md`,
  `phase3-e8a-predictive-risk-estimated-exposure-authority-baseline-2026-08.md`,
  `phase3-e8b0-predictive-target-label-horizon-dataset-certification-2026-08.md`,
  `phase3-e8b01-production-readonly-predictive-certification-2026-08.md`

## Phase topology

| Phase | Status |
|-------|--------|
| E8A | Complete (authority freeze) |
| E8B0 | Complete (synthetic — superseded) |
| E8B0.1 | Complete (Production read-only; insufficient ServiceCase history) |
| E8B | Backend — **blocked** (`INSUFFICIENT_REAL_POSITIVE_LABELS`) |
| E8C | Frontend integration |
| E8D | Merge readiness |

## Boundaries

- Do not modify E7 recommendation derive logic in E8 phases without explicit scope.
- Do not implement E9 forecast series in E8.
- Do not emit estimatedExposure until separate exposure authority pass.
- Historical `cursor/evaluations-*-8427` branches: salvage reference only.
