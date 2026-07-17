# Voice AI Organization Onboarding & Operations UI (Prompt 9A)

**Date:** 2026-07-17  
**Status:** Accepted  
**Scope:** Rental organization UI for KI-Sprachassistent

## Decision

Replace the technical multi-tab setup with:

1. **First-time wizard (8 steps)** while `VoiceAssistant.status !== ACTIVE`
2. **Operations shell (5 tabs)** after activation

Wizard steps map to existing backend capabilities — no mock states.

| Step | UI | APIs |
|------|-----|------|
| Tarif | `VoiceWizardPlanStep` | `GET billing/plans`, `PUT billing/subscription`, `GET billing/usage` |
| Assistent | `VoiceAssistantBuilder` | `PATCH voice-assistant`, `GET voices` |
| Wissen | `VoiceWizardKnowledgeStep` | stations, rental rules, pricing catalog |
| Zugriffsrechte | `VoicePermissionGroupsPanel` | `PATCH toolPermissions` |
| Telefonnummer | `VoiceTelephonyWizard` | phone-numbers, assign, telephony-settings |
| Erreichbarkeit | wizard panel | escalation + business hours fields |
| Tests | `VoiceTestCenter` | test-session |
| Aktivierung | checklist + `POST activate` | readiness, protection status, budget policy |

Post-activation tabs:

- **Overview** — status, today's calls, AI-resolved vs forwarded, remaining minutes, problems, recent calls
- **Conversations** — `VoiceConversationsPanel`
- **Automations** — grouped permissions
- **Analytics & usage** — analytics + billing usage/forecast
- **Settings** — builder + telephony

## Resume

`localStorage` key `synqdrive.voice-wizard.{orgId}` stores current wizard step.

## i18n

Full DE/EN keys under `voice.*` in rental translations.

## New tenant API

`PUT /organizations/:orgId/voice-assistant/billing/subscription` — select/create trial subscription for onboarding plan step (`ORG_ADMIN` / `SUB_ADMIN`).
