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
| `support.ops.{en,de}.ts` | Canonical dictionary module (+88 keys) |

## i18n architecture

- React surfaces use `useLanguage().t()` from canonical `frontend/src/i18n/LanguageContext`.
- Master Support Ops **does not** import Rental `support-i18n.ts`.
- Utils layer returns machine values and/or `TranslationKey` metadata — no React hooks in utils.
- `support-ops-i18n.ts` reuses established `support.status*`, `support.prio*`, `support.cat*`, `support.sender*`, `support.time.*`, and entity keys where semantically correct.
- Master-specific presentation uses `support.ops.*`.
- Machine values preserved: `SupportQueueId`, status/priority/category enums, filter keys, API payloads, `buildTicketListParams` semantics.

## Phase B decision

`SupportTechnicalContextCard.tsx` remains German-hardcoded and is rendered from `SupportOpsWorkspace`. It causes residual mixed-language UI when Master locale is EN. Per P2.2.9 precedent, Phase B was **deferred** — the five-file slice is localized; technical context card is documented as follow-up. Import fix only: `formatDateTimeDe` from shared pattern utils (removed broken import from utils).

## Scanner

`P210_ENFORCE_CLEAN_EXACT` — 5 paths (utils + 4 components).  
Blind-spot grep guard on `support-ops.utils.ts` mirrors P2.2.8/P2.2.9 ops/utils pattern.

## Tests

`master-support-ops-localization.test.tsx` — EN/DE render, machine enum preservation, `buildTicketListParams`, dictionary parity, P210 enforce-clean, P27B/P28/P29 regression, utils blind-spot guard.

## Shim

Unchanged (29 total, 0 new compat consumers).
