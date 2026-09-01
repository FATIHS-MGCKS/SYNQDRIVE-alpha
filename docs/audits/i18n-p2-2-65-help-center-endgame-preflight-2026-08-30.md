# P2.2.65 — Help Center Shell Chrome Endgame Pre-Flight

**Date:** 2026-08-30  
**Mode:** STRICT READ-ONLY ENDGAME PRE-FLIGHT  
**Campaign:** RENTAL  
**Authoritative campaign baseline:** `abcc38958fe7d1431f60bd8c174b3f3726955cd3` (merged PR #1434, P2.2.64)  
**P264 implementation HEAD:** `7a10f868b18abae5109e04606b66e0bab370881f`  
**P264 final audit:** PR #1436 — **B — CERTIFIED WITH NON-BLOCKING OBSERVATIONS — READY TO MERGE**

---

## PART A — P264 freeze

| Check | Result |
|-------|--------|
| PR #1434 merged | **true** (`mergedAt` 2026-08-30T10:28:43Z) |
| PR #1434 closed | **true** |
| Implementation HEAD | `7a10f868b18abae5109e04606b66e0bab370881f` |
| Merge commit | `abcc38958fe7d1431f60bd8c174b3f3726955cd3` |
| PR #1436 verdict | **B — CERTIFIED WITH NON-BLOCKING OBSERVATIONS — READY TO MERGE** |
| P216–P264 | **FROZEN** |
| Data Analyse | **DEFERRED — PLANNED REMOVAL** |
| Dead IAM CRUD | **DEFERRED — PRODUCT WIRING REQUIRED** |

Post-P264 certified metrics (recomputed on `abcc38958`):

| Metric | Value |
|--------|------:|
| EN keys | 9706 |
| DE keys | 9706 |
| Parity | 100% |
| Orphans | 0 |
| Global scanner | 1254 |
| Rental scanner | 157 |
| Finance/Billing | 25 |
| True active actionable Rental debt | **13** |
| P264 active mounted debt | **0** |

---

## PART B — Baseline / main drift

**Current `origin/main`:** `2ceb3fa45` (P1.4 reconciliation mutex #1435)

**Baseline strategy:** **DIRECT FROM P264 CAMPAIGN BASELINE** (`abcc38958`)

Rationale: Help Center production paths unchanged semantically vs `main`; drift is CSS/token class harmonization only (~28 lines in `HelpCenterView.tsx`, no copy changes). `App.tsx` has unrelated DIMO/scheduler routing drift on `main` — irrelevant to P265.

| Path | Drift vs `main` | Classification |
|------|-----------------|----------------|
| `rental/components/HelpCenterView.tsx` | ~28 lines CSS classes | **LOW** |
| `rental/App.tsx` | +154 lines (DIMO/scheduler) | **NONE** for P265 (not in scope) |

**Collision (#1429, #1435, newer):** **NONE** on Help Center frontend paths.

---

## PART C — Remaining 13 active actionable findings (complete)

| # | Path | Line | Literal (sample) | Mounted route | Visible | Surface | Shared? | Machine/raw? | P265? | Later? |
|---|------|-----:|------------------|---------------|---------|---------|---------|--------------|-------|--------|
| 1 | `HelpCenterView.tsx` | 809 | Help Center | `help-center` | Yes | Help Center header | No | Host chrome | **Yes** | — |
| 2 | `HelpCenterView.tsx` | 827 | Problem nicht gelöst? Support-Ticket erstellen | `help-center` | Yes | Support CTA | No | Host chrome | **Yes** | — |
| 3 | `HelpCenterView.tsx` | 838 | Nach Themen, Funktionen oder Fragen suchen... | `help-center` | Yes | Search placeholder | No | Host chrome | **Yes** | — |
| 4 | `HelpCenterView.tsx` | 904 | Demnächst | `help-center` | Yes (comingSoon sections) | Section badge | No | Host chrome | **Yes** | — |
| 5 | `HelpCenterView.tsx` | 951 | Noch Fragen? | `help-center` | Yes | Footer | No | Host chrome | **Yes** | — |
| 6 | `HelpCenterView.tsx` | 953 | Wenn Sie hier keine Antwort finden… | `help-center` | Yes | Footer | No | Host chrome | **Yes** | — |
| 7 | `OrganizationSwitcher.tsx` | 59 | Switch organization | TopBar multi-org | Yes | Org switch | No | ARIA chrome | No | P266 candidate |
| 8 | `OrganizationSwitcher.tsx` | 61 | Active organization | TopBar multi-org | Yes | Org switch | No | Host label | No | P266 candidate |
| 9 | `AIAssistantView.tsx` | 363 | Clear conversation | `ai-assistant` | Yes | AI chrome | No | Host chrome | No | P266 candidate |
| 10 | `HomeAwayBadge.tsx` | 135 | Geofence: … | Fleet tiles | Yes | Geofence badge | Yes (fleet) | ARIA template | No | P266 candidate |
| 11 | `rental-requirements-ui.tsx` | 146 | Rule source: … | Settings/booking rules | Yes | Requirements shared | **Yes** | Host title | No | P266/P267 |
| 12 | `rental-requirements-ui.tsx` | 471 | Loading effective rules | Settings/booking rules | Yes | Requirements shared | **Yes** | ARIA | No | P266/P267 |
| 13 | `App.tsx` | 1291 | Rental view crashed | Error boundary | On crash | App shell | No | Host error | No | P266 candidate |

**Help Center scanner findings: 6 / 13**  
**Non-Help-Center active: 7 / 13**

---

## PART D — Help Center topology

**Route:** `currentView === 'help-center'` in `rental/App.tsx`  
**Sidebar:** `nav.helpCenter` → `handleViewChange('help-center')`  
**Support bridge:** `onOpenSupport` → `sessionStorage` flag + navigate to `support` view

```
help-center (App.tsx)
└── HelpCenterView.tsx
    ├── Header (title, stats, intro, support CTA)
    ├── Search (input, results count, no-results)
    ├── Quick navigation (section chips)
    ├── Sections accordion (SECTIONS const)
    │   ├── Section header (title, comingSoon badge, article count, description)
    │   └── Article list
    │       ├── Article row (title)
    │       └── Article body (ArticleContent markdown-lite renderer)
    └── Footer (support prompt)
```

**Active components:** `HelpCenterView.tsx` only (single-file mount).  
**Dead/legacy help components:** None found. Support is separate (`SupportView`, P229 certified).

---

## PART E — Shell vs content ownership

**Model: E — MIXED**

| Layer | Source | Ownership | P265 scope |
|-------|--------|-----------|------------|
| Shell chrome (header, search, nav labels, footer, badges) | Inline JSX | Host-owned static | **P265 target** |
| `SECTIONS` corpus (17 sections, 61 articles) | Inline `const SECTIONS` | Host-owned static German copy | **Out of P265 shell** — separate content slice |
| Search index | Client filter over `SECTIONS` | Derived from static content | Preserve machine/query semantics |
| Support CTA | Navigation callback | Presentation + route change | Shell only |
| External URLs | None in Help Center | — | — |

**Raw/CMS:** No backend/CMS article API. All article title/body is host static strings in `SECTIONS` (~1010 lines). Not provider/user content.

**Scanner blind spot:** `SECTIONS` object literals are not flagged by current scanner JSX patterns — only 6 JSX chrome strings appear in inventory. Hidden content debt is **large** (~120+ keys if fully localized).

---

## PART F — Machines / raw / actions / state

### Category machines (section IDs — identity, do not translate)

`getting-started`, `dashboard`, `bookings`, `fleet`, `customers`, `stations`, `tasks`, `documents`, `damages`, `health`, `invoices`, `fines`, `data-analyse`, `ai-assistant`, `settings`, `faq` (+ article slugs like `welcome`, `first-steps`, etc.)

### Search semantics

- Query: raw user `searchTerm` state
- Matching: client-side `toLowerCase().includes(q)` on title/content/description
- Locale switch must preserve `searchTerm`, `expandedSection`, `expandedArticle`
- **Risk if shell-only P265:** EN shell with DE article corpus — acceptable interim; full EN search requires content slice

### Mutations

**MUTATION SURFACE = NONE** in Help Center. `onOpenSupport` is navigation only (no API). Support ticket creation happens in `SupportView` (frozen P229).

### Locale-aware content API

**NOT LOCALE-AWARE** — no fetch; static `SECTIONS` only.

### Locale-refetch expectation (future P265)

All business refetch deltas = **0** (no API). Category E feasible.

### Same-mount state inventory

`searchTerm`, `expandedSection`, `expandedArticle` — all preserve across DE→EN→DE.

### React identity

Stable: `key={sec.id}`, `key={section.id}`, `key={article.id}` — **no locale/t key risks**.

---

## PART G — Reuse / key budget / split

### Canonical reuse candidates

| Copy | Reuse |
|------|-------|
| Sidebar label | `nav.helpCenter` (exact for title) |
| Support CTA tone | `support.center.createTicketButton` (partial semantic overlap) |
| Search patterns | `support.center.searchTicketsPlaceholder` (different domain — not exact) |

**Verdict:** Mostly **NEW REQUIRED** `helpCenter.*` namespace for shell chrome.

### Projected P265 keys (shell chrome only)

| Chrome element | Est. keys |
|----------------|----------:|
| Title (or reuse `nav.helpCenter`) | 0–1 |
| Stats line template | 1 |
| Intro paragraph | 1 |
| Support CTA | 1 |
| Search placeholder | 1 |
| Search no-results / results count | 2 |
| Quick nav title | 1 |
| Coming soon badge (Demnächst/Soon) | 1 |
| Article count singular/plural | 2 |
| Footer title + body | 2 |
| Hidden chrome not in scanner (Schnellnavigation, etc.) | 2–4 |

**Projected net new: 18–28** (medium band, acceptable)

### Full content localization (if attempted in same slice)

17 section titles + descriptions + 61 article titles + 61 bodies ≈ **140–200+ keys** → **must split**.

### Split decision

**SPLIT — SHELL CHROME ONLY**

Options evaluated:
- A HELP CENTER COMPLETE — rejected (content explosion)
- B SHELL CHROME ONLY — **selected**
- E STATIC FAQ CONTENT SEPARATE — deferred to P266+ content architecture slice
- G CONTENT LOCALIZATION ARCHITECTURE — not required yet (static const, not CMS)

---

## PART H — Same-mount / refetch

| Check | Future P265 expectation |
|-------|------------------------|
| Persistent root | `HelpCenterView` under `LanguageProvider` |
| DE→EN→DE | Preserve search, expanded section/article |
| Business refetch | 0 (no API) |
| Search query | Preserved raw |
| Article/section IDs | Preserved |

**Same-mount feasibility:** **HIGH** — single component, local state only.

---

## PART I — Endgame forecast

### Help Center priority verdict

Help Center has **6/13 (46%)** of remaining actionable scanner debt — highest single-surface count. Correct P265 target **if split to shell chrome only**.

### Remaining active target ranking (post-P264)

| Rank | Surface | Scanner | Hidden est. | Keys est. | Mutation | Visibility | Recommendation |
|------|---------|--------:|------------:|----------:|----------|------------|----------------|
| 1 | Help Center shell | 6 | ~10 chrome | 18–28 | None | High | **P265** |
| 2 | Help Center content (`SECTIONS`) | 0 | ~120+ | 140–200+ | None | High | **P266+ separate slice** |
| 3 | Org switcher | 2 | 0 | 3–5 | Low | Medium | P266 |
| 4 | Requirements shared UI | 2 | ~40 | 35–50 | Low | Medium | P266/P267 |
| 5 | App crash boundary | 1 | 1 | 2–3 | None | Low | P266 |
| 6 | AI Assistant chrome | 1 | ~5 | 6–10 | Medium | Medium | P266 |
| 7 | HomeAwayBadge | 1 | 2 | 3–4 | None | Medium | P266 |

### Expected debt after P265 (shell only)

| Metric | Before | After P265 shell |
|--------|-------:|-----------------:|
| True active actionable | 13 | **7** |
| Help Center scanner | 6 | **0** |
| Help Center hidden content | ~120+ keys | **unchanged** (out of shell scope) |

**Campaign complete after P265?** **NO**

### Likely P266

**Help Center Static Content Localization** (SECTIONS corpus) OR small-chrome sweep (Org switcher + App crash) — recommend **content slice** if campaign goal is Help Center completeness; otherwise **org switcher + micro-chrome bundle** to clear remaining 7 scanner findings.

If all retained-product actionable cleared without content slice: **P266 = CAMPAIGN CLOSEOUT AUDIT** only after remaining 7 micro-surfaces done.

---

## PART J — Test / governance (future P265)

Future enforce-clean boundary (shell slice):

- `rental/components/HelpCenterView.tsx` (shell JSX only; `SECTIONS` content deferred)

Future tests:

- DE/EN shell presentation
- Search query preservation same-mount
- Section/article ID preservation
- Unknown category fallback N/A (static IDs)
- Zero locale refetch (trivial — no API)
- Raw `SECTIONS` content unchanged in shell-only slice
- P264/P263/P262/P261 regressions

Category E feasibility: **FEASIBLE**

---

## PART K — Campaign completion forecast

**Completion rule:** Retained-product **active mounted host presentation debt = 0** for in-scope surfaces; deferred buckets (Data Analyse, IAM CRUD, legacy dead, machine/raw) may remain in scanner totals.

| Denominator | Value |
|-------------|------:|
| Retained-product mounted coverage | Help Center + 7 micro-surfaces |
| Active actionable cleared (P216–P264) | 150 of 163 rental scanner classified |
| Remaining active actionable | **13** |
| Deferred/dead justified | 144 (32+45+65+1+1) |

---

## Final verdict

**B — GO, BUT SPLIT — P2.2.65 HELP CENTER TARGET SELECTED**

P2.2.65: **Help Center Shell Chrome**

SPLIT: **SHELL CHROME ONLY**

BASELINE: `abcc38958fe7d1431f60bd8c174b3f3726955cd3`

P216–P264: **FROZEN**

TRUE ACTIVE ACTIONABLE RENTAL SCANNER DEBT: **13**

PROJECTED NEW KEYS: **18–28**

EXPECTED ACTIVE DEBT AFTER P265: **7**

LIKELY P2.2.66: **Help Center Static Content (SECTIONS corpus)** or micro-chrome bundle

DATA ANALYSE: **DEFERRED — PLANNED REMOVAL**

DEAD IAM CUSTOM ROLE CRUD: **DEFERRED — PRODUCT WIRING REQUIRED**

**IMPLEMENTATION NOT STARTED.**
