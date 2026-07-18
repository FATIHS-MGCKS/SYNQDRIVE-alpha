# Voice AI — Master organization operations workspace (8B)

**Date:** 2026-07-18  
**Scope:** Per-organization Master Admin voice operations workspace replacing the simple drawer

## Summary

The Master Admin org detail is now a full **Voice Operations Workspace** with eight tabs, a ten-step provisioning pipeline, and fachlich klare sichere Write-Aktionen.

## Workspace tabs

| Tab | Content |
|-----|---------|
| Übersicht | Readiness, telephony, subscription, warnings, KPIs |
| Provisionierung | 10-step stepper + background jobs |
| Telefonnummern | Masked numbers, regulatory, provider accounts |
| Agent | Draft/diff summary, publish, rollback |
| Gespräche | Recent conversations (no transcripts) |
| Usage & Billing | Plan, period, minutes, costs, margin, forecast, budget |
| Events | Org-scoped webhooks, DLQ, replay |
| Audit | Protection audit + master audit events |

## Provisioning stepper (10 steps)

1. Voice Subscription  
2. Twilio Subaccount  
3. Regulatory Setup  
4. Phone Number  
5. ElevenLabs Agent  
6. Number Assignment  
7. MCP Connection  
8. Webhooks  
9. Test  
10. Activation  

Status derived client-side from `VoiceControlPlaneOrgWorkspace` (subscription, provider accounts, phone numbers, jobs, readiness, telephony).

Each step exposes: status, prerequisites, last change, responsible resource, error, retry action where applicable.

## Secure write actions

All destructive or provider mutations use `VoiceSecureActionDialog`:

- Explicit confirmation checkbox
- Mandatory reason (except status refresh)
- Idempotency-Key on API calls
- Audit via existing backend protection/control-plane paths

**Action labels (examples):**

- Provisionierungsstatus aktualisieren  
- Fehlgeschlagenen Schritt erneut versuchen  
- Agent-Version veröffentlichen  
- Webhook-Ereignis erneut verarbeiten  
- Voice-Dienste sperren (destruktiv)

## URL state

- `?voiceSection=organizations&voiceOrgId=<id>&voiceOrgTab=<tab>`
- Deep link restores workspace on load and `popstate`

## Frontend modules

| Module | Role |
|--------|------|
| `VoiceOrgWorkspace.tsx` | Full-screen workspace shell |
| `voice-org-workspace-navigation.ts` | Tab + URL helpers |
| `voice-org-provisioning.ops.ts` | 10-step derivation |
| `voice-org-workspace.actions.ts` | Secure action builders |
| `VoiceOrg*Tab.tsx` | Tab panels |

## Security

- `MASTER_ADMIN` guard unchanged
- Masked phone numbers and technical IDs
- No transcripts, secrets, or raw webhook payloads in UI
- No free-form provider ID input
