# Vehicle Signal Intelligence — Master Roadmap

| Field | Value |
|-------|-------|
| **Companion** | [`VSI_PRODUCT_CHARTER.md`](VSI_PRODUCT_CHARTER.md) |
| **Last updated** | 2026-10-15 |
| **Legend** | **MERGED** = on `main` · **DEPLOYED** = production runtime proven separately |

---

## Phase summary

| Phase | Name | Status | Primary artifact |
|-------|------|--------|------------------|
| **P0** | Declared vs observed discovery | **MERGED** (#2034) | Evaluator + declared catalog resolver |
| **P1** | Durable signal profiles | **MERGED** (#2034) | `vehicle_signal_capability_profiles` + materialization |
| **P2** | Automatic onboarding & lifecycle reconciliation | **IN PR #2038** (hardening + CI) | Outbox claim lease, ordering guards, link-scoped lifecycle init, backfill continuation, disposable PG suite |
| **P3** | Signal fingerprint & quality intelligence | **IN PR** (v1 fingerprint) | Profile v2 contract, quality labels, bundle-history cadence, registry coverage matrix |
| **P4** | Capability resolver & validated fallback contracts | Planned | Consumer contracts, approved alternates registry |
| **P5** | APDS read-only profile & consumer-demand integration | Planned | Read APIs + APDS consumer adapter (wired) |
| **P6** | Controlled polling optimization | Planned | Closed-loop APDS with human gates |
| **P7** | Continuous learning & drift detection | Planned | Drift dashboards, alerts, reconciliation jobs |

**MERGED ≠ DEPLOYED.** P0+P1 may exist on `main` while Production lacks migration, materialization traffic, or inspection usage. See [`evidence/VSI_P0P1_MERGE_BASELINE_2026-10-15.md`](evidence/VSI_P0P1_MERGE_BASELINE_2026-10-15.md).

---

## P0 — Declared vs observed discovery (**MERGED**)

### Deliverables

- Canonical signal definitions for initial materialization keys (LV, HV SOC, speed-related keys as scoped).
- `VsiDeclaredCatalogResolver` — cached preflight only on materialization path.
- `evaluateVsiSignalProfile` — merges declared catalog with VSI-03 readonly composer empirical axes.
- Multi-link and provider-mismatch declared attribution guards (`UNKNOWN` + explicit limitations).

### Dependencies

- VSI-03 P1 readonly composer.
- Driving capability + battery capability preflight writers (DIMO integration path).
- VO-SIG connection identity on link metadata.

### Acceptance criteria

- Unit tests for NOT_LISTED vs UNKNOWN preflight rules.
- Composer + evaluator tests without DIMO HTTP on profile materialization.
- Declared axes never attributed to a specific link without provenance when multiple active links exist.

### Evidence requirements

- PR #2034 merge SHA on `main`.
- `vsi-declared-catalog.resolver.spec.ts`, `vsi-profile-evaluator.spec.ts`.

### Cross-workstream ownership

- **VSI** — evaluator semantics.
- **DIMO / driving-capability / battery** — preflight population.
- **VO** — link identity inputs.

### Safety boundaries

- No new DIMO calls on snapshot materialization hook.
- No APDS or capture flag changes.

### Non-goals

- Fleet UI, customer APIs, APDS wiring.

---

## P1 — Durable signal profiles (**MERGED**)

### Deliverables

- Prisma migration `vehicle_signal_capability_profiles`.
- `VsiSignalProfileMaterializationService` — idempotent upsert, revision, fingerprint, concurrency guards.
- Post-VLS fire-and-forget materialization in `dimo-snapshot.processor.ts`.
- Internal inspection API (`MASTER_ADMIN`) + recovery `POST .../materialize`.

### Dependencies

- P0 evaluator.
- VLS upsert ordering (VDC monotonic semantics).
- Disposable PostgreSQL CI harness (`vsi03-p2c-postgres-ci.sh` includes profile integration).

### Acceptance criteria

- Postgres integration: Ruptela + Tesla stratification, tenant isolation, out-of-order skip, multi-link declared UNKNOWN.
- GitHub workflow **VSI03 P2C disposable PostgreSQL certification** green on merge head.

### Evidence requirements

- `vsi-profile-materialization.postgres.integration.spec.ts`.
- Merge commit `eb5f1f2ee238d2d52ce587c9e920fd1548e19901`.

### Cross-workstream ownership

- **VSI** — profile store and APIs.
- **VDC** — VLS binding and timestamp authority.

### Safety boundaries

- Materialization skips when binding mismatch (configurable).
- No production deploy claimed by merge alone.

### Non-goals

- Onboarding automation (P2).
- APDS consumption (P5).

---

## P2 — Automatic onboarding & lifecycle reconciliation

### Deliverables

- VO activation hooks: on link activate/deactivate/supersede → enqueue profile materialization or invalidation.
- Catalog refresh coordination when preflight advances (`declaredCatalogCheckedAt` driven re-materialize).
- HM / multi-provider declared catalog strategy (per-link catalog snapshots where vehicle-scoped preflight is insufficient).

### Dependencies

- P1 durable store.
- VO-SIG P2+ registration paths stable.
- Explicit per-link catalog provenance design (extends P0 guards).

### Acceptance criteria

- New vehicle with single active DIMO link receives profile without manual `POST /materialize`.
- Deactivated link profiles marked inactive or archived per policy (TBD in design note).

### Evidence requirements

- VO + VSI integration tests.
- Production read-only sampling post-deploy (profiles exist for pilot cohort).

### Cross-workstream ownership

- **VO** — hooks and events.
- **VSI** — materialization orchestration.

### Safety boundaries

- Hooks must not block onboarding HTTP path; async only.
- No DIMO storm on bulk import without rate policy.

### Non-goals

- APDS activation.

---

## P3 — Signal fingerprint & quality intelligence

### Deliverables

- Extended profile dimensions: cadence histograms, miss streaks, stale-run counts, poll-to-advance ratios (read-only aggregates).
- Quality labels separate from observation boolean (e.g. `OBSERVED_STALE`, `OBSERVED_LOW_CONFIDENCE`).
- Optional correlation with VSI03 P2C ledger when capture enabled (forensic enrichment, not required).

### Dependencies

- P1 fingerprints.
- VDC poll vs advance metrics alignment.
- ClickHouse / HF mirrors only if provenance contract approved.

### Acceptance criteria

- Quality dimensions documented per canonical signal.
- Tests prove stale LV during sleep does not flip declared LISTED.

### Evidence requirements

- Postgres or analytical fixture suites.
- Pilot vehicle forensics (read-only).

### Cross-workstream ownership

- **VSI** — profile schema extensions.
- **Battery V2 / DI** — consume quality, not redefine.

### Safety boundaries

- No automatic domain algorithm changes from quality labels alone.

### Non-goals

- Replacing Battery V2 REST observability architecture.

---

## P4 — Capability resolver & validated fallback contracts

### Deliverables

- `CapabilityResolver` service: given consumer intent (module, feature, minimum evidence class) → resolved signal plan.
- Registry of **domain-approved** alternates (e.g. HV SOC vs proxy) with validation status.
- Public internal API contracts for DI, Battery, trips, health modules.

### Dependencies

- P3 quality axes.
- Domain sign-off from Battery V2 and Driving Intelligence authorities.

### Acceptance criteria

- Each consumer documents required keys + fallback chain ID.
- Resolver returns `UNKNOWN` when chain not validated — never silent substitute.

### Evidence requirements

- Contract tests per consumer adapter.
- Architecture decision records in owning modules.

### Cross-workstream ownership

- **VSI** — resolver engine.
- **Domain modules** — approve fallback semantics.

### Safety boundaries

- No fallback activation without `VALIDATED` or `PRODUCTION_VALIDATED` decision status.

### Non-goals

- Customer-facing GraphQL redesign in this phase.

---

## P5 — APDS read-only profile & consumer-demand integration

### Deliverables

- Wire `vsi-apds-consumer.adapter` (today contract-only) to read profiles + limitations.
- APDS shadow compares polling decisions against profile-declared needs (read-only).
- Demand vector: which canonical signals consumers currently require per vehicle/link.

### Dependencies

- P1 profiles populated for pilot cohort.
- APDS R5 shadow epoch governance (VDC evidence).
- P4 consumer requirements registry (minimal subset acceptable).

### Acceptance criteria

- APDS shadow logs include profile revision + fingerprint at decision time.
- Zero write-back from APDS into VSI tables without explicit API.

### Evidence requirements

- Shadow replay certification (VDC APDS evidence pattern).
- Integration tests with `WORKER_APD_SHADOW_ENABLED=false` default.

### Cross-workstream ownership

- **APDS / VDC** — decision engine.
- **VSI** — truth supplier.

### Safety boundaries

- Read-only integration only; no polling activation.

### Non-goals

- Production polling policy changes.

---

## P6 — Controlled polling optimization

### Deliverables

- Closed-loop: APDS adjusts poll lists using VSI profiles + demand.
- Human authorization gates (DSRG, APDS epoch pins) before production enable.
- Provider-cost accounting per vehicle/link.

### Dependencies

- P5 read path proven in shadow.
- DIMO global budget configs (DI EXP021 S4F evidence).

### Acceptance criteria

- Demonstrated provider call reduction without capability regression on pilot cohort.
- Rollback pin documented.

### Evidence requirements

- Shadow + canary epochs with before/after metrics.
- Production deploy record separate from merge.

### Cross-workstream ownership

- **APDS** — execution.
- **VSI** — capability inputs.
- **DSRG** — deploy authorization.

### Safety boundaries

- Fail-closed to legacy polling on profile missing or `UNKNOWN` critical signals.

### Non-goals

- Eliminating DIMO polls for signals still required by safety modules without sign-off.

---

## P7 — Continuous learning & drift detection

### Deliverables

- Scheduled reconciliation jobs: compare declared, observed, and consumer satisfaction.
- Drift alerts (catalog changed, observation lost, fingerprint jump).
- Operator/master views (future UI) grounded in profile history.

### Dependencies

- P2 lifecycle automation.
- P3 quality metrics.
- Optional ML suggestions **non-authoritative** until validated.

### Acceptance criteria

- Detect multi-link ambiguity resolution when link deactivated.
- Measure time-to-profile after onboarding < SLO.

### Evidence requirements

- Operational metrics + audit samples.
- Production read-only dashboards.

### Cross-workstream ownership

- **VSI** — drift engine.
- **Platform admin** — surfacing.

### Safety boundaries

- Drift detection does not auto-change domain health scores.

### Non-goals

- Autonomous provider contract changes without human review.

---

## Roadmap governance

All VSI implementation PRs must cite roadmap phase(s) and satisfy [`VSI_PRODUCT_GOVERNANCE.md`](VSI_PRODUCT_GOVERNANCE.md).
