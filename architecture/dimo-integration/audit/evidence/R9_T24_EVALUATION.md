# R9 T+24 Natural Evaluation

| Field | Value |
|-------|-------|
| **Earliest evaluation UTC** | `2026-10-12T20:41:00Z` |
| **Status** | `PENDING` — populate after read-only production pass |

## Checklist (read-only)

- [ ] Provider speed + ignition trigger state (failure counts, enabled)
- [ ] Authorized cohort vs `dimo-r9-webhook-health.config.ts` defaults
- [ ] Webhooks received (PM2 / ingress logs)
- [ ] `synqdrive_trip_snapshot_wake_total` by outcome
- [ ] Snapshot poll correlation (success/failure, excluded tokens)
- [ ] End-to-end natural event (if any) — else **NOT_OBSERVED**

**No synthetic webhooks. No provider mutations.**

---

_Evidence appended by R4.5 automation below this line._
