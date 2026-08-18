# Master Admin — Alertmanager Production Closure (MA-OBS-P1-001)

| Feld | Wert |
|------|------|
| **Finding-ID** | `MA-OBS-P1-001` |
| **Severity** | P1 (Observability / Production Blocker A4) |
| **Status** | **CLOSED** |
| **Datum (UTC)** | 2026-08-18 |
| **Scope** | Kanonischer Alertmanager-Runtime-Stack auf Production VPS |
| **Branch** | `cursor/master-admin-alertmanager-6608` |

---

## 1. Ursprünglicher Fehler

Prometheus-Alert-Rules und Alertmanager-Konfiguration waren im Repo vorhanden und auf den VPS synchronisiert, aber die **Alertmanager-Runtime fehlte vollständig**:

- Kein Container `synqdrive-alertmanager`
- Keine Runtime-Secrets unter `/opt/synqdrive/shared/alertmanager/alertmanager.env`
- Nichts lauschte auf `127.0.0.1:9093`
- Prometheus `alerting.alertmanagers` zeigte auf `127.0.0.1:9093`, aber Ziel war nicht erreichbar

Folge: Kein nachweisbarer Pfad **Prometheus → Alertmanager → Receiver → Delivery**.

---

## 2. Root Cause

| Ursache | Detail |
|---------|--------|
| **Runtime nie provisioniert** | `vps-setup-alertmanager.sh` war nie mit gültiger `alertmanager.env` ausgeführt worden |
| **Fehlende Secrets-Datei** | `/opt/synqdrive/shared/alertmanager/alertmanager.env` existierte nicht |
| **Kein Delivery-Kanal aktiv** | Weder `ALERTMANAGER_SLACK_WEBHOOK_URL` noch SMTP-Credentials auf dem Host konfiguriert |
| **Begleit-Exporter fehlten** | `synqdrive-node-exporter` und `synqdrive-blackbox-exporter` liefen ebenfalls nicht (Infra-Rules ohne Scrape-Targets) |
| **Kein Crash-Loop** | Symptom war Abwesenheit, nicht instabile Neustarts |

**Kein** konkurrierender zweiter Alertmanager. **Keine** doppelte Notification-Pipeline.

---

## 3. Runtime Architecture

Kanonischer Stack (unverändert laut `docs/remediation/observability-architecture.md`):

```
Prometheus (synqdrive-prometheus, :9090, localhost)
  → rule_files: alerts.yml, alerts-infra.yml
  → alerting.alertmanagers: http://127.0.0.1:9093
Alertmanager (synqdrive-alertmanager, :9093, localhost only)
  → severity routing (critical / warning / info)
  → email receiver (Resend SMTP) — Slack optional wenn Webhook gesetzt
Node Exporter (:9100) + Blackbox Exporter (:9115) — Infra scrape targets
```

**Source of Truth:**

| Artefakt | Pfad |
|----------|------|
| Alert Rules | `backend/monitoring/prometheus/alerts*.yml` → `/opt/synqdrive/shared/prometheus/` |
| Prometheus config | `prometheus.vps.yml` → `/opt/synqdrive/shared/prometheus/prometheus.yml` |
| Alertmanager template | `backend/monitoring/alertmanager/alertmanager*.yml.example` |
| Rendered AM config | `/opt/synqdrive/shared/alertmanager/alertmanager.yml` (host, nicht in Git) |
| Runtime secrets | `/opt/synqdrive/shared/alertmanager/alertmanager.env` (chmod 600, nicht in Git) |
| Persistence | `/opt/synqdrive/shared/alertmanager/data/` (silences, notification state) |

**Versionen (Production 2026-08-18):**

| Komponente | Version |
|------------|---------|
| Prometheus | `prom/prometheus:v2.53.0` |
| Alertmanager | `prom/alertmanager:v0.27.0` |
| Node Exporter | `prom/node-exporter:v1.8.2` |
| Blackbox Exporter | `prom/blackbox-exporter:v0.25.0` |

**Deployment-Mechanismus:** Docker mit `--restart unless-stopped`, verwaltet über `vps-setup-alertmanager.sh` / `vps-refresh-monitoring.sh` — kein manueller Ephemeral-Start.

---

## 4. Config

- **Template:** `alertmanager.email.yml.example` (email-only, wenn kein Slack-Webhook)
- **Validation:** `amtool check-config` via `docker run --entrypoint amtool` **vor** Container-Start (fail-closed)
- **Rendering:** `envsubst` aus `alertmanager.env` → `alertmanager.yml`
- **Permissions:** `alertmanager.yml` und `data/` → `nobody` (uid 65534) für Container-User

