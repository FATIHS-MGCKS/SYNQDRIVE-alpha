# Twilio — Voice Assistant PSTN integration (SynqDrive)

Server-only Twilio Programmable Voice layer for org-scoped Voice Assistant telephony. **ElevenLabs remains the AI agent provider**; Twilio handles PSTN numbers, inbound webhooks, outbound call initiation, and call-status tracking.

## Architecture

| Layer | Provider | Responsibility |
|-------|----------|----------------|
| AI agent / voice / conversations | ElevenLabs | Agent provisioning, signed test URL, conversation sync |
| PSTN numbers / call control | Twilio (optional) | Phone numbers, inbound TwiML, outbound calls, status callbacks |
| Orchestration | `VoiceAssistantService` | Org-scoped assign/unassign, readiness, telephony settings |

When `pstnProvider=TWILIO`, inbound calls hit `/api/v1/webhooks/twilio/voice` and receive TwiML built from the assistant greeting (ElevenLabs agent metadata preserved for future SIP/stream bridge).

## Required environment

| Variable | Description |
|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_API_KEY_SID` | API Key SID (created in **IE1**) — REST SDK |
| `TWILIO_API_KEY_SECRET` | API Key secret — REST SDK only, never log |
| `TWILIO_AUTH_TOKEN` | **Webhook signature validation only** — not used for REST client |
| `TWILIO_REGION` | Default `ie1` |
| `TWILIO_EDGE` | Default `dublin` — fixed pair with `ie1` |
| `TWILIO_VOICE_WEBHOOK_BASE_URL` | Public app base (e.g. `https://app.synqdrive.eu`); falls back to `APP_URL` |

All variables are optional until telephony is enabled. Missing values must not fail application bootstrap.

## Ireland (IE1) routing

- `region: 'ie1'` + `edge: 'dublin'` — always configure together
- API Key credentials must be created in the IE1 region
- Client factory: `getTwilioClient()` in `src/config/twilio-client.util.ts`

## API surface

### Org-scoped (JWT + `OrgScopingGuard`)

- Existing voice-assistant telephony routes unchanged
- `POST .../phone-number/assign` — optional body `{ provider: 'elevenlabs' | 'twilio' }`
- `POST .../twilio/outbound-call` — `{ to: '+49...' }` when Twilio PSTN + outbound enabled

### Public webhooks (signature validated when `TWILIO_AUTH_TOKEN` set)

- `POST /api/v1/webhooks/twilio/voice` — inbound TwiML
- `POST /api/v1/webhooks/twilio/status` — call status + conversation metrics

## Module layout

```
backend/src/modules/twilio/
  twilio.module.ts
  twilio.service.ts
  twilio-telephony.service.ts
  twilio-webhook.controller.ts
  twilio-webhook.service.ts
  twilio-voice-bridge.service.ts
  twilio-voice-twiml.util.ts
  twilio-signature.util.ts
```

`VoiceAssistantModule` imports `TwilioModule`.

## Security

- Never log `TWILIO_API_KEY_SECRET` or `TWILIO_AUTH_TOKEN`
- Never expose Twilio credentials to the frontend
- Webhook routes are public but HMAC-validated in production when auth token is configured
- No Account Auth Token for REST — API Key auth only

## Prisma

- `VoiceAssistant.pstnProvider` — `ELEVENLABS` (default) or `TWILIO`
- `VoiceAssistant.twilioPhoneNumberSid`
- `VoiceConversation.twilioCallSid`
- `TwilioWebhookEvent` — idempotent webhook audit

## Related

- `modules/voice-assistant/README.md` — ElevenLabs activation & readiness
- `modules/whatsapp` — separate Meta Cloud API channel
