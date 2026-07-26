# Master Admin — Production Deploy + Post-Deploy Ops (Phase 2G.7 Abschluss)

| Feld | Wert |
|------|------|
| **Datum (UTC)** | 2026-07-26 |
| **Release** | `20260726211156_v4994` @ `d339477` |
| **Ergebnis** | Remediation-Stack **live**; Post-Deploy-Ops ausgeführt |
| **Vorgänger-Dokument** | `master-admin-deploy-attempt-2026-07-26.md` (blockierter Versuch) |

---

## 1. Executive Summary

Der P0/P1-Remediation-Stack läuft in Production. Der Stripe-Blocker wurde per **Option B** aufgelöst: Billing bleibt bis zum Go-Live bewusst im Sandbox-Modus.

Die anschließenden VPS-Ops haben eine Reihe von Defekten aufgedeckt, die vorher unsichtbar waren, weil die betroffenen Werkzeuge selbst nicht liefen. Drei davon sind substanziell:

1. **ClickHouse-Migrationen wurden in Production seit Wochen stillschweigend übersprungen.** Ursache war ein Build-Pfad-Mismatch. Migration 007 war deshalb nie angewandt.
2. **Der ClickHouse-Container hing an einem gelöschten Release-Verzeichnis.** `/backups` zeigte ins Leere — Backups hätten nie ein wiederherstellbares Artefakt erzeugt.
3. **Die Backup-Verifikationskette war an vier Stellen defekt.** Ein Backup konnte weder verifiziert noch zurückgespielt werden.

Alle drei sind behoben und live verifiziert. Der ClickHouse-Restore-Drill lief erstmals erfolgreich durch.

**Verbleibend:** ein echter historischer Datenverlust (9 defekte Parts vom 2026-07-17) und eine offene Entscheidung zur Backup-Verschlüsselung.

---

## 2. Stripe — Option B umgesetzt

```
Stripe environment locked: runtime=TEST nodeEnv=production
```

In `/opt/synqdrive/shared/backend.env` (Backup vorher unter `shared/backups/backend.env.20260726T201526Z.bak`):

```bash
STRIPE_ENVIRONMENT=test
STRIPE_ALLOW_TEST_IN_PRODUCTION=true
```

`STRIPE_ENVIRONMENT=test` ist bewusst mitgesetzt: Wird später ein `sk_live_*`-Key eingespielt, während das Sandbox-Flag noch steht, bricht der Start mit `STRIPE_EXPLICIT_ENV_MISMATCH` ab, statt still in einen Mischzustand zu laufen. **Beide Zeilen beim Go-Live entfernen.**

Damit ist die 2B.2-Kontrolle bewusst und dokumentiert außer Kraft — kein stiller Zustand.

---

## 3. Live verifizierte Kontrollen

| Kontrolle | Nachweis |
|-----------|----------|
| Swagger deaktiviert | `/docs` und `/docs-json` liefern die SPA-Shell, 0 Swagger-/OpenAPI-Marker (vorher: erreichbare UI + Spec) |
| Backend nicht öffentlich | `:3001` von außen ohne Antwort |
| Stripe-Guard aktiv | `Stripe environment locked: runtime=TEST nodeEnv=production` |
| Health | `/api/v1/health` → 200 |
| Boot-Gate | `Boot check OK — module graph and providers resolved` vor jedem Promote |
| ClickHouse | Container `healthy`, Readiness `available`, 7 Migrationen |

---

## 4. Befund: ClickHouse-Migrationen liefen nie

```
WARN [ClickHouseSchemaService] Migrations directory not found at
  .../backend/dist/src/modules/clickhouse/migrations — no migrations to apply.
LOG  [ClickHouseSchemaService] ClickHouse migrations complete — 0 applied this run, 6 total.
```

`nest-cli` kopiert Assets relativ zu `sourceRoot`, also nach `dist/modules/clickhouse/migrations`. `tsc` emittiert jedoch nach `dist/src/...`, weil `prisma/` und `scripts/` den abgeleiteten `rootDir` aufweiten. Der kompilierte Service suchte damit neben sich — und fand nichts.

Der Runner wertete das fehlende Verzeichnis als „nichts anzuwenden“ und meldete `pendingMigrationCount=0` ohne Schema-Fehler. Die Lücke war dadurch **von außen nicht erkennbar**.

**Fix:** Asset-`outDir` auf `dist/src`, Verzeichnisauflösung über eine Kandidatenliste, und ein Throw statt einer Warnung, wenn keines existiert — sichtbar über `lastSchemaError`. Abgesichert durch `clickhouse-schema.migrations-dir.spec.ts`, das auch die `nest-cli.json`-Zusage prüft.

### Folge: Migration 007 + org_id-Backfill

Nach dem Fix wurde 007 angewandt (`org_id` auf `telemetry_snapshots` / `telemetry_state_changes`) und der Backfill nachgezogen:

