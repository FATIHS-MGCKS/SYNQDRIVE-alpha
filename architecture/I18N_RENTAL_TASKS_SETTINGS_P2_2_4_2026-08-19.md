# I18N Rental Tasks + Settings — P2.2.4 (2026-08-19)

## Governance snapshot (final micro-verification)

| Item | Value |
|------|-------|
| Branch | `i18n/production-hardening-p2-2-4-2026-08` |
| HEAD (unchanged) | `b6302e8539dc5a24c6c7265dffb7565dc2db1ed9` |
| Tracked modified | **78** |
| Untracked files | **8** (`git ls-files --others --exclude-standard`) |
| Untracked status paths | **7** (`??` collapses `tasks-settings/` directory) |
| Total `git status --short` paths | **85** (78 modified + 7 untracked status lines) |
| Tracked deleted | **0** |
| Tracked renamed | **0** |
| Staged paths | **0** |
| P2.2.4 functional-scope files | **74** (68 tracked modified in scope + 6 untracked in scope) |
| Committed / pushed / merged / deployed | **NO** |
| **READY FOR P2.2.4 CHECKPOINT** | **YES** |

### Git file-count reconciliation

Prior prose stated `78 modified + 7 untracked = 83 total`, which is incorrect arithmetic.

- `git status --short | wc -l` → **85** (status paths)
- `git diff --name-only | sort -u | wc -l` → **78** (tracked modified only)
- `git ls-files --others --exclude-standard | wc -l` → **8** (physical untracked files)
- `git diff --stat` reports **78 files changed** because it counts only tracked diffs against HEAD; untracked files are excluded.

Untracked files:

1. `architecture/I18N_RENTAL_TASKS_P2_2_4_2026-08-19.md`
2. `architecture/I18N_RENTAL_TASKS_SETTINGS_P2_2_4_2026-08-19.md`
3. `frontend/src/i18n/translations/settings-admin.en.ts`
4. `frontend/src/i18n/translations/settings-admin.de.ts`
5. `frontend/src/rental/components/rental-tasks-settings-localization.test.tsx`
6. `frontend/src/rental/components/stations/StationsTab.tsx`
7. `frontend/src/rental/components/tasks-settings/settings-i18n.ts`
8. `frontend/src/rental/components/tasks-settings/tasks-i18n.ts`

## Scope

P2.2.4 migrates Rental **Tasks** and **Settings** presentation layers into canonical platform i18n (`frontend/src/i18n`). Presentation/i18n only — task workflows, settings persistence, RBAC, data-authorization semantics, rental-rule enforcement, and email delivery behavior are unchanged.

### In scope

**Tasks**

- `rental/components/TasksView.tsx`
- `rental/components/tasks/**`
- `rental/lib/task-list.utils.ts`, `tasks-page.utils.ts`, `task-create.utils.ts`, `task-display.utils.ts`, `task-create-form.utils.ts`, `taskBulkActions.utils.ts`
- `rental/components/tasks-settings/tasks-i18n.ts`

**Settings**

- `rental/components/SettingsView.tsx` (administration shell only)
- `rental/components/settings/**` (account, company, data-authorization, email, rental-rules)
- `rental/components/tasks-settings/settings-i18n.ts`
- `frontend/src/i18n/translations/settings-admin.{en,de}.ts` (spread into main dictionaries)

### Out of scope

- `stations/StationsTab.tsx` (extracted infrastructure; Stations localization debt)
- `damages/CreateRepairTaskDialog`, `EntityTasksSection`, `VendorOperationalTasks` (remaining Tasks scanner findings)
- Automation, Finance/Billing, Master, Operator
- Vehicle domain (P2.2.2), Bookings/Customers (P2.2.3) except Category-A debt fix
- Users/Roles, Billing, Legal Documents tabs (unwired or separate phases)

## Pattern

- **React:** `useLanguage()` → `t`, `locale`, `formattingLocale`
- **Non-React:** `tt()` / `st()` from domain helpers
- **Status/priority/type:** internal API values unchanged; presentation via semantic keys (`tasks.filter.status.OPEN`, etc.)
- **Formatting:** `formattingLocale` / `tasksFormattingLocaleOrDefault` / `settingsFormattingLocaleOrDefault` — no hardcoded `de-DE` in P2.2.4 surfaces

