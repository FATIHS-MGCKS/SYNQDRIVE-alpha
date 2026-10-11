# EXP021-S4P2-R1 — Alert reliability & merge readiness

**Date (UTC):** 2026-10-11  
**PR:** #1988 (draft)  
**Production:** READ-ONLY — `GLOBAL_KILL=KILLED` unchanged

## 1. Merge coordination (#1987 + #1988)

| PR | Scope | Overlap |
|----|-------|---------|
| **#1987** | S4P1 audit + `di-v0-s4p1-safety-gate-contract.spec.ts` | 4 files |
| **#1988** | S4P1 cherry-pick + S4P2 alerts/metrics + S4P2-R1 fixes | Superset of #1987 |

**Integration order (human):**

1. Merge **#1987** to `main` first.
2. Rebase **#1988** onto `main` and **drop** duplicate commit `074cbd9f2b` (S4P1 cherry-pick) — or merge #1988 with GitHub “merge main” resolving only S4P2 deltas.
3. No file-level conflict expected: #1988 touches monitoring + `s4-runtime/*` only; #1987 is docs + gate6 spec only.

**Drift check:** `git diff origin/main...HEAD` should be reviewed after each `main` advance; overlapping S4P1 paths must remain identical to #1987.

## 2. Metric freshness

| Mechanism | Behavior |
|-----------|----------|
| Refresh interval | 60s (`DI_V0_S4_OPERATIONAL_REFRESH_INTERVAL_SECONDS`) |
| Leader only | Followers call `resetDiV0S4OperationalPrometheusMetrics()` — no stale max() from old leader |
| Overlap guard | `refreshInFlight` skips concurrent SQL |
| Success | `synqdrive_di_v0_s4_operational_last_success_unixtime`, `refresh_error=0` |
| Failure | `markDiV0S4OperationalRefreshFailed()` clears aggregates + `refresh_error=1` |
| Stale alert | `DiV0S4OperationalMetricsStale` if success age > 180s while `activity_signal>=1` |

SQL load: bounded S4F snapshot (`workBatchLimit=5`, `beyondHorizonBatchLimit=5`) + one allowlist COUNT.

## 3. Alert semantics (R1 fixes)

| Area | Fix |
|------|-----|
| **Discovery** | Split `DiV0S4DiscoverySchedulerMissing` (absent counter, `for: 20m`) vs `DiV0S4DiscoverySchedulerStale` (`increase<1` over 1h) |
| **DIMO budget** | `min(synqdrive_dimo_global_budget_enabled)==0` + `activity_signal` gate |
| **Dormant** | `activity_signal` requires `NOT_KILLED`+staged or work items — staged-only while KILLED does not page |
| **Replica drift** | Requires `count(up{job="synqdrive-backend"}==1)>=2` |
| **Global kill** | Warning only when `activity_signal>=1` |
| **Control plane** | Requires fresh operational success timestamp |

## 4. Validation

```bash
cd backend && npm run test:di:s4p2:prometheus-rules
cd backend && npm run test:di:s4f7as:gate6-open-rekill-operator
```

**Alert delivery:** still **UNVERIFIED** (no production synthetic fire).

## 5. Deploy safety — `vps-refresh-monitoring.sh`

| Step | Safeguard |
|------|-----------|
| Before copy | `validate_prometheus_bundle()` — promtool check on alerts.yml, alerts-infra.yml, alerts-di-s4.yml |
| On validation fail | Exit 1 — **does not** overwrite `$PROM_DIR` |
| On copy | Timestamped `.bak.*` for each rules file |
| Prometheus reload | POST `/-/reload`; restart only if reload fails |
| Alertmanager | Restart **only** when rendered `alertmanager.yml` content changes (cmp) |

**Post-refresh verification:**

```bash
curl -sf http://127.0.0.1:9090/-/healthy
curl -sf http://127.0.0.1:9090/api/v1/rules | jq '.data.groups[] | select(.name=="synqdrive_di_v0_s4_shadow") | .name'
```

**Rollback:** Restore `*.bak.*` files to `$PROM_DIR`, `curl -X POST http://127.0.0.1:9090/-/reload`.

## 6. Runbook anchors

- **#metric-freshness** — `DiV0S4OperationalMetricsStale`; inspect leader logs + DB connectivity.
- **#discovery** — Missing vs stale alerts; confirm `di_v0_s4_discovery` scheduler ticks on leader.
