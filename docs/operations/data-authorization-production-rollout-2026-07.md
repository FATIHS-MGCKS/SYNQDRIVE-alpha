# Data Authorization — Production Rollout (2026-07)

| Field | Value |
|-------|-------|
| **Prompt** | 43 von 44 |
| **Gate** | Prompt 42 Staging-Verifikation |
| **Gate verdict** | **NO-GO** — Rollout **nicht ausgeführt** |
| **Documented at** | 2026-07-24 UTC |
| **Operator** | Cloud Agent |
| **References** | [Staging audit](../audits/data-authorization-staging-runtime-verification-2026-07.md), [Runbook](../runbooks/data-authorization-production-rollout.md), [Incidents](../runbooks/data-authorization-incidents.md) |

---

## Executive decision

| Question | Answer |
|----------|--------|
| **Rollout durchgeführt?** | **Nein** |
| **Grund** | Prompt 42 lieferte ein eindeutiges **NO-GO** (Privacy-Migration `organization_id` UUID/TEXT-Mismatch; 0/15 Runtime-Szenarien; kein Privacy-Schema auf VPS). Prompt 43 erlaubt Ausführung nur bei eindeutigem GO. |

Kein Code-Switch, keine Migration, kein Worker-Wechsel, kein Fail-closed-Umschalten wurde auf Production durchgeführt.

---

## 1. Gate checklist (Prompt 42 → 43)

| Gate criterion | Prompt 42 result | Blocks rollout? |
|----------------|------------------|-----------------|
| Migrations apply cleanly | ❌ Failed `20260723230000_privacy_domain_foundation` | **Yes** |
| Privacy-domain schema present | ❌ Tables absent | **Yes** |
| 15 runtime scenarios pass | ❌ 15 skipped | **Yes** |
| `data_auth_*` metrics on VPS | ❌ 0 series on live binary | **Yes** |
| `synqdrive_data_auth` alerts loaded | ❌ Not on VPS Prometheus | **Yes** |
| Staging audit verdict | **NO-GO** | **Yes** |

**Mandatory next step before any rollout attempt:** Fix privacy migrations (`organization_id` → `TEXT`), resolve failed migration row, re-run Prompt 42 to **GO**.

---

## 2. Production baseline (unchanged)

Captured 2026-07-24 UTC — read-only, no changes made.

| Item | Value |
|------|-------|
| **Active commit** | `51069d1` |
| **Release path** | `/opt/synqdrive/releases/20260723224943_v4994` |
| **Public health** | `https://app.synqdrive.eu/api/v1/health` → `status: ok` |
| **PM2 apps** | `synqdrive` (online), `pm2-logrotate` (online) |
| **Backend exec** | `/opt/synqdrive/current/backend/dist/src/main.js` |
| **PostgreSQL** | localhost:5432, 263 applied migrations on live release |
| **Failed migration row** | `20260723230000_privacy_domain_foundation` (unresolved) |
| **Redis** | PONG |
| **ClickHouse** | `CLICKHOUSE_URL` configured (keys present in shared env; runtime ping not re-verified this prompt) |

### Safety env keys (names only, shared `backend.env`)

- `DATA_AUTH_DECISION_DEV_BYPASS`
- `DATA_AUTH_DECISION_ENFORCEMENT_ENABLED`
- `DATA_AUTH_DECISION_GLOBAL_DENY`
- `RETENTION_DELETION_SCHEDULER_DRY_RUN`

(Appended during Prompt 42 RC attempt; values not logged.)

### Available backups

| Backup | Size | When |
|--------|------|------|
| `db-pre-data-auth-rc-20260724025941.sql.gz` | 51.7 MB | 2026-07-24 02:59 UTC |
| `db-pre-deploy-20260723224943.sql.gz` | 51.6 MB | 2026-07-23 22:49 UTC |

Restore procedure documented in [staging audit §1](../audits/data-authorization-staging-runtime-verification-2026-07.md). **Not exercised** this prompt (no deploy occurred).

---

## 3. Planned rollout sequence (18 steps) — status

All steps **blocked at step 0** by Prompt 42 NO-GO gate. Documented for execution after GO.

