# P2.2.48 — Post-P247 Operator Closure + Next Campaign Pre-Flight

**Date:** 2026-08-26  
**Mode:** Read-only pre-flight / campaign closure audit  
**Authoritative baseline:** `35fba3159322b6f82a5d29afa77ad74986628efd` (merged PR #1312 — P2.2.47)  
**Pre-flight reference:** PR #1310  
**Implementation not started.**

---

## PART A — P247 post-merge freeze

### Baseline health (independent)

| Metric | Expected | Actual | PASS |
|--------|----------|--------|------|
| EN keys | 8703 | **8703** | ✓ |
| DE keys | 8703 | **8703** | ✓ |
| Parity | 100% | **100%** | ✓ |
| Orphans | 0 | **0** | ✓ |
| P247 enforce-clean | 0 | **0** | ✓ |
| P246–P216 enforce-clean | 0 | **0** | ✓ |
| Global enforce-clean | 0 | **0** | ✓ |
| i18n suite | ≈442 | **442** | ✓ |
| Shim | ≤29 | **29** | ✓ |
| `npm run i18n:check` | PASS | **PASS** | ✓ |
| `npm run check:surface` | PASS | **PASS** | ✓ |

### P247 frozen surfaces verified

- `operator/views/OperatorTasksView.tsx` — 0 scanner findings
- `operator/lib/operator-tasks-tab-i18n.ts` — 0 findings
- Filter/sort/task semantics unchanged (`operatorTask.utils.ts` 0 diff since merge)
- P246 Task Card files — 0 diff since merge
- No search UI introduced in Tasks tab

**P247 freeze: PASS — no regression.**

---

## PART B — Operator closure audit

### Operator residual inventory (production-reachable, post-P236–P247)

| Path | Findings | Audience | Coupling | Eligible? |
|------|----------|----------|----------|-----------|
| `operator/ai-upload/OperatorAiUploadFlow.tsx` | 11 | Operator | **HIGH** — shared AI Upload ingestion | **DEFER** |
| `operator/ai-upload/OperatorAiUploadReview.tsx` | 3 | Operator | **HIGH** — confirmation/mutation flow | **DEFER** |
| `operator/views/OperatorVehiclesView.tsx` | 5 | Operator | **HIGH** — fleet/QV semantic | **DEFER** |
| `operator/lib/operatorVehicleQuickView.utils.ts` | 2 | Operator | fixed-locale `de-DE` | **DEFER** |
| `operator/components/OperatorVehicleQuickView.tsx` | 1 | Operator | QV chrome (partial P235) | **DEFER** |
| `operator/tasks/OperatorTaskCreateForm.tsx` | 1 | Operator | thin wrapper over rental form | **LOW** |
| **Entry/access cluster (see below)** | **11** | Operator entry | **Presentation-only** | **YES** |
| `operator/components/OperatorEntryModal.tsx` | 4 | Rental/Master → Operator | Presentation | **YES** |
| `operator/components/OperatorDesktopOnlyNotice.tsx` | 2 | Desktop `/operator` | Presentation | **YES** |
| `operator/components/OperatorAccessDeniedScreen.tsx` | 2 | Access gate | Presentation | **YES** |
| `operator/components/OperatorAccessGuard.tsx` | 1 | Access gate | Presentation + raw error | **YES** |
| `operator/components/OperatorEntryButton.tsx` | 1 | Rental/Master topbar | Presentation | **YES** |
| `operator/components/OperatorLinkCard.tsx` | 1 | Entry modal/notice | Presentation | **YES** |
| `operator/lib/operatorAccess.ts` | 0* | Access gate | **Blind-spot** — 5 denial reasons | **YES** |
| `operator/components/OperatorAccessLoadingScreen.tsx` | 0* | Access gate | default label blind-spot | **YES** |

\*Not in scanner inventory; verified by source inspection (~12 additional literals).

**Operator notifications:** **NONE** — no `Notification*` components under `frontend/src/operator/`.

**Task Detail:** `OperatorTaskDetail.tsx` already uses `useLanguage()` + shared `TaskDetailShell` — **no scanner debt**.

**Task Create:** `OperatorTaskCreateForm.tsx` delegates to `ManualTaskCreateForm` (rental); 1 residual label — not a standalone slice.

### Operator closure primary gate

**A — OPERATOR HAS ONE FINAL STRONG SLICE**

One cohesive, bounded, presentation-only cluster remains: **Operator Entry & Access Shell** (~11 scanner + ~12 blind-spot literals across 8 paths). All other Operator residuals are low-value (1 finding), fleet-coupled, or AI-upload architecturally blocked.

### Operator completion declaration

**OPERATOR FINAL SLICE SELECTED**

After P2.2.48, Operator presentation debt is effectively closed except deferred residuals:
- AI Upload operator surfaces (14 findings) — shared ingestion architecture
- Vehicles/QV entry (8 findings) — fleet semantic risk
- Task create wrapper (1 finding) — covered by rental task-create keys

---

## PART C — Global challenger comparison

### Campaign challengers

| Campaign | Best candidate | Findings | Bounded? | Collision | Score (/50) |
|----------|--------------|----------|----------|-----------|-------------|
| **OPERATOR (final)** | Entry & Access Shell | ~23 literals | **YES** | NONE | **38** |
| Rental/Booking | Invoice Detail Secondary | 16 | YES | LOW | **36** |
| Customer | — | 0 | N/A | — | **0** |
| Notifications | Dashboard `NotificationPanelHeader` | 1 blind-spot | Thin | MEDIUM (dashboard active) | **22** |
| Shared UI | Shell top-level | 25 SHELL | Mixed | LOW | **28** |
| Dashboard | ScheduleBox widget | 3 | Thin | HIGH (active dashboard) | **18** |
| Vehicle/Fleet | OperatorVehiclesView | 5 | NO | HIGH | **12** |
| Admin/Integrations | TenantBillingOverviewTab | 8 | YES | LOW | **30** |

### Top-7 deep comparison

| Rank | Target | Campaign | Keys est. | Business risk | Collision |
|------|--------|----------|-----------|---------------|-----------|
| 1 | **Operator Entry & Access Shell** | OPERATOR | 18–24 | **1** | NONE |
| 2 | Invoice Detail Secondary | RENTAL | 20–22 | **2** | LOW |
| 3 | Tenant Billing Overview Tab | ADMIN/BILLING | 12–16 | **2** | LOW |
| 4 | Insights Cockpit | RENTAL | 15–18 | **3** | LOW |
| 5 | Financial Insights View | RENTAL | 12–15 | **2** | LOW |
| 6 | Operator AI Upload Flow | OPERATOR | 25+ | **4** | LOW |
| 7 | Damage Work Queue | RENTAL | 20+ | **5** | MEDIUM |

### Best Operator vs best external

| Candidate | Score (/50) | Business risk |
|-----------|-------------|---------------|
| **Operator Entry & Access Shell** | **38** | 1 |
| Invoice Detail Secondary | 36 | 2 |
| Tenant Billing Overview | 30 | 2 |

**Operator final slice wins** on boundedness, collision safety, and campaign-closure leverage. Invoice Detail Secondary is the strongest **post-Operator** Rental target (likely P249).

### Campaign direction

**B — FINAL OPERATOR SLICE**

---

## PART D — P248 selection

### Selected target

**P2.2.48 — Operator Entry & Access Shell Localization**

### Split decision

**ONE SLICE**

### Exact production boundary

| Path | Role |
|------|------|
| `frontend/src/operator/components/OperatorEntryModal.tsx` | Desktop entry modal |
| `frontend/src/operator/components/OperatorDesktopOnlyNotice.tsx` | Desktop guard screen |
| `frontend/src/operator/components/OperatorAccessDeniedScreen.tsx` | Access denial screen |
| `frontend/src/operator/components/OperatorAccessGuard.tsx` | Org gate error chrome |
| `frontend/src/operator/components/OperatorEntryButton.tsx` | Rental/Master entry CTA |
| `frontend/src/operator/components/OperatorLinkCard.tsx` | Shareable link card |
| `frontend/src/operator/lib/operatorAccess.ts` | Denial reason → title/description |
| `frontend/src/operator/components/OperatorAccessLoadingScreen.tsx` | Loading label default |

### Mount / audience

```
Rental/Master TopBar → OperatorEntryButton → OperatorEntryModal → OperatorLinkCard
/operator (desktop) → OperatorDesktopOnlyNotice → OperatorLinkCard
/operator → OperatorApp → OperatorAccessGuard → OperatorAccessDeniedScreen | OperatorAccessLoadingScreen
```

Audience: all users attempting Operator entry; denial reasons are machine enums.

### Machine / domain freeze matrix

| Value | Source | May localize? | Must freeze |
|-------|--------|---------------|-------------|
| `OperatorAccessDenialReason` | `operatorAccess.types` | label only | enum values |
| `allowed` / `reason` | `evaluateOperatorAccess` | no | predicate |
| `/login`, `/rental`, `/operator` routes | navigation | no | paths |
| `profileError` (API) | catch block | **raw dynamic** | message text |
| `businessType` check | `isRentalBusinessType` | no | predicate |
| `buildOperatorEntryUrl()` | URL builder | no | URL |

### Dynamic data freeze

- API `profileError` message — remain raw in `ErrorState`
- Clipboard URL value — dynamic, not translated
- User/org names — N/A on these surfaces

### Callback / navigation freeze

| Control | Callback | Target | Frozen |
|---------|----------|--------|--------|
| Entry button (mobile) | `navigate(OPERATOR_BASE_PATH)` | `/operator` | YES |
| Entry button (desktop) | `setModalOpen(true)` | modal | YES |
| Modal close | `onOpenChange(false)` | — | YES |
| Copy link | `navigator.clipboard.writeText(url)` | — | YES |
| Login CTA | `Link to="/login"` | `/login` | YES |
| Back to rental | `Link to="/rental"` | `/rental` | YES |
| Org retry | `setRetryKey` | re-fetch profile | YES |

### Filter / sort / order

**N/A** — no collections.

### Key reuse audit

| Concept | Strategy |
|---------|----------|
| Close button | **EXACT** `common.close` |
| Login CTA | **SEMANTIC** `auth.*` or new `operator.access.login` |
| Denial titles/descriptions | **NEW** `operator.access.denial.*` keyed by machine reason |
| Link card copy | **NEW** `operator.entry.link.*` |
| Desktop/mobile notice | **NEW** `operator.entry.notice.*` |
| Loading labels | **NEW** `operator.access.loading.*` |

**Estimated new keys:** 18–24 EN+DE (within 14–30 pre-flight comfort band).

### Adapter strategy

**NEW BOUNDED PRESENTATION ADAPTER**

Suggested: `frontend/src/operator/lib/operator-entry-access-i18n.ts`

Exports:
- `operatorAccessDenialTitle(locale, reason)` — machine reason → key
- `operatorAccessDenialDescription(locale, reason)`
- Static entry/link/notice helpers
- No access evaluation, routing, or API logic

### Extraction strategy

**KEEP EXISTING COMPONENTS** — presentation swap only.

### P248 enforce-clean boundary

```
P248_ENFORCE_CLEAN_EXACT = [
  'operator/components/OperatorEntryModal.tsx',
  'operator/components/OperatorDesktopOnlyNotice.tsx',
  'operator/components/OperatorAccessDeniedScreen.tsx',
  'operator/components/OperatorAccessGuard.tsx',
  'operator/components/OperatorEntryButton.tsx',
  'operator/components/OperatorLinkCard.tsx',
  'operator/lib/operatorAccess.ts',
  'operator/components/OperatorAccessLoadingScreen.tsx',
  'operator/lib/operator-entry-access-i18n.ts',
]
```

Excludes: P216–P247 frozen surfaces, AI Upload, Vehicles/QV, Task surfaces.

### Category E feasibility

**YES** — presentation-only; denial reason machine IDs frozen; routes/callbacks unchanged.

### Active collision

| PR | Overlap |
|----|---------|
| #1302 BullMQ | NONE |
| #1307 DIMO consent (merged) | NONE |
| #1309 prod audit | NONE |
| #1311 ClickHouse recovery | NONE |
| Open Operator PRs | NONE on entry/access paths |

**Collision: NONE**

### Current main drift

| Item | Value |
|------|-------|
| Baseline | `35fba315` (P247 merge on `p239-p238-merge-baseline-3c10`) |
| Main | `7572e19c` |
| Topology | **VALID CAMPAIGN BASELINE BEHIND MAIN** |
| P248 path drift | **LOW** (entry paths unchanged on main) |

### Baseline strategy

**DIRECT FROM P247 MERGE BASELINE** (`35fba3159322b6f82a5d29afa77ad74986628efd`)

---

## PART E — Updated global completion model

| Metric | PR #1310 ref | Post-P247 | Post-P248 (projected) |
|--------|--------------|-----------|------------------------|
| Global completion | ~92% | **~92.5%** | **~92.7%** |
| Remaining actionable units | ~1527 | **~1518** | **~1500** |
| P247 closed units | — | **~9** | ~9 |
| P248 closed units (projected) | — | — | **~18** |
| Confidence | — | HIGH | HIGH |

### Remaining campaign map (post-P248)

| Campaign | Surfaces | Actionable units | Slices est. |
|----------|----------|------------------|-------------|
| **RENTAL** | 372+ findings | ~480 | 25–30 |
| **MASTER** | 1049+ findings | ~1200 | 20–25 |
| **OPERATOR (deferred)** | AI Upload, Vehicles | ~23 | 0–2 (deferred) |
| **SHELL** | 25 | ~30 | 2–3 |
| **SHARED** | 6 | ~8 | 1 |

### Projected slices to 100%

- Minimum: **32**
- Most likely: **36**
- Upper: **44**

(Compatible with PR #1310 range; Operator campaign closure reduces slice count by ~1–2.)

### Operator closure forecast

After P248: **0** remaining strong Operator slices. Deferred: AI Upload (1 architectural slice), Vehicles/QV (1 fleet slice, high risk).

### Likely P249 forecast

**LIKELY P249: P2.2.49 — Rental Invoice Detail Secondary Localization**

(Campaign pivot to RENTAL after Operator final slice.)

---

## Final verdict

# **C — GO — FINAL OPERATOR SLICE SELECTED**

**P2.2.48:** Operator Entry & Access Shell Localization  
**CAMPAIGN:** OPERATOR (final slice)  
**OPERATOR STATUS:** FINAL SLICE SELECTED — campaign completes after P248 except deferred AI Upload / Vehicles residuals  
**GLOBAL I18N COMPLETION:** ~92.5% (post-P247); ~92.7% projected post-P248  
**CONFIDENCE:** HIGH  
**REMAINING ACTIONABLE DEBT:** ~1518 units  
**PROJECTED SLICES TO 100%:** 32–44  

**IMPLEMENTATION NOT STARTED.**

---

*Read-only pre-flight artifact. No production, dictionary, test, scanner, or architecture changes.*
