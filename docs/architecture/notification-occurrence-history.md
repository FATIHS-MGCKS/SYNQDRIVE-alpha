# Notification Occurrence History

**Module:** `backend/src/modules/notifications/occurrence`  
**Migration:** `20260726130000_notification_occurrence_history`  
**Status:** Production (Notification Engine Remediation — Prompt 9)

## Occurrence schema

Each accepted ingest appends one row to `notification_occurrences`:

| Column | Meaning |
|--------|---------|
| `notification_id` | Parent notification |
| `organization_id` | Tenant scope |
| `source_type` | Producer system (`sourceSystem` in ingest contract) |
| `source_event_id` | Opaque producer event id — **dedupe key** |
| `source_ref` | Legacy mirror of `source_event_id` |
| `occurred_at` | Producer timestamp of the underlying fact |
| `observed_at` | When SynqDrive ingested the fact |
| `severity_at_occurrence` | Severity carried by this observation |
| `recovery_state` | `ACTIVE` or `RECOVERED` |
| `correlation_id` | Optional distributed trace id |
| `causation_id` | Optional upstream cause id |
| `payload` | Controlled metadata (allowlist, no PII, ≤ 64 KiB) |
| `created_at` | Row insert time |

`notifications.occurrence_count` is incremented atomically (`{ increment: 1 }`) in the same transaction as occurrence insert.

## Out-of-order rules

Ordering uses producer `occurred_at` against `notifications.last_seen_at` (monotonic max of accepted active signals).

| Scenario | Occurrence row | Notification effect |
|----------|----------------|---------------------|
| Newer/equal active signal | ✓ | Severity escalates only upward; lifecycle side-effects apply |
| Stale active signal (`occurred_at < last_seen_at`) | ✓ (audit) | Severity still uses escalate-only; **no lifecycle wake**; `last_seen_at` unchanged |
| Stale recovery | ✓ (audit) | **No resolve** — active generation stays open |
| Valid recovery | ✓ | Resolve active row |

Late WARNING cannot downgrade CRITICAL because `escalateSeverity` never de-escalates.

## Dedupe rules for `sourceEventId`

Unique index: `(notification_id, source_event_id)`.

| Case | Behavior |
|------|----------|
| Same `sourceEventId` on same notification | Idempotent ignore — no new row, no count increment |
| Different `sourceEventId` | New occurrence + atomic count increment |

## Retention preparation

Indexes for future partition/purge jobs:

- `(organization_id, observed_at)`
- `(created_at)`

## Tests

- `occurrence/notification-occurrence.policy.spec.ts` — out-of-order, dedupe, recovery ordering, retention hints
- `occurrence/notification-occurrence.factory.spec.ts` — field mapping
- `notification-core.service.spec.ts` — integration: dedupe, distinct ids, stale severity, stale recovery
