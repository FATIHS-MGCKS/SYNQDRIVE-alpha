# Vehicle Signal Intelligence — Change ledger

Append-only architecture change record.

| Date | Change | Phase | Evidence |
|------|--------|-------|----------|
| 2026-10-15 | P0+P1 signal capability profiles merged (#2034 @ `eb5f1f2ee`) | P0, P1 | [`evidence/VSI_P0P1_MERGE_BASELINE_2026-10-15.md`](../evidence/VSI_P0P1_MERGE_BASELINE_2026-10-15.md), [`CURRENT_STATE.md`](../CURRENT_STATE.md) |
| 2026-10-15 | Canonical **Product Charter**, **Master Roadmap** (P0–P7), **Cross-workstream contracts**, **Product governance** PR checklist | Governance | [`VSI_PRODUCT_CHARTER.md`](../VSI_PRODUCT_CHARTER.md), [`VSI_MASTER_ROADMAP.md`](../VSI_MASTER_ROADMAP.md) |
| 2026-10-15 | **P2 automatic profile lifecycle** — outbox, VO/DIMO link hooks, deactivation limitations, catalog-advance enqueue, backfill plan, registry expansion design | P2 | `vsi-profile-lifecycle.*`, [`VSI_SIGNAL_REGISTRY_EXPANSION_PLAN.md`](VSI_SIGNAL_REGISTRY_EXPANSION_PLAN.md), `vsi-profile-lifecycle.postgres.integration.spec.ts` |
| 2026-10-15 | **P2 hardening (PR #2038)** — outbox PROCESSING lease + claim token, lifecycle event ordering, foreign-VLS isolation on lifecycle init, backfill continuation enqueue, expanded disposable PostgreSQL certification | P2 | migration `20261015210000_vsi_p2_outbox_claim_lease`, `vsi-profile-lifecycle-ordering.*`, CI `vsi03-p2c-postgres-ci.sh` |
| 2026-10-15 | **P3 signal fingerprint v1** — profile contract v2, quality classifier, bundle historical loader, accelerator/position materialization keys, disposable PG fingerprint suite | P3 | `vsi-signal-fingerprint.*`, `vsi-profile-fingerprint.postgres.integration.spec.ts`, [`evidence/VSI_P3_BASELINE_2026-10-15.md`](../evidence/VSI_P3_BASELINE_2026-10-15.md) |
| 2026-10-15 | **P3 product correctness hardening (PR #2041)** — empirical VLS extractors, bundle vs per-signal separation, latest-64 history window, registry matrix flags, expanded unit/PG tests | P3 | `vsi-profile-empirical-extractor.ts`, `vsi-raw-payload-signals.util.ts`, `vsi-signal-quality.classifier.ts`, `vsi03-p2c-postgres-ci.sh` (43 tests) |
| 2026-10-16 | **P4 capability resolver v1** — consumer requirements + fallback registries, read-only resolver engine/API, disposable PG tests | P4 | `vsi-capability-resolver.*`, `vsi-consumer-requirements.registry.ts`, `VSI_P4_DOMAIN_APPROVAL_MATRIX.md` |
| 2026-10-16 | **P4 final hardening** — empirical/freshness fail-closed gates, fixture registry isolation, APDS design-contract approval, controller evaluationTime validation | P4 | `vsi-capability-resolver.empirical.ts`, `vsi-capability-resolver.test-registry.ts`, domain matrix |
| 2026-10-16 | **P4 design vs runtime approval** — `APPROVED_DESIGN_CONTRACT` cannot yield runtime ELIGIBLE; `REQUIREMENT_RUNTIME_APPROVAL_ABSENT` | P4 | `vsi-consumer-requirements.registry.ts`, resolver engine |
| 2026-10-16 | **P4 merged** — capability resolver v1 (#2045 @ `a0ce01f19`) | P4 | GitHub #2045 |
| 2026-10-16 | **P5A read-only APDS correlation** — adapter, demand vector, pure correlation engine, P5B config gate (default OFF), no `adaptive-polling-shadow` hook | P5 | `vsi-apds-p5.*`, [`VSI_P5_APDS_INTEGRATION.md`](VSI_P5_APDS_INTEGRATION.md) |
| 2026-10-16 | **P5A correctness hardening** — evidence-time semantics, APDS opportunity binding, P4-shared requirement evaluation, fail-closed tenant/link protection, honest replay parity wording | P5 | `vsi-apds-profile-evidence-time.ts`, `vsi-apds-shadow-opportunity-binding.ts`, `evaluateVsiConsumerRequirement` export |