| # | Step | Status | Notes |
|---|------|--------|-------|
| 1 | Vollständiges Backup | ⏸️ Blocked | Would run `pg_dump` before any migrate/deploy |
| 2 | Restore-Nachweis | ⏸️ Blocked | Spot-restore to temp DB or checksum verify — not run |
| 3 | Git-Commit verifizieren | ✅ Baseline only | Live: `51069d1`; target RC: `31a1548c` / `53b86321` |
| 4 | Laufende Services erfassen | ✅ Baseline only | PM2, Postgres, Redis, Prometheus, Grafana captured |
| 5 | Alte Worker identifizieren | ✅ Baseline only | Single `synqdrive` PM2 process; Bull queues active (battery, tire) |
| 6 | Migration Dry-Run | ❌ Known fail | `organization_id UUID` vs `organizations.id TEXT` |
| 7 | Feature Flags prüfen | ⏸️ Blocked | Global flags present; per-domain shadow flags not applicable (schema missing) |
| 8 | Backend deployen | ⏸️ Blocked | `vps-deploy-release.sh` / RC script — not executed |
| 9 | Neue Worker im Shadow Mode | ⏸️ Blocked | Requires deployed binary + schema |
| 10 | Coverage und Decision Logs prüfen | ⏸️ Blocked | `authorization_decision_events` table absent |
| 11 | Testmandant verifizieren | ⏸️ Blocked | `createDataAuthPostgresFixture` — privacy schema required |
| 12 | Schrittweise Fail-closed-Aktivierung | ⏸️ Blocked | See §4 enforcement groups |
| 13 | Alte Worker kontrolliert stoppen | ⏸️ Blocked | N/A — no new workers started |
| 14 | Monitoring prüfen | ⏸️ Blocked | `data_auth_*` / `synqdrive_data_auth` not on live stack |
| 15 | Rollback-Bereitschaft erhalten | ✅ | Symlink unchanged; backups available; rollback path documented |
| 16 | Enforcement-Gruppen separat freigeben | ⏸️ Blocked | See §4 |
| 17 | Revocation-Smoke-Test (Testscope) | ⏸️ Blocked | No real provider grants; synthetic tenant only after schema |
| 18 | Abschließende Instanz- und Commit-Prüfung | ⏸️ Blocked | Would verify `data_auth_build_info` git_commit |

---

## 4. Shadow / Fail-closed activation plan (for post-GO execution)

**No activation performed.** Planned per-domain sequence (no Big-Bang):

| Order | Domain | Shadow env | Fail-closed env | Health check after |
|-------|--------|------------|-----------------|-------------------|
| 1 | Telemetry ingest | `DATA_AUTH_INGEST_SHADOW_MODE=true` → `false` | `DATA_AUTH_INGEST_FAIL_CLOSED=false` → `true` | Health + metrics `data_auth_decisions_total` |
| 2 | Trip / location | `DATA_AUTH_TRIP_LOCATION_SHADOW_MODE` | `DATA_AUTH_TRIP_LOCATION_FAIL_CLOSED` | Trip list smoke (synthetic tenant) |
| 3 | Vehicle health | `DATA_AUTH_HEALTH_SHADOW_MODE` | `DATA_AUTH_HEALTH_FAIL_CLOSED` | Health module read |
| 4 | Driving behavior | `DATA_AUTH_DRIVING_BEHAVIOR_SHADOW_MODE` | `DATA_AUTH_DRIVING_BEHAVIOR_FAIL_CLOSED` | Misuse counters stable |
| 5 | Notifications | `DATA_AUTH_NOTIFICATION_SHADOW_MODE` | `DATA_AUTH_NOTIFICATION_FAIL_CLOSED` | Alert pipeline idle |
| 6 | External access (AI/MCP/export) | `DATA_AUTH_EXTERNAL_ACCESS_SHADOW_MODE` | `DATA_AUTH_EXTERNAL_ACCESS_FAIL_CLOSED` | MCP path deny smoke |

**Global guards (must remain):**

- `DATA_AUTH_DECISION_DEV_BYPASS=false`
- `DATA_AUTH_DECISION_ENFORCEMENT_ENABLED=true`
- `DATA_AUTH_DECISION_GLOBAL_DENY=false` (unless incident)
- `RETENTION_DELETION_SCHEDULER_DRY_RUN=true` until retention sign-off

