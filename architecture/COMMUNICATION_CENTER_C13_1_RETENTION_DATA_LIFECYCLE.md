# Communication Center C13.1 — Retention & Data Lifecycle

**Status:** PARTIAL — policy scaffolding + safe purge framework  
**Date:** 2026-08-23  
**Repository:** FATIHS-MGCKS/SYNQDRIVE-alpha  
**Base:** `main` after merged PR #1229 (C9–C12 gate OPEN)  
**Branch:** `feature/communication-center-c13-1-retention-lifecycle`

---

## 1. Scope

C13.1 establishes the canonical Communication Center retention/data-lifecycle policy, inventory, scheduler scaffolding, and safe purge execution framework.

**In scope (C13.1):**
- Data class inventory and classification
- Centralized config (`communication-retention.config.ts`)
- `CommunicationRetentionService` + scheduler + purge-run audit table
- Voice retention harmonization (delegates to existing `VoiceRetentionService`)
- Content redaction phases (message, native WhatsApp, attachments, reply commands) — **disabled by default** until product configures retention days
- Read-model `contentAvailability` (`AVAILABLE` | `PURGED` | `UNAVAILABLE`)
- PostgreSQL integration tests
- C13.2 metrics hooks (`CommunicationRetentionMetrics`)

**Out of scope (later C13 phases):**
- C13.2 observability dashboards/alerts
- C13.3 legacy redirects
- C13.4 UI deletion
- C13.5 API cleanup
- C13.6 cutover

---

## 2. Data inventory

| Data class | Canonical model(s) | Owner module |
|------------|-------------------|--------------|
| Operational conversation state | `CommunicationConversation` | communication |
| Timeline metadata | `CommunicationEvent` | communication |
| Customer message body | `CommunicationMessageContent.text` | communication |
| Native WhatsApp body | `WhatsAppMessage.content` | whatsapp |
| Voice transcript/summary | `VoiceConversation.transcript`, `.summary` | voice-assistant |
| Voice provider payloads | `VoiceProviderWebhookEvent.redactedPayload` | voice-assistant |
| Attachments | `CommunicationAttachment` + object storage | communication / documents |
| Reply idempotency | `CommunicationReplyCommand` | communication |
| AI Activity | `CommunicationEvent` (AI_* types, metadata) | communication |
| Handoff notifications | `Notification` (separate subsystem) | notifications |
| SMS native | `SmsMessage` (schema exists; projection path) | sms |
| Provider webhooks | `WhatsAppWebhookEvent`, voice webhook tables | channel modules |
| Task provenance | `Task` conversation/source refs | tasks |

---

## 3. Classification

| Class | Examples | Classification |
|-------|----------|----------------|
| A. OPERATIONAL_STATE | `CommunicationConversation.status`, unreadCount, context links | Retain structural rows; no Stage-2 deletion in C13.1 |
| B. CUSTOMER_CONTENT | message text, transcript, template variables | Stage-1 content purge candidate |
| C. AI_CONTENT | AI summaries in voice, AI event metadata text | Stage-1 when policy configured |
| D. PROVIDER_METADATA | providerMessageId, delivery state, correlation IDs | Retain longer than body where configured |
| E. IDEMPOTENCY_AUDIT | `CommunicationReplyCommand` hash/state | Conservative retention; UNKNOWN never purged |
| F. SECURITY_AUDIT | IAM/workflow audit (separate) | Not absorbed — existing subsystems |
| G. DERIVED_PROJECTION | `lastMessagePreview`, AI Activity list | Redact/minimize on content purge |
| H. BINARY_ATTACHMENT | `CommunicationAttachment` object storage | Delete binary first, then metadata `PURGED` |
| I. BUSINESS_REFERENCE | customerId, bookingId, vehicleId on conversation | Not erased by content retention |

---

## 4. Existing retention authority

| Subsystem | Policy source | Default | C13.1 relationship |
|-----------|---------------|---------|-------------------|
| Voice transcript/summary | `VoiceRetentionService` | 90d (org override via `voiceAgentDeployment.configSnapshot.privacyRetention`) | **EXISTING_POLICY** — delegated phase |
| Voice provider payload | `VoiceRetentionService` | 30d | **EXISTING_POLICY** — delegated |
| Notifications | `NotificationRetentionService` | 180d resolved; disabled by default | Separate authority — handoff notifications not merged |
| Legal documents | `legal-document-retention.*` | Org policy + legal hold | Separate authority |
| IAM data retention | `iam-data-retention.*` | Product policy | Separate authority |
| Document extraction | `document-retention.service` | Configurable | Separate authority |
| Telemetry tables | `retention.config.ts` | Product tables default 0 | Separate authority |
| **Communication message content** | None before C13.1 | **NO_POLICY** (days=0) | Scaffolding only until env configured |
| **WhatsApp native content** | None | **NO_POLICY** (days=0) | Scaffolding only |
| **Communication attachments** | None | **NO_POLICY** (days=0) | Scaffolding only |
| **Reply command content** | None | **NO_POLICY** (days=0) | Scaffolding; UNKNOWN/PENDING always protected |

