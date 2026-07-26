# Master Admin — Production Deploy Attempt (Phase 2G.7 follow-up)

| Feld | Wert |
|------|------|
| **Datum (UTC)** | 2026-07-26 |
| **Code-Stand** | `main` @ `c8225249` |
| **Prod-Stand** | Release `20260726073619_v4994` (pre-remediation), `/api/v1/health` → 200 |
| **Ergebnis** | Deploy **nicht promoted** — ein verbleibender Config-Blocker |

---

## 1. Executive Summary

Der SSH-Zugang für Cloud Agents wurde repariert, die Deploy-Kette bis zum Ende durchlaufen und dabei **vier release-blockierende Defekte** im gemergten P0/P1-Stack gefunden und behoben. Ein Defekt hat Production kurzzeitig auf 502 gebracht; der Rollback erfolgte innerhalb weniger Minuten.

Der Deploy ist jetzt an einen **Boot-Check** gekoppelt, der ein Release erst promoted, wenn der Nest-Modulgraph vollständig auflöst. Genau dieses Gate hält aktuell den Deploy an: die Production-`backend.env` enthält einen **Stripe-Test-Key** bei `NODE_ENV=production`, was der neue 2B.2-Guard bewusst verweigert.

**Production läuft unverändert und gesund auf dem vorherigen Release.**

---

## 2. Root Cause: SSH-Blockade des Cloud Agents

Die Diagnose „fail2ban-Ban“ war falsch.

| Beobachtung | Erklärung |
|-------------|-----------|
| SSH klappte sporadisch (~1 von 4 Versuchen) | Cloud-Agent-Egress rotiert über einen **Pool von 8 AWS-IPs** |
| `kex_exchange_identification: Connection reset` | UFW-SSH-Allowlist (Phase 2A.3) enthielt nur 2 der 8 IPs |
| Hostinger-API zeigte keine Firewall | Die Sperre liegt in **UFW auf dem Host**, nicht bei Hostinger |

**Fix:** Alle 8 Egress-IPs in `/opt/synqdrive/shared/firewall/ssh-allowlist.txt` + UFW-Regeln für Port 22. Danach 10/10 erfolgreiche SSH-Verbindungen.

```
184.72.144.40  3.212.32.120  3.217.89.139  3.226.203.3
32.192.159.40  34.199.12.19  54.158.128.7  98.95.136.227
```

> Egress-IPs sind nicht dauerhaft garantiert. Für stabile Herkunft bleibt Tailscale (AGENTS.md Path B) die bessere Lösung.

Zusätzlich: `root`-SSH ist seit 2A.2 deaktiviert. `cloud-agent-deploy.sh` verbindet jetzt als `synqdrive-admin` und eskaliert das Release-Skript per `sudo -n -H` (die Release-Pfade und der pm2-Daemon gehören `root`).

---

## 3. Gefundene release-blockierende Defekte

| # | Defekt | Symptom | Fix |
|---|--------|---------|-----|
| 1 | `CREATE INDEX CONCURRENTLY` in Prisma-Migration `20260726140000` | `SQLSTATE 25001`, blockiert **alle** Folge-Migrationen | CONCURRENTLY entfernt; `vehicles` ist klein (9 Zeilen, 6 mit DIMO-Binding), Duplikat-Audit vorab: 0 Treffer |
| 2 | Fehlender `bcrypt`-Import in `auth.controller.ts` | TS2552, Backend-Build bricht | Import wiederhergestellt |
| 3 | Modul-Zyklus `UsersModule` ↔ `IamDataRetentionModule` (COMP-3) | Nest löst Rückkante als `undefined` → **Crash-Loop, Production 502** | Endpoint nach `MasterAdminUserDeletionController` im Retention-Modul verschoben; Route unverändert |
| 4 | MFA-Wiring aus 2A.5 | `RefreshTokenService` / `IamMfaEnrollmentService` / `IamMfaStepUpService` nicht auflösbar | `forwardRef` symmetrisch; `IamMfaModule` `@Global()` + Enrollment/Challenge exportiert |

### Zu Defekt 3 — Production-Ausfall

`ln -sfn current` und `pm2 restart` liefen, **bevor** irgendetwas den Bootvorgang verifiziert hatte. Der Health-Check danach hatte ein festes `sleep 3`, während der Boot ~12 s braucht — er schlug fehl, das Skript brach per `set -e` ab und ließ das kaputte Release als `current` stehen.

Rollback auf `20260726073619_v4994` → `/api/v1/health` = 200.

---

## 4. Neues Deploy-Gate

`vps-deploy-release.sh` führt jetzt **vor** dem Umschalten von `current` aus:

```bash
SYNQDRIVE_BOOT_CHECK=1 node dist/src/main.js
```