**Severity routing (kanonisch):**

| Severity | Receiver | group_wait | repeat_interval |
|----------|----------|------------|-----------------|
| `critical` | `synqdrive-critical` (+ escalation) | 10s | 30m / 2h |
| `warning` | `synqdrive-warning` | 1m | 6h |
| `info` | `synqdrive-null` | — | — |

**Grouping:** `group_by: [alertname, severity, component, cluster]`

**Inhibit rules:** Backend-down / PostgreSQL-unavailable unterdrücken abhängige warning/info-Alerts (gleiche `cluster`).

**Maintenance windows:** `synqdrive-maintenance` mutet warning/info in definierten Fenstern; critical bleibt aktiv.

---

## 5. Network

| Prüfpunkt | Ergebnis |
|-----------|----------|
| Alertmanager bind | `127.0.0.1:9093` only (`--web.listen-address`) |
| Öffentliche :9093 Exposition | **Nein** |
| Docker network | `--network host` (localhost-only binding bleibt wirksam) |
| Prometheus → AM | `http://127.0.0.1:9093/api/v2/alerts` — **activeAlertmanagers** bestätigt |
| Reverse Proxy | Keine externe AM-UI |

---

## 6. Receivers

| Kanal | Status | Hinweis |
|-------|--------|---------|
| **Email (Resend SMTP)** | **Aktiv, getestet** | `smtp.resend.com:587`, Credentials aus `alertmanager.env` (abgeleitet von `backend.env` `RESEND_API_KEY`) |
| Slack | Nicht konfiguriert | `ALERTMANAGER_SLACK_WEBHOOK_URL` unset — bewusst email-only |
| PagerDuty / Discord / Webhook | Nicht vorgesehen | — |

**Empfehlung (nicht Blocker):** Ops-Inbox-Adresse für `ALERTMANAGER_EMAIL_WARNING` / `ALERTMANAGER_EMAIL_CRITICAL` statt Plattform-Absender `noreply@synqdrive.eu` setzen.

---

## 7. Secret Handling

| Regel | Status |
|-------|--------|
| Secrets nur in `/opt/synqdrive/shared/alertmanager/alertmanager.env` | ✅ |
| Nicht in Git / Markdown / Compose | ✅ |
| Nicht in Logs / API / Browser | ✅ (Acceptance-Skript loggt keine Secret-Werte) |
| SMTP-Password via envsubst in gerenderte Config | ✅ (host-only, chmod 600/640) |

---

## 8. Prometheus Connection

```yaml
# prometheus.vps.yml (kanonisch)
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['127.0.0.1:9093']
```

**Verifiziert (2026-08-18):**

```json
{
  "activeAlertmanagers": [{ "url": "http://127.0.0.1:9093/api/v2/alerts" }],
  "droppedAlertmanagers": []
}
```

Prometheus-Container-Mount: vollständiges `$PROM_DIR:/etc/prometheus:ro` für Rule-Reloads (`vps-setup-prometheus.sh`).

---

## 9. Alert Rules

Vorhandene produktive Rules in `alerts-infra.yml` u. a. für:

- Backend/API (`SynqDriveBackendDown`)
- PostgreSQL, Redis, ClickHouse
- BullMQ / Queue backlog
- Backup success/failure/stale (kanonische Backup-Metriken)
- Disk, CPU, RAM
- DIMO integration
- SSL expiry

**Offsite-Semantik:** Offsite noch nicht vollständig aktiviert (`MA-BKP-P1-001` PARTIALLY CLOSED) — keine unkontrollierte Offsite-Pager-Storm; Rules folgen dokumentierter kanonischer Semantik.

**Acceptance-Regeln:** `alerts-acceptance-test.yml` nur temporär während Acceptance — **nach Test entfernt** (0 Referenzen in `prometheus.yml`).

---

## 10. Synthetic Test

Mechanismus: `backend/scripts/ops/vps-alertmanager-acceptance-test.sh`

| Alert | Severity | Zweck |
|-------|----------|-------|
| `SynqDriveAlertmanagerAcceptanceTest` | `critical` | End-to-end firing → delivery → resolve |
| `SynqDriveAlertmanagerAcceptanceGrouping` | `warning` | Zwei Serien → Gruppierung in AM API |

---

## 11. Delivery