| Tabelle | leer vorher | leer nachher |
|---------|------------:|-------------:|
| `telemetry_snapshots` | 612 157 | 38 259 |
| `telemetry_state_changes` | 4 221 | 306 |
| `telemetry_waypoints` | 642 | 0 |
| `trip_activity_windows` | 126 | 0 |

`telemetry_waypoints` und `trip_activity_windows` fehlten in der Tabellenliste des Backfills, obwohl sie die Spalte seit 004–006 haben — ~770 Zeilen realer Tenant-Daten waren für org-gescopte Analytics unsichtbar. Liste in Skript **und** Service ergänzt.

Die verbliebenen 38 565 Zeilen gehören sämtlich zu `be15ecb1-…`, einem in Postgres gelöschten Fahrzeug. Sie sind keinem Tenant zuzuordnen und durch den `org_id`-Filter für alle unsichtbar — das sichere Verhalten, aber toter Datenbestand.

### Nebeneffekt: Checksum-Drift

Weil die Dateien erstmals gelesen wurden, fiel auf, dass 001–003 aus abweichendem Inhalt angewandt wurden. Der Runner verweigert korrekterweise ein Re-Run. Das wurde jedoch über `lastSchemaError` gemeldet und schob ClickHouse dauerhaft auf `schema_error`. Drift ist ein Hinweis, kein Laufzeitfehler — sie läuft jetzt über ein eigenes Feld `schemaDrift`, damit ein echter Migrationsfehler weiterhin rot wird und nicht maskiert bleibt.

---

## 5. Befund: Container-Mounts auf gelöschtem Release

Der ClickHouse-Container wurde mit Bind-Mounts in `releases/20260717111944_v4994` erzeugt. Dieses Release ist längst weggeräumt:

```
/opt/synqdrive/releases/20260717111944_v4994/backend/storage/clickhouse/backups -> /backups
```

`/backups` zeigte damit auf ein gelöschtes Verzeichnis: `BACKUP DATABASE` hätte gemeldet, erfolgreich zu sein, ohne dass je ein Artefakt auf dem Host auftaucht. Der nächtliche Cron hätte genau das produziert.

**Fix:** `vps-clickhouse-migrate-storage-topology.sh` — hängt die Binds auf `/opt/synqdrive/shared/clickhouse` um (Override aus Phase 2D.7), persistiert `COMPOSE_FILE`, und bricht ab, wenn sich der Row-Count ändert.

Der Recreate scheiterte zunächst: Der Host hatte nur `docker-compose` v1.29.2, das mit Docker 29 nicht mehr kompatibel ist (`KeyError: 'ContainerConfig'`). Der Container war zu dem Zeitpunkt bereits gestoppt. Nach Installation des Compose-v2-Plugins lief die Migration durch — **818 871 Zeilen vorher wie nachher**, Daten liegen in benannten Volumes.

Storage-Topology-Audit: **10 P0 → 0**.

---

## 6. Befund: Backup-Verifikationskette

Beim Nachweis, dass Backups jetzt tatsächlich schreiben, kamen vier Defekte zutage — jeder für sich hätte ein Backup unbrauchbar gemacht:

| # | Defekt | Wirkung |
|---|--------|---------|
| 1 | `promote_artifact` verschob das Archiv, nicht den `.sha256`-Sidecar | Integritätsprüfung schlug immer fehl |
| 2 | `sha256sum -c` lief im falschen Arbeitsverzeichnis | Sidecar enthält nur den Basename |
| 3 | `list_valid_archives` gab Log-Zeilen auf stdout aus | `tail -1` lieferte eine Log-Zeile statt eines Pfads; die Generationszählung der **Rotation** war zu hoch |
| 4 | Restore nutzte `RESTORE DATABASE <ziel>` | Archiv trägt den Quellnamen → `BACKUP_ENTRY_NOT_FOUND` |

Defekt 3 traf ClickHouse und Redis gleichermaßen; `offsite-backup-lib.sh` machte es bereits richtig.

### Restore-Drill (erstmals erfolgreich)

```
RESTORE DATABASE synqdrive AS synqdrive_restore_test FROM Disk('backups', ...)
RESTORED
smoke: tables in synqdrive_restore_test = 9
restore-test SUCCESS
```

Damit ist die offene Position „VPS restore drill“ geschlossen. Die zur Validierung erzeugten **unverschlüsselten** Artefakte wurden anschließend entfernt.

---

## 7. Befund: Acceptance-Audit meldete Defekte, die es selbst verursachte

Das Audit stand auf **NO-GO (5 P0)** — auf einem gesunden Cluster.

| Ursache | Korrektur |
|---------|-----------|
| `hasColumn()` existiert in CH 25.8 nicht | Lookup über `system.columns` |
| `system.detached_parts.disk_name` | heißt `disk` |
| `system.processes.type/status` | Background-Pool über `system.metrics` |
| `ORDER BY <alias>` direkt auf einem UNION | UNION in Subquery gekapselt (2×) |
| Jeder **inaktive** Part galt als P0 | Inaktive Parts sind nach Merges/Mutationen normal — bewertet wird jetzt das **Alter**; P0 sind `broken`/`unexpected` Detached Parts |
| Pipeline beendet sich mit 1 bei reinem P1, Runner mappt 1 → P0 | Exit 3 für P1-only → Runner zählt WARN |

