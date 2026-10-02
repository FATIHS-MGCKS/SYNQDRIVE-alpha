# VO-3.2 — Source-adoption security, concurrency & atomicity final seal

| Field | Value |
|-------|-------|
| **PR** | #1854 |

## DIMO platform mirror contract

| Invariant | Value |
|-----------|-------|
| `DIMO_MIRROR_SCOPE` | `PLATFORM_DEVELOPER_LICENSE` |
| `DIMO_ROW_PROVES_TENANT_OWNERSHIP` | **NO** |
| Cutover prerequisite | Controller/IAM must authorize assigning a platform DIMO mirror to `organizationId` before public tenant endpoints call orchestration |

## VO-3.2 code changes

- Removed public arbitrary `attachSourceRef(snapshot)` — use `attachDimoSource` / `attachHighMobilitySource` with adoption authority
- Restored PostgreSQL concurrent activation + tenant activation isolation proofs
- Path-specific rollback fault matrix (DIMO vs HM)
- Strengthened post-failure artifact assertions
- Manual idempotency fingerprint: canonical JSON + SHA-256 including admin fields
