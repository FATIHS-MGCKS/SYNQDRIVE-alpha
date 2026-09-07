# R9 Scoped Trigger Bootstrap — Trip Detection Cross-Reference

Canonical provider mutation record: [DIMO Integration `R9_SCOPED_TRIGGER_BOOTSTRAP_2026-09-07.md`](../../dimo-integration/evidence/R9_SCOPED_TRIGGER_BOOTSTRAP_2026-09-07.md)

| Field | Value |
|-------|-------|
| **Outcome** | **ROLLED_BACK** |
| **Blocker (historical six-vehicle attempt)** | tokenId **190497** — former fleet vehicle; excluded from active cohort |
| **Active R9 cohort** | 5 tokenIds — see [R9_FIVE_VEHICLE_CANARY_2026-09-07.md](../../dimo-integration/evidence/R9_FIVE_VEHICLE_CANARY_2026-09-07.md) |
| **Production R9 wake runtime** | Deployed; **five-vehicle provider trigger coverage PASS** @ stableIds `9eeb7158afee`, `5d611d470eab` |
| **Coverage (active cohort)** | subscribed_speed=5, subscribed_ignition=5, subscribed_both=5, missing_both=0 |
| **NEXT_GATE** | `NATURAL_R9_WAKE_OBSERVATION` |

Trip Detection cannot claim natural R9 wake validation until an actual drive/ignition event occurs on the five-vehicle canary cohort.

**NEXT_GATE:** `NATURAL_R9_WAKE_OBSERVATION`
