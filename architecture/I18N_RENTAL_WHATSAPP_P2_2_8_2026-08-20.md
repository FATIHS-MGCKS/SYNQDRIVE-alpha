# I18N Rental WhatsApp Business P2.2.8

**Date:** 2026-08-20
**Version:** V4.9.930
**Baseline:** Post–P2.2.7B @ `48423155`

## Scope

| File | Role |
|------|------|
| `WhatsAppBusinessView.tsx` | Shell / tab orchestration / modals |
| `whatsapp/*.tsx` (15 components) | Inbox, chat, settings, templates, wizard, context |
| `whatsapp.ops.ts` | Machine keys + readiness defs (scanner blind spot) |
| `whatsapp-i18n.ts` | Presentation mappers (`wa`, nav/filter/status labels) |
| `whatsapp.{en,de}.ts` | Canonical dictionary module |

## i18n architecture

- React surfaces use `useLanguage().t()` from canonical `frontend/src/i18n/LanguageContext`.
- `whatsapp/` shells migrated shim → `../../../i18n/LanguageContext` (2 files).
- Ops copy resolves via `whatsapp-i18n.ts` helpers at render time.
- Machine values preserved: `InboxFilter` keys, `WhatsAppTab` IDs, template category enum keys (`BOOKING_CONFIRMATION`, …), delivery status codes (`QUEUED`, `SENT`, …), `aiMode` keys, API handover default reason (Category E).

## Scanner

`P28_ENFORCE_CLEAN_EXACT` — 18 paths (17 production + `whatsapp-i18n.ts`).

Blind-spot guard: `hardcoded-copy-guard.test.ts` greps `whatsapp.ops.ts` for banned presentation literals + `TranslationKey` usage.

## Key reuse

| Reused key | Used for |
|------------|----------|
| `nav.whatsappBusiness` | Sidebar (pre-existing) |
| `whatsapp.ai.description` | AI assistance description (relocated to module) |
| `common.cancel` | Modal cancel buttons |
| `common.save` | (available; no new Save surface added) |

## Tests

`rental-whatsapp-localization.test.tsx` — EN/DE component render, ops helper coverage, locale switch, machine-key preservation, P2.2.8 enforce-clean guard, shim migration check.
