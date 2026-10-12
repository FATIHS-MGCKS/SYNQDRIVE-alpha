# Webhook Security & Event Delivery (R4.5-B)

**Code anchor:** `dimo-webhook.controller.ts`

## Authentication model

| Step | Control | On failure |
|------|---------|------------|
| URL verification | `DIMO_WEBHOOK_VERIFICATION_TOKEN` echo | `503 verification_not_configured` |
| Trigger payload | Must match Vehicle Triggers shape | `rejected invalid_payload` |
| Optional HMAC | `DIMO_WEBHOOK_SECRET` + `x-dimo-signature` timing-safe compare | `rejected invalid_signature` |
| Unsigned POST | **Accepted** when secret unset or signature absent | Debug log — provider does not sign standard trigger POSTs |

**Trust assumption (documented):** DIMO subscription-time `verificationToken` + HTTPS callback URL — not per-POST HMAC for speed/ignition.

## Replay / deduplication

| Event class | Dedup | Replay risk |
|-------------|-------|-------------|
| Device connection (OBD plug) | Inbox `provider_providerEventId` unique + terminal status short-circuit | Low for same event id |
| Speed / ignition wake | **No webhook inbox** — direct `SnapshotWakeIntakeService` | Duplicate POSTs may hit coordinator; Redis coalesce scripts mitigate snapshot enqueue — **DIM-RISK-001** |
| DTC / RPM | Vehicle-scoped processing; RPM candidate intake rules | Medium without global nonce |
| Unknown tokenId | `ignored unknown_vehicle` | No side effect |

## Security risk rating (guard-based)

| Threat | Mitigation present | Residual |
|--------|-------------------|----------|
| Spoofed POST without secret | Verification token not re-checked on each trigger POST | **Medium** — relies on URL secrecy + HTTPS; no shared signing on trigger body |
| Replay of captured webhook | No timestamp/nonce gate on speed/ignition | **Low–Medium** — wake mostly no-ops when FSM active; could add queue churn |
| Invalid signature | Rejected before processing | **Low** when secret configured |
| Cross-tenant vehicle binding | tokenId → vehicle mapping | **Medium** — integrity of link table |

## Device connection queue reliability

- Bull job: `attempts: 5`, `removeOnFail: { count: 5000, age: 7d }` — `device-connection-webhook-queue.producer.ts`
- Inbox processor: exponential backoff → dead letter after `maxAttempts` — `device-connection-webhook-processing.service.ts` ~168–210

## Production observability (R4.1a @ `a4d06c60…`)

`synqdrive_trip_snapshot_wake_total` — dominant `IGNORED_FSM_ACTIVE` (expected when vehicle already in trip).