---

## 5. Policy source

| Class | Source | Destructive purge in C13.1 |
|-------|--------|---------------------------|
| Voice transcript/summary/payload | EXISTING_POLICY | Yes (via delegation) when `COMMUNICATION_RETENTION_ENABLED=true` |
| Message content | NO_POLICY | **Blocked** until `COMMUNICATION_RETENTION_MESSAGE_CONTENT_DAYS > 0` |
| Native WhatsApp | NO_POLICY | **Blocked** until `COMMUNICATION_RETENTION_NATIVE_WHATSAPP_CONTENT_DAYS > 0` |
| Attachments | NO_POLICY | **Blocked** until `COMMUNICATION_RETENTION_ATTACHMENT_DAYS > 0` |
| Reply command content | NO_POLICY | **Blocked** until `COMMUNICATION_RETENTION_REPLY_COMMAND_SETTLED_DAYS > 0` |
| Structural records | NO_POLICY | **Not implemented** in C13.1 |
| AI Activity metadata | NO_POLICY | **Not implemented** in C13.1 |

---

## 6. Default / override policy

**Environment config** (`backend/src/config/communication-retention.config.ts`):

| Env var | Default | Notes |
|---------|---------|-------|
| `COMMUNICATION_RETENTION_ENABLED` | `false` | Master switch |
| `COMMUNICATION_RETENTION_DRY_RUN` | `true` | Count-only default |
| `COMMUNICATION_RETENTION_BATCH_SIZE` | `200` | Per-phase batch |
| `COMMUNICATION_RETENTION_MESSAGE_CONTENT_DAYS` | `0` | NO_POLICY |
| `COMMUNICATION_RETENTION_NATIVE_WHATSAPP_CONTENT_DAYS` | `0` | NO_POLICY |
| `COMMUNICATION_RETENTION_ATTACHMENT_DAYS` | `0` | NO_POLICY |
| `COMMUNICATION_RETENTION_REPLY_COMMAND_SETTLED_DAYS` | `0` | NO_POLICY |
| `COMMUNICATION_RETENTION_VOICE_TRANSCRIPT_DAYS` | `90` | Mirrors VoiceRetentionService |
| `COMMUNICATION_RETENTION_VOICE_SUMMARY_DAYS` | `90` | Mirrors VoiceRetentionService |
| `COMMUNICATION_RETENTION_VOICE_PROVIDER_PAYLOAD_DAYS` | `30` | Mirrors VoiceRetentionService |

**Org-level DB policy model:** Not added in C13.1 — no existing Communication retention org settings found. Voice org overrides continue via `voiceAgentDeployment.configSnapshot.privacyRetention`.

---

## 7. Active / hold skip rules

**Active conversation skip** (content purge phases):
- `AI_ACTIVE`, `WAITING_CUSTOMER`, `HUMAN_REQUIRED`, `HUMAN_ACTIVE`

**Reply command protection:**
- `UNKNOWN` — never purged (reconciliation evidence)
- `PENDING` — never purged (in-flight send)

**Legal hold:** No Communication-specific legal hold model. Notification/legal-document legal hold subsystems are **not** wired into Communication retention in C13.1.

---

## 8–14. Lifecycle summaries

### Message content (Stage 1)
- Redact `CommunicationMessageContent.text`, set `contentPurgedAt`
- Update `lastMessagePreview` to `[content removed]` when referencing purged content
- Event row and provider IDs retained

### WhatsApp native parity
- When native phase enabled: redact `WhatsAppMessage.content` + `contentPurgedAt`
- Defaults disabled — prevents canonical-only purge without native phase configuration

### Voice
- Delegates to `VoiceRetentionService.purgeOrganization`
- Transcript/summary nulled; call row retained
- UI uses existing `TRANSCRIPT_UNAVAILABLE` — no new voice state

### Attachments
- Order: `deleteObject` → DB `state=PURGED`, `purgedAt`
- Storage failure: row stays `READY`, phase reports `failed`

### Reply commands
- Redact `text` + `templateVariables` for settled (`ACCEPTED`/`FAILED`) commands only
- Retain hash, sendState, correlation fields

