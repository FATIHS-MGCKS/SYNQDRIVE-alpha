# Internationalization (i18n) — Agent Contract

**Effective:** 2026-09-10
**Registry coverage:** `AUTHORITY_ACTIVE`
**Authority maturity:** Bootstrap audit V1 complete (Gate A satisfied 2026-09-10)

## Mandatory read-first sequence

Before substantive Internationalization work, read in order:

1. [`architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md`](../SYNQDRIVE_RENTAL_ARCHITECTURE.md) — overview row + detailed Internationalization section
2. This authority: [README.md](./README.md) → [CURRENT_STATE.md](./CURRENT_STATE.md) → [KNOWLEDGE_GRAPH.md](./KNOWLEDGE_GRAPH.md)
3. [AUDIT_MANIFEST.md](./AUDIT_MANIFEST.md) · [decisions/DECISION_REGISTER.md](./decisions/DECISION_REGISTER.md) · [contradictions/](./contradictions/) · [research/OPEN_QUESTIONS.md](./research/OPEN_QUESTIONS.md)
4. [`.cursor/rules/i18n.mdc`](../../.cursor/rules/i18n.mdc) — engineering rules
5. For governance classifier/parity work: `architecture/I18N_GOVERNANCE_*` supporting docs and `frontend/scripts/lib/i18n-governance/authority-path-contract.mjs`
6. **Neighbor authorities** when cross-module: Rental surface owners, Legal Documents, Operator/Master shell modules, Communication Center (voice/WhatsApp copy surfaces)

Flat `architecture/I18N_*` memos and `audit-campaign/architecture/I18N_*` slice docs are **supporting evidence only** — not default authority.

## Module-authority maintenance duty

Any **substantive** Internationalization change **must** update this authority in the **same workstream/PR**.

Preserve BEFORE / WHY / CHANGE / alternatives / expected effect / validation / observed effect / non-effects / tradeoffs / remaining gaps / evidence references per the standard.

## Same-PR registry synchronization duty

When registry metadata facts change in the same PR:

1. Update this module authority artifacts.
2. Re-read the Internationalization overview row and detailed section in [`architecture/SYNQDRIVE_RENTAL_ARCHITECTURE.md`](../SYNQDRIVE_RENTAL_ARCHITECTURE.md).
3. Update the central registry **only when facts changed** (name, mini description, registry coverage status, authority-native status, authority path, scope, boundaries, mandatory entry documents, validation commands, successor, Last updated).
4. Run `bash architecture/scripts/validate-module-registry.sh`.

## Mandatory registry review reporting

Every substantive workstream must report **one result per affected module**:

- `REGISTRY_REVIEWED: UPDATED` or `REGISTRY_REVIEWED: UNCHANGED`
- registry coverage status **before** and **after**
- specific **reason**

Cross-module changes require the same review result for **every owning authority touched** (for example central registry edits plus any neighbor module whose boundaries or contracts change).

## Substantive change definition

Substantive i18n changes include:

- Runtime lookup semantics (`LanguageContext`, `translateKey`, fallback, persistence)
- Locale contract (`locales.ts`, official locale set, BCP-47 metadata)
- Translation catalog structure or canonical key ownership
- Translation coverage baselines and regression guards
- Hardcoded-copy inventory, scanner classification, enforce-clean phases
- Governance classifier/parser, authority-path contract, PR gate policy, workflow parity
- i18n CI workflows (`i18n-governance-new-debt.yml`, `i18n-authority-protection.yml`)
- Registered module authority under `architecture/internationalization/`
- Central registry Internationalization row or detailed routing section
- SynqDrive Code discoverability entries for i18n architecture changes

**Not substantive (usually):** pure refactors with no behavioral claim, comment-only edits, unrelated neighbor-module work outside i18n boundaries, product translation string additions that do not change runtime/governance contracts.

## Ownership boundaries

| In scope | Out of scope |
|----------|--------------|
| `frontend/src/i18n/**` | General backend API localization framework |
| i18n scripts / `frontend/scripts/lib/i18n-governance/**` | Legal document authoritative text |
| i18n CI workflows and authority-path contract | Rental business logic (except `t()` usage patterns) |
| Translation coverage / hardcoded inventory | DIMO / trip / health calculation modules |
| Targeted backend DE/EN copy modules documented in authority | Per-surface business rules owned by Rental/Operator modules |

## Prohibited silent changes

Without updating authority artifacts (and registry when metadata changes):

