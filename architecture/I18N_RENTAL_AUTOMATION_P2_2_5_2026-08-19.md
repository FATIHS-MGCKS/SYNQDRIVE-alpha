# I18N Rental Workflow Automation — P2.2.5 (2026-08-19)

## Governance snapshot (final micro-verification)

| Item | Value |
|------|-------|
| Branch | `i18n/production-hardening-p2-2-5-2026-08` |
| HEAD (unchanged) | `01ce0fb9` |
| Tracked modified | **23** |
| Untracked files | **4** |
| Total `git status --short` paths | **27** (23 modified + 4 untracked) |
| Committed / pushed / merged / deployed | **NO** |
| **READY FOR P2.2.5 CHECKPOINT** | **YES** |

### Untracked files

1. `architecture/I18N_RENTAL_AUTOMATION_P2_2_5_2026-08-19.md`
2. `frontend/src/i18n/translations/automation-workflow.en.ts`
3. `frontend/src/i18n/translations/automation-workflow.de.ts`
4. `frontend/src/rental/components/rental-automation-localization.test.tsx`
5. `frontend/src/rental/components/workflow-automation/automation-i18n.ts`

(4 untracked in `git ls-files`; architecture doc is also untracked when written.)

## Scope

P2.2.5 migrates Rental **Workflow Automation** (legacy builder shell + runtime drawers) and **Task Automation** presentation into canonical platform i18n (`frontend/src/i18n`). Presentation/i18n only — workflow definitions, trigger/action semantics, task automation API enums, RBAC, and runtime execution behavior are unchanged.

### In scope

- `rental/components/WorkflowAutomationView.tsx`
- `rental/components/workflow-automation/**`
- `rental/components/workflow-automation/automation-i18n.ts`
- `frontend/src/i18n/translations/automation-workflow.{en,de}.ts` (spread into main dictionaries)

### Out of scope

- `voice-assistant/**`, `whatsapp/**` (separate Automation sub-modules)
- Tasks global page, Settings, Bookings, Customers, Vehicles/Health (prior phases)
- Finance/Billing, Stations, Support, Documents

## Pattern

- **React:** `useLanguage()` → `t`, `locale`, `formattingLocale`
- **Non-React:** `at()` / label helpers from `automation-i18n.ts`
- **Task priority:** reuse `tasks.filter.priority.*` (SAME-SEMANTIC)
- **Workflow runtime:** existing `workflowAutomation.*` keys preserved; new `workflowAutomation.legacy.*` for legacy builder constants
- **Formatting:** `automationFormattingLocaleOrDefault` — no hardcoded `de-DE` in P2.2.5 surfaces
- **Imports:** workflow-automation files use `../../../i18n/`; `WorkflowAutomationView` migrated `../i18n/` shim → `../../i18n/` canonical

## Enforce-clean boundary (P25)

`frontend/scripts/i18n-hardcoded-scan.mjs`:

- Exact: `WorkflowAutomationView.tsx`
- Prefix: `workflow-automation/**`
- Module label: **Workflow Automation** (split from generic Tasks/Automation misclassification)

**P2.2.5 enforce-clean findings: 0** (baseline **108**)

## Scanner findings before/after

| Metric | P2.2.4 checkpoint (`5926` keys) | P2.2.5 final (uncommitted) |
|--------|--------------------------------|----------------------------|
| P2.2.5 in-scope enforce-clean | **108** | **0** |
| Workflow Automation module (scanner) | **108** (in enforce-clean zone) | **0** |
| Global findings | **2320** | **2212** |
| Rental findings | **998** | **890** |
| Enforce-clean (global) | **0** | **0** |

### Rental module breakdown (final)

| Module | Findings |
|--------|----------:|
| other Rental areas | 474 |
| Finance/Billing | 131 |
| WhatsApp | 72 |
| Voice Assistant | 111 |
| Stations | 57 |
| Tasks (out of P24 zone) | 17 |
| Support | 19 |
| Documents | 8 |
| App / routing shell | 1 |
| Workflow Automation | **0** |

