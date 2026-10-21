# DI-EV-0035C — HF Recovery Runtime (Reference Capture)

**Date:** 2026-09-04  
**Evidence:** `docs/audits/driving-intelligence-hf-recovery-runtime-implementation-2026-09.md`  
**Design authority:** RD004-B (`SETTLED_HORIZON_PLUS_OVERLAP_PLUS_PERIODIC_SWEEP`)

## Scope

Runtime implementation on **reference-capture** `HF_HISTORICAL` acquisition only. Production post-trip HF (`dimo-segments.service.ts` / `trip-behavior-enrichment.service.ts`) is **out of scope** and unchanged.

## Architecture

```
Fast loop (every cycle when HF surface planned)
  ├─ buildHfQueryWindow()
  │    queryTo = requestStartedAt - settlementDelayMs   [V2 only]
  │    queryFrom = coverage - recoveryOverlapMs         [V2 overlap configurable]
  ├─ DIMO signals historical query (same-origin per window)
  ├─ physicalSampleFingerprint dedupe + revision path
  ├─ append hfQueryProvenanceRecord (incl. zero-result)
  └─ advance QUERY COVERAGE only after flushIdempotent success

Periodic deep recovery (optional, HF_RECOVERY_SWEEP_ENABLED)
  ├─ planRecoverySweepWindow() — bounded chunk behind settled horizon
  ├─ explicit queryFrom/queryTo (canonical origin per chunk)
  └─ advance hfRecoveryCursorByField on successful sweep commit
```

## Watermarks

| Authority | State field | Meaning |
|-----------|-------------|---------|
| DATA | `hfWatermarkByField` | Latest durable provider sample timestamp per field |
| QUERY COVERAGE | `hfQueryCoverageByField` | Latest settled query horizon committed |
| RECOVERY | `hfRecoveryCursorByField` | Deep sweep progress over closed intervals |

## Feature gates

- `HF_RECOVERY_POLICY_V2_ENABLED` — default **false** (legacy 2s overlap)
- `HF_RECOVERY_POLICY_V2_CANARY_TOKEN_IDS` — optional token allowlist
- `HF_RECOVERY_SWEEP_ENABLED` — default **false**
- `HF_AVAILABILITY_CALIBRATION_ENABLED` — default **false**

Provisional timing defaults (8s / 6s) are **not validated** (`PRODUCTION_HF_POLICY_PARAMETERS_VALIDATED=NO`).

## Concurrency

Per-session cycle lock (`ReferenceCaptureSessionRepository.tryAcquireCycleLock`) prevents duplicate HF cycles across BullMQ workers/replicas.

## Related files

- `reference-capture-hf-recovery-v2.policy.ts`
- `reference-capture-acquisition.service.ts`
- `reference-capture-hf-watermark-policy.ts` (legacy overlap constant)
- `reference-capture-physical-sample-identity.util.ts` (aggregate bucket identity)