- Reintroducing `frontend/src/rental/i18n/` bridge
- `...en` dictionary spread for false locale completeness
- Hardcoded user-visible strings in enforce-clean surfaces without inventory update
- Handwritten mirrors of workflow authority classifier diverging from `authority-path-contract.mjs`
- Weakening `pull_request_target` security in authority-protection workflow
- Collapsing registry coverage, epistemic, and decision/validation statuses into one field
- Recycling stable graph/decision/evidence/contradiction/gap IDs

## Evidence discipline

- **Code and verified runtime evidence** establish current behavior.
- **Documentation** preserves canonical memory; every substantive claim must stay synchronized with its evidence.
- **`UNKNOWN` remains `UNKNOWN`** until verified — do not infer Production UX or per-locale completeness without evidence.
- **Contradictions remain explicit** until evidence resolves them (see `contradictions/OPEN_CONTRADICTIONS.md`).
- Separate **source type** from **epistemic state** and **decision/validation status**.
- Tests, deployment success, and natural Production evidence are **different evidence classes** — do not conflate them.
- Use stable evidence IDs (`I18N-EVID-*`, `I18N-EV-PROD-*`); do not delete or rewrite historical evidence.

## Three-axis status separation

Never merge these axes:

1. **Registry coverage status** — `NOT_STARTED`, `AUDIT_IN_PROGRESS`, `AUTHORITY_ACTIVE`, `SUPERSEDED`
2. **Epistemic state** — `CONFIRMED`, `INFERRED`, `HISTORICAL`, `UNKNOWN`, `CONTRADICTED`
3. **Decision / validation status** — `PROPOSED`, `EXPERIMENTAL`, `VALIDATED`, `PRODUCTION_VALIDATED`, `REJECTED`, `SUPERSEDED`

`AUTHORITY_ACTIVE` means a structured, usable, maintained authority exists — **not** that implementation or locale migration is finished.

## Stable-ID discipline

Graph node IDs, decision IDs, evidence IDs, contradiction/gap IDs, and change-ledger IDs use the `I18N-*` prefix scheme defined in `graph/schema.yaml`. IDs are **stable and non-recycled**. Append new records; do not silently rewrite or delete historical IDs.

## Production safety

Production inspection is **read-only by default**. Unless the user gives **separate, task-specific authorization**, prohibit:

- deploy / `cloud-agent-deploy.sh`
- PM2 restart/reload/start/stop/delete
- migrations or schema changes
- DB writes, backfills, or DDL
- Redis writes, deletes, flushes, or queue mutation
- BullMQ enqueue/retry/remove/clean/drain
- flag/env modification on Production
- Production file edits
- invoking write endpoints or triggering provider side effects

Allowed: connectivity verification, bounded read-only SQL, file presence checks, health endpoints, sanitized log inspection.

## Repository vs Production baselines

`origin/main` is **not** automatically identical to deployed Production. Record and reconcile both independently in `CURRENT_STATE.md` and `evidence/PRODUCTION_BASELINE.md`. Drift must remain explicit until a new Production audit updates evidence.

## Contradiction and drift handling

Never silently overwrite conflicting evidence, contradictions, or drift claims. When code and documentation disagree, record the conflict and resolve with new evidence — do not delete the prior record.

## Cross-module work

When a change affects neighboring modules (Rental surfaces, Legal Documents, Operator/Master chrome, central registry, governance workflows), inspect and update **every owning authority** in the same PR when the change is substantive to that neighbor.

## Registry synchronization

For every affected module after substantive work:

1. Re-read overview row in central registry
2. Read detailed routing section when `AUTHORITY_ACTIVE`
3. Update registry only when listed metadata facts changed
4. Report `UPDATED` or `UNCHANGED` with before/after coverage status and reason

## Validation commands

```bash
bash architecture/internationalization/scripts/validate-graph.sh
bash architecture/scripts/validate-module-registry.sh
cd frontend && npm run i18n:check:ci
cd frontend && npm run i18n:pr-gate:test
bash .cursor/scripts/i18n-authority-protection-classifier.harness.sh
git diff --check
```

## Required final `ARCHITECTURE_GOVERNANCE` report

Substantive work must end with the completion block defined in [`.cursor/rules/Architectur-Updates.mdc`](../../.cursor/rules/Architectur-Updates.mdc), including:

- `substantive_change: YES|NO`
- affected modules (always include **Internationalization (i18n)** when touched)
- authority updates performed
- one `registry_review` object **per affected module** (before/after `AUDIT_IN_PROGRESS` or `AUTHORITY_ACTIVE` status + reason)
- `authority_validators` and `central_registry_validator` results
- SynqDrive Code → Changes / Architektur updates when architecture or signal flow changed
