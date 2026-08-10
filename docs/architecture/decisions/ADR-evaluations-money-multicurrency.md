# Evaluations Money and Multi-Currency Authority

- Status: `ACCEPTED`
- Decision ID: `EVAL-ADR-001`
- Date: `2026-08-10`
- Scope: SynqDrive Evaluations / Auswertungen

## Context

A typed money contract preserves original amounts and converts only with historical FX provenance.

The repository does not contain separately identifiable Book I–IV files under the names supplied by the Phase-2.5 mandate. The direct Phase-2.5 mandate is therefore the controlling product instruction; repository ADRs, canonical architecture and current code were checked for contradictions. No contradiction prevents acceptance.

## Authority evidence

- `backend/prisma/schema.prisma — Organization, OrgInvoice, BillingInvoice currency/minor-unit fields`
- `docs/architecture/analytics/evaluations-metric-registry.md — metric units and canonical registry`
- `docs/architecture/analytics/evaluations-calculation-versioning.md — filters, source versions and reproducibility`
- `docs/audits/evaluations/evaluations-post-remediation-readiness-2026-07.md — current EUR-only behavior`

## Decision

- The canonical value object is `{ amountMinor, currency }`, where `currency` is an uppercase ISO-4217 code and `amountMinor` is an integer in that currency's defined minor unit.
- Every converted value preserves original amount/currency plus organization base currency, converted amount, FX rate, FX timestamp, FX source/provenance, and conversion status.
- Unknown currency is not EUR. Values without an approved conversion are never summed across currencies and surface as partial/unavailable.
- Historical reports use the FX context effective for the reporting event or persisted conversion snapshot; later rates never silently rewrite history.
- Existing `totalCents`/`amountCents` fields remain source-domain inputs during migration, but the evaluations contract uses `amountMinor`; no magnitude heuristic may infer cents versus euros.

## Non-negotiable constraints

- The invoice and billing domains remain source authorities for original transaction values.
- Formula/provenance versions must change when currency policy changes.
- Backfill is dry-run, idempotent and reconcilable; uncertain rows remain unconverted.

## Impact

- Affected change-sets: `cs-evaluations-money-domain`, `cs-evaluations-money-migration`, `cs-evaluations-receivables`, `cs-evaluations-revenue-cashflow-result`, `cs-evaluations-multi-currency`, `cs-evaluations-finance-test-suite`
- Migration: Required: organization base currency, conversion/provenance storage, and controlled historical backfill.
- Security/privacy: Financial data; finance-owner review and reconciliation are mandatory.

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
