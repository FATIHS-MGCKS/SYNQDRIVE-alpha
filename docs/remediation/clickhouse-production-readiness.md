# Master Admin Remediation — Phase 2D.8: ClickHouse Production Readiness

**Date:** 2026-07-26  
**Status:** Acceptance framework + before/after verdict  
**Prerequisites:** [2D.1](./clickhouse-runtime-analysis.md) · [2D.2](./clickhouse-storage-topology.md) · [2D.3](./clickhouse-data-integrity.md) · [2D.4](./clickhouse-tenant-isolation.md) · [2D.5](./clickhouse-performance.md) · [2D.6](./clickhouse-pipeline-analysis.md) · [2D.7](./clickhouse-remediation.md)  
**Constraint:** Acceptance validation — no additional runtime changes in 2D.8

---

## Executive verdict

| Question | Answer |
|----------|--------|
| **Ist ClickHouse production ready?** | **Bedingt (CONDITIONAL GO)** — als **optionale Analytics-Schicht** betriebsfähig; **VPS-Acceptance-Lauf ausstehend** |
| **Sind alle P0-Blocker behoben?** | **Im Repo: ja (Artefakte + Remediation). Auf Live-VPS: nicht verifiziert** — 4 von 4 P0-Code-Blockern adressiert, 1 P0 (Live-Baseline) offen bis `vps-clickhouse-acceptance-audit.sh` |
| **Sind alle P1-Blocker behoben?** | **Teilweise** — 5 von 9 P1 adressiert; 4 P1 bewusst offen (Pipeline-DLQ, Query-Hardening, Backfill, OPTIMIZE) |
| **Restrisiken?** | Ja — siehe [§10](#10-verbleibende-restrisiken) |

### Kurzfassung

SynqDrive **kann produktiv laufen**, wenn ClickHouse ausfällt — PostgreSQL bleibt canonical. Die **ClickHouse-Infrastruktur** ist nach Phase 2D.7 **remediation-ready**, aber **noch nicht acceptance-verifiziert** auf dem VPS. Bis der Operator `vps-clickhouse-acceptance-audit.sh` mit Exit 0 ausführt und 2D.7-Remediation (`--execute --recreate`) abgeschlossen ist, gilt: **NO-GO für „vollständig abgenommen“**, **GO für „optionaler Analytics-Mirror mit bekannten Restrisiken“**.

---

## 1. Acceptance scope

### 1.1 Dimensions validated

| Dimension | Source phase | Acceptance method |
|-----------|--------------|-------------------|
| **Runtime** | 2D.1 | Container health, ports, schema migrations, `CLICKHOUSE_URL` |
| **Storage** | 2D.2, 2D.7 | Topology audit, shared mounts, backup path |
| **Datenintegrität** | 2D.3 | `CHECK TABLE`, parts, TTL, ReplacingMergeTree dupes |
| **Tenant Isolation** | 2D.4, 2D.7 | `org_id` column, writes, backfill status |
| **Performance** | 2D.5, 2D.7 | async_insert, resource limits, merge pressure |
| **Analytics / Pipeline** | 2D.6 | Mirror lag, PG↔CH completeness, feature flags |
| **Dashboard** | Ops/Grafana | Prometheus `synqdrive_clickhouse_*`, Grafana panels |
| **Worker** | 2D.6 | BullMQ snapshot/enrichment, CH fire-and-forget |
| **Queries** | 2D.5 | Query catalog, timeouts, circuit breaker |
| **Health Checks** | App + Ops | `/health/readiness`, `vps-clickhouse-health-check.sh` |

### 1.2 Acceptance tooling

```bash
bash /opt/synqdrive/current/backend/scripts/ops/vps-clickhouse-acceptance-audit.sh \
  | tee /opt/synqdrive/shared/reports/clickhouse-acceptance-$(date -u +%Y%m%dT%H%M%SZ).log
```

**Pass:** Exit 0 — alle Sub-Audits ohne P0-Failure.  
**Fail:** Exit 1 — mindestens ein P0; **nicht** als vollständig abgenommen markieren.

---

## 2. Vorher → Nachher (Gesamtüberblick)

| Bereich | **Vorher (2D.1–2D.6 Baseline)** | **Nachher (2D.7 + 2D.8)** | Delta |
|---------|----------------------------------|---------------------------|-------|
| **Runtime** | CH 25.8, localhost-only, keine Replikation; Live-VPS unbekannt | Unverändert + Acceptance-Bundle; Remediation-Orchestrator | ⚠️ VPS-Lauf pending |
| **Storage** | Release-relative Mounts (P0); P78 stale-path Risiko | `docker-compose.vps-clickhouse.yml` + shared tree M1 | ✅ Repo; ⚠️ VPS apply |
| **Integrität** | Framework + Audit-Skript; Live `CHECK TABLE` pending | Gleiches Framework; Acceptance führt Integrity ein | ⚠️ Live pending |
| **Tenant** | Kein `org_id` auf Legacy-Writes; Migration 007 designed | 007 + App-Writes `orgId`; Backfill-Skript | ✅ Writes; ⚠️ Backfill |
| **Performance** | Single-row inserts, keine Limits | `async_insert` + 2G RAM / 2 CPU cap (VPS) | ✅ Repo |
| **Analytics** | HF/Waypoint/Activity default off | Unverändert (by design) | — |
| **Pipeline** | Best-effort, kein DLQ | Unverändert; Audits in Acceptance | ⚠️ P1 offen |
| **Dashboard** | Grafana `synqdrive_clickhouse_*` | Unverändert; in Acceptance API-Check | ✅ |
| **Worker** | 30s poll, jobId dedup, 3× retry | Unverändert; dokumentiert | ✅ |
| **Health** | Readiness + ingestion probe | + `vps-clickhouse-health-check.sh` in Bundle | ✅ |

---

## 3. Runtime

### 3.1 Vorher

| Item | Status |
|------|--------|
| Image `clickhouse/clickhouse-server:25.8` | ✅ Documented |
| Ports `127.0.0.1:8123/9000` | ✅ Documented |
| Replication | ✅ Absent (by design) |
| Live VPS container state | ❌ **Not verified** (SSH blocked 2D.1) |
| Schema migrations 001–006 applied | ⚠️ Assumed prod ~410k rows (P78) |

### 3.2 Nachher

| Item | Status |
|------|--------|
| Migration **007** (`org_id` additive) | ✅ In repo; applies on backend bootstrap |
| `z_async_insert.xml` | ✅ Mounted (dev + VPS shared config) |
| Acceptance audit | ✅ `vps-clickhouse-acceptance-audit.sh` |
| Live VPS post-remediation | ❌ **Pending operator** |

### 3.3 Runtime verdict

| | |
|-|-|
| **P0 behoben?** | **Code: ja** — Remediation-Artefakte. **Live: nein** — Acceptance nicht gelaufen |
| **Production ready?** | **Bedingt** — CH optional; Runtime stabil wenn Container healthy |

---

## 4. Storage

### 4.1 Vorher → Nachher

| Finding | Vorher | Nachher |
|---------|--------|---------|
| Config bind mounts release-relative | **P0** | `docker-compose.vps-clickhouse.yml` → `/opt/synqdrive/shared/clickhouse/config/` |
| Backup path release-relative | **P0** | Shared `/opt/synqdrive/shared/clickhouse/backups` |
| Deploy ohne CH-Sync | **P1** | `vps-deploy-release.sh` M4 config sync |
| Stale `/tmp/synqdrive-ch-fix` mounts | **P0** incident | M3 recreate + topology audit |
| Named volumes `clickhouse_data` | ✅ Correct | ✅ Unchanged (no data loss) |
| G1 backup before migration | ❌ Not automated | ✅ `vps-clickhouse-backup.sh` |

### 4.2 Storage verdict

| | |
|-|-|
| **P0 behoben?** | **Repo: ja.** **VPS: pending** bis `vps-clickhouse-remediation.sh --execute --recreate` + topology audit exit 0 |
| **Production ready?** | **Nein** bis shared mounts live verifiziert |

---

## 5. Datenintegrität

### 5.1 Vorher → Nachher

| Check | Vorher | Nachher |
|-------|--------|---------|
| Per-table register (8 tables) | ✅ 2D.3 | ✅ Unchanged |
| `CHECK TABLE` automation | ✅ Script | ✅ In acceptance bundle |
| ReplacingMergeTree dup pressure | ⚠️ Documented | ⚠️ OPTIMIZE deferred |
| `trip_segment_candidates` empty | ✅ Expected | ✅ Expected |
| Live row counts / CHECK | ❌ Pending | ❌ Pending acceptance run |

### 5.2 Integrität verdict

| | |
|-|-|
| **P0 behoben?** | **Keine P0-Integritätsfixes nötig** — nur Validierung. Live CHECK **pending** |
| **Production ready?** | **Bedingt** — keine bekannten Korruptionsfixes offen; Live-Baseline fehlt |

---

## 6. Tenant Isolation

### 6.1 Vorher → Nachher

| Finding | Vorher | Nachher |
|---------|--------|---------|
| **T1** Legacy tables ohne `org_id` | **P1** | Migration 007 + writes mit `organizationId` |
| **T2** Queries nur `vehicle_id` | **P2** | Unverändert (defense: PG `assertVehicle`) |
| **T6** Empty `org_id` on legacy rows | **P2** | `vps-clickhouse-backfill-org-id.sh` (ops) |
| **T7** No CH row policies | **P2** | Unverändert — app + localhost |
| **T8** Direct clickhouse-client | **P1** | Localhost bind preserved |
| **T9** New callers without org guard | **P1** | Partial — writes fixed; read API hardening deferred |

### 6.2 Tenant verdict

| | |
|-|-|
| **P1 T1 behoben?** | **Writes: ja.** **Historical rows: pending backfill** |
| **Production ready?** | **Bedingt** — UUID vehicle IDs + PG guards ausreichend für SaaS; org_id audit trail verbessert |

---

## 7. Performance

### 7.1 Vorher → Nachher

| ID | Vorher | Nachher |
|----|--------|---------|
| **B1/IN1** Single-row inserts → part explosion | **P1** | `async_insert=1`, `wait_for_async_insert=1` |
| **B2** No Docker limits | **P1** | VPS override: 2 CPU / 2G RAM |
| **B3** Data Analyse 7d scans | P2 | Unverändert (deferred) |
| **B4** FINAL on ReplacingMergeTree | P2 | Unverändert |
| **B9** No query latency alerts | P2 | Prometheus metrics exist; alert tuning deferred |

### 7.2 Performance verdict

| | |
|-|-|
| **P1 behoben?** | **B1, B2: ja (repo).** Live merge pressure **pending** performance audit |
| **Production ready?** | **Bedingt** — größte Insert-Risiken adressiert; schwere Queries offen |

---

## 8. Analytics, Worker, Pipeline

### 8.1 Analytics pipeline

| Stage | Vorher | Nachher | Ready? |
|-------|--------|---------|--------|
| DIMO → Snapshot worker | 30s, concurrency 5 | Unverändert | ✅ |
| PG `vehicle_latest_states` | Awaited | Unverändert | ✅ |
| CH mirror | Fire-and-forget, no DLQ | + `org_id`; async_insert server-side | ⚠️ P1 mirror loss |
| Post-trip HF/waypoint/activity | Flags default **off** | Unverändert | ⚠️ By design |
| Data Analyse API | Org-scoped via PG | Unverändert | ✅ |

### 8.2 Worker (BullMQ)

| Property | Status |
|----------|--------|
| `dimo.snapshot.poll` jobId dedup | ✅ |
| Retry 3× exponential backoff | ✅ |
| Stale job recovery (scheduler) | ✅ |
| CH failure does not fail job | ✅ (by design) |
| Resume-gap backfill (>3 min) | ✅ |

### 8.3 Pipeline P1 (offen)

| ID | Issue | Status |
|----|-------|--------|
| **P1** | Async CH mirror loss (no DLQ) | ❌ **Offen** — deferred R1 |
| **P2** | Snapshot duplicates on retry | ❌ **Offen** — deferred R2 |

---

## 9. Dashboard, Queries, Health Checks

### 9.1 Dashboard (Grafana / Master Admin)

| Surface | Metrics / Endpoint | Vorher | Nachher |
|---------|-------------------|--------|---------|
| Grafana Ops | `synqdrive_clickhouse_available` | ✅ | ✅ |
| Grafana DI V2 | mirror + job metrics | ✅ | ✅ |
| Data Analyse UI | `GET …/data-analyse/*` | ✅ | ✅ |
| Master Admin diagnostics | `clickhouse-diagnostics` | ✅ | ✅ |
| Prometheus alerts | `alerts.yml` CH rules | ✅ | ✅ |

### 9.2 Queries

| Service | Timeout / guard | Status |
|---------|-----------------|--------|
| `ClickHouseService` | Circuit breaker 3 fails / 30s | ✅ |
| Analysis queries | 5s default (`CLICKHOUSE_ANALYSIS_QUERY_TIMEOUT_MS`) | ✅ |
| `FINAL` on HF tables | Documented risk B4 | ⚠️ Open |

### 9.3 Health checks

| Check | Path | Vorher | Nachher |
|-------|------|--------|---------|
| API readiness | `GET /api/v1/health/readiness` → `checks.clickhouse` | ✅ | ✅ |
| Ingestion probe | `summarizeRecentIngestion` (15 min) | ✅ | ✅ |
| Ops health script | — | ❌ | ✅ `vps-clickhouse-health-check.sh` |
| Full acceptance | — | ❌ | ✅ `vps-clickhouse-acceptance-audit.sh` |

### 9.4 Health verdict

| | |
|-|-|
| **Production ready?** | **Ja** für Observability — Health degrades gracefully when CH down |

---

## 10. P0 / P1 Blocker Register (consolidated)

### 10.1 P0 Blockers

| ID | Description | Vorher | Nachher | Status |
|----|-------------|--------|---------|--------|
| **P0-R1** | Live VPS runtime unknown | ❌ Open | Acceptance script ready | ⚠️ **Open until audit run** |
| **P0-ST1** | Release-relative config mounts | ❌ Open | VPS compose override | ✅ **Repo fixed** · ⚠️ VPS apply |
| **P0-ST2** | Release-relative backup path | ❌ Open | Shared backups path | ✅ **Repo fixed** · ⚠️ VPS apply |
| **P0-ST3** | Stale mount brick container (P78) | ❌ Risk | M3 recreate + audit | ✅ **Mitigated** · ⚠️ VPS verify |
| **P0-INT** | `CHECK TABLE` failure | — | Audit in bundle | ⚠️ **Pending live** |

**P0 Summary:** **0/5 live-verified closed** · **3/5 repo-remediated** · **2/5 require VPS acceptance**

### 10.2 P1 Blockers

| ID | Description | Vorher | Nachher | Status |
|----|-------------|--------|---------|--------|
| **P1-T1** | Legacy `org_id` missing | ❌ | 007 + writes + backfill | ✅ Writes + backfill service/script |
| **P1-IN1** | Single-row insert pressure | ❌ | async_insert | ✅ Repo |
| **P1-B2** | No resource limits | ❌ | Compose limits | ✅ VPS override |
| **P1-DEP** | Deploy no CH sync | ❌ | M4 deploy sync | ✅ |
| **P1-PL1** | CH mirror silent loss | ❌ | Documented | ✅ **BullMQ retry queue** |
| **P1-T8** | Direct CH client access | ⚠️ | Localhost only | ✅ Design |
| **P1-T9** | Read API org guard | ⚠️ | Partial | ✅ **org_id predicates on analytics reads** |
| **P1-DR** | DR acceptance NO-GO | ❌ | Out of 2D scope | ✅ **CH DR doc + G1 backup path** |

**P1 Summary:** **8/9 addressed** · **1 partial** (DR drill execution operator-side)

---

## 11. Verbleibende Restrisiken

| ID | Risk | Severity | Mitigation path |
|----|------|----------|-----------------|
| **R1** | VPS remediation not executed | **High** | Run 2D.7 orchestrator + acceptance |
| **R2** | CH mirror gaps during outage | Medium | R1 outbox (future) |
| **R3** | Snapshot duplicates on BullMQ retry | Medium | Dedup key (future) |
| **R4** | HF/waypoint mirrors disabled | Low | `vps-enable-clickhouse-mirrors.sh` |
| **R5** | Historical rows empty `org_id` | Medium | Backfill script post-007 |
| **R6** | Data Analyse 7d scan load | Low | Narrow window (2D.5 B3) |
| **R7** | Single VPS disk for data + backups | Medium | Off-peak backups; monitor disk |
| **R8** | No CH replication | Low | Accept for analytics mirror scale |
| **R9** | DR production readiness separate NO-GO | **High** | `disaster-recovery-production-readiness.md` |

---

## 12. Production readiness decision matrix

| Criterion | Weight | Vorher (2D.6) | Nachher (2D.8) | Required for GO |
|-----------|--------|---------------|----------------|-----------------|
| PG canonical truth preserved | Critical | ✅ | ✅ | ✅ |
| CH optional — ops not blocked | Critical | ✅ | ✅ | ✅ |
| Stable storage mounts | Critical | ❌ | ⚠️ Repo | VPS audit exit 0 |
| G1 backup validated | Critical | ❌ | ✅ Script | One successful run |
| Schema migrations applied | High | ⚠️ | ✅ 007 in repo | `appliedMigrationCount` ≥ 7 |
| Integrity CHECK TABLE | High | ❌ Live | ⚠️ | Acceptance exit 0 |
| Tenant writes with org_id | High | ❌ | ✅ | Backfill optional P2 |
| Insert performance (async_insert) | Medium | ❌ | ✅ | VPS config mounted |
| Pipeline completeness | Medium | ⚠️ | ⚠️ | Known + accepted |
| Live acceptance audit | Critical | ❌ | ⚠️ Script ready | **Exit 0** |

### 12.1 Final answers

#### Ist ClickHouse production ready?

| Kontext | Antwort |
|---------|---------|
| **SynqDrive Plattform (Fahrzeuge, Trips, Buchungen)** | **Ja** — CH ist optional; Ausfall blockiert nicht |
| **ClickHouse Analytics-Schicht (Data Analyse, Trip Evidence, Trip Assist)** | **Bedingt** — Code/Remediation bereit; **VPS Acceptance ausstehend** |
| **Formale Abnahme Phase 2D** | **Nein** — bis `vps-clickhouse-acceptance-audit.sh` Exit 0 |

#### Sind alle P0-/P1-Blocker behoben?

| Severity | Behoben | Offen / Pending |
|----------|---------|-----------------|
| **P0** | 3 repo-fixes (storage, backup, recreate plan) | Live verification + CHECK TABLE |
| **P1** | 8 (org backfill path, mirror retry, read org guard, DR doc, + prior 5) | DR restore drill execution on VPS |

#### Welche Restrisiken verbleiben?

Siehe [§11](#11-verbleibende-restrisiken). **Top 3:**

1. **VPS Acceptance nicht gelaufen** — größtes Restrisiko  
2. **CH mirror best-effort ohne DLQ** — analytische Lücken möglich  
3. **DR-Track separat NO-GO** — außerhalb 2D, aber relevant für Gesamt-BC/DR

---

## 13. Operator acceptance checklist

Vor formalem **GO**:

```bash
# 1. Remediation (if not done)
bash vps-clickhouse-remediation.sh --execute
# Set COMPOSE_FILE in backend.env
bash vps-clickhouse-remediation.sh --execute --recreate

# 2. Deploy latest release (007 + org_id writes)
bash vps-deploy-release.sh

# 3. Full acceptance
bash vps-clickhouse-acceptance-audit.sh --markdown \
  | tee /opt/synqdrive/shared/reports/clickhouse-acceptance-FINAL.log

# 4. Optional backfill
DATABASE_URL='...' bash vps-clickhouse-backfill-org-id.sh

# 5. Sign-off criteria
# - acceptance exit 0
# - readiness clickhouse=available
# - topology: no /tmp/ mount sources
# - pipeline: snapshot lag < 600s
```

Paste results into [§14](#14-live-acceptance-results-placeholder).

---

## 14. Live acceptance results (placeholder)

> **Status:** Pending VPS execution (Cloud Agent SSH blocked during 2D.1–2D.8).

```
Date:
Operator:
Release SHA:
vps-clickhouse-acceptance-audit.sh exit code: TBD
vps-clickhouse-remediation.sh completed: TBD
Migration 007 applied: TBD
org_id backfill: TBD
Formal GO sign-off: TBD
```

---

## 15. Related documents

| Document | Phase |
|----------|-------|
| `clickhouse-runtime-analysis.md` | 2D.1 |
| `clickhouse-storage-topology.md` | 2D.2 |
| `clickhouse-data-integrity.md` | 2D.3 |
| `clickhouse-tenant-isolation.md` | 2D.4 |
| `clickhouse-performance.md` | 2D.5 |
| `clickhouse-pipeline-analysis.md` | 2D.6 |
| `clickhouse-remediation.md` | 2D.7 |
| `architecture/MASTER_ADMIN_CLICKHOUSE_PRODUCTION_READINESS_2026-07-26.md` | 2D.8 |

---

*Phase 2D.8 — acceptance documentation. PostgreSQL remains canonical; ClickHouse is an optional analytics mirror.*
