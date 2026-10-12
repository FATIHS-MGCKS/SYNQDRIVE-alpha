# R9 — Permanent resilience options (design only)

| Field | Value |
|-------|-------|
| **Evidence ID** | `DIM-EV-R22-RESILIENCE-001` |
| **Status** | **ENGINEERING_IN_PROGRESS** — R2.5 implements A+B offline (PR #1984); VPS orchestrator wiring pending |

## Problem statement

VO5C production deploy **maintenance nginx stub** returns **503** to all public routes including DIMO webhooks. DIMO treats ≥400 as delivery failures; after threshold, definitions become **`failed`** and **stop firing** until authorized `PUT` — subscriptions remain.

## Options

### Option A — Deployment availability (zero-downtime public path)

**Idea:** Keep proxying to healthy replicas during deploy; avoid global `return 503` for API routes (or exempt `/api/v1/webhooks/dimo`).

| Criterion | Assessment |
|-----------|------------|
| Effectiveness | **High** for preventing recurrence of maintenance-induced `failed` |
| Effort | **Medium** — orchestrator + nginx template + deploy runbook change |
| Risk | Rolling restart may still cause brief upstream errors if both replicas restart sequentially — mitigated by dual-upstream + health-aware nginx |
| Multi-replica | **Required** — already 2 replicas @ 3001/3002 |
| Infra | None beyond nginx config discipline |
| Maintainability | Must stay aligned with DSRG VO5C phases |
| Provider load | Unchanged |
| Security | Maintenance may still apply to SPA static assets only |
| **Order** | **1** — addresses proven Oct-9 root cause |

### Option B — Circuit-breaker observability (GET-only audit + alert)

**Idea:** Scheduled read-only job: `GET /v1/webhooks`, alert on `status=failed`, `failureCount` delta, subscription drift vs SynqDrive cohort allowlist.

| Criterion | Assessment |
|-----------|------------|
| Effectiveness | **High** for time-to-detect; **no** self-heal |
| Effort | **Low–medium** (extend `r9-post-get-audit.mjs` + monitoring) |
| Risk | **Low** — no provider mutation |
| Multi-replica | N/A |
| Infra | Cron/CI or external monitor |
| Maintainability | Reuse existing ops scripts |
| Provider load | Minimal (few GETs/hour) |
| Security | Developer JWT — guard secrets |
| **Order** | **2** — parallel with A |

### Option C — Controlled recovery (operator-gated PUT)

**Idea:** Formalize `gt-r1-unplug-webhook-recovery.mjs` pattern for R9 UUIDs with `--confirm-webhook`, diff printing, audit log file.

| Criterion | Assessment |
|-----------|------------|
| Effectiveness | **High** for remediation after failure |
| Effort | **Low** — script + runbook ([R9_RECOVERY_OWNER_GATE.md](R9_RECOVERY_OWNER_GATE.md)) |
| Risk | **Medium** — wrong UUID / wrong payload |
| Multi-replica | N/A |
| Infra | None |
| Maintainability | Single script per webhook family |
| Provider load | One PUT per definition |
| Security | Separate authorization per execution |
| **Order** | **3** — after B detects failure |

### Option D — Ingress buffering (durable edge queue)

**Idea:** HA ingress (queue + worker) accepting DIMO POSTs during app maintenance, replay when Nest healthy.

| Criterion | Assessment |
|-----------|------------|
| Effectiveness | **High** if replay semantics match DIMO retry expectations |
| Effort | **High** — new component, auth, dedupe, ordering, replay contract |
| Risk | **High** — duplicate wakes, security boundary, PII at edge |
| Multi-replica | Decouples provider from app replicas |
| Infra | Queue/store + consumers |
| Maintainability | New on-call surface |
| Provider load | May duplicate if DIMO also retries |
| Security | Verification token / payload trust at edge |
| **Order** | **4** — only if A insufficient |

## Recommendation

Implement **A + B** first (prevent + detect). Keep **C** as documented operator path. Defer **D** unless product requires webhook SLA independent of monolith deploy.
