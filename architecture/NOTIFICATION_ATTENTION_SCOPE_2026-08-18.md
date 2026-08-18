# Notification Registry — attentionScope (P1.1)

**Date:** 2026-08-18  
**Status:** Implemented (routing foundation only — no UI cutover)

## Summary

Introduced canonical `NotificationAttentionScope` on every registered notification event type:

- `OPERATIONS` — general operational attention space (default dashboard box today)
- `FLEET_READINESS` — vehicle technical/readiness/connectivity attention space

## Architecture

```
Rental Health (vehicle state) → Notification Engine V2 (lifecycle) → attentionScope (routing projection)
                                                                          ├─ OPERATIONS
                                                                          └─ FLEET_READINESS
```

`attentionScope` is **not** persisted, not part of fingerprints, and not a replacement for `domain`.

## Code

| File | Change |
|------|--------|
| `notification-event-registry.types.ts` | `NotificationAttentionScope` type + required field |
| `notification-event-registry.ts` | Lookup helpers |
| `notification-event-registry.definitions.ts` | Scope on all 46 core events |
| `legal-document-notification-event.definitions.ts` | Scope on 19 legal events (all OPERATIONS) |
| `notification-event-registry.spec.ts` | Partition + fingerprint isolation tests |

## Counts (code-derived)

- Total: 65 event types
- FLEET_READINESS: 23
- OPERATIONS: 42

## Audit

See `docs/audits/fleet-readiness-notification-parity-2026-08.md` — **NOT READY FOR PHASE 2** UI split.

## Next steps (Phase 2)

1. Wire missing fleet-readiness producers (compliance, vehicle_alerts, aggregate blocked/ready)
2. Promote shadow producers for fleet types
3. API filter by `attentionScope` from registry lookup (no hardcoded lists)
4. Dashboard UI split (separate PR)