**Shadow evaluation:** Compare `SHADOW_WOULD_DENY` vs `DENY` rates in `authorization_decision_events` and `data_auth_decisions_total` for ≥24h per domain before fail-closed flip. Roll back domain shadow flag on P0/P1.

---

## 5. Worker strategy (planned)

| Phase | Action |
|-------|--------|
| Pre-deploy | Document PM2 `synqdrive` as legacy single-process worker host |
| Post-deploy | Same binary serves API + in-process workers (NestJS); verify Bull queue names unchanged |
| Shadow | All `*_SHADOW_MODE=true`, `*_FAIL_CLOSED=false` |
| Cutover | Per-domain fail-closed; monitor queue depth + `data_auth_*` |
| Stop old | Only after new process handles jobs — PM2 restart is atomic; no parallel old instance |

**Current:** One `synqdrive` PM2 process — no split worker fleet. No worker stop performed.

---

## 6. Rollback status

| Item | Status |
|------|--------|
| Code rollback path | ✅ Ready — symlink to `20260723224943_v4994` |
| DB rollback path | ✅ Backup available — not needed (no schema change this prompt) |
| Failed migration cleanup | ⚠️ Required before retry: `prisma migrate resolve --rolled-back 20260723230000_privacy_domain_foundation` |
| Rollback executed | **No** — nothing to roll back |
| Production impact | **None** from Prompt 43 |

### P0/P1 rollback trigger (when rollout runs)

1. Health check fails after any step
2. Migration error
3. `data_auth_unregistered_path_total` > 0
4. Unexpected `DENY` spike on production tenants
5. Queue backlog growth with decision errors

Action: revert symlink → prior release → `pm2 restart synqdrive` → restore DB only if migrate partially applied.

---

## 7. Open errors / blockers

| ID | Severity | Description |
|----|----------|-------------|
| E1 | **P0** | Privacy migration `organization_id UUID` incompatible with `organizations.id TEXT` |
| E2 | **P0** | Failed migration row blocks `prisma migrate deploy` |
| E3 | **P1** | Privacy-domain tables absent — enforcement stack non-functional |
| E4 | **P1** | Prompt 42 runtime scenarios 0/15 executed |
| E5 | **P2** | `synqdrive_data_auth` alerts not loaded on VPS |
| E6 | **P2** | ClickHouse ping script `.env` parse issue (from Prompt 42) |

---

## 8. Compliance notes

- No production data used for functional tests (rollout not executed).
- No automatic compliance claims — enforcement not active on live stack.
- No real provider grant revocations attempted.
- Secrets and full `.env` contents not logged.

---

## 9. Next mandatory actions (ordered)

1. **Fix migrations** — change `organization_id` columns in privacy migrations `20260723230000` … `20260724130000` from `UUID` to `TEXT` to match Prisma `String` / production `organizations.id`.
2. **Resolve failed migration** — `prisma migrate resolve --rolled-back 20260723230000_privacy_domain_foundation` on VPS.
3. **Re-run Prompt 42** — RC deploy, `verify-data-auth-staging.sh`, 15/15 runtime scenarios → **GO**.
4. **Re-attempt Prompt 43** — execute §3 steps 1–18 with health check after each step.
5. **Import monitoring** — `bash backend/scripts/ops/vps-refresh-monitoring.sh` after successful deploy.

---

## 10. Summary output (Prompt 43)

| Field | Value |
|-------|-------|
| **Rollout durchgeführt** | **Nein** |
| **Aktiver Commit** | `51069d1` |
| **Aktive Instanzen** | 1× PM2 `synqdrive` @ `/opt/synqdrive/releases/20260723224943_v4994` |
| **Aktive Worker** | Embedded in `synqdrive` process; Bull queues (battery.v2, dimo.tire.recalculation) operational |
| **Shadow-/Fail-closed-Status** | **Nicht aktiv** — Data-Auth-Stack nicht deployt; globale Flags in shared env vorbereitet, per-Domain-Shadow nicht anwendbar |
| **Offene Fehler** | E1–E6 (siehe §7) |
| **Rollbackstatus** | Bereit, nicht ausgeführt; Production unverändert |
| **Nächste zwingende Maßnahme** | Privacy-Migration `organization_id`-Typfix + Prompt-42-Neuverifikation → GO |
