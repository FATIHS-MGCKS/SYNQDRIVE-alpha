# Communication Center C0.2 — RBAC Implementation Record

**Phase:** C0.2 (Security / Authority Foundation)  
**Date:** 2026-08-21  
**Branch:** `feature/communication-center-c0-2-rbac`  
**Contract reference:** `architecture/COMMUNICATION_CENTER_CANONICAL_CONTRACT_V1.md` (C0.1)

---

## 1. Previous authority state

| Surface | Before C0.2 |
|---------|-------------|
| **WhatsApp tenant API** | All operational routes used `@RequirePermission('ai-assistant', read\|write)`; connect/disconnect used `data-authorization.manage` |
| **Voice tenant API** | Most routes: `OrgScopingGuard` + `RolesGuard` only — any ACTIVE org member (including DRIVER) could call operational endpoints |
| **Internal Fleet AI** | `/organizations/:orgId/chat/*` under `ai-assistant.*` |
| **Frontend nav** | WhatsApp + Voice visible to all authenticated rental users (no permission gates) |
| **Role templates** | `ai-assistant` in admin/worker key lists; no `communication` / `voice-assistant` modules |

---

## 2. New authority model

### Canonical modules

| Module | Levels | Semantics |
|--------|--------|-----------|
| `communication` | read / write / manage | External operational comms (WhatsApp ops, Voice conversations, MCP approvals) |
| `voice-assistant` | read / write / manage | Deep Voice Agent admin (builder, telephony, numbers, ElevenLabs, deployment) |
| `ai-assistant` | read / write / manage | **Internal Fleet AI only** — unchanged semantics |

### Level semantics

- **read** — list/detail conversations, messages, transcripts, analytics
- **write** — send/reply, sync, outbound call, MCP approval mutations
- **manage** — org/channel config (WhatsApp templates/config), telephony admin

`voice-assistant.manage` is **not** implied by `communication.manage`.

---

## 3. Endpoint mapping

### WhatsApp (`WhatsAppController`)

| Endpoint | Permission |
|----------|------------|
| GET config, conversations, messages, stats, templates | `communication.read` |
| POST messages, quick actions, AI reply, human review, simulate | `communication.write` |
| PUT config, POST templates | `communication.manage` |
| POST connect/disconnect | `data-authorization.manage` (unchanged) |
| Booking/damage reminders | `bookings.write` / `fleet-condition.write` (unchanged) |

### Voice tenant (`VoiceAssistantController` + related)

| Class | Permission pattern |
|-------|-------------------|
| Agent config, voices, telephony, phone numbers | `voice-assistant.read/write/manage` |
| Conversations, analytics, sync, outbound call | `communication.read/write` + `voiceOperationalLegacy: true` |
| MCP approvals | `communication.write` + legacy bridge |
| Billing, protection, webhook replay | `voice-assistant.read/manage` |
| Agent deployment | `voice-assistant.read/write/manage` |

### Internal AI (`ChatController`)

Unchanged — `ai-assistant.*` only. **No** communication bridge.

---

## 4. Legacy compatibility bridge

**Centralized in:** `backend/src/shared/auth/communication-permission.compat.ts`

| Bridge | Condition | Removal |
|--------|-----------|---------|
| WhatsApp | `ai-assistant.*` satisfies equivalent `communication.*` | Phase **C13** |
| Voice operational | ORG_ADMIN / SUB_ADMIN / WORKER + `voiceOperationalLegacy: true` on route | Phase **C13** |
| Voice deep admin | SUB_ADMIN + `voiceAdminLegacy: true` on `@RequireVoiceAssistantPermission` | Phase **C13** |

**Invariants:**

- One-way only: `communication.*` does **not** grant `ai-assistant.*`
- DRIVER excluded from operational legacy
- `communication.manage` never inferred from `ai-assistant.manage` alone (backfill + compat)
- Explicit `communication: { read: false, ... }` is never overwritten by backfill

**Frontend mirror:** `frontend/src/rental/lib/communication-permissions.ts` (nav only; backend authoritative)

---

## 5. Role compatibility mapping

| Role / template | C0.2 effective access |
|-----------------|----------------------|
| MASTER_ADMIN | Bypass (unchanged) |
| ORG_ADMIN | Full (membership bypass, unchanged) |
| SUB_ADMIN | Full admin modules via template; legacy SUB_ADMIN admin bridge on voice-assistant routes |
| WORKER (employee, etc.) | Voice ops via legacy bridge until backfill/migration; WhatsApp via ai-assistant legacy if granted |
| DRIVER | Denied Communication Center operator access |
| Custom roles | Backfill maps `ai-assistant` → `communication`/`voice-assistant` only when module keys absent |

**Backfill service:** `CommunicationPermissionBackfillService.backfillOrganization(orgId)` — idempotent, skips DRIVER, skips explicit communication keys.

---

## 6. Station-scope boundary (C6 deferred)

C0.2 establishes **permission authority only**. Station filtering for Communication conversations is **not** implemented.

Existing station restrictions on other modules are preserved. Future C6 attaches server-side station enforcement to canonical `CommunicationConversation` reads — a user with `communication.read` may still be station-scoped at C6.

---

## 7. Security tests

| Suite | Coverage |
|-------|----------|
| `communication-permission.compat.spec.ts` | Compat evaluators, DRIVER denial, internal AI separation |
| `communication-permission.security.spec.ts` | PermissionsGuard matrix (Master/Org Admin/Worker/Driver, level separation, cross-org) |
| `communication-permission.defaults.spec.ts` | Backfill derivation, role templates |
| `communication-permission-backfill.service.spec.ts` | Idempotent migration, DRIVER skip, explicit revoke |
| `voice-assistant.controller.security.characterization.spec.ts` | Guard + decorator metadata |
| `iam-endpoint-enforcement-triage.security.spec.ts` | WhatsApp communication module |
| `communication-permissions.test.ts` (frontend) | Nav helper mirrors |

---

## 8. Known remaining risks

1. Legacy bridge remains active until C13 — dual authority paths during migration window.
2. Backfill is opt-in per org (service registered; not auto-run on deploy) — ops must run for custom roles without ai-assistant.
3. Frontend nav uses role-based voice legacy for WORKER — backend still authoritative if nav/API diverge.
4. Voice deep admin SUB_ADMIN legacy bridge grants broad access until C13 — intentional parity with pre-C0.2 SUB_ADMIN org-admin routes.
5. Station scope for comms not enforced until C6.

---

## 9. Next phase readiness

**READY FOR C1** — canonical permission foundation, backward-compatible bridges, and authoritative guards are in place. C1 may introduce canonical persistence without re-architecting RBAC.

---

## 10. Files changed (C0.2)

**Backend:** `communication-permission.*`, `require-*-permission.decorator.ts`, `permissions.guard.ts`, `permission.constants.ts`, WhatsApp + Voice controllers, `communication-permission-backfill.service.ts`, role defaults.

**Frontend:** `communication-permissions.ts`, `Sidebar.tsx`, `users-roles/constants.ts`.

**Docs:** this file.
