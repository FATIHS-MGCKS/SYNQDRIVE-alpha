# Webhook Security & Event Delivery (R4.5-B / final)

**Code anchor:** `backend/src/modules/dimo/dimo-webhook.controller.ts`

## Ingress (production)

| Layer | Behavior | Evidence |
|-------|----------|----------|
| Public URL | `https://app.synqdrive.eu/api/v1/webhooks/dimo` | WEBHOOK_OPERATIONS.md |
| TLS | HTTPS redirect on :80 | nginx test templates / VDC forensics |
| Upstream | `synqdrive_backend` → `127.0.0.1:3001` + `3002` (R9 resilience pattern) | `r9-phase1.stripped.conf`, R9_RESILIENCE_ENGINEERING.md |
| App auth | Nest global API prefix `/api/v1` | dimo-webhook `@Controller('webhooks/dimo')` |

**NOT_MEASURED in this pass:** production nginx rate-limit / WAF rules on live VPS (no read-only nginx dump). No dedicated `limit_req` in repository test template for webhook location.

## Trigger POST authentication

| Step | Control | On failure |
|------|---------|------------|
| URL verification (subscription) | `DIMO_WEBHOOK_VERIFICATION_TOKEN` echo | `503 verification_not_configured` |
| Trigger payload | `isDimoTriggerPayload` shape | `rejected invalid_payload` |
| HMAC when **both** secret and `x-dimo-signature` present | `timingSafeEqual` on sha256 body | `rejected invalid_signature` |
| Secret configured, **signature absent** | **Request accepted** — debug log only (~121–124) | — |
| Secret unset (non-dev) | Still requires verification token configured for subscription; trigger POST accepted without HMAC | — |

**DIM-RISK-003 (P2):** Attacker who learns the public URL can POST plausible trigger JSON for a **valid fleet `tokenId`** without shared signing. Mitigations: HTTPS, non-guessable tokenIds, FSM `IGNORED_FSM_ACTIVE`, snapshot coalesce, device-connection inbox dedup. **Does not** re-verify subscription `verificationToken` on each trigger POST.

## Manipulated event impact

| Signal path | Manipulation effect | Guards |
|-------------|---------------------|--------|
| speed / ignition | `SnapshotWakeIntakeService` — may enqueue snapshot if RESTING | FSM active → IGNORED; coordinator coalesce |
| OBD plug | Inbox + async queue | `provider_providerEventId` dedup |
| DTC / RPM | Vehicle-scoped side effects | RPM thresholds; DTC normalization |
| Unknown tokenId | No processing | `ignored unknown_vehicle` |

## Replay / deduplication

| Class | Dedup | Residual |
|-------|-------|----------|
| Device connection | Inbox unique `provider_providerEventId` | Low replay impact |
| Speed / ignition | **None at webhook layer** | DIM-RISK-001 — duplicate POSTs |
| Multi-replica | Both replicas may process if load-balanced duplicate delivery | DIM-RISK-004 SUSPECTED |

## DIM-RISK-003 classification (R4.5 final)

| Axis | Assessment |
|------|------------|
| Likelihood | **Medium** — endpoint is public; signing optional |
| Impact | **Low–Medium** — ops noise, wake/snapshot churn; limited trip corruption when FSM active |
| Priority | **P2** (reclassified from P3) |
| Promote to P1? | **No** — without evidence of successful abuse or customer data breach |

## Device connection queue reliability

- Bull: `attempts: 5`, `removeOnFail` retention — `device-connection-webhook-queue.producer.ts`
- Inbox DLQ after max attempts — `device-connection-webhook-processing.service.ts`

## Observability

R4.1a / R9 retrospective: `synqdrive_trip_snapshot_wake_total` — `IGNORED_FSM_ACTIVE` dominant when vehicles in trip.
