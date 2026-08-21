# I18N Master Support Ops P2.2.10

**Date:** 2026-08-20  
**Version:** V4.9.932  
**Baseline:** Post–P2.2.9 @ `d78a6bab`

## Scope

| File | Role |
|------|------|
| `support-ops.utils.ts` | Machine queue/filter/query logic + `SUPPORT_QUEUE_DEFS` with translation keys |
| `support-ops-i18n.ts` | Master-owned presentation helpers (`so`, status/priority/category labels, duration/time) |
| `SupportOpsWorkspace.tsx` | Ticket workspace, composer, meta panel |
| `SupportOpsInbox.tsx` | Filters, list, pagination, empty/error states |
| `SupportOpsQueue.tsx` | Queue sidebar + mobile chips |
| `SupportOpsKpis.tsx` | KPI strip |
| `SupportTechnicalContextCard.tsx` | Phase B — technical context panel (mixed-language fix) |
| `support.ops.{en,de}.ts` | Canonical dictionary module (96 keys) |

## i18n architecture

- React surfaces use `useLanguage().t()` from canonical `frontend/src/i18n/LanguageContext`.
- Master Support Ops **does not** import Rental `support-i18n.ts`.
- Utils layer returns machine values and/or `TranslationKey` metadata — no React hooks in utils.
- `support-ops-i18n.ts` reuses established `support.status*`, `support.prio*`, `support.cat*`, `support.sender*`, `support.time.*`, and entity keys where semantically correct.
- Master-specific presentation uses `support.ops.*`.
- Machine values preserved: `SupportQueueId`, status/priority/category enums, filter keys, API payloads, `buildTicketListParams` semantics.

## Phase B

`SupportTechnicalContextCard.tsx` is rendered from `SupportOpsWorkspace`. Pre-localization it caused confirmed EN/DE mixed-language UI (German labels under EN locale). Phase B localizes all presentation copy via `support.ops.technicalContext.*` plus reused `support.entity*`, `common.yes`/`common.no`, and `support.time.emDash`. Technical metadata values remain raw machine strings.

## Key audit summary

| Item | Count |
|------|-------|
| Original first-pass `support.ops.*` keys | 88 |
| Replaced by existing canonical keys (B) | 6 |
| Removed as duplication (C) | 1 |
| Phase B additions (A) | 15 |
| Final `support.ops.*` module | 96 |
| Net canonical delta | +96 (7018→7114) |

## Scanner

`P210_ENFORCE_CLEAN_EXACT` — 6 paths (5 master support-ops + Phase B card).  
Blind-spot grep guards on `support-ops.utils.ts` and `SupportTechnicalContextCard.tsx`.

## Tests

`master-support-ops-localization.test.tsx` — 21 tests: EN/DE render, machine enum preservation, `buildTicketListParams`, dictionary parity, Phase B EN/DE + no German in EN surface, P210 enforce-clean, P27B/P28/P29 regression, utils blind-spot guard.

## Shim

Unchanged (29 total, 0 new compat consumers).
