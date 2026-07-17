# Voice AI Plans, Entitlements, and Usage Ledger (Prompt 8A)

**Date:** 2026-07-17  
**Status:** Accepted  
**Scope:** Voice billing control plane (separate from vehicle pricing / rental tariffs)

## Context

Prompts 7A–7B established webhook ingestion and native Twilio–ElevenLabs orchestration.  
`VoiceSubscription`, `VoiceUsageEvent`, and `VoiceBillingPeriod` existed as schema/repos only.  
Platform billing (`billing/`) exposes a `VOICE_AGENT` addon but does **not** own per-minute Voice AI metering.

## Decision

Implement a dedicated `voice-billing` module as the single source for:

1. **Versioned plan catalog** (`voice-plan-catalog.ts`, version `2026-07-17`)
2. **Subscription lifecycle** — `TRIAL`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELLED` (+ legacy `PENDING`)
3. **Usage ledger** — seconds raw, 6s grace + minute round-up, idempotent rows, inbound/outbound split
4. **Cost engine** — Twilio / ElevenLabs / LLM columns; conservative `0.12 €/min` fallback; never overwrite `FINAL`
5. **Customer pricing** — included minutes, overage, monthly forecast, margin
6. **APIs** — tenant usage / remaining / forecast; Master Admin org billing with cost + margin

No Stripe product auto-provisioning. Setup fee stored on subscription, separate from monthly base.

## Plan catalog (EUR net)

| Plan | Monthly | Included min | Overage/min | Numbers | Branches | Concurrent | Setup |
|------|---------|--------------|-------------|---------|----------|------------|-------|
| START | 49 € | 100 | 0,35 € | 1 | 1 | 1 | 149 € |
| PRO | 119 € | 400 | 0,29 € | 1 | 2 | 2 | 249 € |
| BUSINESS | 249 € | 1.000 | 0,25 € | 2 | ∞ | 5 | 499 € |

Languages entitlement: `de`, `en` (all plans).

## Metering

- Raw: `billableSeconds` on `VoiceUsageEvent`
- Customer minutes: `0` if `seconds ≤ 6`, else `ceil(seconds / 60)`
- Inbound + outbound both debit included pool
- Provider usage dedup: `@@unique([organizationId, idempotencyKey])` and `@@unique([provider, externalUsageRef])`

## Recording hook

`VoiceConversationLifecycleService` records usage when a conversation reaches `COMPLETED` with `durationSeconds > 0`.

## APIs

| Route | Audience |
|-------|----------|
| `GET /organizations/:orgId/voice-assistant/billing/usage` | Tenant |
| `GET /organizations/:orgId/voice-assistant/billing/remaining-minutes` | Tenant |
| `GET /organizations/:orgId/voice-assistant/billing/forecast` | Tenant |
| `GET /admin/voice-assistant/billing/organizations/:orgId` | Master Admin (costs + margin) |

## Migration

`20260717280000_voice_plans_usage_ledger` — enum values, subscription setup/plan-change columns, usage cost splits, billing period aggregates.

## Out of scope (8B+)

- Stripe invoice generation for Voice plans
- `VOICE_AI_BILLING_ENFORCEMENT` feature flag wiring to platform addon
- Frontend billing UI beyond existing admin overview flag
