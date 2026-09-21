# VDC OBD PLUG webhook restoration — Phase A–G forensics (read-only + ops gate)

**Workstream:** controlled Production remediation (canary WOB L 7503)  
**Epistemic:** PRODUCTION_OBSERVATION + PROVIDER_API + CODE  
**P2.5 T0 (unchanged):** `2026-09-18T09:33:25.000Z`  
**Production observation UTC:** `2026-09-21T11:53:17Z`  
**Production SHA:** `6e3bce843ed09c3603f02fcdb835a1840429372b` (`/opt/synqdrive/releases/20260921103500_v4994`)

No provider `PUT` enable, no subscription mutation, no P2.5 T0 reset, no PR #1697 changes.

---

## Phase A — Path / subscription forensics

### `PLUG_SUBSCRIPTION_SCOPE`

DIMO Vehicle Triggers webhook **definitions** are **account-global** (one UUID per direction). Vehicle linkage is **per-token** via `subscribe/{assetDID}` on each webhook id. SynqDrive cannot enable PLUG for WOB only without (a) enabling the global PLUG definition and (b) ensuring WOB is on the PLUG subscription list.

| Control | tokenId | PLUG list | UNPLUG list | PLUG enabled | UNPLUG enabled |
|---------|---------|-----------|-------------|--------------|----------------|
| WOB L 7503 | **192922** | **NO** | YES | def **disabled** | def **enabled** |
| KS MX 2024 | 187336 | YES | YES | def disabled | enabled |
| KS MS 661 | 187361 | YES | YES | def disabled | enabled |

**PLUG webhook:** `7a0562d3-369a-45eb-b5ed-8d35258091dd` (`b977124a025a`) — `vss.obdIsPluggedIn`, `valueNumber == 1`  
**UNPLUG webhook:** `49438f51-3ca5-4808-81d5-3598336c53a3` (`a257daa23ee5`) — `valueNumber == 0`

Plug subscription tokenIds (6): `186946, 187336, 187361, 187784, 189118, 190497`  
Unplug subscription tokenIds (7): above **+ 192922**

### SynqDrive runtime path (PLUG direction)

| Gate | Status |
|------|--------|
| PLUG_WEBHOOK_INGRESS_IMPLEMENTED | YES — `DimoWebhookController` → inbox |
| PLUG_WEBHOOK_VALIDATION_IMPLEMENTED | YES — signature + mapping |
| PLUG_WEBHOOK_PERSISTENCE_IMPLEMENTED | YES — inbox + events |
| PLUG_WEBHOOK_PHYSICAL_WRITER_IMPLEMENTED | YES — `writeWebhookEvidence` + coordinator |
| PLUG_WEBHOOK_EPISODE_RESOLUTION_IMPLEMENTED | YES — shared lifecycle with UNPLUG |
| PLUG_WEBHOOK_IDEMPOTENCY_IMPLEMENTED | YES — dedupe bucket + DUPLICATE decision |
| PLUG_WEBHOOK_STALE_ORDERING_GUARD_IMPLEMENTED | YES — monotonic / STALE / CONFLICT |
| PLUG_WEBHOOK_MULTI_REPLICA_SAFE | YES — inbox claim + idempotent reconcile (design + tests) |

Ops read-only verifier: `backend/scripts/ops/gt-r1-plug-webhook-restoration.mjs` (default READ_ONLY).

---

## Phase B — Why PLUG was disabled

| Field | Value |
|-------|-------|
| PLUG_DISABLED_INTENTIONALLY | **YES** — provider status `disabled` since `2026-07-08T05:06:44.718491Z` (not `failed`) |
| KNOWN_HISTORICAL_PLUG_PROVIDER_FAILURE | **NO** — `failureCount=0` at observation |
| KNOWN_HISTORICAL_SYNQDRIVE_PLUG_FAILURE | **NO** — ingress path implemented; GT-R1 UNPLUG workstream explicitly deferred PLUG enable (VDC-EVID-GT-R1-UNPLUG-FAILURE-001 §6) |
| CURRENT_REASON_FOR_DISABLED_STATE | **Operational policy + snapshot fallback assumption** during UNPLUG recovery; later P2.5 / KS MX replug delay proved snapshot-only parked replug is not bounded by ~8h wake SLA |

