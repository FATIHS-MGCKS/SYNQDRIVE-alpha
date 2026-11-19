# Communication Center — Architecture Authority (bootstrap, `AUDIT_IN_PROGRESS`)

| Field | Value |
|-------|-------|
| **Logical domain** | **Core** platform (owner 2026-11-19 — [`POST_P6_BOUNDARY_OWNER_CLASSIFICATION_2026-11-19.md`](../platform-reorientation/evidence/POST_P6_BOUNDARY_OWNER_CLASSIFICATION_2026-11-19.md)) |
| **Registry coverage status** | `AUDIT_IN_PROGRESS` (from `NOT_STARTED`, 2026-11-19 — post-P6 boundary PR1 scoped audit) |
| **Authority-native status** | Bootstrap V0.1 · repository audit **PARTIAL** (quick-action booking read port only) |
| **Production baseline** | **NOT_STARTED** (no VPS read in this workstream) |

## Scope (initial)

- `backend/src/modules/communication/` omnichannel persistence, read/write, quick actions
- Core → Rental boundary: `COMMUNICATION_BOOKING_SNAPSHOT_READ_PORT` (PR1)

## Mandatory entry documents (partial)

1. [`AUDIT_MANIFEST.md`](AUDIT_MANIFEST.md)
2. [`CURRENT_STATE.md`](CURRENT_STATE.md)
3. [`AGENT_CONTRACT.md`](AGENT_CONTRACT.md)
4. [`research/CHANGE_LEDGER.md`](research/CHANGE_LEDGER.md)