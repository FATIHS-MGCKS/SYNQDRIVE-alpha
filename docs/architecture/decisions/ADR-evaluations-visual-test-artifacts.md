# Evaluations Visual Test Artifact Policy

- Status: `ACCEPTED`
- Decision ID: `EVAL-ADR-010`
- Date: `2026-08-10`
- Scope: SynqDrive Evaluations / Auswertungen

## Context

Reproducible tests and current baselines are authority; historical screenshots are not recovered.

The repository does not contain separately identifiable Book I–IV files under the names supplied by the Phase-2.5 mandate. The direct Phase-2.5 mandate is therefore the controlling product instruction; repository ADRs, canonical architecture and current code were checked for contradictions. No contradiction prevents acceptance.

## Authority evidence

- `docs/audits/evaluations/evaluations-e2e-visual-report-2026-07.md — current test conventions`
- `frontend/e2e/evaluations-fixtures.ts — merged reproducible fixtures`
- `docs/audits/pr-recovery/phase2-evaluations-recovery-plan-2026-08.md — #818 preservation gate`

## Decision

- Do not recover historical PNGs or artifact-path-only commits as product source.
- Recover deterministic fixture/spec intent only after rebasing it on current #818 conventions.
- Generate a new approved baseline from the implemented current UI; volatile timestamps, random IDs, network data and PII are prohibited.
- Visual diffs are review evidence, not functional or architectural source of truth.

## Non-negotiable constraints

- Baselines are versioned with viewport, theme, locale and fixture schema.
- Accessibility and interaction tests remain separate mandatory gates.
- Artifact retention follows CI policy; stale screenshots may be deleted only in implementation PRs after replacement evidence exists.

## Impact

- Affected change-sets: `cs-evaluations-mobile-readiness`, `cs-evaluations-accessibility-i18n`, `cs-evaluations-information-architecture`, `cs-evaluations-forecast-ux`
- Migration: No DB impact; test baseline regeneration is required after approved UI cutover.
- Security/privacy: Fixtures/screenshots must contain synthetic, non-PII data.

## Consequences

- Historical cumulative branches are evidence only and are not integration authorities.
- Phase 3 reimplements or manually ports the decision on current main with the package gates.
- Any future exception requires a superseding ratified ADR and calculation/contract version update.

## Verification

- Architecture matrix consistency check.
- Package dependency and source-coverage validation.
- Required automated, security, migration and staging gates from the Phase-3 runbook.

## Open questions

None. Runtime activation remains gated by tests and release evidence, not by an unresolved architecture choice.
