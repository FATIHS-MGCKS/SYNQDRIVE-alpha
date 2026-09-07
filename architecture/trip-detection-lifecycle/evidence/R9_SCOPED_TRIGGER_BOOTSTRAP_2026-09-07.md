# R9 Scoped Trigger Bootstrap — Trip Detection Cross-Reference

Canonical provider mutation record: [DIMO Integration `R9_SCOPED_TRIGGER_BOOTSTRAP_2026-09-07.md`](../../dimo-integration/evidence/R9_SCOPED_TRIGGER_BOOTSTRAP_2026-09-07.md)

| Field | Value |
|-------|-------|
| **Outcome** | **ROLLED_BACK** |
| **Blocker** | DIMO `POST …/subscribe/{assetDID}` → `403 Insufficient vehicle permissions` for **tokenId=190497** |
| **Production R9 wake runtime** | Deployed @ `0ba96e03…` includes R9 code path; **provider trigger coverage still absent** |
| **Coverage after rollback** | subscribed_speed=0, subscribed_ignition=0, subscribed_both=0, missing_both=6 |

Trip Detection cannot claim R9 provider-wake latency benefit until DIMO Integration completes **DIMO_VEHICLE_PERMISSION_RESOLUTION** for tokenId **190497**, then a successful scoped bootstrap.

**NEXT_GATE:** `DIMO_VEHICLE_PERMISSION_RESOLUTION` (not natural observation until 6/6 subscribable + bootstrap PASS)
