# Changes & Architektur — Voice Plan & Assistant Onboarding (2026-07-18)

## Changes

- **Plan step (`VoiceWizardPlanStep`)** — redesigned with `voice-ui` primitives: comparison table (desktop), stacked cards (mobile), recommended PRO badge, current plan + pending change notices, net-price note, usage examples, plan-change confirmation dialog. All prices/limits from `GET billing/plans` + `subscription`.
- **Assistant step (`VoiceWizardAssistantStep`)** — dedicated onboarding surface replacing full `VoiceAssistantBuilder` in wizard: name, company, languages (plan-gated), voice picker with grouped optgroups, safe audio preview (rate-limited `preview_url`), greeting/sample-call previews, pronunciation hints, draft/live badges.
- **Ops modules** — `voice-plan-onboarding.ops.ts`, `voice-assistant-onboarding.ops.ts` (validation, language metadata in `companyContext`, preview rate limit).
- **Wizard** — assistant step blocks “Next” until validation passes; `isWizardStepComplete('assistant')` requires `role` (company name).
- **i18n** — full DE/EN for `voice.plan.*` extensions and `voice.assistant.onboarding.*`.

## Architektur

### Data flow

```
VoiceWizardPlanStep
  → billing.plans + billing.subscription
  → PUT billing/subscription on select (with change confirm)

VoiceWizardAssistantStep
  → controlled fields → PATCH voice-assistant (draft)
  → companyContext stores [languages] + [pronunciation] blocks
  → voice preview: client Audio(preview_url) only — no outbound call
  → live deployment unchanged until agent deploy / activate
```

### Settings vs onboarding

- **Wizard assistant step** — slim onboarding (`VoiceWizardAssistantStep`)
- **Settings → assistant** — full `VoiceAssistantBuilder` (advanced fields deferred)

### Security

- Voice sample preview uses provider `preview_url` in browser; `VOICE_PREVIEW_MIN_INTERVAL_MS` client throttle.
- No agent IDs or provider branding in onboarding UI.
