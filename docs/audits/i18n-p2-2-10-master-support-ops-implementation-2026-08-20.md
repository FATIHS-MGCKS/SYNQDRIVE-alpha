# P2.2.10 — Master Support Ops localization — Implementation audit

**Date:** 2026-08-20  
**Program baseline SHA:** `d78a6bab903e3cbbb939469f5b88b2241abad4cf` (post–P2.2.9 / PR #1082)  
**Implementation branch:** `cursor/p2210-master-support-ops-i18n-3c10`  
**Implementation PR:** #1086 (draft)  
**Pre-flight audit:** PR #1084 (audit-only — not merged, not used as baseline)

## Provenance

Independent P2.2.10 pre-flight verdict **A — READY TO START**. Implementation branched directly from verified program tip `d78a6bab`. P2.2.7B, P2.2.8, and P2.2.9 frozen boundaries preserved.

## Exact production scope (`P210_ENFORCE_CLEAN_EXACT`)

| Path | Role |
|------|------|
| `master/components/support-ops/support-ops.utils.ts` | Machine queue/filter/query logic + `SUPPORT_QUEUE_DEFS` with translation keys |
| `master/components/support-ops/SupportOpsWorkspace.tsx` | Workspace, composer, meta, toasts |
| `master/components/support-ops/SupportOpsInbox.tsx` | Filters, list, pagination, empty/error states |
| `master/components/support-ops/SupportOpsQueue.tsx` | Queue sidebar + mobile chips |
| `master/components/support-ops/SupportOpsKpis.tsx` | KPI strip |
| `components/support/SupportTechnicalContextCard.tsx` | Phase B — technical context panel rendered from Master workspace |

Supporting (outside enforce-clean exact boundary):

| Path | Role |
|------|------|
| `master/components/support-ops/support-ops-i18n.ts` | Master-owned presentation adapter |
| `i18n/translations/support.ops.{en,de}.ts` | Canonical dictionary module |

## Architectural decoupling

**Before:** `support-ops.utils.ts` imported Rental `support-i18n.ts` and pinned `MASTER_SUPPORT_LOCALE = 'de'`.

**After:** Master-owned `support-ops-i18n.ts` uses canonical `translateKey` + `useLanguage()` in components. Utils retain machine logic imports from `support-center.utils.ts` only (normalization/validation — not presentation i18n).

**Decision:** Smallest correct fix — no Rental i18n dependency for Master presentation; no duplication of machine normalization logic.

## Phase B decision (corrected)

**Initial report error:** Phase B was incorrectly deferred despite confirmed mixed-language production surface when Master locale=EN.

**Correction:** `SupportTechnicalContextCard.tsx` is rendered from `SupportOpsWorkspace` and contained German-hardcoded labels (`Technischer Kontext`, `Quellseite`, `Nicht verfügbar`, etc.). Under the approved rule — include Phase B when mixed-language would occur — **Phase B is mandatory**.

**Implementation:** Localized all user-visible presentation copy via `useLanguage().t()` with `support.ops.technicalContext.*` and reused canonical keys (`support.entityBooking`, `support.entityInvoice`, `support.ops.filter.organization`, `common.yes`/`common.no`, `support.time.emDash`). Locale-aware datetime via `formattingLocale`. Machine metadata values (`vehicleId`, `provider`, `connectionStatus`, etc.) preserved as raw strings.

**Phase B files changed:** `components/support/SupportTechnicalContextCard.tsx` only.

**Presentation literals removed:** `Technischer Kontext`, `Quellseite`, `Organisation`, `Fahrzeug-ID`, `Kennzeichen`, `Buchung`, `Rechnung`, `Modul / Tab`, `Zuletzt gesehen`, `Nicht verfügbar`, `Ja`/`Nein`, hardcoded row label map.

## +88-key audit (corrected)

| Classification | Count | Action |
|----------------|-------|--------|
| **Original new `support.ops.*` keys (first pass)** | 88 | — |
| **B — replaced by existing canonical keys** | 6 | `filter.all`→`common.all`; `kpi.new`→`support.statusNew`; `inbox.errorTitle`→`support.error.ticketsLoadFailed`; `inbox.retryLabel`→`common.retry`; `inbox.badgeCritical`→`support.prioCritical`; `workspace.noMessages`→`support.detail.noMessages` |
| **C — removed unnecessary duplication** | 1 | `workspace.organization` removed; workspace reuses `support.ops.filter.organization` |
| **A — retained genuinely Master Support Ops-specific** | 81 | Original slice after B/C cleanup |
| **A — Phase B additions** | 15 | `support.ops.technicalContext.*` (title, sourcePage, vehicleId, licensePlate, vin, moduleTab, dimoStatus, provider, lastSeen, healthSummary, userAgent, viewport, helpCenter, aiSummary, notAvailable) |
| **Final `support.ops.*` module size** | **96** | — |
| **Final net canonical delta from baseline** | **+96** | 7018 → **7114** |

Phase B additionally reuses without new keys: `support.entityBooking`, `support.entityInvoice`, `common.yes`, `common.no`, `support.time.emDash`.

## Hidden-literal remediation (`support-ops.utils.ts`)

Pre-flight: ~0 scanner findings, ~15+ manual presentation literals.

Remediated classes:

- `MASTER_SUPPORT_LOCALE` + Rental `support-i18n` import
- `SUPPORT_QUEUES` German label map
- `SUPPORT_STATUS_LABEL` / category / priority label records
- `formatDurationMs` / `formatDateTime` presentation helpers
- KPI label constants
- Queue header `"Queues"`

Replaced with `SUPPORT_QUEUE_DEFS` (`labelKey` / `hintKey`) and Master `support-ops-i18n.ts` presentation helpers.

**Blind-spot guard:** `hardcoded-copy-guard.test.ts` + `master-support-ops-localization.test.tsx` grep patterns mirroring P2.2.8/P2.2.9 utils guard. Phase B guard added for `SupportTechnicalContextCard.tsx`.

## Scanner accounting (recomputed after Phase B correction)

| Metric | Pre-P2.2.10 (`d78a6bab`) | After correction | Delta |
|--------|---------------------------|------------------|-------|
| Global findings | 1920 | **1899** | −21 |
| Master | 1069 | **1049** | −20 |
| Rental | 610 | **610** | 0 |
| Operator | 180 | **180** | 0 |
| SHARED | 35 | **34** | −1 |
| SHELL | 26 | **25** | −1 |
| P210 enforce-clean (6 paths) | n/a | **0** | clean |
| P29 enforce-clean | 0 | 0 | preserved |
| P28 enforce-clean | 0 | 0 | preserved |
| P27B enforce-clean | 0 | 0 | preserved |
| Global enforce-clean remaining | 0 | 0 | preserved |
| Canonical EN keys | 7018 | **7114** | +96 |
| Canonical DE keys | 7018 | **7114** | +96 |
| EN/DE parity | 100% | **100%** | — |

## Machine-semantic verification

Preserved unchanged:

- `SupportQueueId` union and queue switch semantics
- `buildTicketListParams` output for all queue/filter combinations
- Status / priority / category machine enums and API param keys
- `normalizeStatusKey`, `normalizePriorityKey`, `normalizeCategoryKey`
- Technical metadata values displayed as raw machine strings
- Task creation payload strings (`Follow-up für Support-Ticket …`) — backend description semantics (Category E freeze)
- `sourceKey: 'SUPPORT_OPS'`, `type: 'CUSTOM'`, `source: 'MANUAL'`

## Shim accounting

| Metric | Before | After |
|--------|--------|-------|
| Shim total | 29 | 29 |
| Production compat | 18 | 18 |
| Test compat | 11 | 11 |
| New compat consumers | 0 | 0 |

## Category A–F accounting

| Cat | Status | Notes |
|-----|--------|-------|
| A | Yes | Component wiring; `support-ops-i18n.ts`; Phase B card |
| B | Yes | `support.ops.{en,de}.ts`; reused `support.*` / `common.*` |
| C | Yes | 21 localization tests incl. Phase B render coverage |
| D | Yes | P210 boundary (6 paths); utils + Phase B blind-spot guards |
| E | **0** | No business/runtime semantic changes |
| F | Yes | This audit; architecture record; Changes/Architektur |

## Tests and validation

| Check | Result |
|-------|--------|
| `master-support-ops-localization.test.tsx` (21 tests) | PASS |
| Phase B EN/DE render + no German literals in EN surface | PASS |
| `hardcoded-copy-guard.test.ts` (P210 + Phase B guard) | PASS |
| P27B / P28 / P29 regression guards | PASS |
| `npm run i18n:check` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

## Residual observations (non-blocking)

1. **`master/components/SupportView.tsx`:** `assigneeName` fallback `'Nicht zugewiesen'` outside P210 scope — pre-existing, documented separately.
2. **`support.ops.queue.header`:** EN value `"Queues"` retained in DE dictionary (operational term).

## Final verdict

**A — IMPLEMENTATION COMPLETE — READY FOR INDEPENDENT RE-AUDIT**

Phase B mixed-language defect eliminated. P210 enforce-clean boundary includes six production paths at 0 findings.
