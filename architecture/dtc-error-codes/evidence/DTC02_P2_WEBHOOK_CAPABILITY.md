# DTC-02 P2 — webhook capability & poll/webhook parity (repository)

**Date:** 2026-10-17  
**Epistemic:** `CONFIRMED` for repository behavior under unit/disposable-PostgreSQL tests; `NOT_DEPLOYED` / no production webhook reliability claim.

## Scope

- Explicit webhook ingress classification: `CONFIRMED_COMPLETE`, `PARTIAL`, `STALE`, `DUPLICATE`, `UNKNOWN`.
- Gated runtime path: `DTC_02_WEBHOOK_CAPABILITY_ENABLED` + `DTC_02_WEBHOOK_CAPABILITY_VEHICLE_ALLOWLIST` (requires `DTC_01A_SAFETY_FOUNDATION_ENABLED`).
- Reuses `DtcSnapshotApplyService` + `evaluateDtcSnapshotDecision` (no second canonical state machine).
- Prometheus: `synqdrive_dtc02_webhook_capability_total{classification}` (low cardinality).

## False-clear guarantees (P2 path)

| Scenario | P2 behavior |
|----------|-------------|
| Partial webhook | `allowClears=false` via 01A decision + P2 clamp |
| Empty partial webhook | Classified `PARTIAL`; no clear |
| Missing `obdDTCList` value | `UNKNOWN`; metadata only |
| Provider / binding failure | Rejected metadata; no episode clear |
| Stale vs head | `STALE`; no apply |
| Duplicate delivery | `DUPLICATE`; no apply |
| Confirmed complete | Only with explicit `provider_confirmed_snapshot` attestation (not inferred from DIMO triggers today) |

## Limitations

- DIMO Vehicle Triggers do not expose a documented completeness attestation for `obdDTCList`; production webhooks remain **PARTIAL** until provider contract evolves.
- Live webhook delivery reliability, ordering, and duplicate rates are **unknown** without production evidence.
- Concurrent poll/webhook serialization relies on existing PostgreSQL advisory locks in `DtcSnapshotApplyService` (certified in DTC-01B PostgreSQL suite).

## Validation

```bash
cd backend && npm test -- --testPathPatterns='dtc-02|dtc02-'
cd backend && DTC_01B_PG_INTEGRATION=1 DATABASE_URL=… npm test -- dtc-01b.postgres
```
