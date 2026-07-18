# Voice AI — Operations overview & conversation center (7A)

**Date:** 2026-07-18  
**Scope:** Post-activation rental org voice operations UI

## Summary

The active organization voice surface is structured as an operational command center with eight overview sections and a dedicated conversation center. Customer-facing UI no longer exposes provider sync actions, raw provider identifiers, or inline full transcripts.

## Overview information architecture

1. **Status hero** — `VoiceStatusHero`
   - Operational status: Active / Degraded / Suspended (from `VoiceWorkspaceView.primaryState`, rollout, connection, readiness)
   - Reachability from business hours + telephony snapshot
   - Masked phone number
   - Last successful finalized call
   - Action-needed list (escalations, readiness, minutes, telephony)

2. **Today's performance** — finalized conversations only via `computeTodayKpis`
   - Calls, AI resolved, forwarded, callbacks, average duration, minutes consumed

3. **Minutes & forecast** — `billing.remainingMinutes`, `billing.forecast`

4. **Open escalations** — escalated finalized calls without linked task

5. **Recent conversations** — last five finalized calls, opens drawer via conversations tab

6. **Current problems** — provider, readiness, minutes, protection budget, blocking workspace issues

7. **Automation activity** — enabled permission groups + recent `actionsPerformed`

8. **Quick actions** — conversations, analytics, telephony settings, budget settings

## Conversation center

- Table columns: direction, customer/booking refs, intent, outcome, duration, time, follow-up, estimated cost, privacy status
- Filters: period, direction, outcome, intent (client), escalation, errors (client), search (API)
- **Detail drawer** (`VoiceConversationDetailDrawer`): summary, timeline, links, tool actions, tasks, cost, sanitized provider status, collapsible transcript with access notice, audio only when recording policy allows
- Task creation via existing `api.tasks.create`

## Data rules

- **Finalized only** for KPIs: `isFinalizedConversation` excludes `PENDING`, `active`, and legacy diagnostic Twilio SAY calls
- **No provider IDs** in customer UI (API may still return them; UI does not render)
- **Sync from ElevenLabs** removed from customer actions; sync remains available only in analytics diagnostics path if needed server-side

## Frontend modules

| Module | Role |
|--------|------|
| `voice-ops-overview.ops.ts` | Hero status, reachability, today KPIs, escalations, automation summary |
| `voice-conversation.utils.ts` | Finalization, privacy, intent, cost estimate, timeline |
| `VoiceStatusHero.tsx` | Status hero section |
| `VoiceOperationsOverview.tsx` | Full overview layout |
| `VoiceConversationsPanel.tsx` | Filterable table + pagination |
| `VoiceConversationDetailDrawer.tsx` | Conversation detail sheet |
| `VoiceCommandHeader.tsx` | i18n header without provider branding/sync |

## APIs used

- `GET /voice-assistant/conversations`
- `GET /voice-assistant/billing/remaining-minutes`
- `GET /voice-assistant/billing/forecast`
- `GET /voice-assistant/billing/usage` (cost estimate rate)
- `GET /voice-assistant/protection/status`
- `POST /tasks` (follow-up from call)

## i18n

All customer copy under `voice.ops.*` and `voice.conversations.*` (DE/EN).
