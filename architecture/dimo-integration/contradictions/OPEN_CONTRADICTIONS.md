# DIMO Integration — Open Contradictions

| ID | Contradiction | Status |
|----|---------------|--------|
| **DIM-CX-001** | Driving Intelligence registry cites "Trip Detection / DIMO Segments own boundaries" while DIMO Integration was `NOT_STARTED` during DI bootstrap | **OPEN** — mitigated by DIMO `AUDIT_IN_PROGRESS` bootstrap; **DIM-GAP-001 RESOLVED** (TDL-OQ-006) for segment **mutation** ownership |
| **DIM-CX-002** | `DimoTriggersService.subscribeVehicle` uses `POST /v1/webhooks/{id}/vehicles/{tokenId}` + `{signals}`; official Vehicle Triggers API uses `POST /v1/webhooks/{id}/subscribe/{tokenDID}` (no legacy signals body) | **CONFIRMED** @ `0633d0831…` — ops scripts (`r9-scoped-dimo-trigger-bootstrap.mjs`) use current API; Nest service **DORMANT/LEGACY** |
| **DIM-CX-003** | `DimoTriggersService.createWebhook` posts `{name,url}`; official API requires `service`, `metricName`, `condition`, `targetURL`, `verificationToken`, … | **CONFIRMED** @ `0633d0831…` — production R9 webhooks created via ops/console, not this method |
| **DIM-CX-004** | Authority docs cite Production SHA `8a1d9c658…` / origin `1393095f5…`; R1 read-only SSH observes `2b89f746…` / `0633d0831…` | **CONFIRMED** documentation drift — remediated in R1 evidence `DIM-EV-R1-PROD-001` |
| **DIM-CX-005** | Historical R9 evidence assumes webhook definitions **enabled**; R2/R21 GET shows R9 speed/ignition `status: failed` while vehicle subscriptions remain 5/5 | **CONFIRMED** @ `2b89f746…` — **explained** R21: provider delivery circuit-breaker (`failureCount` threshold) ≠ subscription removal; transition **2026-10-09 ~15:22 UTC** correlated with nginx **503** burst @ deploy window — `DIM-EV-R21-RCA-001` |

Trip Detection tracks related item as **TDL-CX-006** (partially superseded — DIMO authority now exists, gap remains).
