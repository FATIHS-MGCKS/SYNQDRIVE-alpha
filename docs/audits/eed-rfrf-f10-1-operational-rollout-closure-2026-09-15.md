# RFRF F10.1 — Operational production rollout closure

**Date:** 2026-09-15  
**Branch:** `cursor/rfrf-f10-1-operational-closure-f21f`  
**Base:** `main` @ `55ad2438e3cb8abecdbdb8015c3a49b2ca3eee15` (F9 merge #1662)

## Classification

| Field | Value |
|-------|-------|
| RFRF_RUNTIME_SEMANTICS_CHANGED | NO |
| PRISMA_SCHEMA_CHANGED | NO |
| NEW_MIGRATION_REQUIRED | NO |
| Scope | OPERATIONAL TOOLING + DOCUMENTATION + MONITORING CONFIG |

## F10.0 blocker closure map

| F10.0 blocker | F10.1 artifact |
|---------------|----------------|
| No operator runbook | `docs/operations/rfrf-production-rollout-runbook-2026-09-15.md` |
| No RFRF enablement script | `rfrf-production-enable-stage.sh` + `rfrf-production-rollback.sh` |
| F8 alerts not loaded in prod | `rfrf-monitoring-verify-alerts.sh` + `rfrf-monitoring-sync-alerts.sh` + dual-scrape `prometheus.vps.yml` |
| Missing env documentation | `backend/.env.example` RFRF section |
| Single-replica Prometheus scrape | `prometheus.vps.yml` replica a+b targets; alert aggregation updated |
| No blast-radius gate | `rfrf-production-blast-radius-assessment.sh` |

## Topology reassessment

| Verdict | Result |
|---------|--------|
| PRODUCTION_RUNTIME_TOPOLOGY_MATCHES_F9 | YES (2 replicas, shared PG/Redis, advisory locks — unchanged) |
| PRODUCTION_OBSERVABILITY_TOPOLOGY_COMPLETE | NO until dual-scrape config deployed + alerts synced (tooling ready) |

## Operational artifacts

| Path | Purpose |
|------|---------|
| `backend/scripts/ops/lib/rfrf-production-rollout.lib.sh` | Shared stage/flag/cutover/monitoring helpers |
| `backend/scripts/ops/rfrf-production-preflight.sh` | Read-only production preflight |
| `backend/scripts/ops/rfrf-production-blast-radius-assessment.sh` | Pre-Stage-5 assessment |
| `backend/scripts/ops/rfrf-production-enable-stage.sh` | Staged enablement (no enable-all) |
| `backend/scripts/ops/rfrf-production-rollback.sh` | Reverse-order rollback |
| `backend/scripts/ops/rfrf-monitoring-verify-alerts.sh` | F8 alert verification |
| `backend/scripts/ops/rfrf-monitoring-sync-alerts.sh` | Monitoring sync wrapper |
| `backend/scripts/ops/rfrf-production-rollout.selftest.sh` | Deterministic tooling tests |
| `backend/scripts/test/rfrf-f10-operational-tooling-gate.sh` | Consolidated gate |

## Monitoring changes (config only)

- `prometheus.vps.yml`: scrape `:3001` and `:3002` with `replica` label
- `alerts.yml`: aggregate F8 Physical Refuel expressions for multi-replica scrape

## Production actions explicitly NOT performed

- No production deploy, PM2 restart, backend.env edit, Prometheus reload, flag enable, DB mutation

## Evidence

- EED-EV-0063 (extended by F10.1.1 micro-closure)

---

## F10.1.1 micro-closure (independent review remediation)

Independent review of PR #1665 identified operational fail-closed gaps and dirty PR ancestry. F10.1.1 closes these **without changing RFRF runtime/schema semantics**.

| Finding | F10.1.1 remediation |
|---------|---------------------|
| Dirty/diverged PR ancestry (duplicate F9 commits) | Rebased/transplanted net F10 delta onto current `main` |
| Unreachable Stage 1 (cutover chicken-and-egg) | Stage 0→1 validates **proposed** `RFRF_CUTOVER_AT`; production requires explicit operator UTC ISO timestamp |
| Stale hard-coded deploy SHA default | Removed default; production requires explicit `RFRF_REQUIRED_GIT_SHA` |
| Monitoring apply silently dry-run | `--apply` requires `RFRF_MONITORING_SYNC_ACK=YES` **and** `RFRF_MONITORING_MUTATION=PRODUCTION`; promtool strict validation before reload |
| File-only Prometheus verification | Added live gates: ready, both targets up, F8 rules loaded/healthy + file drift checks |
| Fail-open blast-radius (`|| true`) | Stage 5 requires successful assessment (`BLAST_RADIUS_ASSESSMENT_COMPLETE=YES`) + operator pass; SQL/metrics errors exit non-zero |
| Incomplete Stage 6 gates | Enforces G2 V2 + recovery + valid G2 cutover + worker/readiness gate; dual cutover remains independent authorities |
| Redis/worker diagnostic bug | Fixed readiness `PORT` propagation; Stage 6 blocks on authoritative readiness workers check |
| Multi-replica alert aggregation risk | Documented: `min(recovery_enabled)` safe when live target/config gates pass pre Stage 5/6 |

### Additional artifacts (F10.1.1)

| Path | Purpose |
|------|---------|
| `backend/scripts/test/rfrf-f10-operational-script-contracts.sh` | Script-level fixture contract tests |

### Validation (F10.1.1)

- `bash backend/scripts/test/rfrf-f10-operational-tooling-gate.sh`
- No production mutation