Jeder dieser Query-Fehler brach sein Audit ab und wurde als P0 gezählt. Bemerkenswert an der Parts-Regel: Sie war invertiert — harmlose inaktive Parts blockierten, während 9 tatsächlich defekte Parts nur eine Warnung waren.

**Ergebnis: 5 P0 → 1 P0.**

| Audit | Vorher | Nachher |
|-------|--------|---------|
| storage-topology | FAIL (10 P0) | **PASS** |
| data-integrity | FAIL | FAIL (1 echter P0) |
| tenant-isolation | ERROR | **PASS** |
| performance | ERROR | **PASS** |
| pipeline | FAIL (P0) | WARN (P1) |
| health-check | PASS | PASS |

---

## 8. Verbleibende Punkte

### 8.1 Datenverlust `telemetry_snapshots` 202607 (P0, historisch)

9 Detached Parts, Grund `broken-on-start`, alle `bytes_on_disk = 0`, alle mit Zeitstempel **2026-07-17 12:18:42** — ein einzelner Vorfall, neun Tage vor diesem Deploy und unabhängig von ihm.

Die Parts sind leer; ein `ATTACH` stellt nichts wieder her. Zwei Wege: Re-Ingest des Fensters aus DIMO, oder bewusste Annahme des Verlusts und `DROP DETACHED PARTITION`. **Es wurde nichts gelöscht** — ein Drop würde nur das Audit grün färben, ohne etwas zu lösen.

### 8.2 Backup-Verschlüsselung (Entscheidung erforderlich)

Beide Backup-Crons sind installiert, scheitern aber an der Verschlüsselungspflicht aus Phase 2C:

```
ERROR: encryption required — set CH_BACKUP_GPG_RECIPIENT or CH_BACKUP_GPG_PASSPHRASE_FILE
```

Das ist eine gewollte Kontrolle. Es wurde bewusst **kein** Schlüsselmaterial erzeugt: Eine Passphrase, die nur auf dem VPS liegt und nirgends hinterlegt ist, macht Backups im Ernstfall wertlos. Nötig ist eine Entscheidung über Schlüssel und Hinterlegung, dann:

```bash
# In /opt/synqdrive/shared/clickhouse-backup.env bzw. redis-backup.env
CH_BACKUP_GPG_PASSPHRASE_FILE=/opt/synqdrive/shared/secrets/ch-backup.pass
REDIS_BACKUP_GPG_PASSPHRASE_FILE=/opt/synqdrive/shared/secrets/redis-backup.pass
```

Offsite ist ebenfalls unkonfiguriert — Backups liegen derzeit ausschließlich lokal.

### 8.3 Kleinere Punkte

| Befund | Bewertung |
|--------|-----------|
| `battery.v2`: 30 Failed Jobs, `dimo.trip-tracking`: 2 | Bekannt (MA-REDIS-P1-001), Drain offen |
| Snapshot-Freshness ~6 h | Kein Stall: Fahrzeuge stehen gestaffelt still (5,9 h bis 20 d). Schwellwert über `CH_PIPELINE_MAX_SNAPSHOT_LAG_SECONDS` justierbar |
| Alertmanager-Container läuft nicht | Templates synchronisiert, `alertmanager.env` fehlt |
| Checksum-Drift 001–003 | Als `schemaDrift` sichtbar; Re-Baseline ist eine bewusste Entscheidung |
| Migration `20260413230000` mit `applied_steps_count = 0` | Composite-Indizes fehlen in Prod, gleiche CONCURRENTLY-Ursache |
| ClickHouse-Container `restart: no` | Kommt nach einem Host-Reboot nicht selbstständig hoch |
| `HM_HEALTH_APP_MQTT_TOPIC` enthält `$share/...` unquotiert | Bricht jedes Werkzeug, das die Env-Datei shell-interpretiert; die Post-Ops lesen Keys deshalb literal statt via `source` |

---

## 9. Status

| Gate | Code (`main`) | Prod (live) |
|------|---------------|-------------|
| Bootfähigkeit | PASS | **PASS** |
| Security (Swagger, Port, Audit) | PASS | **PASS** |
| Billing (Stripe-Guard) | PASS | **PASS** (Sandbox, bewusst) |
| ClickHouse Migrationen | PASS | **PASS** (7 applied) |
| Tenant-Isolation (org_id) | PASS | **PASS** |
| Backup-Kette (create/verify/restore) | PASS | **PASS** (Verschlüsselung offen) |
| Storage-Topologie | PASS | **PASS** |
| Data-Integrity | — | **FAIL** (historischer Verlust 202607) |

**Bewertung:** Production ist **Production Ready with Conditions**. Die Bedingungen sind der bewusste Stripe-Sandbox-Betrieb, die offene Entscheidung zur Backup-Verschlüsselung und der historische Datenverlust in `telemetry_snapshots` 202607.