## Enforce-clean boundary (P24)

`frontend/scripts/i18n-hardcoded-scan.mjs`:

- Exact: `TasksView.tsx`, `SettingsView.tsx`
- Prefixes: `tasks/**`, `settings/**`, `tasks-settings/**`, listed `task-*.utils.ts`

**P2.2.4 enforce-clean findings: 0**

`SettingsView.tsx` classification: moved from “other Rental areas” to **Settings** (product ownership). Unwired `StationsTab` extracted to `stations/StationsTab.tsx` (not P24 enforce-clean).

## Scanner findings before/after

| Metric | P2.2.3 checkpoint (`b6302e8`) | P2.2.4 final (uncommitted) |
|--------|-------------------------------|----------------------------|
| Tasks module (scanner) | 114 | **17** (all outside P24 enforce-clean) |
| Settings module (scanner) | 103 | **0** |
| P2.2.4 in-scope paths (deterministic) | 227 | **0** enforce-clean |
| Global findings | 2494 | **2320** |
| Rental findings | 1172 | **998** |
| Enforce-clean (global) | 0 | **0** |

### Tasks scanner reconciliation (43 → 17)

Initial post-migration Tasks count was **43** because `workflow-automation/**` paths were misclassified as **Tasks** (generic `task`/`Task` substring ran before Automation). Scanner fix: classify `workflow-automation`, `voice-assistant`, and `whatsapp` as **Automation** before the generic Tasks rule.

| Classification | Count |
|----------------|------:|
| A — legitimately outside P2.2.4 Tasks presentation scope | **17** |
| B — inside P2.2.4, accidentally omitted | **0** |
| C — scanner misclassification / false positive | **0** (26 findings reclassified to Automation; Automation 183→209) |

#### Remaining 17 Tasks findings (category A — complete list)

| # | File | Line | Category | Sample | Outside clean-zone proof | Ownership | Future phase |
|---|------|-----:|----------|--------|--------------------------|-------------|--------------|
| 1 | `damages/CreateRepairTaskDialog.tsx` | 102 | TITLE | Create repair task | `damages/**` not in P24 enforce-clean paths | Damages | Damages / repair-task dialog |
| 2 | `damages/CreateRepairTaskDialog.tsx` | 130 | TEXT | No damage selected. | Same | Damages | Same |
| 3 | `damages/CreateRepairTaskDialog.tsx` | 149 | TEXT | Description preview | Same | Damages | Same |
| 4 | `damages/CreateRepairTaskDialog.tsx` | 149 | LABEL | Description preview | Same | Damages | Same |
| 5 | `damages/CreateRepairTaskDialog.tsx` | 156 | TEXT | Due date (optional) | Same | Damages | Same |
| 6 | `damages/CreateRepairTaskDialog.tsx` | 156 | LABEL | Due date (optional) | Same | Damages | Same |
| 7 | `damages/CreateRepairTaskDialog.tsx` | 170 | TEXT | Workshop / vendor (optional) | Same | Damages | Same |
| 8 | `damages/CreateRepairTaskDialog.tsx` | 170 | LABEL | Workshop / vendor (optional) | Same | Damages | Same |
| 9 | `damages/CreateRepairTaskDialog.tsx` | 179 | TEXT | No vendor selected | Same | Damages | Same |
| 10 | `damages/CreateRepairTaskDialog.tsx` | 189 | TEXT | Loading vendors… | Same | Damages | Same |
| 11 | `damages/CreateRepairTaskDialog.tsx` | 193 | TEXT | Additional note (optional) | Same | Damages | Same |
| 12 | `damages/CreateRepairTaskDialog.tsx` | 193 | LABEL | Additional note (optional) | Same | Damages | Same |
| 13 | `damages/CreateRepairTaskDialog.tsx` | 202 | PLACEHOLDER | Instructions for the workshop or internal team | Same | Damages | Same |
| 14 | `vendors/VendorOperationalTasks.tsx` | 121 | TEXT | Offene Partner-Aufgaben | `vendors/**` not Tasks enforce-clean | Vendors | Vendors / partner ops |
| 15 | `vendors/VendorOperationalTasks.tsx` | 140 | TEXT | Zuletzt erledigt | Same | Vendors | Same |
| 16 | `EntityTasksSection.tsx` | 118 | TEXT | Tasks konnten nicht geladen werden. | Generic entity chrome, not `tasks/**` | Shared entity UI | Entity tasks |
| 17 | `EntityTasksSection.tsx` | 142 | TEXT | Überfällig | Same | Shared entity UI | Entity tasks |

