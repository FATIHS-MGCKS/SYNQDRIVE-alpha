# Notification Engine — Audit Logging & ISO 27001 Control Alignment (V4.9.875)

**Date:** 2026-07-26  
**Scope:** Durable, data-minimal audit trail for notification lifecycle, delivery, and policy events.

> This document describes **technical alignment** with ISO/IEC 27001 control objectives. It does **not** constitute certification or an attestation of compliance.

Companion: `docs/security/notification-engine-access-control.md`

## Audit events

Append-only rows in `notification_audit_events`. No user-facing write API.

| Event | When | Retention class |
|-------|------|-----------------|
| `NOTIFICATION_CREATED` | New notification materialized | REVISION_AUDIT |
| `SEVERITY_ESCALATED` | Severity increased on active notification | GOVERNANCE_AUDIT |
| `ACKNOWLEDGED` | Personal or org-wide acknowledge | REVISION_AUDIT |
| `SNOOZED` | Personal or org-wide snooze | REVISION_AUDIT |
| `UNSNOOZED` | Personal or org-wide unsnooze | REVISION_AUDIT |
| `RESOLVED` | Manual, recovery, or automation resolve | GOVERNANCE_AUDIT |
| `REOPENED` | Resolved notification reopened | GOVERNANCE_AUDIT |
| `ARCHIVED` | Administrative archive | GOVERNANCE_AUDIT |
| `DELIVERY_FAILED` | Delivery retry scheduled | TECHNICAL_LOG |
| `DELIVERY_DEAD_LETTER` | Delivery exhausted retries | GOVERNANCE_AUDIT |
| `WORKFLOW_TRIGGERED` | Lifecycle workflow emit scheduled | TECHNICAL_LOG |
| `MANUAL_INTERVENTION` | Denied manual action (e.g. resolve blocked) | GOVERNANCE_AUDIT |
| `POLICY_REJECTED` | Channel/registry/policy rejection | GOVERNANCE_AUDIT |
| `INGEST_IGNORED` | Loop guard, archived, reopen policy ignore | TECHNICAL_LOG |

## Event shape

| Field | Description |
|-------|-------------|
| `organizationId` | Tenant scope (never from client body) |
| `actorType` | `USER` \| `SYSTEM` \| `AUTOMATION` \| `WORKFLOW` |
| `actorUserId` | Set when actor is a user |
| `notificationId` | Target notification when applicable |
| `eventType` | Canonical action |
| `previousState` / `nextState` | Minimal snapshot: status, severity, scope, channel — **no text** |
| `reasonCode` | Machine-readable reason |
| `correlationId` | Request/run/workflow chain |
| `clientMeta` | Route/IP only when supplied by trusted server context |
| `payloadHash` | SHA-256 integrity hash over canonical payload |
| `createdAt` | Timestamp |
| `legalHold` | Blocks retention purge when true |

## Protected fields (never stored)

- `titleKey`, `bodyKey`, rendered title/body
- `templateParams`, `actionTarget`, occurrence payloads
- Raw email/phone/recipient content
- Full delivery message bodies

Source: `audit/notification-audit.constants.ts` + workflow secret-scan reuse.

## Access control

- **Write:** server-side only (`NotificationAuditService.record`)
- **Read:** `GET /organizations/:orgId/notifications/audit-events` — ORG_ADMIN, SUB_ADMIN, MASTER_ADMIN
- Append-only: no update/delete endpoints for normal users
- Retention purge: scheduled job via `NotificationRetentionService` (respects `legalHold`)

## Integrity & retention

| Class | Default retention |
|-------|-------------------|
| `TECHNICAL_LOG` | 90 days |
| `REVISION_AUDIT` | 365 days |
| `GOVERNANCE_AUDIT` | ~7 years |

- `payloadHash` computed on write for tamper detection
- Governance events mirrored to `activity_logs` (summary only)
- Purge phase: `purge_notification_audit_events` in retention scheduler

## ISO/IEC 27001 control mapping (orientation)

| Control area | Objective | Implementation |
|--------------|-----------|----------------|
| A.8.15 | Logging | Durable `notification_audit_events` for lifecycle/security actions |
| A.8.16 | Monitoring activities | Delivery fail/dead-letter + policy rejection events |
| A.9.4 | Access control | Admin-only read API; writes server-only |
| A.12.4 | Logging and monitoring | Correlation IDs, actor attribution, integrity hash |
| A.18.1 | Privacy | Data minimization; no notification text in audit rows |
| A.18.2 | Data retention | Retention classes + legal hold + scheduled purge |

## API

```
GET /organizations/:orgId/notifications/audit-events
GET /organizations/:orgId/notifications/audit-events?notificationId=<id>&eventType=RESOLVED&limit=50
```
