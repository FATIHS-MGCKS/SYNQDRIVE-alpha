# R9 Permission Root Cause — Trip Detection Cross-Reference

Canonical audit: [DIMO Integration `R9_PERMISSION_ROOT_CAUSE_AUDIT_2026-09-07.md`](../../dimo-integration/evidence/R9_PERMISSION_ROOT_CAUSE_AUDIT_2026-09-07.md)

| Field | Value |
|-------|-------|
| **Affected tokenId** | 190497 (VW Golf 2026, vehicle ref `c43c3b45…`) |
| **Root cause** | Missing DIMO developer-license privilege for tokenId=190497 |
| **R9 coverage** | **0/6** |
| **Natural R9 observation** | **Impossible** until `DIMO_VEHICLE_PERMISSION_RESOLUTION` |
| **NEXT_GATE** | `DIMO_VEHICLE_PERMISSION_RESOLUTION` |
