# Vehicle Signal Intelligence — Change ledger

Append-only architecture change record.

| Date | Change | Phase | Evidence |
|------|--------|-------|----------|
| 2026-10-15 | P0+P1 signal capability profiles merged (#2034 @ `eb5f1f2ee`) | P0, P1 | [`evidence/VSI_P0P1_MERGE_BASELINE_2026-10-15.md`](../evidence/VSI_P0P1_MERGE_BASELINE_2026-10-15.md), [`CURRENT_STATE.md`](../CURRENT_STATE.md) |
| 2026-10-15 | Canonical **Product Charter**, **Master Roadmap** (P0–P7), **Cross-workstream contracts**, **Product governance** PR checklist | Governance | [`VSI_PRODUCT_CHARTER.md`](../VSI_PRODUCT_CHARTER.md), [`VSI_MASTER_ROADMAP.md`](../VSI_MASTER_ROADMAP.md) |
| 2026-10-15 | **P2 automatic profile lifecycle** — outbox, VO/DIMO link hooks, deactivation limitations, catalog-advance enqueue, backfill plan, registry expansion design | P2 | `vsi-profile-lifecycle.*`, [`VSI_SIGNAL_REGISTRY_EXPANSION_PLAN.md`](VSI_SIGNAL_REGISTRY_EXPANSION_PLAN.md), `vsi-profile-lifecycle.postgres.integration.spec.ts` |
