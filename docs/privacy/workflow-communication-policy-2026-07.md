# Workflow Communication Policy Engine

**Version:** V4.9.849 (Phase 9, Prompt 39)  
**Date:** 2026-07-25  
**Status:** Production architecture

## Purpose

SynqDrive routes all automated customer contacts (email, SMS, WhatsApp, voice) through a **central communication policy engine** before planning and immediately before provider send. The engine is authoritative — clients and workflow definitions cannot bypass it.

> **Legal notice:** Legal basis references in this system are **configurable documented codes only**. SynqDrive does not provide legal advice. Organizations must configure and maintain their own legal basis documentation.

## Decision outcomes

| Decision | Meaning |
|----------|---------|
| `ALLOW` | Send may proceed |
| `ALLOW_WITH_APPROVAL` | Permitted only after workflow approval (`runApproved`) |
| `DELAY_UNTIL` | Retry after `delayUntil` (quiet hours, frequency, rate limit) |
| `FALLBACK_CHANNEL` | Primary channel blocked; use `fallbackChannel` (e.g. WhatsApp → SMS) |
| `SUPPRESS` | Do not send; silent suppression (opt-out, special block, prior success) |
| `DENY` | Hard block with auditable reason |

Each result includes:

- `reasonCode` — machine-readable code
- `explanation` — human-readable (non-legal-advice) message
- `snapshot` — auditable policy snapshot with `snapshotHash`

## Evaluation phases

1. **Plan** (`phase: 'plan'`) — dry-run, call plan, workflow preview
2. **Pre-send** (`phase: 'pre_send'`) — immediately before provider adapter invocation

Pre-send re-evaluates consent/opt-out and compares against the frozen snapshot from planning. A later opt-out or policy change yields `POLICY_CHANGED_PRE_SEND` → `DENY`.

## Checks applied (in order)

1. `organizationId` / tenant isolation (`TENANT_VIOLATION`)
2. Special blocks (`SPECIAL_BLOCK` → `SUPPRESS`)
3. Channel enabled + permission (`CHANNEL_DISABLED`, `CHANNEL_NOT_PERMITTED`)
4. Processing purpose — marketing blocked in workflow automation (`MARKETING_BLOCKED`)
5. Legal basis reference (catalog only — `LEGAL_BASIS_MISSING`, `LEGAL_BASIS_UNKNOWN`, purpose mismatch)
6. Booking/contract reference for transactional purpose (`BOOKING_REF_MISSING`)
7. Recipient validation (`RECIPIENT_NOT_VALIDATED`)
8. Opt-out (`OPT_OUT` / `SUPPRESSED` for email suppression list)
9. Opt-in when required (`OPT_IN_REQUIRED`)
10. Communication preference / fallback (`FALLBACK_AVAILABLE`, `COMMUNICATION_PREFERENCE_MISMATCH`)
11. Country/provider restrictions
12. Prior successful contact suppression
13. Quiet hours (`QUIET_HOURS` → `DELAY_UNTIL`)
14. Contact frequency (`CONTACT_FREQUENCY` → `DELAY_UNTIL`)
15. Organization rate limit (`RATE_LIMIT` → `DELAY_UNTIL`)
16. AI transparency (`AI_TRANSPARENCY_REQUIRED`)
17. Policy snapshot compatibility at pre-send (`POLICY_CHANGED_PRE_SEND`)
18. Approval (`APPROVAL_REQUIRED` → `ALLOW_WITH_APPROVAL`)

## Legal basis catalog

Configured in `workflow-communication-policy.config.ts`:

| Code | Allowed purposes |
|------|------------------|
| `gdpr.art6.1.b.contract` | transactional, operational |
| `gdpr.art6.1.f.legitimate_interest` | transactional, support, operational |
| `gdpr.art6.1.a.consent` | marketing, support |
| `gdpr.art6.1.c.legal_obligation` | transactional, operational |

Organizations should map workflow templates to these references in future org settings UI. Until then, channel adapters default to `gdpr.art6.1.b.contract` for transactional messages.

## Architecture

```
Workflow Action Handler
  └─ Channel Send Service (email/sms/whatsapp/voice)
       ├─ Consent / recipient resolution
       ├─ Channel Policy Service (thin DB adapter)
       │    └─ WorkflowCommunicationPolicyEngineService.evaluate()
       ├─ assertSendPermitted()  ← mandatory before provider
       └─ Provider Adapter (Twilio, Resend, Meta, Voice Orchestrator)
```

### Module location

- `backend/src/modules/workflows/communication-policy/`
  - `workflow-communication-policy-engine.service.ts` — central evaluator
  - `workflow-communication-policy.types.ts` — decisions, reason codes, snapshot
  - `workflow-communication-policy.config.ts` — legal basis catalog, quiet hours defaults
  - `workflow-communication-policy.quiet-hours.ts` — timezone-aware quiet hours
  - `workflow-communication-policy.snapshot.ts` — snapshot builder + compatibility check

Channel-specific wrappers (gather DB state, frequency counts):

- `workflow-sms-communication-policy.service.ts`
- `workflow-whatsapp-communication-policy.service.ts`
- `workflow-email-communication-policy.service.ts`
- `workflow-voice-call-communication-policy.service.ts`

## Provider adapter rule

Provider adapters **must** receive a policy result where `decision` is `ALLOW` or `ALLOW_WITH_APPROVAL` (with `runApproved`). `WorkflowCommunicationPolicyEngineService.assertSendPermitted()` enforces this and throws `ForbiddenException` / `BadRequestException` — no silent bypass.

## Transactional vs marketing separation

- Workflow automation **blocks marketing** on all channels (`MARKETING_BLOCKED`).
- Transactional sends require booking/contract reference when `requireBookingOrContractRef` is set.
- Marketing legal basis codes cannot be used for transactional purpose (and vice versa).

## Tests

`workflow-communication-policy-engine.spec.ts` covers:

- Opt-out
- Channel not allowed
- Quiet hours / delay
- Contact frequency
- Missing booking reference
- Approval required
- Policy change before send
- Foreign tenant
- Fallback channel
- Marketing blocked

Channel integration tests in existing workflow action specs (sms, email, whatsapp, voice).

## Required organizational configuration (legal/ops)

Organizations must still configure outside this engine:

1. **Legal basis documentation** — maintain LIA/consent records mapped to catalog codes
2. **Org timezone** — `Organization.timezone` for quiet hours
3. **Channel credentials** — SMS/WhatsApp/email/voice provider setup
4. **Consent records** — `SmsConsent`, `WhatsAppConsent`, email suppression list
5. **Voice business hours** — `VoiceAssistant.businessHours` for outbound calls
6. **Approval workflows** — for high-risk or AI-generated communications
7. **Retention policies** — align `retentionClass` with org DPA (future org UI)

## Related docs

- `docs/ai/workflow-ai-communication-governance-2026-07.md` — AI pipeline (feeds into policy)
- `docs/integrations/workflow-sms-action-2026-07.md`
- `docs/integrations/workflow-voice-action-2026-07.md`
- `docs/architecture/workflow-action-policies-2026-07.md` — action-level technical policies
