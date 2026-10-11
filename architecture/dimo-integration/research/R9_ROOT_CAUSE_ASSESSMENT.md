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

## Primary root cause (layered — R2.2)

| Layer | Finding | Status |
|-------|---------|--------|
| **Mechanism** | DIMO `IncrementTriggerFailureCount` → `status=failed`; delivery halted while `failed` | **CONFIRMED** |
| **SynqDrive HTTP** | **40×503** on `POST /api/v1/webhooks/dimo` @ 2026-10-09 **15:21–15:22 UTC** | **CONFIRMED** (nginx aggregate) |
| **503 generator** | VO5C orchestrator Phase 1 nginx `return 503 "SynqDrive scheduled maintenance"` | **CONFIRMED** (VPS script) |
| **Correlation** | Provider `updatedAt` **15:22:29 / 15:22:50** within burst | **CONFIRMED** |
| **Rolling PM2 @ 15:38** | Cause of **15:21** 503 | **REJECTED** (timing) |
| **Per-request DIMO log** | Each 503 counted once | **INFERRED** |
| **R9-only share of 503 burst** | — | **UNKNOWN** (nginx) |

**Effect:** Subscriptions **remain**; R9 path **B→D blocked** until authorized `PUT`.

Detail: [R9_DEPLOYMENT_AVAILABILITY_RCA.md](R9_DEPLOYMENT_AVAILABILITY_RCA.md), [R22_R9_PREFLIGHT_AND_EVIDENCE_CORRECTION.md](../evidence/R22_R9_PREFLIGHT_AND_EVIDENCE_CORRECTION.md).

## Secondary findings

| Finding | Impact |
|---------|--------|
| Tiered snapshot polling **enabled** on Production | Trip detection **may continue** via polling fallback — **not** equivalent to R9 wake latency |
| tokenId **187336** stale telemetry | Operational risk if re-subscribed after recovery without ownership check |
| tokenId **190497** | Correctly **outside** R9 subs |

## DIM-CX-005 refinement

Contradiction **CONFIRMED** and **explained**: `failed` + full subscriptions is **consistent** with DIMO architecture (subscription ≠ delivery gate).
