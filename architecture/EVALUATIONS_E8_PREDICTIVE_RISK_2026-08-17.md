# Evaluations E8 — Predictive Risk Authority (2026-08-17)

## Changes

- **E8A (authority freeze, docs-only):** froze Predictive Risk governance before any
  runtime implementation. E7 merged @ `bd732a8`. No Prisma, migration, or production
  changes.
- Selected initial predictive target: `FLEET_UNPLANNED_MAINTENANCE_DISRUPTION` /
  horizon `NEXT_30_DAYS` at org/station scope.
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
- **Authority chain (planned E8B).** E2 scope → E4 summary (1×) → historical
  ServiceCase features (≤ featureCutoffAt) → E5 quality fail-closed → risk category
  output. No direct E3 finance for MVP target. No E7 recommendation features.
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
  `phase3-e8a-predictive-risk-estimated-exposure-authority-baseline-2026-08.md`

## Phase topology

| Phase | Status |
|-------|--------|
| E8A | Complete (this document) |
| E8B | Backend + offline validation — next |
| E8C | Frontend integration |
| E8D | Merge readiness |

## Boundaries

- Do not modify E7 recommendation derive logic in E8 phases without explicit scope.
- Do not implement E9 forecast series in E8.
- Do not emit estimatedExposure until separate exposure authority pass.
- Historical `cursor/evaluations-*-8427` branches: salvage reference only.
