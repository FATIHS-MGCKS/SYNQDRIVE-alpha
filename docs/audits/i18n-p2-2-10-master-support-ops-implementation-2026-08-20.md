# P2.2.10 — Master Support Ops localization — Implementation audit

**Date:** 2026-08-20  
**Program baseline SHA:** `d78a6bab903e3cbbb939469f5b88b2241abad4cf` (post–P2.2.9 / PR #1082)  
**Implementation branch:** `cursor/p2210-master-support-ops-i18n-3c10`  
**Pre-flight audit:** PR #1084 (audit-only — not merged, not used as baseline)

## Provenance

Independent P2.2.10 pre-flight verdict **A — READY TO START**. Implementation branched directly from verified program tip `d78a6bab`. P2.2.7B, P2.2.8, and P2.2.9 frozen boundaries preserved.

## Exact production scope (`P210_ENFORCE_CLEAN_EXACT`)

| Path | Role |
|------|------|
| `master/components/support-ops/support-ops.utils.ts` | Machine queue/filter/query logic; `SUPPORT_QUEUE_DEFS` with `TranslationKey` metadata |
| `master/components/support-ops/SupportOpsWorkspace.tsx` | Workspace, composer, meta, toasts |
| `master/components/support-ops/SupportOpsInbox.tsx` | Filters, list, pagination, empty/error states |
| `master/components/support-ops/SupportOpsQueue.tsx` | Queue sidebar + mobile chips |
| `master/components/support-ops/SupportOpsKpis.tsx` | KPI strip |

Supporting (outside enforce-clean exact boundary):

| Path | Role |
|------|------|
| `master/components/support-ops/support-ops-i18n.ts` | Master-owned presentation adapter |
| `i18n/translations/support.ops.{en,de}.ts` | Canonical dictionary module |
| `components/support/SupportTechnicalContextCard.tsx` | Import-only fix (`formatDateTimeDe`) — Phase B deferred |

## Architectural decoupling

**Before:** `support-ops.utils.ts` imported Rental `support-i18n.ts` and pinned `MASTER_SUPPORT_LOCALE = 'de'`.

**After:** Master-owned `support-ops-i18n.ts` uses canonical `translateKey` + `useLanguage()` in components. Utils retain machine logic imports from `support-center.utils.ts` only (normalization/validation — not presentation i18n).

**Decision:** Smallest correct fix — no Rental i18n dependency for Master presentation; no duplication of machine normalization logic.

## Phase B decision

`SupportTechnicalContextCard.tsx` remains German-hardcoded and is rendered from `SupportOpsWorkspace`. This causes residual mixed-language UI when Master locale is EN (technical context footer).

**Decision:** **Deferred** (same principle as P2.2.9 CreateSupportTicketDialog inclusion rule). The five-file slice is fully localized; Phase B is documented as non-blocking residual observation.

**Minimal touch:** Broken `formatDateTime` import fixed via shared `formatDateTimeDe` from `components/patterns/format-utils.ts` (build compatibility only).

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

**Blind-spot guard:** `hardcoded-copy-guard.test.ts` + `master-support-ops-localization.test.tsx` grep patterns mirroring P2.2.8/P2.2.9 utils guard.

## Dictionary accounting

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Canonical EN keys | 7018 | 7106 | +88 |
| Canonical DE keys | 7018 | 7106 | +88 |
| EN/DE parity | 100% | 100% | — |
| New namespace | — | `support.ops.*` (88 keys) | +88 |
| Reused families | — | `support.status*`, `support.prio*`, `support.cat*`, `support.sender*`, `support.time.*`, entity keys | — |

## Scanner accounting

| Metric | Before (`d78a6bab`) | After | Delta |
|--------|---------------------|-------|-------|
| Global findings | 1920 | 1900 | −20 |
| Master | 1069 | 1049 | −20 |
| Rental | 610 | 610 | 0 |
| Operator | 180 | 180 | 0 |
| SHARED | 35 | 35 | 0 |
| SHELL | 26 | 26 | 0 |
| P210 enforce-clean (5 files) | n/a (not bounded) | **0** | clean |
| P29 enforce-clean | 0 | 0 | preserved |
| P28 enforce-clean | 0 | 0 | preserved |
| P27B enforce-clean | 0 | 0 | preserved |
| Global enforce-clean remaining | 0 | 0 | preserved |

## Machine-semantic verification

Preserved unchanged:

- `SupportQueueId` union and queue switch semantics
- `buildTicketListParams` output for all queue/filter combinations
- Status / priority / category machine enums and API param keys
- `normalizeStatusKey`, `normalizePriorityKey`, `normalizeCategoryKey`
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

| Cat | Count | Notes |
|-----|-------|-------|
| A | Yes | Component `useLanguage()` wiring; `support-ops-i18n.ts` adapter |
| B | Yes | `support.ops.{en,de}.ts`; spreads in `en.ts` / `de.ts` |
| C | Yes | `master-support-ops-localization.test.tsx`; guard test extensions |
| D | Yes | `P210_ENFORCE_CLEAN_EXACT` in scan + guard |
| E | **0** | No business/runtime semantic changes |
| F | Yes | This audit; `I18N_MASTER_SUPPORT_OPS_P2_2_10_2026-08-20.md`; Changes/Architektur |

## Tests and validation

| Check | Result |
|-------|--------|
| `master-support-ops-localization.test.tsx` (17 tests) | PASS |
| `hardcoded-copy-guard.test.ts` (P210 scope) | PASS |
| P27B / P28 / P29 regression guards | PASS |
| `npm run i18n:check` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

## Residual observations (non-blocking)

1. **Phase B:** `SupportTechnicalContextCard` German-hardcoded labels remain — mixed EN/DE when locale=EN and ticket selected.
2. **`master/components/SupportView.tsx`:** `assigneeName` fallback `'Nicht zugewiesen'` outside P210 scope — pre-existing.
3. **`support.ops.queue.header`:** EN value `"Queues"` retained in DE dictionary (operational term — matches pre-flight DE inbox title pattern).

## Final verdict

**B — IMPLEMENTATION COMPLETE WITH NON-BLOCKING OBSERVATIONS — READY FOR INDEPENDENT RE-AUDIT**

Phase B residual mixed-language in technical context card is documented and intentionally deferred per slice rules.
