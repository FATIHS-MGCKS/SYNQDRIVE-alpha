# EXP021 P2.1 — Real-trip QC read-only preview

**Status:** IMPLEMENTED (draft PR)  
**Runtime:** OFF — ops CLI only; not registered on AppModule; no production VPS execution in this workstream.

## Scope

Single-trip, read-only preview for COMPLETED PRIMARY S4 work items:

- Verifies pinned evidence snapshot (S4D verifier).
- Loads S2 shadow intervals.
- Applies P1 speed QC and P2 in-memory projection (`computeDiV0TripSpeedQualityProjectionV1ForWorkItem`).
- **No** `persistCurrentProjection`, **no** P2 table reads/writes, **no** DIMO/provider calls.

## Operator entrypoint

```bash
cd backend
npm run ops:di:p21-trip-speed-quality-preview -- \
  --organizationId <uuid> --tripId <uuid> --workItemId <uuid>
```

### Allowed scope input (fail-closed)

| Path | Inputs |
|------|--------|
| **A — CLI flags** | All three: `--organizationId`, `--tripId`, `--workItemId` (each must be a UUID) |
| **B — P21 env bundle** | All three: `DI_V0_P21_ORGANIZATION_ID`, `DI_V0_P21_TRIP_ID`, `DI_V0_P21_WORK_ITEM_ID` |

Partial CLI + partial env is **rejected**. Generic `ORGANIZATION_ID` is **not** accepted (prevents accidental tenant selection).

Uses `SET LOCAL transaction_read_only = on` and `statement_timeout` (30s). Exit codes: `0` assessed, `3` not assessable, `2` missing scope, `4` invalid UUID, `5` mixed/ambiguous input.

### Production database access (documentation only — no change in this workstream)

For future approved production read-only previews:

- Use a **dedicated** `DATABASE_URL` for a PostgreSQL role with **`SELECT` only** on required tables (`di_v0_s4_work_items`, `di_v0_s4_evidence_snapshots`, `di_v0_shadow_runs`, `di_v0_shadow_intervals`, …).
- No `INSERT`/`UPDATE`/`DELETE` grants; preview also sets `transaction_read_only = on` as a second layer.
- Do **not** reuse application writer credentials for operator previews.
- Role creation / grants are a **separate** DBA/ops change — not applied by this PR.

## Validation

- `npm run test:di:trip-speed-quality` (includes P2.1 unit parity)
- `npm run test:di:trip-speed-quality:postgres:ci` (PG1–PG15 + P21-1…P21-7)

## Post-merge ops gate

Separate human approval required before any production READ-ONLY preview on ≤5 selected real trips. This document does **not** authorize production access.
