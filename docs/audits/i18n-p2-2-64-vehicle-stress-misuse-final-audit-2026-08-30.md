# P2.2.64 — Vehicle Rental Stress & Misuse Hints Final Independent Audit

**Date:** 2026-08-30  
**Mode:** STRICT READ-ONLY FINAL CERTIFICATION  
**Implementation PR:** #1434  
**Pre-flight PR:** #1433 (audit only — not merged)  
**Baseline:** `6881b9b922fc163e53879b451268eb8d1a87c1b8`  
**Audited HEAD:** `7a10f868b18abae5109e04606b66e0bab370881f`  
**Audit branch:** `cursor/p2264-vehicle-stress-misuse-final-audit-3c10`

---

## PART 1 — Topology

| Check | Independent result |
|-------|-------------------|
| PR #1434 open | **PASS** |
| Draft | **PASS** |
| Unmerged | **PASS** |
| Mergeable | **PASS** (`MERGEABLE`) |
| Base | `6881b9b922fc163e53879b451268eb8d1a87c1b8` on `p239-p238-merge-baseline-3c10` — **PASS** |
| HEAD | `7a10f868b18abae5109e04606b66e0bab370881f` — **PASS** |
| Commit count | **2** (`c10499c0f`, `7a10f868b`) — **PASS** |
| #1433 audit ancestry | **NONE** (`merge-base --is-ancestor` exit 1; audit commit `10ae0a2ba` not in implementation branch) — **PASS** |

---

## PART 2 — Changed paths (17 files)

| Path | Class |
|------|-------|
| `frontend/src/rental/components/MisuseCasesPanel.tsx` | **A** active production presentation |
| `frontend/src/rental/components/RentalStressAnalysisCard.tsx` | **A** |
| `frontend/src/rental/lib/misuse-case-lifecycle.ui.ts` | **A** |
| `frontend/src/rental/lib/rental-misuse-stress-i18n.ts` | **C** presentation adapter |
| `frontend/src/i18n/translations/rental.misuseStress.en.ts` | **B** dictionary |
| `frontend/src/i18n/translations/rental.misuseStress.de.ts` | **B** |
| `frontend/src/i18n/translations/en.ts` | **B** (spread import) |
| `frontend/src/i18n/translations/de.ts` | **B** |
| `frontend/src/rental/components/rental-vehicle-stress-misuse-localization.test.tsx` | **D** tests |
| `frontend/src/rental/lib/misuse-case-lifecycle.ui.test.ts` | **D** |
| `frontend/src/i18n/hardcoded-copy-guard.test.ts` | **E** scanner/governance |
| `frontend/scripts/i18n-hardcoded-scan.mjs` | **E** |
| `frontend/src/i18n/hardcoded-copy-inventory.json` | **E** |
| `docs/audits/i18n-p2-2-64-vehicle-stress-misuse-implementation-2026-08-30.md` | **F** implementation docs |
| `architecture/I18N_RENTAL_VEHICLE_STRESS_MISUSE_P2_2_64_2026-08-30.md` | **G** architecture/bookkeeping |
| `frontend/src/master/components/ChangesView.tsx` | **G** |
| `frontend/src/master/components/ArchitekturView.tsx` | **G** |

**H/I/J/K/L/M production changes = 0** (no backend, no frozen P216–P263 surfaces, no Data Analyse, no IAM CRUD, no DIMO/trip backend, no legacy rental modules).

---

## PART 3 — Mount topology

| Parent | Components | Active |
|--------|------------|--------|
| `BookingUsageMisuseTab` | `RentalStressAnalysisCard`, `MisuseCasesPanel` | **Yes** |
| `CustomerDrivingTab` | `RentalStressAnalysisCard`, `MisuseCasesPanel` | **Yes** |
| `TripTimelineExpanded` | `MisuseCasesPanel` | **Yes** |
| `BookingsView` | imports `MisuseCasesPanel` | **Yes** (import wiring) |

Production components `MisuseCasesPanel.tsx` and `RentalStressAnalysisCard.tsx` are genuinely mounted in booking/customer/trip contexts.

---

## PART 4 — Complete 45-key inventory

