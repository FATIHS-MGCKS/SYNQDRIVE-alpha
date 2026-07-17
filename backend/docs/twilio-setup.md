# Twilio — server-side SDK setup (SynqDrive)

Server-only integration groundwork for Twilio Programmable Voice / telephony. The official Node.js SDK (`twilio`) is installed in the NestJS backend workspace. **No live API calls are made during bootstrap** when credentials are unset.

## Required environment (API Key auth — not Account Auth Token)

| Variable | Description |
|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_API_KEY_SID` | API Key SID (created in the **IE1** region) |
| `TWILIO_API_KEY_SECRET` | API Key secret — server-only, never commit or log |
| `TWILIO_REGION` | Regional processing target. Default: `ie1` (Ireland) |
| `TWILIO_EDGE` | Edge location paired with region. Default: `dublin` |

All credential variables are **optional** until telephony features are enabled. Missing values must not fail application startup.

## Ireland (IE1) routing

SynqDrive targets European Twilio processing:

- `region: 'ie1'`
- `edge: 'dublin'` (required companion to `ie1`)
- API Key credentials must be created in the **IE1** region in the Twilio Console
- **Do not** set `region` and `edge` independently in production — they are a fixed pair

Future client initialization (no network until an API method is called):

```typescript
import twilio = require('twilio');

const client = twilio(apiKeySid, apiKeySecret, {
  accountSid,
  region: 'ie1',
  edge: 'dublin',
});
```

The shared factory `getTwilioClient()` in `src/config/twilio-client.util.ts` applies the same defaults and returns `null` when credentials are incomplete.

## Security

- Never use the Twilio **Account Auth Token** in SynqDrive — API Key auth only
- Never expose credentials to the frontend bundle
- Never log `TWILIO_API_KEY_SECRET` or full API keys
- Placeholders only in `.env.example`; real values in server `.env` / VPS `backend.env`

## Related modules

- **Voice Assistant** (`modules/voice-assistant`) — ElevenLabs agents/telephony today; Twilio may complement outbound/inbound PSTN in a later phase
- **WhatsApp** (`modules/whatsapp`) — Meta Cloud API (separate from Twilio SMS/Voice)
