# EXP021-S4P2 — Unattended operations & alert integration

**Date (UTC):** 2026-10-11  
**Base:** `origin/main` @ audit time (`7266dbefc197e912947cd2aefe95941440161114`)  
**Production:** READ-ONLY (no deploy, no LIVE_OPEN, no env mutation)  
**Kill policy:** `GLOBAL_KILL=KILLED` unchanged by this slice

## Phase 1 — Observability audit (repository + documented production)

| Capability | Exists in repo? | Operational on Production? | Evidence |
|------------|-----------------|---------------------------|----------|
| Prometheus scrape (A/B replicas) | **YES** | **INFERRED** (Wave-3 deploy evidence) | `backend/monitoring/prometheus/prometheus.vps.yml` L26–40 |
| Alertmanager routing (critical / warning / escalation) | **YES** | **DOCUMENTED** closed 2026-08-18 | `backend/monitoring/alertmanager/alertmanager.yml.example`; `docs/final/master-admin-alertmanager-production-closure.md` |
| VPS config refresh (rules → host) | **YES** | Requires deploy + `vps-refresh-monitoring.sh` | `backend/scripts/ops/vps-refresh-monitoring.sh` |
| S4 runtime config attestation metric | **YES** | Per-replica gauge at scrape | `synqdrive_di_v0_s4_runtime_config_attestation_info` — `di-v0-s4-runtime-config-attestation.metrics.ts` |
| S4F reconciliation snapshot (SQL aggregates) | **YES** | Read-only service, not HTTP | `DiV0S4fReconciliationService` |
| S4-specific Prometheus alert rules (pre-S4P2) | **NO** | N/A | Grep `monitoring/prometheus` — no `di_v0_s4` before S4P2 |
| Gate-6 monitoring SQL bundle | **YES** | Manual ops / playbook | `GATE6_MONITORING_QUERIES` in `di-v0-s4-gate6-open-rekill-production.lib.ts` |
| Platform Admin Alertmanager summary API | **YES** | Reads `ALERTMANAGER_INTERNAL_URL` | `platform-ops-alertmanager.service.ts` |
| Grafana dashboards for S4 | **UNKNOWN** | Not found in repo search | — |
| **Alert delivery to humans (live test this slice)** | N/A | **UNVERIFIED** | No production firing test authorized |

**Conclusion:** SynqDrive already has a **standard Prometheus → Alertmanager → receiver** stack. S4 lacked **dedicated alert rules** and **low-cardinality operational gauges** derived from S4F aggregates. This PR adds both without a parallel control plane.

## Phase 2 — Alert rules (severity)

Catalog: `backend/scripts/ops/di-v0-s4-gate6-open-rekill-production/di-v0-s4p2-alert-rules.contract.ts`  
Rules file: `backend/monitoring/prometheus/alerts-di-s4.yml`

| Alert | Severity | Signal |
|-------|----------|--------|
| `DiV0S4RuntimeConfigAttestationReplicaDrift` | CRITICAL | Fingerprint count > 1 while `activity_signal` |
| `DiV0S4SchedulerLeaderElectionBroken` | CRITICAL | ≠1 leader while S4 active |
| `DiV0S4AllowlistTenantViolation` | CRITICAL | `allowlist_violation_work_items` > 0 |
| `DiV0S4AttemptsExhausted` | CRITICAL | T10 exhausted candidates |
| `DiV0S4ControlPlaneUnreadable` | CRITICAL | `control_plane_readable` == 0 |
| `DiV0S4DimoBudgetDisabledWhileStaged` | CRITICAL | STAGED attestation + budget gauge 0 |
| `DiV0S4GlobalKillOpen` | WARNING | `global_not_killed` == 1 (authorized pilot or incident) |
| `DiV0S4ExpiredLeasesPersistent` | WARNING | Expired leases 15m+ |
| `DiV0S4EvidencePinInconsistent` | WARNING | Missing required pins |
| `DiV0S4DimoBudgetCooldownSustained` | WARNING | Cooldown 30m+ |
| `DiV0S4DimoPostTripAcquireTimeouts` | WARNING | POST_TRIP acquire timeouts |
| `DiV0S4DiscoverySchedulerStale` | WARNING | No discovery ticks 2h while STAGED |
| `DiV0S4FailedTerminalWorkItems` | WARNING | FAILED_TERMINAL count > 0 |

**Noise control:** `synqdrive_di_v0_s4_activity_signal` gates most shadow alerts while dormant (`GLOBAL_KILL=KILLED`, no work items, non-STAGED config).

## Phase 3 — Integration

| Change | Purpose |
|--------|---------|
| `DiV0S4OperationalMetricsService` | Leader-only 60s refresh; publishes gauges from S4F snapshot + allowlist violation count |
| `alerts-di-s4.yml` + Prometheus `rule_files` | Wire rules into VPS/local Prometheus templates |
| `vps-refresh-monitoring.sh` / `vps-setup-prometheus.sh` | Copy `alerts-di-s4.yml` to host |

**CRITICAL response route:** Existing Alertmanager receivers `synqdrive-critical` and `synqdrive-escalation` (`alertmanager.yml.example`). **Containment:** manual `EMERGENCY_REKILL` operator — **no** automatic rekill implemented or tested.

### Runbook anchors

- **#replica-drift** — Compare `synqdrive_di_v0_s4_runtime_config_attestation_info` per replica; fix env parity; abort if unexplained.
- **#scheduler-leader** — `synqdrive_scheduler_leader_status`; Redis lock health.
- **#global-kill** — Confirm owner authorization; else Gate-6 `EMERGENCY_REKILL`.
- **#allowlist** — SQL from `unexpectedTenantWork` in Gate-6 monitoring queries.
- **#stuck-leases** — Maintenance reaper + claim loop metrics (`synqdrive_scheduler_tick_total{scheduler="di_v0_s4_claim_loop"}`).
- **#retries-exhausted** — Inspect `FAILED_TERMINAL` / executor DIMO errors.
- **#evidence-persistence** — `pin_required_missing` gauge; evidence snapshot tables.
- **#control-plane** — `di_v0_s4_control` readability.
- **#dimo-budget** — `synqdrive_dimo_global_budget_enabled`, cooldown, acquire timeouts.
- **#discovery** — `di_v0_s4_discovery` scheduler ticks.
- **#worker-failures** — `synqdrive_di_v0_s4_work_items{status="FAILED_TERMINAL"}`.

## Phase 4 — Testing (offline)

```bash
cd backend && npm run test:di:s4f7as:gate6-open-rekill-operator
cd backend && npm test -- di-v0-s4-operational-prometheus.metrics.spec.ts
```

Optional local rule syntax: `promtool check rules backend/monitoring/prometheus/alerts-di-s4.yml` (when promtool installed).

**Delivery:** **UNVERIFIED** in this slice (no authorized production synthetic alert fire).

## Phase 5 — Pilot readiness

| Gate | Status |
|------|--------|
| Unattended metrics export | **Engineering complete** (after deploy) |
| Alert rules in Prometheus | **After** monitoring refresh on VPS |
| Alert delivery | **UNVERIFIED** until acceptance test or real incident |
| Automatic containment | **NO** |
| Five-vehicle / sold 187336 / NATIVE off / KILLED | Unchanged policy |

**READY_FOR_UNATTENDED_PILOT:** **PARTIAL** — code-ready; production wiring + delivery proof still required before relying on paging.
