# Voice Budget, Limit, and Abuse Protection (Prompt 8B)

**Date:** 2026-07-17  
**Status:** Accepted  
**Scope:** Server-side enforcement — not UI-only limits

## Context

Prompt 8A delivered plan catalog, usage ledger, and billing APIs. Outbound policy existed only as basic subscription/budget/destination checks in `VoiceCallPolicyService`.

## Decision

Introduce `voice-protection` module with:

### Limits (server-enforced)
- Max conversation duration (flag only — active calls not terminated)
- Daily outbound minutes
- Monthly budget with hard stop + optional grace minutes
- Max concurrent calls (Redis SET + Lua, race-safe)
- Max repeats per destination + cooldown (Redis)
- Plan entitlements (`maxConcurrentCalls` from catalog)

### Destination policy
- Default `DE_EEA`; `DE_ONLY` and `CUSTOM` supported
- Premium/special number prefix blocklist
- E.164 normalization required
- No free caller-ID manipulation in enforcement path

### Warnings
- Thresholds: 70%, 85%, 100% of included minutes
- Period-end forecast projection
- Org admin activity-log entries
- Master Admin anomaly flag via audit when trajectory > 150% included

### Hard limits
- Outbound blocked at hard limit (`HARD_STOP`) unless grace minutes remain
- Inbound degrades to safe TwiML fallback (no abrupt disconnect)
- Active calls never force-terminated by duration checks

### Abuse detection
Signals audited (not auto-blocking unless combined with limits): short-call burst, failed targets, international cost, parallel spike, forwarding loop, long call.

### Audit
`VoiceProtectionAuditEvent` for blocks, warnings, policy updates, overrides. Master Admin overrides require reason + `expiresAt`.

## APIs

| Route | Role |
|-------|------|
| `GET/PATCH .../voice-assistant/protection/*` | Org admin |
| `GET/POST /admin/voice-assistant/protection/*` | Master Admin |

## Enforcement hooks

- Before outbound (`VoiceCallPolicyService` → `VoiceBudgetEnforcementService`)
- On activation (`VoiceAssistantService.activateAssistant`)
- During calls (`VoiceConversationLifecycleService` progress + release slot)
- After usage metering (`VoiceBudgetWarningService`)

## Migration

`20260717290000_voice_budget_abuse_protection`
