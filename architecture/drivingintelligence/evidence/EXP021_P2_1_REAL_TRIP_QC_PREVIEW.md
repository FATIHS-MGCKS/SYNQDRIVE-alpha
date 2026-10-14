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

Uses `SET LOCAL transaction_read_only = on` and `statement_timeout` (30s).

## Validation

- `npm run test:di:trip-speed-quality` (includes P2.1 unit parity)
- `npm run test:di:trip-speed-quality:postgres:ci` (PG1–PG15 + P21-1…P21-7)

## Post-merge ops gate

Separate human approval required before any production READ-ONLY preview on ≤5 selected real trips. This document does **not** authorize production access.
