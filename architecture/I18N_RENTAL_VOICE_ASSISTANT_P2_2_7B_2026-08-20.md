# I18N Rental Voice Assistant P2.2.7B — Telephony + Test Center

**Date:** 2026-08-20
**Version:** V4.9.928
**Baseline:** P2.2.7A merged @ `77047cfa`

## Scope

| File | Role |
|------|------|
| `VoiceTelephonyWizard.tsx` | ElevenLabs telephony setup wizard (presentation) |
| `VoiceTestCenter.tsx` | Signed test session UI + operator scenarios |
| `voice-test-scenarios.ts` | Scenario machine metadata + translation key refs |
| `voice-assistant-i18n.ts` | Presentation mappers for phases, verdicts, scenarios |

## i18n architecture

- React surfaces use `useLanguage().t()` from `../../../i18n/LanguageContext` (canonical, no shim).
- Scenario copy resolves at render time via `localizedVoiceTestScenarios(locale, definitions)` so locale switches remain dynamic.
- Machine values preserved: API payload keys (`telephonyEnabled`, `inboundEnabled`, `outboundEnabled`), `phoneNumberId`, `SessionPhase`, `TestVerdict` ids, `VoiceTab` routing, scenario `id`, `res.status === 'blocked'`.

## Scanner

`P27B_ENFORCE_CLEAN_EXACT`:

- `rental/components/voice-assistant/VoiceTelephonyWizard.tsx`
- `rental/components/voice-assistant/VoiceTestCenter.tsx`
- `rental/components/voice-assistant/voice-test-scenarios.ts`

## Key reuse (implementation)

| Reused key | Used for |
|------------|----------|
| `voice.nav.tab.test` | Test Center page title |
| `voice.wizard.step.phone` | Telephony wizard step 3 title |
| `common.cancel` | Outbound confirm cancel |
| `voice.status.operator.error` | Wizard step error + test session error phase |
| `voice.checklist.elevenlabs.label` | Test Center provider row (connected) |
| `voice.status.telephony.notConnected` | Test Center provider row (disconnected) |

Ambiguous decisions:

- **Open Test Center** → new `voice.telephony.openTestCenter` (action verb vs nav label)
- **Test Center subtitle** → new `voice.test.subtitle` (distinct from `voice.launch.subtitle` context)

## Tests

`rental-voice-assistant-telephony-test-center-localization.test.tsx` — EN/DE component render, scenario localization, P2.2.7B enforce-clean guard, no shim imports.