---

## Phase C — Dual-path correctness (repository)

Automated coverage (unit + shadow orchestration; postgres integration **not re-run** in this session — `PHYSICAL_STATE_POSTGRES_INTEGRATION=1` required):

- Webhook PLUG / UNPLUG canonicalization: `device-connection-webhook.service.spec.ts`
- Concurrent webhook vs snapshot ordering: `physical-state-evidence-writer.postgres.integration.spec.ts` (webhook PLUG wins when newer)
- GT-R1 ordering: `physical-state-snapshot-real-callsite.postgres.integration.spec.ts`, `physical-state-gt-r1-proof.spec.ts`
- CLI mutation gate: `gt-r1-plug-webhook-restoration.cli.spec.mjs`

| Invariant | Result |
|-----------|--------|
| ONE_REAL_EVENT_ONE_EFFECTIVE_TRANSITION | YES (by design + tests where executed) |
| NO_DUPLICATE_EPISODE_RESOLUTION | YES |
| NO_DUPLICATE_USER_VISIBLE_SIDE_EFFECT | YES (sideEffects gated) |
| MULTI_REPLICA_CONVERGENCE | PASS (inbox + idempotency — not live-proven this session) |

---

## Phase D — Controlled activation

**NOT EXECUTED** — blocked by:

1. **Canary subscription gap:** WOB `192922` not on PLUG webhook subscription list (only on UNPLUG).
2. **Blast radius:** enabling PLUG definition affects all **6** currently PLUG-subscribed tokens immediately (global definition).
3. **Operator authorization:** mutation requires explicit `--execute --confirm-webhook=7a0562d3-…` outside read-only forensics.

---

## Phase E — Post-activation (N/A)

Skipped — no mutation.

---

## Phase F — Controlled GT-R1 replug (operator)

**GT_REPLUG_PHYSICAL_TEST_REQUIRED=YES**  
**GT_REPLUG_TEST_EXECUTED=NO**

### Pre-requisites before physical test

1. `POST /v1/webhooks/7a0562d3-369a-45eb-b5ed-8d35258091dd/subscribe/{WOB assetDID}` (narrow canary subscribe).
2. Authorized `PUT` enable PLUG definition (`gt-r1-plug-webhook-restoration.mjs --execute --confirm-webhook=…`).
3. Verify UNPLUG remains `enabled`.

### Observation window (read-only SQL / logs — run on VPS)

```bash
# Provider registry (read-only)
sudo SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env \
  node /opt/synqdrive/current/backend/scripts/ops/gt-r1-plug-webhook-restoration.mjs

# Inbox + physical evidence (vehicle id WOB)
# Use forensic-vehicle-connectivity-readonly.ts or Prisma against dimo_device_connection_webhook_inbox
# Filter: vehicle 19fedd4b-c4e8-4de8-a125-dab293326e7e, event OBD_DEVICE_PLUGGED_IN after replug T0
```

Record timestamps for latency matrix: provider emit → ingress → inbox → processor → physical row → episode resolve.

---

## Phase G — P2.5 epoch

| Field | Value |
|-------|-------|
| P25_T0_BEFORE | `2026-09-18T09:33:25.000Z` |
| P25_T0_AFTER | `2026-09-18T09:33:25.000Z` (no config mutation) |
| P25_ACQUISITION_CHANNEL_CHANGE_AT | *(unset — no PLUG enable performed)* |

---

## Related

- VDC-DEC-010 — dual-path recovery architecture  
- VDC-EVID-GT-R1-PREFLIGHT-001 — PLUG disabled but historically “subscribed” (WOB drift: subscribed UNPLUG only as of 2026-09-21)