### AI Activity
- Stored in `CommunicationEvent.metadata` — **no destructive purge in C13.1** (NO_POLICY)

### Notifications / tasks
- Notification retention remains in `NotificationRetentionService`
- Task provenance IDs preserved; tasks must tolerate purged message bodies (read model returns `PURGED`)

---

## 15. Structural record policy

**Stage-2 structural deletion not implemented.** FK audit shows risk to tasks, notifications, and reporting. C13.1 retains conversation/event rows.

---

## 16. Purge order

Per organization, per run:
1. Voice delegated (transcript, summary, provider payload)
2. Canonical message content redaction
3. Native WhatsApp content redaction
4. Attachment binary deletion
5. Reply command content redaction

---

## 17–19. Scheduler / batching / multi-instance

- `CommunicationRetentionScheduler` — cron `30 3 * * *`
- In-process `running` guard (same pattern as notification/voice schedulers)
- Bounded `batchSize` per phase; subsequent runs continue cursor via `occurredAt`/`createdAt` ordering
- Existing `VoiceRetentionScheduler` retained for backward compatibility

---

## 20. Dry run

`COMMUNICATION_RETENTION_DRY_RUN=true` (default): phases count candidates, skip destructive writes, report `skipReasons.DRY_RUN`.

---

## 21. Metrics hooks (C13.2 readiness)

`CommunicationRetentionMetrics` exposes in-process snapshot:
- `lastRunDurationMs`, `lastRunAffected`, `lastRunFailed`, `lastRunCompletedAt`

Purge runs persisted in `CommunicationRetentionPurgeRun.report` JSON.

---

## 22–23. Provider / backup limitations

- Provider-hosted recordings (ElevenLabs/Twilio) cannot be deleted by local purge alone — documented limitation
- Meta WhatsApp provider copies outside SynqDrive DB are not purged by this job
- Database backups may retain deleted content until backup rotation — operational limitation

---

## 24. RBAC

- Scheduler: system authority (internal job)
- No retention settings UI in C13.1
- Policy changes require env/deployment configuration (high privilege ops)

---

## 25. PostgreSQL evidence

`communication-retention.postgres.integration.spec.ts` — **11/11 PASS**:
- Tenant isolation (Org A / Org B)
- Age threshold (before/after)
- Active conversation skip
- Content redaction + timeline read model
- Native WhatsApp parity
- Voice transcript purge + metadata retained
- Reply command UNKNOWN preserved / settled redacted
- Attachment binary idempotency + storage failure safety
- Batch continuation
- Concurrent run idempotency
- Dry run

---

## 26. Rollout

1. Deploy migration `20260823160000_communication_retention_lifecycle`
2. Leave `COMMUNICATION_RETENTION_ENABLED=false` (default)
3. Run dry-run with `ENABLED=true`, `DRY_RUN=true` — review `CommunicationRetentionPurgeRun` reports
4. Product/legal sets retention day env vars per data class
5. Set `DRY_RUN=false` for controlled first live run
6. Enable destructive execution per class only when policy approved

---

## 27. Remaining policy gaps

1. Message content retention days — **PRODUCT_POLICY REQUIRED**
2. Native WhatsApp content days — **PRODUCT_POLICY REQUIRED** (must align with canonical)
3. Attachment retention days — **PRODUCT_POLICY REQUIRED**
4. Reply command settled retention days — **PRODUCT_POLICY REQUIRED**
5. AI Activity metadata redaction — **UNDECIDED**
6. Structural conversation/event deletion — **UNDECIDED** (FK risk)
7. SMS native `SmsMessage` content parity — **UNDECIDED**
8. Org-level Communication retention DB policy — **UNDECIDED**
9. Legal hold integration for Communication content — **UNSUPPORTED**
10. Provider recording deletion API integration — **UNDECIDED**

---

## 28. C13.1 sign-off

| Area | Verdict |
|------|---------|
| Policy inventory + classification | PASS |
| Centralized config (disabled by default) | PASS |
| Voice harmonization (existing policy) | PASS |
| Message/attachment/reply destructive purge | GAP — NO_POLICY defaults (scaffolding only) |
| PostgreSQL safety tests | PASS |
| Read-model purged state | PASS |
| Structural deletion | GAP — intentionally deferred |

**C13.1 sign-off: PARTIAL**

---

## 29. C13.2 readiness

**READY** for observability wiring — metrics snapshot + purge run reports exist. Dashboards/alerts not implemented.

**Recommended next phase:** C13.2 observability (wire `CommunicationRetentionMetrics` to Prometheus + alert on purge failures), then product decision on message-content retention days before enabling destructive message purge in production.