`SYNQDRIVE_BOOT_CHECK=1` baut in `main.ts` den kompletten Modulgraph inklusive aller Provider auf und beendet sich **ohne Port-Bind** — dadurch läuft der Check gefahrlos parallel zur Live-Instanz. Schlägt er fehl, bricht der Deploy ab und `current` bleibt unangetastet.

Der Health-Check nach dem pm2-Restart pollt jetzt bis 60 s statt einmalig nach 3 s.

Verifiziert: Defekt 3 und 4 wurden von diesem Gate real abgefangen, ohne Production zu berühren.

> Reproduktion erfordert den echten Entrypoint plus `AppModule.forRootAsync()`. Ein Check, der `AppModule` direkt an `NestFactory.create` übergibt, ist **nicht** aussagekräftig — er meldete für den kaputten Stand fälschlich OK.

---

## 5. Verbleibender Blocker: Stripe-Environment

```
StripeEnvironmentViolationError: Production refuses sk_test_* Stripe keys.
!! ABORT: release 20260726193757_v4994 failed to bootstrap — current release left untouched
```

| Prüfung | Befund |
|---------|--------|
| `NODE_ENV` (prod) | `production` |
| `STRIPE_SECRET_KEY` (prod) | `sk_test_*` |
| `STRIPE_WEBHOOK_SECRET` (prod) | leer |
| `STRIPE_ALLOW_TEST_IN_PRODUCTION` (prod) | nicht gesetzt |
| Live-Key als Cloud-Agent-Secret | nicht vorhanden (ebenfalls `sk_test_*`) |

Der Guard stammt aus Phase 2B.2 und ist **beabsichtigt**: er verwandelt das stille P1-Risiko „Production rechnet gegen Stripe-Test-Mode ab“ in einen Fail-Fast beim Start.

`docs/remediation/stripe-environment-separation.md` schreibt explizit `STRIPE_ALLOW_TEST_IN_PRODUCTION=false` — *„never set true on real prod“*. Die Escape-Hatch wurde daher **nicht** gesetzt.

### Nachweis, dass das Release ansonsten sauber ist

Boot-Check auf dem VPS gegen Release `20260726193757_v4994`, Override nur in einer transienten Prozess-Umgebung (Production-`backend.env` unverändert):

```
LOG [Bootstrap] Boot check OK — module graph and providers resolved
```

### Zwei Wege nach vorn

| Option | Vorgehen | Bewertung |
|--------|----------|-----------|
| **A — Billing live schalten** | `STRIPE_SECRET_KEY=sk_live_*`, `STRIPE_ENVIRONMENT=live`, Live-`STRIPE_WEBHOOK_SECRET` in `/opt/synqdrive/shared/backend.env` | Empfohlen, sofern Billing wirklich produktiv gehen soll |
| **B — Prod bewusst als Billing-Sandbox betreiben** | `STRIPE_ALLOW_TEST_IN_PRODUCTION=true` | Setzt eine 2B.2-Kontrolle außer Kraft; braucht eine explizite, dokumentierte Freigabe |

Nach Option A oder B: `bash .cursor/scripts/cloud-agent-deploy.sh`, anschließend `backend/scripts/ops/vps-post-remediation-ops.sh`.

---

## 6. Nebenbefunde

| Befund | Bewertung |
|--------|-----------|
| Migration `20260413230000_add_composite_indexes_batch_c` steht mit `applied_steps_count = 0` in `_prisma_migrations` | Wurde damals manuell als applied markiert; die Composite-Indizes existieren in Prod **nicht**. Gleiche CONCURRENTLY-Ursache. Nachziehen per `psql` außerhalb Prisma. |
| `InjectorLogger: Nest encountered an undefined dependency` | **Vorbestehend** — auch im gesunden Release (pm2-Log 07:42:02). Kein Regress, eigener Follow-up. |
| 5 rote Testsuites unter `modules/users` | **Vorbestehend** aus dem Merge; Baseline gegen `e75c50be` bestätigt (5 Suites / 18 Tests vor und nach dem Refactor). |
| pm2-Restart-Zähler > 3100 | Historisch; aktuelle Instanz stabil. |

---

## 7. Status

| Gate | Code (`main`) | Prod (live) |
|------|---------------|-------------|
| Bootfähigkeit | **PASS** (Boot-Check) | PASS (Vorgänger-Release) |
| Deploy-Kette | **PASS** (SSH + sudo + Gate) | — |
| Security (Swagger) | **PASS** | FAIL (nicht deployt) |
| Billing (Stripe env) | **PASS** (Guard aktiv) | **BLOCKER** (Test-Key) |
| Migrationen | **PASS** (282 applied) | PASS (bereits angewandt) |

**Entscheidung:** `main` ist **Production Ready with Conditions**. Production bleibt **Not Production Ready**, bis der Stripe-Environment-Blocker über Option A oder B entschieden ist.
