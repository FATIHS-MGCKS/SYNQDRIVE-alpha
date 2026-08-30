# I18N Governance Scanner & Classification — P2.3.2

**Date:** 2026-08-30

## Summary

P2.3.2 adds enhanced presentation scanning, residual classification manifest, fingerprinting, and a governance comparator without changing product UI semantics.

## Components

| Path | Role |
|------|------|
| `frontend/scripts/lib/i18n-governance/` | Classification taxonomy, fingerprints, structural context, presentation analysis, comparator, manifest validator |
| `frontend/scripts/i18n-governance.mjs` | Orchestrator: enhanced scan + manifest validation + active-debt report |
| `frontend/scripts/capture-i18n-governance-baseline.mjs` | Captures enhanced-scan fingerprints into manifest baseline |
| `frontend/src/i18n/i18n-debt-classifications.json` | Narrow semantic rules + committed baseline fingerprints |
| `frontend/src/i18n/__fixtures__/governance-adversarial/` | Adversarial positive/negative scanner fixtures |
| `frontend/src/i18n/i18n-governance-scanner.test.ts` | Fixture, fingerprint, manifest bypass, legacy compatibility tests |

## Scanner modes

- **Legacy (`includeEnhanced: false`)** — used by `npm run i18n:check`; preserves P2.3.1 closeout counts (1241 / 144 / 25) and enforce-clean inventory semantics.
- **Governance (`includeEnhanced: true`)** — adds bounded indirect presentation analysis (title/aria/placeholder/alt, toast, setError, config labels, template literals).

## Classification safety model

1. **Pre-existing baseline debt** — fingerprint in `baselineFingerprints` → `PREEXISTING_BASELINE_DEBT` (visible, not "new").
2. **Baseline enforce-clean debt** — fingerprint in baseline + `enforce-clean` → `ACTIVE_REMEDIATION_REQUIRED` (known, unresolved).
3. **New host debt** — fingerprint not in baseline and actionable → `NEW_UNCLASSIFIED_ACTIVE_HOST_DEBT`.
4. **Narrow semantic rules only** — Data Analyse, IAM RolesTab, Help Center SECTIONS TEXT corpus. No production-root wildcards.
5. **Enforce-clean override** — broad rules cannot suppress enforce-clean findings; only exact fingerprint entries may classify them.

## Fingerprint v2

`file + category + presentationOwner + kind + structuralContext + normalizedLiteral`

`structuralContext` = nearest enclosing function/component symbol (line-independent).

## Inventory ownership

- `hardcoded-copy-inventory.json` — legacy mode only (`i18n:check` CLI).
- Governance findings — reported by `npm run i18n:governance` (not mixed into legacy inventory).

## Next step

P2.3.3 — changed-file PR gate using comparator + fingerprints.