| # | Key | EN | DE | Callsite | Mounted | Host-owned | Reuse | Dup | Unused | Group |
|---|-----|----|----|----------|---------|------------|-------|-----|--------|-------|
| 1 | `misuseStress.panel.defaultTitle` | Review hints | Prüfhinweise | `MisuseCasesPanel.tsx:396` | Yes | Yes | No | No | No | panel chrome |
| 2 | `misuseStress.panel.loading` | Loading hints… | Hinweise werden geladen… | `MisuseCasesPanel.tsx:456` | Yes | Yes | No | No | No | panel chrome |
| 3 | `misuseStress.error.loadFailed` | Hints could not be loaded | Hinweise konnten nicht geladen werden | `MisuseCasesPanel.tsx:437` | Yes | Yes | No | No | No | error framing |
| 4 | `misuseStress.empty.calmTitle` | Unremarkable trip | Unauffällige Fahrt | `MisuseCasesPanel.tsx:121` | Yes | Yes | No | No | No | empty state |
| 5 | `misuseStress.empty.calmDescription` | No abuse or damage hints… | Keine Hinweise auf Missbrauch… | `MisuseCasesPanel.tsx:124` | Yes | Yes | No | No | No | empty state |
| 6 | `misuseStress.severity.CRITICAL` | Critical | Kritisch | adapter → `MisuseCasesPanel.tsx:326` | Yes | Yes | No | No | No | severity taxonomy |
| 7 | `misuseStress.severity.SEVERE` | Severe | Schwer | adapter → chip | Yes | Yes | No | No | No | severity taxonomy |
| 8 | `misuseStress.severity.WARNING` | Notable | Auffällig | adapter → chip | Yes | Yes | No | No | No | severity taxonomy |
| 9 | `misuseStress.severity.INFO` | Hint | Hinweis | adapter → chip | Yes | Yes | No | No | No | severity taxonomy |
| 10 | `misuseStress.summary.countOne` | 1 review hint | 1 Prüfhinweis | `MisuseCasesPanel.tsx:497` | Yes | Yes | No | No | No | summary |
| 11 | `misuseStress.summary.countMany` | {count} review hints | {count} Prüfhinweise | `MisuseCasesPanel.tsx:498` | Yes | Yes | No | No | No | summary |
| 12 | `misuseStress.summary.damageRelated` | · {count} damage-related | · {count} mit Schadensbezug | `MisuseCasesPanel.tsx:521` | Yes | Yes | No | No | No | summary |
| 13 | `misuseStress.evidence.sectionTitle` | Evidence | Beweislage | `MisuseCasesPanel.tsx:208` | Yes | Yes | No | No | No | evidence chrome |
| 14 | `misuseStress.evidence.reasonsPrefix` | Reasons: | Gründe: | `MisuseCasesPanel.tsx:231` | Yes | Yes | No | No | No | evidence chrome |
| 15 | `misuseStress.evidence.signalsPrefix` | Signals: | Signale: | `MisuseCasesPanel.tsx:248` | Yes | Yes | No | No | No | evidence chrome |
| 16 | `misuseStress.evidence.missingSignals` | · missing: | · fehlend: | `MisuseCasesPanel.tsx:250` | Yes | Yes | No | No | No | evidence chrome |
| 17 | `misuseStress.evidence.anchorsPrefix` | Anchors: | Anker: | `MisuseCasesPanel.tsx:270` | Yes | Yes | No | No | No | evidence chrome |
| 18 | `misuseStress.evidence.nativeEventOne` | 1 native event | 1 natives Ereignis | `MisuseCasesPanel.tsx:198` | Yes | Yes | No | No | No | evidence chrome |
| 19 | `misuseStress.evidence.nativeEventMany` | {count} native events | {count} native Ereignisse | `MisuseCasesPanel.tsx:200` | Yes | Yes | No | No | No | evidence chrome |
| 20 | `misuseStress.evidence.none` | none | keine | `MisuseCasesPanel.tsx:201` | Yes | Yes | No | No | No | evidence chrome |
| 21 | `misuseStress.evidence.windowPrefix` | · window | · Fenster | `MisuseCasesPanel.tsx:271` | Yes | Yes | No | No | No | evidence chrome |
| 22 | `misuseStress.evidence.sourcePrefix` | Source: | Quelle: | `MisuseCasesPanel.tsx:278` | Yes | Yes | No | No | No | evidence chrome |
| 23 | `misuseStress.reviewDisclaimer` | Review hint — not an automated allegation. | Hinweis zur Prüfung… | `MisuseCasesPanel.tsx:369` | Yes | Yes | No | No | No | lifecycle framing |
| 24 | `misuseStress.recommendedPrefix` | Recommended: | Empfohlen: | `MisuseCasesPanel.tsx:374` | Yes | Yes | No | No | No | lifecycle framing |
| 25 | `misuseStress.status.CANDIDATE` | Candidate | Kandidat | adapter → `misuseCaseStatusLabel` | Yes | Yes | No | No | No | status taxonomy |
| 26 | `misuseStress.status.ACTIVE` | Active | Aktiv | adapter | Yes | Yes | No | No | No | status taxonomy |
| 27 | `misuseStress.status.REVIEW_REQUIRED` | Review required | Prüfung erforderlich | adapter | Yes | Yes | No | No | No | status taxonomy |
| 28 | `misuseStress.status.CONFIRMED` | Confirmed | Bestätigt | adapter | Yes | Yes | No | No | No | status taxonomy |
| 29 | `misuseStress.status.DISMISSED` | Dismissed | Verworfen | adapter | Yes | Yes | No | No | No | status taxonomy |
| 30 | `misuseStress.status.RESOLVED` | Resolved | Erledigt | adapter | Yes | Yes | No | No | No | status taxonomy |
| 31 | `misuseStress.status.SUPERSEDED` | Superseded | Ersetzt | adapter | Yes | Yes | No | No | No | status taxonomy |
| 32 | `misuseStress.status.NOT_ASSESSABLE` | Not assessable | Nicht bewertbar | adapter | Yes | Yes | No | No | No | status taxonomy |
| 33 | `misuseStress.eligibility.INFORMATIONAL_ONLY` | Informational only… | Nur informativ… | adapter → `misuseCaseDecisionHint` | Yes | Yes | No | No | No | eligibility taxonomy |
| 34 | `misuseStress.eligibility.REVIEW_ONLY` | Manual review required | Manuelle Prüfung erforderlich | adapter | Yes | Yes | No | No | No | eligibility taxonomy |
| 35 | `misuseStress.eligibility.MANUAL_CONFIRMATION_ONLY` | Confirmation only possible manually | Bestätigung nur manuell möglich | adapter | Yes | Yes | No | No | No | eligibility taxonomy |
| 36 | `misuseStress.eligibility.OPERATIONAL_ELIGIBLE` | Operational follow-up possible… | Operative Folgeaktion möglich… | adapter | Yes | Yes | No | No | No | eligibility taxonomy |
| 37 | `misuseStress.eligibility.NOT_ELIGIBLE` | No operational decision | Keine operative Entscheidung | adapter | Yes | Yes | No | No | No | eligibility taxonomy |
| 38 | `misuseStress.stress.cardTitle` | Rental driving load | Fahrbelastung der Miete | `RentalStressAnalysisCard.tsx:29` | Yes | Yes | No | No | No | stress chrome |
| 39 | `misuseStress.stress.empty.title` | No driving load analysis yet | Noch keine Fahrbelastungsauswertung | `RentalStressAnalysisCard.tsx:41` | Yes | Yes | No | No | No | stress empty |
| 40 | `misuseStress.stress.empty.description` | After a completed rental… | Nach abgeschlossener Miete… | `RentalStressAnalysisCard.tsx:42` | Yes | Yes | No | No | No | stress empty |
| 41 | `misuseStress.stress.overallAssessment` | Overall assessment | Gesamteinschätzung | `RentalStressAnalysisCard.tsx:92` | Yes | Yes | No | No | No | stress section |
| 42 | `misuseStress.stress.wearRelevance` | Wear relevance | Verschleißrelevanz | `RentalStressAnalysisCard.tsx:101` | Yes | Yes | No | No | No | stress section |
| 43 | `misuseStress.stress.watchpoints` | Hints | Hinweise | `RentalStressAnalysisCard.tsx:129` | Yes | Yes | No | No | No | stress section |
| 44 | `misuseStress.stress.meta.scoredTrips` | {count} scored trips | {count} bewertete Fahrten | `RentalStressAnalysisCard.tsx:59` | Yes | Yes | No | No | No | stress meta |
| 45 | `misuseStress.stress.meta.distanceKm` | {km} km | {km} km | `RentalStressAnalysisCard.tsx:64` | Yes | Yes | No | No | No | stress meta |

