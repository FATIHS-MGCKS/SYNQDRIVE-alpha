# R9 — Deployment availability incident RCA (2026-10-09)

| Field | Value |
|-------|-------|
| **Evidence ID** | `DIM-EV-R22-DEPLOY-RCA-001` |
| **AUDIT_MODE** | `READ_ONLY` |
| **Incident window (UTC)** | `2026-10-09T15:17:43Z` – `~15:39Z` (public 503 during VO5C joint deploy orchestration) |
| **DIMO R9 provider transition** | Ignition `failed` @ `15:22:29Z`; Speed `failed` @ `15:22:50Z` |
| **Authority cross-ref** | DSRG VO5C joint deploy orchestrator @ VPS `vo5c-joint-deploy-orchestrate.sh` |

## Executive summary (precision)

| Claim | Status |
|-------|--------|
| DIMO increments `failureCount` on HTTP ≥400 / timeout / network error | **CONFIRMED** (provider source, R2.1) |
| nginx returned **503** with body `SynqDrive scheduled maintenance` to DIMO `User-Agent: DIMO-Webhook/1.0` | **CONFIRMED** (access log sample + orchestrator nginx stub) |
| **40** webhook POSTs received **503** on 2026-10-09 between `15:21:03` and `15:22:50` UTC | **CONFIRMED** (reproducible aggregate) |
| Each 503 maps 1:1 to a provider failure count increment | **INFERRED** (provider semantics); per-request provider audit log **UNAVAILABLE** |
| Rolling PM2 restart caused the 15:21 503 burst | **REJECTED** — rolling restart logged @ **15:38:07** UTC, **after** provider `failed` transition |
| Release directory mtime `15:27` = deploy start | **PARTIALLY WRONG** — clone/build/migrate ran under maintenance; **switch + rolling** @ **15:38** |
| VO5C orchestrator **Phase 1** puts **all public HTTPS** behind nginx `return 503` maintenance | **CONFIRMED** (script on VPS) |

## Reproducible nginx aggregation (corrected vs R2.1)

**Bug in R2.1 daily table:** `grep 'Oct/2026:09'` matches only **hour 09** on October dates (`[09/Oct/2026:09:…]`), not the full calendar day → falsely reported **381** POSTs.

**Correct filter for calendar day 2026-10-09 (UTC):** `grep '09/Oct/2026:'` across rotated nginx logs.

| Metric | Value | Method |
|--------|-------|--------|
| Total `POST /api/v1/webhooks/dimo` | **791** | `r22-nginx-dimo-webhook-aggregate.sh 2026-10-09` |
| HTTP **200** | **751** | `awk '{print $9}'` histogram |
| HTTP **503** | **40** | same |
| Sum check | **791 = 751 + 40** | **PASS** |

Script: [`scripts/r22-nginx-dimo-webhook-aggregate.sh`](../scripts/r22-nginx-dimo-webhook-aggregate.sh).

## UTC timeline (evidence-merged)

```text
15:17:43Z  Orchestrator start #1 → nginx test FAIL (duplicate upstream backup file) → ABORT (no maintenance)
15:20:03Z  Orchestrator start #2 → Phase 1 maintenance ON (nginx return 503 all locations)
           → curl public health expects 503 → PASS isolation check
           → deploy runner Permission denied → ABORT (maintenance restore on fail path may run)
15:21:03Z  First DIMO webhook POST → 503 (nginx access log, DIMO-Webhook/1.0)
15:21–15:22  40× webhook POST 503 (burst)
15:22:29Z  Provider: R9 Ignition → status failed, failureCount=12
15:22:50Z  Provider: R9 Speed → status failed, failureCount=28
15:23:54Z  Orchestrator start #3 → preflight ABORT (dirty pinned executor tree)
15:26:00Z  Orchestrator start #4 → maintenance ON → backup → preflight PASS
15:26–15:38  Build, migrate, boot check (public still 503 per Phase 1 design)
15:38:07Z  ln -sfn release + rolling restart replica A then B (local health via 127.0.0.1)
15:38:44Z  Internal health PASS (localhost)
~15:39Z    Phase 6 nginx restore from golden backup (script); external curl in log still saw 503 once → orchestrator logged external_health_failed (deploy artifacts on disk show release promoted)
```

**Deploy lock / rollback:** `vps-deploy-release.sh` captures `last-deploy-state.env`, supports `vps_replica_rollback` on rolling failure — **not exercised** in successful path. VO5C rollback guard referenced in deploy script.

## Hypothesis matrix (503 root cause)

| # | Hypothesis | Result | Evidence |
|---|------------|--------|----------|
| 1 | Both replicas down simultaneously @ 15:21 | **UNLIKELY** | Local `127.0.0.1:3001/3002` health used during deploy; orchestrator pre-phase replica health @ 15:26 |
| 2 | nginx upstream empty / bad | **REJECTED for 15:21** | Maintenance config **does not proxy** — explicit `return 503` |
| 3 | Explicit nginx maintenance 503 mode | **CONFIRMED** | Orchestrator Phase 1 stub |
| 4 | Nest controller returned 503 | **REJECTED for sampled lines** | 503 while maintenance stub active; response size 32 bytes matches maintenance body |
| 5 | Other (rate limit, WAF) | **INSUFFICIENT_EVIDENCE** | No WAF log reviewed |

## DSRG / deployment governance note

Authorized joint deploy intentionally **isolates public traffic** during long-running phases while allowing **localhost** health gates (`SYNQDRIVE_EXTERNAL_HEALTH_URL=http://127.0.0.1:3001/...` during Phase 4). **Side effect:** DIMO Vehicle Triggers callbacks to `https://app.synqdrive.eu/...` receive **503** for the maintenance window — counted as provider delivery failures → R9 definitions **`failed`**.

**Gap:** No documented exemption or pause for DIMO webhook definitions before maintenance (contrast: human-operated deploy checklist).

## Incident diagram (ASCII)

```text
VO5C Orchestrator                nginx (public)              DIMO Triggers API
      |                                |                              |
      | Phase 1: swap site to 503 -----+----> POST /webhooks/dimo --> 503
      |                                |                              |
      |        (build/migrate ~12m)    |         failureCount++       |
      |                                |                              |
      | Phase 4: rolling PM2 --------->| (still 503 to public)        |
      |                                |                              |
      | Phase 6: restore proxy -------+----> 200 (post-restore)       |
      |                                |                              |
      X R9 already status=failed       |                              |
        (15:22, before rolling 15:38)  |                              |
```
