# I18N Governance Scanner & Classification — P2.3.2

**Date:** 2026-08-30

## Summary

P2.3.2 adds enhanced presentation scanning, residual classification manifest, fingerprinting, and a governance comparator without changing product UI semantics.

## Components

| Path | Role |
|------|------|
| `frontend/scripts/lib/i18n-governance/` | Classification taxonomy, fingerprints, presentation analysis, comparator, manifest validator |
| `frontend/scripts/i18n-governance.mjs` | Orchestrator: enhanced scan + manifest validation + active-debt report |
| `frontend/src/i18n/i18n-debt-classifications.json` | Committed residual classification rules |
| `frontend/src/i18n/__fixtures__/governance-adversarial/` | Adversarial positive/negative scanner fixtures |
| `frontend/src/i18n/i18n-governance-scanner.test.ts` | Fixture + fingerprint + manifest tests |

## Scanner modes

- **Legacy (`includeEnhanced: false`)** — used by `npm run i18n:check`; preserves P2.2 enforce-clean inventory semantics.
- **Governance (`includeEnhanced: true`)** — adds bounded indirect presentation analysis (title/aria/placeholder/alt, toast, setError, config labels, template literals).

## Invariant

`NEW_UNCLASSIFIED_ACTIVE_HOST_DEBT = enforce-clean findings under enhanced governance scan` (not `TOTAL_FINDINGS = 0`).

## Next step

P2.3.3 — changed-file PR gate using comparator + fingerprints.
