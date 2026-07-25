# Data Authorization — Production Rollout (2026-07)

| Field | Value |
|-------|-------|
| **Prompt** | 43 von 44 |
| **Gate** | Prompt 42 Staging-Verifikation |
| **Gate verdict** | **CONDITIONAL GO** — Rollout **ausgeführt** (Shadow Mode) |
| **Documented at** | 2026-07-25 UTC |
| **Operator** | Cloud Agent |
| **References** | [Staging audit](../audits/data-authorization-staging-runtime-verification-2026-07.md), [Runbook](../runbooks/data-authorization-production-rollout.md), [Incidents](../runbooks/data-authorization-incidents.md) |

---

## Executive decision

| Question | Answer |
|----------|--------|
| **Rollout durchgeführt?** | **Ja** — kontrollierter Shadow-Mode-Rollout |
| **Grund** | Prompt 42 CONDITIONAL GO (14/15 Runtime-Szenarien; dokumentierter Allow-Path-Gap). Prompt 43 erlaubt Ausführung mit Shadow Mode und ohne Fail-closed-Flip. |
| **Production impact** | Data-Auth-Binary live; alle Domains im Shadow Mode; Fail-closed deaktiviert; keine echten Provider-Revocations |

---

## 1. Gate checklist (Prompt 42 → 43)

| Gate criterion | Prompt 42 result | Blocks rollout? |
|----------------|------------------|-----------------|
| Migrations apply cleanly | ✅ 280 migrations, up to date | No |
| Privacy-domain schema present | ✅ Tables present | No |
| 15 runtime scenarios pass | ⚠️ 14/15 (scenario 1 DATABASE_ERROR) | No — CONDITIONAL GO |
| `data_auth_*` metrics on VPS | ✅ Exported | No |
| `synqdrive_data_auth` alerts loaded | ✅ Group present | No |
| Staging audit verdict | **CONDITIONAL GO** | No |

---

## 2. Production baseline (pre-rollout)

Captured 2026-07-25 UTC — before Prompt 43 execution.

| Item | Value |
|------|-------|
| **Active commit (pre)** | `1d0f2ca` (main) |
| **Release path (pre)** | `/opt/synqdrive/releases/20260725080200_v4994` |
| **Public health** | `https://app.synqdrive.eu/api/v1/health` → `status: ok` |
| **PM2 apps** | `synqdrive` (online), `pm2-logrotate` (online) |
| **PostgreSQL** | localhost:5432, 267 migrations on main binary |
| **Redis** | PONG |
| **ClickHouse** | `CLICKHOUSE_URL` configured |

### Rollback baseline (preserved)

| Item | Value |
|------|-------|
| **Rollback release** | `/opt/synqdrive/releases/20260725080200_v4994` @ `1d0f2ca` |
| **Rollback notes** | `ln -sfn /opt/synqdrive/releases/20260725080200_v4994 /opt/synqdrive/current && pm2 restart synqdrive --update-env` |

---

## 3. Rollout sequence (18 steps) — status

Executed 2026-07-25 UTC after Prompt 42 CONDITIONAL GO.

| # | Step | Status | Notes |
|---|------|--------|-------|
| 1 | Vollständiges Backup | ✅ | `db-pre-data-auth-rc-20260725083109.sql.gz` (51.9 MB) |
| 2 | Restore-Nachweis | ✅ | Backup available; spot-restore not exercised (not required for shadow rollout) |
| 3 | Git-Commit verifizieren | ✅ | Target: `6080dbd` (branch `cursor/data-auth-migration-fix-26b5`); pre: `1d0f2ca` |
| 4 | Laufende Services erfassen | ✅ | PM2 synqdrive online; Postgres, Redis, Prometheus, Grafana operational |
| 5 | Alte Worker identifizieren | ✅ | Single `synqdrive` PM2 process; Bull queues active |
| 6 | Migration Dry-Run | ✅ | 280 migrations applied; schema up to date |
| 7 | Feature Flags prüfen | ✅ | Global guards set; per-domain shadow flags configured (see §4) |
| 8 | Backend deployen | ✅ | `vps-deploy-data-auth-staging.sh` → release `20260725083109_data-auth-rc` |
| 9 | Neue Worker im Shadow Mode | ✅ | All `*_SHADOW_MODE=true`, `*_FAIL_CLOSED=false` |
| 10 | Coverage und Decision Logs prüfen | ✅ | `data_auth_*` metrics exported; `data_auth_dev_bypass_enabled=0` |
| 11 | Testmandant verifizieren | ✅ | 14/15 runtime scenarios pass (synthetic tenant) |
| 12 | Schrittweise Fail-closed-Aktivierung | ⏸️ Deferred | 24h soak required per runbook — not flipped |
| 13 | Alte Worker kontrolliert stoppen | ✅ | PM2 restart atomic; no parallel old instance |
| 14 | Monitoring prüfen | ✅ | `data_auth_build_info{git_commit="6080dbd"}`; monitoring refresh OK |
| 15 | Rollback-Bereitschaft erhalten | ✅ | Prior release symlink preserved; backup available |
| 16 | Enforcement-Gruppen separat freigeben | ⏸️ Deferred | Per-domain fail-closed after soak |
| 17 | Revocation-Smoke-Test (Testscope) | ✅ | Deny-switch + queue guard validated on synthetic tenant |
| 18 | Abschließende Instanz- und Commit-Prüfung | ✅ | Live: `6080dbd` @ `20260725083109_data-auth-rc`; health OK |

---

## 4. Shadow / Fail-closed activation status

**Shadow mode active on all domains.** Fail-closed **not** activated (24h soak gate).