**Non-dictionary presentation (adapter const maps, not counted in 45):** evidence levels/sources/classifications/grades (EN), wear impact, data confidence (EN/DE via `getDataConfidenceLabel`).

**Claimed reuse (not in 45):**
- `docUpload.entityReview.confidence.HIGH|MEDIUM|LOW` — exact semantic match for misuse confidence chip labels
- `STRESS_TOOLTIPS.vehicleStress` — footnote via `resolveStressFootnote`

---

## PART 5 — Key verdict

**A — 45 KEYS JUSTIFIED**

All 45 keys are mounted, host-owned, referenced, non-duplicate, and non-unused. Count is exactly at hard ceiling (45 ≤ 45).

---

## PART 6–20 — Semantic audits

| Area | Result |
|------|--------|
| Adapter purity | **PURE** — no fetch, scoring, detection, thresholds, trip logic |
| Stress logic parity | **UNCHANGED** — tone mapping, score resolution, visibility gates identical |
| Misuse logic parity | **UNCHANGED** — `normalizeOperationalIssues`, filter domain, severity mapping unchanged |
| Machine taxonomy | **UNCHANGED** — severity/status/eligibility/evidence machines preserved |
| Unknown machines | **PASS** — raw fallback, no false known mapping (tested) |
| Raw backend description | **PASS** — `Backend Misuse Description X7` preserved DE/EN |
| Raw watchpoint/area/signals | **PASS** — provider values byte-identical |
| Numeric semantics | **UNCHANGED** — scores, counts, km, measurements |
| Unit semantics | **UNCHANGED** — no conversion |
| Date formatting | **UNCHANGED** — window labels use existing `formatWindow`; no hardcoded locale helpers added |
| Sort order | **UNCHANGED** — API/issue order preserved |
| Filter semantics | **UNCHANGED** — `misuse`/`damage` domain filter unchanged |
| Severity order | **UNCHANGED** — `severityTone` rank unchanged |
| Visibility parity | **PASS** — same cards/rows under DE/EN |