## Canonical keys (exact)

| Metric | Count |
|--------|------:|
| Canonical keys at P2.2.4 checkpoint | **5926** |
| Net canonical growth (`automation-workflow` spread) | **339** |
| Final canonical count | **6265** |

**Invariant:** `5926 + 339 = 6265` ✓

### Added-key breakdown

| Source | New keys |
|--------|--------:|
| `automation-workflow.en.ts` spread | **339** |
| Keys removed | **0** |

Prefixes in `automation-workflow.en.ts`:

- `taskAutomation.*` — task automation tab, drawer, simulation (~60+ keys)
- `workflowAutomation.legacy.*` — legacy builder categories, triggers, actions, conditions, templates, detail/builder UI

### SAME-SEMANTIC reuse (not added)

`common.back`, `common.save`, `common.cancel`, `common.close`, `common.reload`, `common.saving`, `tasks.filter.priority.*`, existing `workflowAutomation.*` runtime keys (226 keys retained).

## Coverage (final)

| Locale | Owned | Status |
|--------|------:|--------|
| en | 6265 | COMPLETE |
| de | 6265 | COMPLETE |
| fr | 786 | PARTIAL (floor unchanged) |
| pl | 493 | PARTIAL (floor unchanged) |

## Shim inventory

| | P2.2.4 final | P2.2.5 final |
|--|------------|--------------|
| Rental compat `../i18n/` total | **31** | **30** |
| Production | **20** | **19** |
| Test | **11** | **11** |

**Set difference (removed):** `WorkflowAutomationView.tsx` (`../i18n/` → `../../i18n/` canonical).

**Added:** 0 new compat consumers.

Workflow-automation subtree: all imports canonical `../../../i18n/` (no shim).

## Business-logic audit

**BUSINESS LOGIC CHANGED: NO**

Workflow trigger/action/condition configuration, task automation rule overrides, simulation dry-run, runtime execution history, and API error handling semantics unchanged. Internal API enum values (`HIGH`, `CRITICAL`, assignment strategies, offsets) unchanged — presentation only.

## Validation (final)

| Check | Result |
|-------|--------|
| `npm run i18n:check` | **PASS** |
| `hardcoded-copy-guard.test.ts` | **7/7 PASS** |
| `rental-automation-localization.test.tsx` | **10/10 PASS** |
| `task-automation.utils.test.ts` | **6/6 PASS** |
| `workflow-config.test.ts` | **11/11 PASS** |
| `workflow-runtime.test.ts` | **6/6 PASS** |
| Targeted automation suites | **4 files, 33/33 PASS** |
| `npm run build` | **PASS** |

## Files changed (functional scope)

### New

- `frontend/src/rental/components/workflow-automation/automation-i18n.ts`
- `frontend/src/i18n/translations/automation-workflow.en.ts`
- `frontend/src/i18n/translations/automation-workflow.de.ts`
- `frontend/src/rental/components/rental-automation-localization.test.tsx`
- `architecture/I18N_RENTAL_AUTOMATION_P2_2_5_2026-08-19.md`

### Modified

- `frontend/scripts/i18n-hardcoded-scan.mjs` (P25 enforce-clean + Workflow Automation module)
- `frontend/src/i18n/hardcoded-copy-guard.test.ts` (P25 guard)
- `frontend/src/i18n/hardcoded-copy-inventory.json` (refreshed)
- `frontend/src/i18n/translations/en.ts`, `de.ts` (spread automation-workflow)
- `frontend/src/rental/components/WorkflowAutomationView.tsx`
- `frontend/src/rental/components/workflow-automation/*` (task automation + workflow runtime UI, utils, hooks, tests)

### Master UI (architecture changelog)

- `frontend/src/master/components/ChangesView.tsx`
- `frontend/src/master/components/ArchitekturView.tsx`

## Remaining Rental debt (890)

Voice Assistant (111), WhatsApp (72), Finance/Billing (131), Stations (57), other Rental areas (474) — future phases P2.2.6+.