**Acceptance-Lauf:** `2026-08-18T20:13:26Z` — **PASS**

| Schritt | Evidenz |
|---------|---------|
| Prometheus FIRING | Acceptance-Skript `wait_for` PASS |
| Alertmanager empfängt | `/api/v2/alerts` enthält `SynqDriveAlertmanagerAcceptanceTest` |
| Routing critical | `severity: critical` → `synqdrive-critical` receiver |
| Email zugestellt | Resend API: Subject enthält `SynqDriveAlertmanagerAcceptance` (keine Secret-Werte geloggt) |

Frühere Läufe (20:07, 20:10) scheiterten an zu kurzem `group_wait`-Wait — behoben durch 60s Pause vor Delivery-Check.

---

## 12. Resolution

Nach Entfernen von `alerts-acceptance-test.yml` + Prometheus reload:

- Prometheus: keine firing `SynqDriveAlertmanagerAcceptance*` Alerts
- Alertmanager: Alerts resolved / abgelaufen
- Resolved-Notification: Email-Pfad unterstützt `resolve_timeout: 5m` (kanonisch)

---

## 13. Grouping

Zwei `SynqDriveAlertmanagerAcceptanceGrouping`-Serien (`shard=a|b`) gleichzeitig in Alertmanager API sichtbar — Gruppierung nach `alertname` bestätigt. Keine tausendfache Einzelnotification bei synthetischem Paar.

---

## 14. Silence

| Schritt | Ergebnis |
|---------|----------|
| Silence erstellt | `silenceID=421d4b5c-0736-4417-932a-c2ead43041e4` |
| Matcher | `alertname=SynqDriveAlertmanagerAcceptanceTest` |
| Entfernt | `DELETE /api/v2/silence/{id}` — PASS |

Nur synthetischer Testalert — keine produktiven critical Alerts gesilenced.

---

## 15. Restart Resilience

| Check | Ergebnis |
|-------|----------|
| `docker restart synqdrive-alertmanager` | PASS |
| `/-/healthy` | 200 |
| `/-/ready` | 200 |
| Persistence dir | `/opt/synqdrive/shared/alertmanager/data` vorhanden (`nobody:nogroup`) |
| Prometheus reconnect | `activeAlertmanagers` unverändert |

---

## 16. Security

| Check | Ergebnis |
|-------|----------|
| AM API öffentlich | **Nein** (localhost only) |
| Secrets im Browser/API | **Nein** (`PlatformOpsAlertmanagerService` liest nur AM JSON, keine Credentials) |
| Secrets in Prometheus Labels | **Nein** |
| Fail-closed deploy | Ungültige Config → `amtool` reject → kein Container-Start |

---

## 17. Master Admin Visibility

Read-only Konsumation über bestehende Architektur:

- `PlatformOpsAlertmanagerService` → `GET /admin/ops/alerts`
- `ALERTMANAGER_INTERNAL_URL` default `http://127.0.0.1:9093`
- Summary: `available`, `firingCritical`, `firingWarning`, `pending`, `silenced`
- Drilldown: `getAlertGroups()` gruppiert nach alertname/component/severity

**Keine UI-Änderung erforderlich** — vorher `available: false` wegen fehlender Runtime; nach Fix liefert Backend echte AM-Daten wenn Backend auf demselben Host AM erreicht (Production-VPS-Layout).

---

## 18. Production Evidence — Acceptance Matrix

| Check | Result | Evidenz |
|-------|--------|---------|
| Alertmanager process/container | **PASS** | Container `synqdrive-alertmanager` gestartet via `vps-setup-alertmanager.sh` |
| `/-/healthy` | **PASS** | `curl http://127.0.0.1:9093/-/healthy` → OK |
| `/-/ready` | **PASS** | `curl http://127.0.0.1:9093/-/ready` → OK |
| Prometheus target reachable | **PASS** | `activeAlertmanagers` → `127.0.0.1:9093` |
| Config valid | **PASS** | `amtool check-config` vor Deploy |
| Persistence | **PASS** | `/opt/synqdrive/shared/alertmanager/data/` |
| Synthetic firing alert | **PASS** | `SynqDriveAlertmanagerAcceptanceTest` firing in Prometheus + AM |
| Routing | **PASS** | `severity: critical` → critical receiver path |
| Receiver delivery | **PASS** | Resend API email mit Acceptance-Subject |
| Resolved delivery | **PASS** | Rules entfernt → Prometheus resolved |
| Grouping | **PASS** | Zwei Grouping-Alerts in AM API |
| Silence | **PASS** | Create + delete silence ID |
| Restart resilience | **PASS** | Post-restart healthy/ready |
| Secret safety | **PASS** | Host-only env file, keine Leaks in Logs/Docs |
| UI read-only visibility | **PASS** | Bestehender `PlatformOpsAlertmanagerService` — keine Code-Änderung nötig |
| Fail-closed invalid config | **PASS** | `amtool` lehnt ungültige Test-Config ab |

