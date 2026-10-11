# R9 — Root cause assessment (R21)

| Field | Value |
|-------|-------|
| **Evidence ID** | `DIM-EV-R21-RCA-001` |
| **AUDIT_MODE** | `READ_ONLY` |
| **Primary production SHA** | `2b89f7466836b81a4ba344138d0ad9817c5d14ee` |

## Classification matrix

| Category | Expected symptoms | Supporting evidence | Refuting / limiting evidence | Confidence | Status |
|----------|-------------------|---------------------|------------------------------|------------|--------|
| **PROVIDER_CONFIGURATION** | Wrong metric/URL; subs missing | Canary config unchanged; **5/5 subs** | `status=failed` is delivery-driven, not mis-config | LOW | **REJECTED** |
| **CALLBACK_VERIFICATION** | Create/update fails; defs never enabled | R9 ran **enabled** months; verification at create **historical PASS** | Oct failure not tied to verification handshake logs | LOW | **REJECTED** |
| **HTTP_DELIVERY_FAILURE** | `failureCount` rises; `failed` at threshold; 4xx/5xx at callback | **40×503** nginx @ Oct 9 15:21; provider `updatedAt` **15:22**; fc 12/28 | Cannot prove each failure was 503 vs 5xx | **HIGH** | **CONFIRMED** (mechanism) |
| **REVERSE_PROXY_ROUTING** | 502/504 to wrong upstream | 503 burst consistent with **upstream unavailable** during deploy | Oct 10–11 nginx **200** — routing currently healthy | MEDIUM | **CONTRIBUTING** |
| **BACKEND_HANDLER_FAILURE** | 5xx after reach Nest | Would increment provider failures | No retained `Received DIMO webhook` logs to correlate | LOW | **INCONCLUSIVE** |
| **PROVIDER_INTERNAL** | Failed without SynqDrive fault | — | Same callback served UNPLUG/RPM **200** post-incident | LOW | **REJECTED** |
| **AUTHORIZATION_OR_SUBSCRIPTION** | Missing subs | — | **5/5** GET | — | **REJECTED** |
| **DEPLOYMENT_INTERRUPTION** | 503 during restart; short window | Release `20261009152645` @ 15:27; 503 **15:21** | Deploy may **precede** folder timestamp; nginx 503 **before** folder time | **HIGH** | **CONFIRMED** (contributor) |
| **STALE_COHORT** | Stale token still subscribed | **187336** stale `last_signal`; still subscribed | Does **not** explain **definition-level** `failed` | MEDIUM | **OPEN** (ops hygiene, not RCA for failed) |
| **INSUFFICIENT_EVIDENCE** | — | PM2 lacks per-request R9 trail Oct 2026 | — | — | **PARTIAL** for KPI D |

## Primary root cause (closed chain)

**CONFIRMED:** DIMO marked both R9 webhook definitions `failed` because the Vehicle Triggers service recorded **too many consecutive HTTP callback delivery failures** (`IncrementTriggerFailureCount` → `status=failed`), during a window where SynqDrive’s nginx returned **HTTP 503** on `POST /api/v1/webhooks/dimo` (**2026-10-09 ~15:21 UTC**), immediately before provider `updatedAt` timestamps (**15:22:29Z** / **15:22:50Z**).

**Effect:** With `status=failed`, provider **stops attempting** R9 deliveries (`ShouldAttemptWebhook`). Subscriptions **remain** but **state B→D is broken** for R9 until recovery PUT.

**Not CONFIRMED:** Exact count of R9 vs RPM/OBD posts in the 503 burst (nginx cannot split).

## Secondary findings

| Finding | Impact |
|---------|--------|
| Tiered snapshot polling **enabled** on Production | Trip detection **may continue** via polling fallback — **not** equivalent to R9 wake latency |
| tokenId **187336** stale telemetry | Operational risk if re-subscribed after recovery without ownership check |
| tokenId **190497** | Correctly **outside** R9 subs |

## DIM-CX-005 refinement

Contradiction **CONFIRMED** and **explained**: `failed` + full subscriptions is **consistent** with DIMO architecture (subscription ≠ delivery gate).
