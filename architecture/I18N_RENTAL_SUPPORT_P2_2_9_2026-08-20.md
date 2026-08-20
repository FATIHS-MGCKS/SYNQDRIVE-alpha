# I18N Rental Support Center P2.2.9

**Date:** 2026-08-20
**Version:** V4.9.931
**Baseline:** Post–P2.2.8 @ `a9e2a879`

## Scope

| File | Role |
|------|------|
| `SupportView.tsx` | Support Center shell + dialog orchestration |
| `support/SupportCenterHero.tsx` | Hero, KPIs, quick-issue cards |
| `support/SupportTicketInbox.tsx` | Filters, list, empty states |
| `support/SupportTicketDetailPanel.tsx` | Thread, reply, reopen |
| `support/support-center.utils.ts` | Machine filters/stats + `QUICK_ISSUE_CARD_DEFS` with translation keys |
| `support/support-i18n.ts` | Presentation mappers (`su`, status/priority/category labels, relative time) |
| `components/support/CreateSupportTicketDialog.tsx` | Shared create dialog (Phase B — rental create flow) |
| `support.{en,de}.ts` | Canonical dictionary module (+127 keys) |

## i18n architecture

- React surfaces use `useLanguage().t()` from canonical `frontend/src/i18n/LanguageContext`.
- Utils layer returns machine values and/or `TranslationKey` metadata — no React hooks in utils.
- `support-i18n.ts` provides non-React helpers for inbox previews and master adapter reuse.
- Machine values preserved: status/priority/category enums, filter keys, API payloads, persisted ticket fields.

## Scanner

`P29_ENFORCE_CLEAN_EXACT` — 8 paths (7 rental + shared create dialog).

Blind-spot guard: `hardcoded-copy-guard.test.ts` greps `support-center.utils.ts` for banned presentation literals.

## Key reuse

| Reused key | Used for |
|------------|----------|
| `support.statusInProgress` | IN_PROGRESS |
| `support.statusResolved` | RESOLVED |
| `support.statusClosed` | CLOSED |
| `support.prioLow` / `support.prioHigh` / `support.prioCritical` | Priority labels |
| `support.cancel` / `support.submitTicket` | Create dialog actions |

New semantic key: `support.statusNew` for rental inbox `OPEN` (“New” / “Neu”).

## Tests

`rental-support-center-localization.test.tsx` — EN/DE component render, i18n helper coverage, relative time interpolation, machine-key preservation, P2.2.9 enforce-clean guard, create dialog copy.
