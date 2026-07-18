# Voice AI — Knowledge Center & Permission Center (Prompt 5B)

**Date:** 2026-07-18  
**Scope:** Onboarding step 3 (Knowledge) and step 4 (Permissions)

## Knowledge Center

### Sources (13)

| ID | Origin | Domain API |
|----|--------|------------|
| `organization_profile` | static | `api.organizations.getProfile` |
| `stations` | live | `api.stations.list` |
| `opening_hours` | static | assistant config |
| `faq` | static | `assistant.knowledgeSnippets` |
| `rental_rules` | static | `api.rentalRules.overview` |
| `requirements` | static | `api.rentalRules.getDefaults` |
| `terms` | static | `api.legalDocuments.list` (TERMS_AND_CONDITIONS) |
| `pickup` / `return` | static | rental defaults notes |
| `deposit` / `payment_methods` | static | rental defaults |
| `emergency` | static | assistant escalation config |
| `approved_documents` | static | `api.legalDocuments.list` (ACTIVE) |

### Status semantics

- **CONNECTED** — source usable for voice answers
- **INCOMPLETE** — partial configuration
- **STALE** — profile older than 90 days
- **NOT_PUBLISHED** — missing or inactive publication
- **ERROR** — domain API failure (tenant-scoped)

### Security

- No full document text inlined in UI; safe preview opens via `api.legalDocuments.open(orgId, docId)` only when `sizeBytes ≤ 2MB`
- `sanitizeKnowledgeDisplayText` strips control characters and truncates display copy (prompt-injection mitigation for surfaced snippets)
- Cross-tenant isolation: all fetches use `orgId` from rental context

### Wizard readiness

Knowledge step complete when `connectedCount >= 6` (partial freshness threshold).

## Permission Center

### Business groups (7)

Maps to existing `VoiceToolCapabilityKey` entries — no duplicate domain data.

| Group | Capabilities |
|-------|----------------|
| Answer information | `answerGeneralQuestions`, `quotePrices` |
| Find customers & bookings | `customerLookup`, `bookingSearch` |
| Inspect vehicles & invoices | `customerLookup`, `bookingSearch` |
| Create follow-ups | `createTask`, `createDamageCase` |
| Request changes | `createBookingDraft`, `modifyBooking`, `cancelBooking` |
| Resend documents | `contactCustomer` |
| Involve staff | `emergencyEscalation`, `contactVendor`, `modifyRecords` |

### Modes

| UI mode | Backend modes |
|---------|----------------|
| Not allowed | `DISABLED` |
| Automatically allowed (read) | `SUGGEST_ONLY` for read capabilities |
| Customer confirmation | `SUGGEST_ONLY` (writes blocked for cancel/records) |
| Staff approval | mixed `SUGGEST_ONLY` / `AUTONOMOUS` per capability rules |

### MCP enforcement

`resolveAllowedMcpToolsForAssistant` filters `VOICE_MCP_TOOL_REGISTRY` — capabilities with `DISABLED` exclude tools server-side. UI impact summary uses `VOICE_MCP_TOOLS_BY_CAPABILITY` for transparency only.

### Audit

`PATCH /organizations/:orgId/voice-assistant` with `toolPermissions` writes `ActivityLog` entry:

- `metaJson.auditAction`: `VOICE_ASSISTANT_TOOL_PERMISSIONS_UPDATE`
- `changes[]`: `{ capability, from, to }`

## Frontend modules

- `voice-knowledge-center.ops.ts` — pure status assembly
- `useVoiceKnowledgeCenter.ts` — parallel domain fetches
- `VoiceKnowledgeCenterPanel.tsx` — mobile accordion + desktop grid
- `voice-permission-groups.ops.ts` — 7 groups + MCP summary
- `VoicePermissionGroupsPanel.tsx` — accordion/cards, examples, risk, impact

## Tests

- `voice-knowledge-center.ops.test.ts` — status, sanitization, preview limits
- `voice-permission-groups.ops.test.ts` — 7 groups, safe defaults, MCP summary
- `voice-permission-mcp.mapping.spec.ts` — capability → allowlist
- `voice-assistant.service.spec.ts` — permission audit on update