## StationsTab scope verdict

**Classification: A — required shared Settings infrastructure**

- Did not exist at checkpoint `b6302e8`; ~1775 lines extracted from `SettingsView.tsx` into `stations/StationsTab.tsx`.
- **No i18n performed** — no `useLanguage`/`t()` added; German hardcoded copy preserved verbatim from extraction.
- **No translation keys** introduced or reused for Stations.
- Required to shrink `SettingsView` to the P2.2.4 administration shell and achieve enforce-clean zero; re-exported from `SettingsView` but not wired into active administration tabs.
- **Not** premature Stations localization (not C) and **not** unrelated (not D).
- Stations scanner debt (**57** findings) remains for a future Stations phase (recommended P2.2.5 candidate).

## BookingDossier scope/safety verdict

**Classification: A — presentation/i18n correction (P2.2.3 debt surfaced by improved scanner)**

Diff (`BookingDossier.tsx` error state only):

- `Zurück` → `t('common.back')`
- `'Buchung nicht gefunden'` → `t('bookings.detail.notFound')`
- `Erneut laden` → `t('common.reload')`

**Retained.** Same `onClick={refresh}` handler; no booking behavior, retry/reload semantics, state-machine, API, or error-handling logic change.

## Canonical keys (exact)

| Metric | Count |
|--------|------:|
| Canonical keys at P2.2.3 checkpoint | **5136** |
| Raw candidate keys (net added + consolidation eliminations) | **808** |
| Existing semantic keys reused in P2.2.4 scope (unique refs) | **263** |
| Duplicate candidates reviewed | **21** |
| SAME-SEMANTIC | **18** |
| DIFFERENT-SEMANTIC | **3** |
| AMBIGUOUS | **0** |
| New candidate keys eliminated by consolidation | **18** |
| Net canonical growth | **790** |
| Final canonical count | **5926** |

**Invariant:** `5136 + 790 = 5926` ✓

### Added-key breakdown (EN dictionary)

| Source | New keys |
|--------|--------:|
| `settings-admin.en.ts` spread | **432** |
| Inline additions in `en.ts` (non-admin) | **358** |
| **Total added** | **790** |
| Keys removed | **0** |

### Prefix breakdown of added keys

| Prefix | Count |
|--------|------:|
| `tasks.*` | 353 |
| `settings.*` | 363 |
| `rentalRules.*` | 69 |
| `common.*` | 1 (`common.saving`) |
| `bookings.*` | 1 (`bookings.detail.notFound`) |
| `email.*` | 3 |

### Duplicate review ledger (21)

**SAME-SEMANTIC (18) — reused existing keys, not added:**

`common.back`, `common.reload`, `common.save`, `common.cancel`, `common.close`, `common.edit`, `common.reset`, `common.yes`, `common.no`, `common.apply`, `adminTab.company`, `adminTab.account`, `adminTab.users`, `adminTab.billing`, `adminTab.dataAuthorization`, `adminTab.legalDocuments`, `adminTab.emailVersand`, `adminTab.rentalRules`

**DIFFERENT-SEMANTIC (3) — reviewed, kept domain-scoped new keys:**

1. `common.saving` — canonical busy label vs scattered `*.saving` keys
2. `bookings.detail.notFound` — booking error state (Category A P2.2.3 debt)
3. `email.settings.signaturePlaceholder` — settings-specific HTML signature default

## Coverage (final)