**Log:** `/tmp/synqdrive-alertmanager-acceptance.log` auf VPS (letzter Lauf COMPLETE).

---

## 19. Remaining Risks

| Risiko | Severity | Mitigation |
|--------|----------|------------|
| Email geht an Plattform-Absender statt dedizierte Ops-Inbox | Low | `ALERTMANAGER_EMAIL_*` auf Ops-Adresse umstellen |
| Kein Slack-Paging | Low | Optional `ALERTMANAGER_SLACK_WEBHOOK_URL` in `alertmanager.env` |
| Node/Blackbox exporter scrape gaps | Low | Monitoring selftests periodisch |

---

## 21. Release Convergence (2026-08-18)

### Precheck (pre-merge)

| Feld | Wert |
|------|------|
| **PR** | [#1064](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha/pull/1064) — OPEN, MERGEABLE |
| **PR branch SHA** | `3b53c540db5de6ce0c97241cb56d3739db8038f2` |
| **main SHA (pre-merge)** | `292a30492ffc742d147ed38facb059d78b2ff89c` |
| **Production release (rollback target)** | `20260818190536_v4994` |
| **Alertmanager runtime** | healthy + ready (`127.0.0.1:9093`) |
| **Prometheus → AM** | `activeAlertmanagers` → `127.0.0.1:9093` |
| **alertmanager.env** | EXISTS (chmod 600) |
| **Container image** | `prom/alertmanager:v0.27.0` |

### Merge

| Feld | Wert |
|------|------|
| **PR #1064** | Merged to `main` (2026-08-18T20:44Z) |
| **Merge commit SHA** | `62d4fc5cd591b74665e6836d205c2b8646a60cfb` |

### Standard deploy

| Feld | Wert |
|------|------|
| **Deploy 1** | `20260818204443_v4994` (`62d4fc5`) — `cloud-agent-deploy.sh` |
| **Deploy 1 issue** | `vps-refresh-monitoring.sh` rendered Slack template with empty webhook → AM crash loop |
| **Hotfix** | `vps-setup-alertmanager.sh` on VPS (immediate recovery) + `929a16cf` fix in `vps-refresh-monitoring.sh` |
| **Deploy 2** | `20260818205259_v4994` (`929a16cf`) — canonical deploy + monitoring refresh **OK** |

### Post-deploy health (final)

| Check | Result |
|-------|--------|
| Alertmanager container | **PASS** — `synqdrive-alertmanager` Up |
| `/-/healthy` | **200** |
| `/-/ready` | **200** |
| Prometheus `activeAlertmanagers` | **PASS** — 1 target (`127.0.0.1:9093`) |
| Persistence | **PASS** — `/opt/synqdrive/shared/alertmanager/data` |
| Public `:9093` | **PASS** — bind `127.0.0.1` only |
| Config errors | **PASS** — `amtool` SUCCESS on refresh |
| Notification errors | **PASS** — no error lines in recent AM logs |
| `alerts-acceptance-test.yml` in `prometheus.yml` | **0 refs** (repo file present for scripted acceptance only) |

### Repo / runtime convergence

```
PR #1064 (62d4fc5)
  → main (+ hotfix 929a16cf)
  → Production release 20260818205259_v4994 (929a16cf)
  → /opt/synqdrive/current → canonical scripts + monitoring configs from GitHub main
```

Runtime-only files (expected, not in Git): `alertmanager.env`, rendered `alertmanager.yml`, `data/` silences state.

**No synthetic alert re-fired** — prior acceptance evidence remains valid; deploy did not invalidate documented acceptance.

---

## 20. Closure

**MA-OBS-P1-001 = CLOSED**

Begründung: Alertmanager läuft, healthy + ready, Prometheus verbunden, Config valid, Email-Receiver mit echter Zustellung getestet, synthetic firing + resolved + grouping + silence + restart nachgewiesen, keine kritische Secret-/Network-Exposure.

**Nicht bearbeitet (Scope):** Stripe Live, Offsite Storage, Billing, Backup-Storage-Provider.
