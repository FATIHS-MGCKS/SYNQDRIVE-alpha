# R9 Permission Root Cause — Trip Detection Cross-Reference

Canonical audit: [DIMO Integration `R9_PERMISSION_ROOT_CAUSE_AUDIT_2026-09-07.md`](../../dimo-integration/evidence/R9_PERMISSION_ROOT_CAUSE_AUDIT_2026-09-07.md)

| Field | Value |
|-------|-------|
| **Affected tokenId** | 190497 (VW Golf 2026, vehicle ref `c43c3b45…`) |
| **Classification** | `FORMER_FLEET_VEHICLE` / `EXCLUDED_FROM_ACTIVE_R9_COHORT` |
| **Root cause (corrected)** | Former fleet vehicle — absent from Identity privileged list; subscribe **403 expected** |
| **Rejected remediation** | Re-grant developer-license privilege for tokenId=190497 |
| **R9 coverage (active cohort)** | **5/5** after five-vehicle canary — see [R9_FIVE_VEHICLE_CANARY_2026-09-07.md](R9_FIVE_VEHICLE_CANARY_2026-09-07.md) |
| **Natural R9 observation** | **Not validated** — provider wiring complete; awaits actual drive/ignition events |
| **NEXT_GATE** | `NATURAL_R9_WAKE_OBSERVATION` |
