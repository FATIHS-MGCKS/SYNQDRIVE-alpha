# Current State — Internationalization (i18n)

**Last verified:** 2026-09-10 (repository audit + read-only Production SSH; main sync + promotion pass)
**Registry coverage status:** `AUTHORITY_ACTIVE`

## Executive summary

SynqDrive i18n is a **frontend-centric platform runtime** with heavy **governance automation**. The canonical runtime is `LanguageProvider` + `translateKey()` in `frontend/src/i18n/LanguageContext.tsx`, mounted at SPA root in `frontend/src/App.tsx`. Nine official product locales exist; **English (`en`) is the canonical key source and default/fallback locale**. German (`de`) is the only other **complete** dictionary locale.

**Integration 2C (Rental bridge retirement)** is **complete in repository**: `frontend/src/rental/i18n/` removed; Rental imports `../../i18n/LanguageContext` directly.

**Hardcoded UI copy elimination** is **in progress**: read-only scan @ synchronized `origin/main` reports **3,088** unique findings, **1,658** in phased enforce-clean surfaces (P21–P23). Historical inventory snapshot (2026-09-07) remains **3,091** / **1,661** — see snapshot vs current reconciliation below.

**Governance** (P2.3.x, #1581/#1585/#1589) is **implemented on `origin/main`**: PR new-debt gate, authority protection workflow, authority-path contract parity, structural parser for trusted workflow classifier.

## Repository baseline

| Field | Value |
|-------|-------|
| Branch | `origin/main` @ `83546cc37f9f05f9a170223f2ef114c6cac3b9f5` (post-sync baseline) |
| Canonical keys | 10,431 (`frontend/src/i18n/translations/en.ts`) |
| Locale coverage (owned keys) | `en` 10,431 · `de` 10,431 · `fr` 1,038 · `pl` 745 · `cs` 727 · `nl` 745 · `es` 745 · `it` 745 · `tr` 0 (fallback-only) |
| Hardcoded scan (read-only, current) | 3,088 total · 1,658 enforce-clean · surfaces: SHELL 41 · SHARED 36 · MASTER 1,071 · OPERATOR 179 · RENTAL 1,761 |
| Hardcoded inventory snapshot | 3,091 total · 1,661 enforce-clean · dated 2026-09-07 (`hardcoded-copy-inventory.json`) |
| Locale files | ~125 TypeScript modules under `frontend/src/i18n/translations/` |
| Tests | 12 vitest files under `frontend/src/i18n/` + governance scripts |

## Production baseline

| Field | Value |
|-------|-------|
| Release path | `/opt/synqdrive/releases/20260909220606_v4994` |
| Deployed SHA | `2e82171d11862a80c2e8cd62c65023393ef0ce64` |
| Health | `GET https://app.synqdrive.eu/api/v1/health` → 200 |
| i18n runtime files | Present (`LanguageContext.tsx`, `translation-registry.ts`) |
| Authority workflow file | Present (`i18n-authority-protection.yml`) |

**Drift:** Production is **behind** `origin/main`. Governance parity work merged after deployed SHA.

## Architecture evolution (evidence-backed)

### Old architecture (HISTORICAL)

- Rental maintained a **compat bridge** at `frontend/src/rental/i18n/` with re-exports from platform i18n.
- Runtime locale set was narrower (`RUNTIME_TRANSLATION_LOCALE_CODES` — 8 locales without `tr`).
- Hardcoded German/English UI copy widespread across Rental/Master/Operator.
- No P2.3 PR-gate or authority-path contract parity.

### Current architecture (CONFIRMED)

```
Browser localStorage (synqdrive.locale)
        ↓
resolveInitialPlatformLocale() — locales.ts
        ↓
LanguageProvider — LanguageContext.tsx
        ↓
translateKey(locale, key) → locale dict → en fallback → missing-key passthrough
        ↓
useLanguage() in Rental / Operator / Master / Login components
```

**Dictionary composition:**

- `en.ts` — canonical complete dictionary (10,431 keys)
- `de.ts` — complete
- `fr`, `pl`, `cs`, `nl`, `es`, `it` — **partial** (English fallback at lookup)
- `tr.ts` — **empty** (fallback-only official locale)
- `rental-legacy-gap.{locale}.ts` — migrated Rental-only keys (not a runtime bridge)

### Migration completion by workstream

| Workstream | Status | Evidence |
|------------|--------|----------|
| P0 Production hardening | COMPLETE (repo) | `audit-campaign/architecture/I18N_PRODUCTION_HARDENING_P0_2026-08-18.md` |
| P1 Canonical runtime | COMPLETE (repo) | `audit-campaign/architecture/I18N_CANONICAL_RUNTIME_P1_2026-08-18.md`, `LanguageContext.tsx` |
| Integration 1 — platform infrastructure | COMPLETE | `docs/audits/i18n-integration-1b1-governance-authority-2026-09-08.md` |
| Integration 2A — runtime provider | COMPLETE | `docs/audits/i18n-integration-2a-runtime-provider-2026-09-08.md` |
| Integration 2B — language surfaces | COMPLETE | `docs/audits/i18n-integration-2b-language-surfaces-2026-09-08.md` |
| Integration 2C — Rental bridge retirement | COMPLETE | `docs/audits/i18n-integration-2c-rental-bridge-retirement-2026-09-08.md`, structural tests |
| P2.2 Rental surface key migration (campaign) | SUBSTANTIAL | ~60+ slice docs under `audit-campaign/`; enforce-clean phases still show Rental debt |
| P2.1 Hardcoded-copy inventory | COMPLETE (inventory) | `frontend/src/i18n/hardcoded-copy-inventory.json` v3 |
| P2.3 Governance (scanner, PR gate, authority) | COMPLETE (main) | #1581, #1585, #1589 |
| Partial locale dictionaries | IN_PROGRESS | coverage registry |
| Hardcoded-copy cleanup (enforce-clean) | IN_PROGRESS | 1,658 current scan; 1,661 snapshot (2026-09-07) |
| Turkish owned dictionary | NOT_STARTED | `tr.ts` empty |
| Master surface migration | IN_PROGRESS | 1,071 MASTER findings in inventory |

**No single defensible percentage** is reported — denominators differ per workstream (keys vs files vs enforce-clean surfaces).

## Runtime semantics (CONFIRMED)

| Topic | Behavior |
|-------|----------|
| Default locale | `en` |
| Fallback locale | `en` |
| Persistence | `localStorage` key `synqdrive.locale` |
| Initial resolution | persisted → `navigator.languages` → `en` |
| Missing key | Returns key string; dev warning |
| Interpolation | `{varName}` replacement |
| Pluralization | No dedicated ICU/plural rules engine in platform runtime (CONFIRMED by code inspection) |
| `document.lang` | Set from locale BCP-47 metadata |

## Governance (CONFIRMED on main)

| Layer | Mechanism |
|-------|-----------|
| Layer 0 | `.github/workflows/i18n-authority-protection.yml` — `pull_request_target`, no checkout, label + trusted actor |
| Layer 1–2 | `.github/workflows/i18n-governance-new-debt.yml` — scanner tests, `i18n:check:ci`, `i18n:pr-gate` |
| Authority path SSOT | `frontend/scripts/lib/i18n-governance/authority-path-contract.mjs` |
| Workflow classifier parser | `workflow-authority-classifier.mjs` (structural, fail-closed) |
| PR changed paths | `pr-changed-paths.mjs` — `base.sha...head.sha` |

## Backend involvement (CONFIRMED, limited)

- `backend/src/modules/billing/email/billing-email-i18n.ts` — DE/EN email strings
- `backend/src/synq/evaluations-metrics/evaluations-metric.i18n.ts` — DE/EN metric labels
- Notifications store **i18n key references**, not rendered sentences

## Confirmed invariants

1. Single `LanguageProvider` at SPA root — no nested Rental provider.
2. `OFFICIAL_PRODUCT_LOCALE_CODES` length === 9.
3. `en` and `de` dictionaries are complete vs canonical key set.
4. `...en` spread inheritance forbidden (structural test).
5. Governance authority paths fail closed on drift (main).

## Hardcoded-copy snapshot vs current scan reconciliation

| Source | Date | Total | Enforce-clean | Notes |
|--------|------|-------|---------------|-------|
| **A) Historical snapshot** | 2026-09-07 | 3,091 | 1,661 | `frontend/src/i18n/hardcoded-copy-inventory.json` — not mutated in this PR |
| **B) Current read-only scan** | 2026-09-10 | 3,088 | 1,658 | `node scripts/i18n-hardcoded-scan.mjs --read-only` @ synchronized main |

**Delta (−3 total, −3 enforce-clean):** repository code drift since snapshot generation (main advanced; minor surface reclassification). Snapshot includes `LOGIN: 2` in `bySurface`; current scan surfaces are SHELL 41 · SHARED 36 · MASTER 1,071 · OPERATOR 179 · RENTAL 1,761.

**Canonical CURRENT_STATE uses (B).** Snapshot (A) remains historical evidence only.

## Open gaps

See [contradictions/KNOWLEDGE_GAPS.md](./contradictions/KNOWLEDGE_GAPS.md) and [research/OPEN_QUESTIONS.md](./research/OPEN_QUESTIONS.md).

## Next implementation workstreams

See [research/CHANGE_LEDGER.md](./research/CHANGE_LEDGER.md) § Remaining workstreams.