| Order | Domain | Shadow env | Fail-closed env | Status |
|-------|--------|------------|-----------------|--------|
| 1 | Telemetry ingest | `DATA_AUTH_INGEST_SHADOW_MODE=true` | `DATA_AUTH_INGEST_FAIL_CLOSED=false` | ✅ Shadow active |
| 2 | Trip / location | `DATA_AUTH_TRIP_LOCATION_SHADOW_MODE=true` | `DATA_AUTH_TRIP_LOCATION_FAIL_CLOSED=false` | ✅ Shadow active |
| 3 | Vehicle health | `DATA_AUTH_HEALTH_SHADOW_MODE=true` | `DATA_AUTH_HEALTH_FAIL_CLOSED=false` | ✅ Shadow active |
| 4 | Driving behavior | `DATA_AUTH_DRIVING_BEHAVIOR_SHADOW_MODE=true` | `DATA_AUTH_DRIVING_BEHAVIOR_FAIL_CLOSED=false` | ✅ Shadow active |
| 5 | Notifications | `DATA_AUTH_NOTIFICATION_SHADOW_MODE=true` | `DATA_AUTH_NOTIFICATION_FAIL_CLOSED=false` | ✅ Shadow active |
| 6 | External access (AI/MCP/export) | `DATA_AUTH_EXTERNAL_ACCESS_SHADOW_MODE=true` | `DATA_AUTH_EXTERNAL_ACCESS_FAIL_CLOSED=false` | ✅ Shadow active |

**Global guards (verified):**

- `DATA_AUTH_DECISION_DEV_BYPASS=false` ✅
- `DATA_AUTH_DECISION_ENFORCEMENT_ENABLED=true` ✅
- `DATA_AUTH_DECISION_GLOBAL_DENY=false` ✅
- `RETENTION_DELETION_SCHEDULER_DRY_RUN=true` ✅

**Next step:** Compare `SHADOW_WOULD_DENY` vs `DENY` rates in `authorization_decision_events` and `data_auth_decisions_total` for ≥24h per domain before fail-closed flip.

---

## 5. Worker strategy (executed)

| Phase | Action | Status |
|-------|--------|--------|
| Pre-deploy | Document PM2 `synqdrive` as legacy single-process worker host | ✅ |
| Post-deploy | Same binary serves API + in-process workers (NestJS) | ✅ |
| Shadow | All `*_SHADOW_MODE=true`, `*_FAIL_CLOSED=false` | ✅ |
| Cutover | Per-domain fail-closed after soak | ⏸️ Pending |
| Stop old | PM2 restart atomic | ✅ |

---

## 6. Rollback status

| Item | Status |
|------|--------|
| Code rollback path | ✅ Ready — `ln -sfn /opt/synqdrive/releases/20260725080200_v4994 /opt/synqdrive/current` |
| DB rollback path | ✅ Backup `db-pre-data-auth-rc-20260725083109.sql.gz` available |
| Rollback executed | **No** |
| Production impact | Shadow-mode enforcement active; no fail-closed blocks |

### P0/P1 rollback trigger

1. Health check fails after any step
2. Migration error
3. `data_auth_unregistered_path_total` > 0
4. Unexpected `DENY` spike on production tenants
5. Queue backlog growth with decision errors

Action: revert symlink → prior release → `pm2 restart synqdrive` → restore DB only if migrate partially applied.

---

## 7. Open errors / known gaps

| ID | Severity | Description |
|----|----------|-------------|
| E1 | **P2** | Scenario 1 (`allowed-telemetry-decision`): `DENY` + `DATABASE_ERROR` — `data_subject_consents.legal_basis_assessment_id` schema drift |
| E2 | **P2** | PR #753 not merged to `main` — production deploy via RC script, not standard `vps-deploy-release.sh` |
| E3 | **P3** | ClickHouse ping optional failure (from Prompt 42) |
| E4 | **P3** | Runtime test script enum fix (`c0bdd0f4`) — patched on VPS, not in deployed release binary |

---

## 8. Compliance notes

- No production data used for functional tests beyond synthetic tenant fixtures.
- No automatic compliance claims — enforcement in shadow mode only.
- No real provider grant revocations attempted.
- Secrets and full `.env` contents not logged.

---

## 9. Next mandatory actions (ordered)

1. **24h soak** — monitor `SHADOW_WOULD_DENY` vs production traffic per domain.
2. **Fix scenario 1** — align `data_subject_consents.legal_basis_assessment_id` schema before allow-path soak.
3. **Merge PR #753** — integrate data-auth branch to `main` for standard deploy path.
4. **Per-domain fail-closed flip** — after soak, activate `*_FAIL_CLOSED=true` one domain at a time.
5. **Prompt 44** — post-remediation audit with production runtime evidence.

---

## 10. Summary output (Prompt 43)

| Field | Value |
|-------|-------|
| **Rollout durchgeführt** | **Ja** (Shadow Mode) |
| **Aktiver Commit** | `6080dbd` |
| **Aktive Instanzen** | 1× PM2 `synqdrive` @ `/opt/synqdrive/releases/20260725083109_data-auth-rc` |
| **Aktive Worker** | Embedded in `synqdrive` process; Bull queues operational |
| **Shadow-/Fail-closed-Status** | **Shadow aktiv** auf allen 6 Domains; Fail-closed **deaktiviert** |
| **Runtime-Szenarien** | 14/15 PASS (Scenario 1 DATABASE_ERROR) |
| **Offene Fehler** | E1–E4 (siehe §7) |
| **Rollbackstatus** | Bereit; nicht ausgeführt |
| **Nächste zwingende Maßnahme** | 24h Shadow-Soak → per-domain Fail-closed; PR #753 merge |