---

## PART 21–29 — Same-mount / fetch / errors

| Check | Result |
|-------|--------|
| Same-mount grade | **STRONG** — one persistent root, production `MisuseCasesPanel`, DE→EN→DE |
| Preserved state | panel title, raw backend description, mount count=1 |
| Fetch deps | `[orgId, vehicleId, tripId, bookingId, customerId, limit]` — no `locale`/`t` |
| Business refetch | `misuseCases.list`: 1 on mount, **0** on locale switch |
| Mutation surface | **NONE** |
| React identity | No `key={locale}` / `key={t(...)}` violations |
| Semantic parity test | **PASS** |
| Error ownership | Stable `load_failed` key → render-time `t()`; raw `Error.message` preserved when not host key |

---

## PART 30–35 — Debt / scanner / deferred

**P264 enforce-clean paths (0 findings):**
- `rental/components/MisuseCasesPanel.tsx`
- `rental/components/RentalStressAnalysisCard.tsx`
- `rental/lib/misuse-case-lifecycle.ui.ts`
- `rental/lib/rental-misuse-stress-i18n.ts`

**Manual active debt audit:** ACTIVE MOUNTED P264 PRESENTATION DEBT = **0**

| Metric | Baseline | Independent | Delta |
|--------|---------:|------------:|------:|
| EN keys | 9661 | **9706** | +45 |
| DE keys | 9661 | **9706** | +45 |
| Parity | 100% | **100%** | — |
| Orphans | 0 | **0** | — |
| Unused P264 | 0 | **0** | — |
| Global scanner | 1260 | **1254** | −6 |
| Rental scanner | 163 | **157** | −6 |
| Finance/Billing | 25 | **25** | 0 |

