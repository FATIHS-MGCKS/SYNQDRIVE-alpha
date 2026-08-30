# P2.2.66 — Active Rental Micro-Chrome Closeout Implementation

**Date:** 2026-08-30  
**Mode:** STRICT IMPLEMENTATION  
**Baseline:** `bbeb09b9c8b4e58fe0749caba25721bfc78e4ce2` (merged PR #1439, P2.2.65)  
**Branch:** `cursor/p2266-active-rental-micro-chrome-closeout-3c10`

---

## PART A — 7-finding inventory

| # | Path | Line | Literal | Mount owner | Presentation purpose |
|---|------|-----:|---------|-------------|---------------------|
| 1 | `OrganizationSwitcher.tsx` | 61 | Switch organization | Rental topbar org switcher | Listbox `aria-label` |
| 2 | `OrganizationSwitcher.tsx` | 64 | Active organization | Rental topbar org switcher | Active-org section header |
| 3 | `AIAssistantView.tsx` | 363 | Clear conversation | Rental AI assistant chrome | Clear-chat button `title` |
| 4 | `HomeAwayBadge.tsx` | 137 | Geofence: … | Fleet/dashboard geofence chip (compact) | Compact mode `aria-label` |
| 5 | `rental-requirements-ui.tsx` | 148 | Rule source: … | Vehicle requirements rule badge | `title` template around machine label |
| 6 | `rental-requirements-ui.tsx` | 474 | Loading effective rules | Effective rules skeleton | Loading `aria-label` |
| 7 | `rental/App.tsx` | 1291 | Rental view crashed | Rental shell error boundary | Crash fallback title/description |

All seven verified active, mounted, host-owned presentation at baseline. None machine/raw/provider-owned.

---

## PART B — Exact scope

**In scope (5 paths):**

- `frontend/src/rental/components/OrganizationSwitcher.tsx`
- `frontend/src/rental/components/AIAssistantView.tsx`
- `frontend/src/rental/components/HomeAwayBadge.tsx`
- `frontend/src/rental/components/shared/rental-requirements-ui.tsx`
- `frontend/src/rental/App.tsx` (`RentalShellErrorBoundary` wrapper)

**Out of scope (zero diff):** Data Analyse, dead IAM CRUD, Help Center `SECTIONS` corpus, P216–P265 frozen surfaces, legacy/dead neighbors.

---

## PART C — Key / reuse accounting

| Metric | Value |
|--------|------:|
| Baseline EN/DE | 9718 |
| New P266 keys | 9 |
| Reused keys | 0 |
| Removed/replaced | 0 |
| Final EN/DE | 9727 |
| Parity | 100% |
| Orphans | 0 |
| Unused P266 keys | 0 |
| Key budget | 9 / 12 target — **PASS** (hard stop 16) |

### New keys (`rental.microChrome.*`)

1. `organization.switcher.listAria`
2. `organization.switcher.activeLabel`
3. `aiChat.clearConversation`
4. `fleet.geofence.ariaLabel`
5. `fleet.geofence.statusUnknown`
6. `rentalRequirements.ruleSource.title`
7. `rentalRequirements.loadingEffectiveRules`
8. `rental.shell.errorBoundary.title`
9. `rental.shell.errorBoundary.description`

---

## PART D — Machine / raw ownership

| Fixture | Ownership | P266 behavior |
|---------|-----------|---------------|
| `Provider Organization X7` | RAW org data | Rendered unchanged; never translated |
| `Provider AI Message X7` | RAW conversation | Preserved across locale switch |
| `Organization default` (rule source) | Machine label from `labelRuleSource()` | Preserved in chip body and title interpolation |
| `Backend Crash Error X7` | RAW `error.message` | Preserved in crash UI |
| Home/Away machine (`Home`/`Away`/`—`) | Machine state | Compact aria uses machine label; unknown → localized `statusUnknown` only in aria template |

---

## PART E — Same-mount / refetch

| Surface | Same-mount | Locale business refetch |
|---------|------------|-------------------------|
| OrganizationSwitcher | PASS — selected org ID/name preserved; `switchOrganization` calls = 0 | 0 |
| AIAssistantView | PASS — raw message preserved; clear title localizes | `chatHistory`/`chatAgent` unchanged on DE→EN |
| HomeAwayBadge | PASS — palette/tone unchanged | 0 |
| Requirements UI | PASS — machine label + blocking semantics unchanged | 0 |
| Crash boundary | PASS — raw error preserved; framing localizes | 0 |

No `key={locale}`, `key={t(...)}`, or `t`/`locale` added to fetch identity in changed paths.

---

## PART F — Semantic parity

Under DE and EN:

- Organization selection identity unchanged (`organizationId` payloads untouched)
- AI thread/message identity unchanged; no send/regenerate/new-chat on locale-only switch
- Home/away machine state and tone unchanged
- Requirement evaluation/eligibility unchanged
- Crash/retry/reload semantics unchanged

**Category E = 0**

---

## PART G — Scanner buckets (Rental total 144)

| Bucket | Count |
|--------|------:|
| ACTIVE ACTIONABLE | **0** |
| DATA ANALYSE — PLANNED REMOVAL | 32 |
| IAM CRUD — PRODUCT WIRING REQUIRED | 45 |
| HELP CENTER STATIC CONTENT (scanner-visible) | 0 |
| LEGACY / OTHER JUSTIFIED (incl. insights, schedule, legal, non-billing misc) | 42 |
| Finance/Billing (subset of rental; also counted in legacy/other file paths) | 25 |

**Sum:** 32 + 45 + 42 + 25 = 144 (Finance/Billing is a module sub-total within the 144 rental findings, not additive).

**Scanner delta:** Global 1248→1241 (−7); Rental 151→144 (−7); Finance/Billing 25→25 (unchanged).

---

## PART H — Frozen regressions

| Slice | Result |
|-------|--------|
| P265 Help Center shell | PASS |
| P264 vehicle stress/misuse | PASS |
| P263 mounted roles/security | PASS |
| P262 member management | PASS |
| P261 vehicle damages | PASS |
| P216–P260 | PASS (no semantic diff) |

---

## PART I — Help content classification

**Campaign-definition answer: B — NO, CONTENT CORPUS IS A SEPARATE CONTENT-LOCALIZATION CAMPAIGN**

Help Center `SECTIONS` (17 sections, 44 articles) remains unchanged German static content. P265 localized shell chrome only. Scanner does not surface `SECTIONS` strings as active-mount micro-chrome debt; content localization is a separate editorial/product decision after technical active-mount hardening.

---

## PART J — Campaign closeout readiness

| Gate | Status |
|------|--------|
| True active actionable rental debt = 0 | YES |
| P266 enforce-clean (5 paths) = 0 | YES |
| EN = DE = 9727, parity 100%, orphans 0 | YES |
| Machine/raw semantics preserved | YES |
| Same-mount / zero locale refetch | YES |
| All validation PASS | YES |

**ACTIVE-MOUNT TECHNICAL I18N CLOSEOUT READY = YES**

PR requires independent closeout audit before merge. **DO NOT MERGE YET.**
