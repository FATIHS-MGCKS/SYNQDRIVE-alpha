# Voice AI — Legacy Semantics Fix (Prompt 1B)

**Date:** 2026-07-17  
**Prompt:** 1B von 22  
**Commit message:** `fix(voice): correct legacy provider and conversation semantics`

## Summary

Corrects confirmed semantic legacy bugs in the existing voice stack without introducing control-plane provisioning, subaccounts, or provider resource changes.

## Conversation lifecycle

- Added `VoiceConversationOutcome.PENDING` (default) to separate in-flight status from terminal outcomes.
- Twilio inbound/outbound conversations start as `ACTIVE` + `PENDING` with `LEGACY_TWIML_SAY` metadata (`productiveAiCall: false`, `aiProvider: null`).
- Legacy Twilio terminal statuses map to `ABANDONED`/`FAILED`, never `RESOLVED`.
- ElevenLabs sync only marks `RESOLVED` when a transcript exists; otherwise `ABANDONED`.
- Assistant counter increments are idempotent via `metadata.countersApplied`.

## Provider status

- `deriveConnectionStatus()` requires ElevenLabs configuration; Twilio-only env no longer yields `CONNECTED`.
- Admin overview exposes `elevenLabsConnected` and `twilioConnected` separately.
- Readiness checks include `verification: not_verified` when only env configuration is known.

## Analytics

- `getConversationAnalytics()` excludes legacy placeholder calls and duration-only rows from answered KPIs.
- Durations for analytics aggregate only answered (productive) conversations.

## Twilio placeholder

- TwiML includes explicit `LEGACY_TWIML_SAY` diagnostic comment.
- Telephony status for Twilio PSTN: `legacy_diagnostic_only` / “Diagnostic PSTN only”.

## Error contracts

- Twilio voice/status webhooks propagate `UnauthorizedException` (401) instead of returning HTTP 200 fallback TwiML on internal/signature failures.
- Test session API no longer returns signed ElevenLabs URLs in `developerDetails`.
- Webhook audit stores sanitized headers (no auth/cookie/api-key).

## Frontend

- Provider/telephony labels aligned to diagnostic Twilio path and separate provider checks.
- `PENDING` outcome supported in filters and badges.

## Tests

- Extended characterization/regression suites from Prompt 1A.
- New `voice-conversation-lifecycle.util.spec.ts`.

## Explicitly not changed

- No Twilio subaccount provisioning, number purchase, or ElevenLabs agent architecture changes.
- No `ChangesView.tsx` edits.