**−6 explanation:** Cleared 6 preflight actionable findings from `MisuseCasesPanel` (2) and `RentalStressAnalysisCard` (4).

**True active actionable rental debt:** 19 → **13** (remaining listed in Part 47).

**Deferred buckets (unchanged classification):** Data Analyse 32, dead IAM CRUD 45, legacy/dead ~65, machine/not-localizable 1, other justified 1.

**Category E:** **0**

---

## PART 36–46 — Regressions / validation

| Suite | Result |
|-------|--------|
| P264 focused tests | **PASS** (5/5) |
| P263 regression | **PASS** (6/6) |
| P262 regression | **PASS** (13/13) |
| P261 regression | **PASS** (13/13) |
| `npm run i18n:check` | **PASS** (9706/9706) |
| `npm run check:surface` | **PASS** |
| `npx tsc --noEmit` (frontend) | **PASS** |
| `npm run build` | **PASS** |
| `git diff --check` | **FAIL** — trailing whitespace in markdown docs only (non-production) |
| Backend diff | **0 files** |
| Collision | **NONE** on P264 frontend paths (#1429/#1430 backend-only) |

**Note:** GitHub PR CI reports backend typecheck failures in unrelated spec files (`billing.controller.security`, `vehicles-security-negative`) — pre-existing on campaign baseline, not introduced by #1434. Local frontend validation passes.

---

## PART 47 — Claim reconciliation

| Claim | #1434 | Independent | PASS/FAIL |
|-------|-------|-------------|-----------|
| 2 commits | 2 | 2 | **PASS** |
| 45 new keys | 45 | 45 | **PASS** |
| EN/DE 9706 | 9706 | 9706 | **PASS** |
| Parity 100% | yes | yes | **PASS** |
| Orphans 0 | 0 | 0 | **PASS** |
| Unused 0 | 0 | 0 | **PASS** |
| Global 1254 | 1254 | 1254 | **PASS** |
| Rental 157 | 157 | 157 | **PASS** |
| Actionable 19→13 | yes | 13 remaining | **PASS** |
| Same-mount | PASS | STRONG | **PASS** |
| Zero locale refetch | 0 | 0 | **PASS** |
| Category E | 0 | 0 | **PASS** |
| Machine parity | yes | unchanged | **PASS** |
| Raw ownership | yes | preserved | **PASS** |
| Adapter purity | PURE | PURE | **PASS** |
| Frozen surfaces | untouched | 0 prod diff | **PASS** |
| Validation | all pass | all pass (markdown diff-check NBO) | **PASS** |

### Remaining 13 true active actionable rental scanner debt

1. `rental/App.tsx:1291` — crash boundary title
2. `rental/components/AIAssistantView.tsx:363` — clear conversation
3–8. `rental/components/HelpCenterView.tsx` — 6 findings (likely P265)
9. `rental/components/HomeAwayBadge.tsx:135` — geofence aria
10–11. `rental/components/OrganizationSwitcher.tsx` — 2 findings
12–13. `rental/components/shared/rental-requirements-ui.tsx` — 2 findings

---

## PART 48 — Final verdict

**B — P2.2.64 CERTIFIED WITH NON-BLOCKING OBSERVATIONS — READY TO MERGE**

**Non-blocking observations:**
1. `git diff --check` reports trailing whitespace in markdown implementation/architecture docs only (not production code).
2. GitHub PR CI backend typecheck failures are unrelated to P264 frontend scope (baseline backend spec drift).

P2.2.64 Vehicle Rental Stress & Misuse Hints is independently certified.

PR #1434 may now be marked ready and merged.

Active mounted P264 presentation debt is zero.

True active actionable Rental scanner debt is now 13.

DO NOT MERGE AUDIT PR #1433 OR THIS AUDIT PR.

AFTER #1434 MERGES, P2.2.65 MAY BEGIN.
