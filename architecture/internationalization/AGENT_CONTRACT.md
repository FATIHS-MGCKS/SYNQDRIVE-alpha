# Agent Contract — Internationalization (i18n)

## Mandatory read-first sequence

1. [`architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md`](../SYNQDRIVE_RENTAL_ARCHITECTURE.md) — registry row
2. This directory `README.md` → `CURRENT_STATE.md` → `KNOWLEDGE_GRAPH.md`
3. `.cursor/rules/i18n.mdc` — engineering rules
4. For governance changes: `architecture/I18N_GOVERNANCE_*` supporting docs
5. `decisions/DECISION_REGISTER.md`, `contradictions/*`, `research/OPEN_QUESTIONS.md`

## Substantive change definition

Substantive i18n changes include: runtime lookup semantics, locale contract, fallback behavior, governance classifier/parser, authority-path contract, scanner classification, PR gate policy, translation coverage baseline, hardcoded-copy enforce-clean phases, and Rental/Operator integration patterns.

## Same-workstream duties

- Update this authority when making substantive i18n changes.
- Run `bash architecture/internationalization/scripts/validate-graph.sh`
- Run `bash architecture/scripts/validate-module-registry.sh`
- Run applicable `npm run i18n:*` validators
- Report `REGISTRY_REVIEWED` for Internationalization (i18n)

## Ownership boundaries

| In scope | Out of scope |
|----------|--------------|
| `frontend/src/i18n/**` | General backend API localization |
| i18n scripts / governance lib | Legal document content authority |
| i18n CI workflows | Rental business logic (except `t()` usage) |
| Translation coverage / hardcoded inventory | DIMO / trip modules |

## Prohibited silent changes

- Reintroducing `frontend/src/rental/i18n/` bridge
- `...en` dictionary spread for false completeness
- Hardcoded user-visible strings in enforce-clean surfaces
- Handwritten mirrors of workflow authority classifier
- Weakening `pull_request_target` security in authority-protection workflow

## Production

**Read-only by default.** No deploy/restart/migration without explicit user authorization.

## Validation commands

```bash
bash architecture/internationalization/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
cd frontend && npm run i18n:check:ci
cd frontend && npm run i18n:pr-gate:test
bash .cursor/scripts/i18n-authority-protection-classifier.harness.sh
```

## Completion report (mandatory)

Include `ARCHITECTURE_GOVERNANCE` block per `.cursor/rules/Architectur-Updates.mdc`.