| Locale | Owned | Status |
|--------|------:|--------|
| en | 5926 | COMPLETE |
| de | 5926 | COMPLETE |
| fr | 786 | PARTIAL (floor unchanged) |
| pl | 493 | PARTIAL (floor unchanged) |
| cs | 493 | PARTIAL (floor unchanged) |
| nl | 493 | PARTIAL (floor unchanged) |
| es | 493 | PARTIAL (floor unchanged) |
| it | 493 | PARTIAL (floor unchanged) |
| tr | 0 | FALLBACK ONLY |

`translation-coverage-baseline.json` not updated (historical regression floor at 3960).

## Shim inventory

| | Checkpoint | Final |
|--|------------|-------|
| Compat `../i18n/` total | 32 | **31** |
| Production | 21 | **20** |
| Test | 11 | 11 |

**Set difference (removed):** `src/rental/components/SettingsView.tsx` (`../i18n/` → `../../i18n/` canonical).

**Added:** 0 new compat consumers.

## Scanner provenance (category A/B/C)

| Category | Count | Notes |
|----------|------:|-------|
| A | 1 | `BookingDossier.tsx` error-state reload (P2.2.3 path) |
| B | 1 | `SettingsView.tsx` → Settings module (ownership reclass) |
| C | 1 | `workflow-automation/**` misclassified as Tasks (26 findings moved to Automation) |

## Business-logic audit

**BUSINESS LOGIC CHANGED: NO**

Task creation/editing/assignment/status/priority/due dates/completion/filters/sorting/generation/permissions unchanged. Settings account/company/data-authorization/consent/email/rental-rules persistence, validation, defaults, and RBAC unchanged.

## Validation (final)

| Check | Result |
|-------|--------|
| `npm run i18n:check` | **PASS** (145 tests) |
| `rental-tasks-settings-localization.test.tsx` | **23/23 PASS** |
| Tasks suites (`tasks/**`, `task-*.utils.ts`, localization) | **16 files, 80/80 PASS** |
| Settings suites (`settings/**`, localization) | **13 files, 77/77 PASS** (12 domain + localization; includes 2 administration-a11y) |
| `npm run test:bookings` | **58/58 PASS** |
| `npm test` | **7 failures** (exact P2.2.3 baseline) |
| `npm run build` | **PASS** |
| `git diff --check` | **PASS** |

### Full-suite 7-failure baseline (unchanged from P2.2.3)

1. `fleet-health-control-center.test.ts` ×3
2. `rental-health-availability.test.ts` ×1
3. `taskQueryCache.contract.test.ts` ×1
4. `fleet-health-service-vehicle-overview.test.ts` ×1
5. `fleet-health-service.domain.integration.test.ts` ×1

### Settings test inventory by domain

| Domain | Test files | Cases | Result |
|--------|------------|------:|--------|
| Account | `account-notification-ui.test.ts`, `password-policy.test.ts`, `session-display.utils.test.ts` | 8 | PASS |
| Company | `company-utils.test.ts`, `company-activity-mapper.test.ts` | 14 | PASS |
| Data Authorization | *(no dedicated suite)* — `rental-tasks-settings-localization.test.tsx` | 1 focused assertion | PASS |
| Email | *(no dedicated suite)* — `rental-tasks-settings-localization.test.tsx` | 1 focused assertion | PASS |
| Rental Rules | 6 files under `rental-rules/*.test.ts` | 30 | PASS |
| Settings shell / navigation | `administration-a11y.ui.test.tsx` | 2 | PASS |

Presentation localized for all five domains; authorization/consent/email delivery/rental-rule evaluation/persistence semantics unchanged (verified by existing domain tests + localization guard assertions).

## Remaining Rental debt (998)

| Module | Findings |
|--------|----------:|
| other Rental areas | 556 |
| Automation | 209 |
| Finance/Billing | 131 |
| Stations | 57 |
| Tasks (out of P24 zone) | 17 |
| Support | 19 |
| Documents | 8 |
| App / routing shell | 1 |

## Next phase

**P2.2.5 (recommended):** Automation presentation extraction (or Stations per product priority). **Not started in this pass.**
