# DTC / Error Codes — change ledger (append-only)

## 2026-10-17 — DTC-02 P1 observability (draft, not deployed)

- Added `synqdrive_dtc02_*` Prometheus metrics on existing DTC scheduler fan-out, poll, webhook, and source-trust DB snapshots (no cadence/semantics/clear behavior changes).
- Documented occurrenceCount legacy vs 01A semantics (`docs/dtc-02-occurrence-count-semantics.md`).
- Evidence: `evidence/DTC02_P1_OBSERVABILITY.md` (offboarded eligibility read-only finding).

## 2026-10-15 — DTC-01F1 authority bootstrap + pilot prep (draft)

- Registry: `NOT_STARTED` → `AUDIT_IN_PROGRESS`
- Evidence: Production read-only baseline `evidence/PRODUCTION_BASELINE_2026-10-15.md`
- Code (draft): cohort gate env, `REFRESH_SOURCE_WATERMARK` decision, downstream skip on identical codeset

## 2026-10-15 — DTC-01F3 webhook cohort parity (draft PR #2042)

- `evaluateDtcWebhookAdmission` aligned with poll fan-out; no legacy fallback for non-cohort when cohort ON.
- Global OFF: legacy webhook only for eligible lifecycles (offboarded/archived skipped).
- `DimoWebhookController`: admission before `normalizeDtcCodes` / legacy mutations; boot cohort invalid log on webhook module.
- Tests: `dtc-01f-cohort-gate.spec.ts` parity matrix; `dimo-webhook.controller.spec.ts` DTC admission cases.
- Contract: global rollout risk + dual-replica env symmetry.

## 2026-10-15 — DTC-01F2 pilot safety closure (draft PR #2042)

- **Complete/partial reconciliation:** channel-specific watermarks; `last_accepted_codes_hash` only on confirmed complete; partial cannot overwrite complete hash; `needsEpisodeReconciliation` blocks unsafe `REFRESH_SOURCE_WATERMARK`; defer clears preserve VLS `obdDtcList` vs active episodes.
- **Cohort poll admission:** `evaluateDtcPollJobAdmission` — global OFF → legacy enqueue; cohort ON → allowlist-only (no legacy fallback); invalid cohort → fan-out fail-closed; OFFBOARDED/ARCHIVED never enqueued; boot error log on invalid config.
- **Tests:** unit timeline T100/T200/T150/T250; PostgreSQL integration same timeline; cohort admission matrix extended.
- **Contract:** `docs/dtc-01a-safety-contract.md` §01F updated for poll vs webhook cohort semantics.
- **Validation:** local unit pass; disposable PostgreSQL via `scripts/test/dtc-01b-postgres-ci.sh` on CI (agent VM has no Docker).
