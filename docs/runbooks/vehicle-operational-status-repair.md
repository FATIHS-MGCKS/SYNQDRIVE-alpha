# Runbook: Vehicle Operational Status — Diagnose und Reparatur

**Verbindliches Betriebs-Runbook** für das read-only Diagnosewerkzeug und das kontrollierte Reparaturskript zu Vehicle-, Booking- und Handover-Inkonsistenzen (operativer Flottenstatus).

| Feld | Wert |
|------|------|
| **Gültig ab** | Backend ≥ **V4.9.502** (`VehicleBookingHandoverDiagnosticService` + `VehicleBookingHandoverRepairService`) |
| **Reparatur-Skriptversion** | `1.0.0` (`VBH_REPAIR_SCRIPT_VERSION`) |
| **Diagnose-Skript** | [`backend/scripts/ops/audit-vehicle-booking-handover-data.ts`](../../backend/scripts/ops/audit-vehicle-booking-handover-data.ts) |
| **Reparatur-Skript** | [`backend/scripts/ops/repair-vehicle-booking-handover-data.ts`](../../backend/scripts/ops/repair-vehicle-booking-handover-data.ts) |
| **Ergänzende Ops-Übersicht** | [`backend/scripts/ops/README.md`](../../backend/scripts/ops/README.md) |
| **Verwandtes Runbook** | [`docs/runbooks/task-data-repair.md`](./task-data-repair.md) (gleiches Ops-Muster, anderes Domänenobjekt) |

> **Grundsatz:** Diagnose ist immer read-only. Reparatur ist **standardmäßig Dry Run**; Schreiben nur mit explizitem `--apply`. **Keine unkontrollierte globale Reparatur in Produktion.** Kanonischer Fleet-Status wird zur Laufzeit abgeleitet (V4.9.498–V4.9.500); dieses Runbook betrifft **persistierte Raw-Daten** (`vehicles.status`, `bookings.status`, Handover-Protokolle).

---

## 1. Voraussetzungen

### 1.1 Benötigte Codeversion

| Komponente | Mindestanforderung |
|------------|-------------------|
| Backend-Deployment | **V4.9.502** oder neuer auf `main` (enthält P37 Diagnose + P38 Repair) |
| Frontend (Smoke-Tests) | **V4.9.499+** (kanonische Fleet-Tabs), **V4.9.500+** (UNKNOWN-UX) empfohlen |
| Nest-Module | `VehiclesModule` exportiert `VehicleBookingHandoverDiagnosticService` und `VehicleBookingHandoverRepairService` |
| Reparatur-Skriptversion im Report | `scriptVersion: "1.0.0"` |
| Node.js / ts-node | Wie im Backend-Projekt (`backend/package.json`) |
| Abhängigkeiten | `npm ci` im Verzeichnis `backend/` ausgeführt |

Vor dem Lauf prüfen:

```bash
cd backend
git log -1 --oneline   # muss VBH-Diagnose/Repair-Commits enthalten
npx ts-node -r tsconfig-paths/register -e "require('./src/modules/vehicles/diagnostic/vehicle-booking-handover-repair.types').VBH_REPAIR_SCRIPT_VERSION"
# Erwartung: 1.0.0
```

### 1.2 Migrationen

Für die VBH-Skripte sind **keine neuen dedizierten Migrationen** erforderlich. Folgende bestehende Tabellen/Enums müssen auf der Zieldatenbank vorhanden und migriert sein:

| Objekt | Relevanz |
|--------|----------|
| `vehicles` (`status`: `AVAILABLE`, `RENTED`, `RESERVED`, `IN_SERVICE`, `OUT_OF_SERVICE`) | Raw-Fahrzeugstatus |
| `bookings` (`status`, `start_date`, `end_date`, `completed_at`, …) | Buchungs-Lifecycle |
| `booking_handover_protocols` (`kind`: `PICKUP` / `RETURN`) | Handover-Wahrheit |
| `organizations` (`timezone`) | Pickup-Tag / Reservierungsfenster (IANA) |
| `activity_logs` | Persistenter Audit-Trail bei `--apply` |

Prüfung:

```bash
cd backend
npx prisma migrate status
# Erwartung: keine ausstehenden Migrationen auf der Zieldatenbank
```

### 1.3 Umgebungsvariablen

| Variable | Zweck | Diagnose | Reparatur |
|----------|-------|----------|-----------|
| `DATABASE_URL` | PostgreSQL-Verbindung zur Zieldatenbank | ✓ | ✓ |
| `NODE_ENV` | `production` blockiert Lauf ohne Override | ✓ | ✓ |
| `ORG_ID` | Alias für `--organization-id` | ✓ | ✓ |
| `VEHICLE_BOOKING_HANDOVER_DIAGNOSTIC_ALLOW_REMOTE` | Nicht-lokale DB erlauben (Prod-Muster weiter blockiert) | ✓ | — |
| `VEHICLE_BOOKING_HANDOVER_DIAGNOSTIC_ALLOW_PROD` | Prod-Override Diagnose (nur mit Freigabe) | ✓ | — |
| `VEHICLE_BOOKING_HANDOVER_REPAIR_ALLOW_REMOTE` | Nicht-lokale DB erlauben (Prod-Muster weiter blockiert) | — | ✓ |
| `VEHICLE_BOOKING_HANDOVER_REPAIR_ALLOW_PROD` | Prod-Override Reparatur (nur mit Freigabe) | — | ✓ |

`.env` wird von beiden Skripten aus `backend/.env` geladen, sofern gesetzt.

**Sicherheitsregel:** Prod-URL-Muster (`synqdrive.eu`, RDS, `/opt/synqdrive/`, …) werden ohne expliziten Override **immer** abgelehnt.

### 1.4 Datenbankzugriff

| Anforderung | Details |
|-------------|---------|
| Berechtigungen | Lesezugriff für Diagnose; Lese-/Schreibzugriff auf `vehicles`, `bookings`, `activity_logs` für Reparatur |
| Netzwerk | VPN/SSH-Tunnel zur Zieldatenbank; keine öffentlich exponierte Admin-URL |
| Scope | Reparatur in Staging/Produktion **immer** mit `--organization-id=<uuid>`; optional `--vehicle-id=<uuid>` für Einzelfahrzeug |
| Isolation | Lokale/Test-DB bevorzugt (`localhost`, `synqdrive_test`, …) |

Verbindung testen (read-only):

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM vehicles;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM bookings;"
```

### 1.5 Rollen und Verantwortung (RACI)

| Rolle | Verantwortung |
|-------|---------------|
| **Ops / Platform** | Backup, Skriptausführung, Report-Archivierung, Abbruch |
| **DBA** | Backup-Verifikation, Restore-Test, Point-in-Time-Recovery |
| **Domain Owner (Fleet / Rental Ops)** | Freigabe Reparatur-Scope, Abnahme Stichproben, Review `unresolved` |
| **Engineering** | Skriptversion, Fehleranalyse, Hotfix bei Abbruchkriterien |
| **Product / Support** | Kommunikation bei Wartungsfenster, Kunden-Stichproben |

**Freigabe vor `--apply` in Staging/Produktion:** schriftlich (Ticket) mit Org-ID, erwarteten Finding-/Action-Klassen und Rollback-Plan.

---

## 2. Backup

### 2.1 Vollständiges Backup

**Vor jedem `--apply`** — auch in Staging.

```bash
pg_dump "$DATABASE_URL" -Fc -f "/var/backups/synqdrive-vbh-repair-$(date +%F-%H%M)-pre.dump"
```

Metadaten notieren: Zeitstempel, Org-ID, optional `vehicle-id`, Git-Commit, Skriptversion `1.0.0`.

### 2.2 Backup-Verifikation

```bash
ls -lh /var/backups/synqdrive-vbh-repair-*-pre.dump
pg_restore --list /var/backups/synqdrive-vbh-repair-*-pre.dump | head -20
pg_restore --schema-only /var/backups/synqdrive-vbh-repair-*-pre.dump 2>/dev/null | grep -E 'vehicles|bookings|booking_handover'
```

Backup gilt als **verifiziert**, wenn Liste fehlerfrei ist und kritische Tabellen enthalten sind.

### 2.3 Restore-Test

**Pflicht vor erstem Produktions-`--apply`** (in isolierter Test-DB):

```bash
createdb synqdrive_vbh_restore_test
pg_restore -d synqdrive_vbh_restore_test /var/backups/synqdrive-vbh-repair-*-pre.dump

psql synqdrive_vbh_restore_test -c "SELECT COUNT(*) FROM vehicles WHERE organization_id = '<uuid>';"
psql synqdrive_vbh_restore_test -c "SELECT COUNT(*) FROM bookings WHERE organization_id = '<uuid>';"
```

Nach erfolgreichem Test: Restore-DB löschen oder für Rollback-Übung behalten.

---

## 3. Lokale / Testumgebung

Zweck: Skriptverhalten validieren, Reports verstehen, **keine Produktionsdaten riskieren**.

### 3.1 Diagnoseskript

```bash
cd backend

# Gesamtbestand (alle Orgs in Test-DB)
npx ts-node -r tsconfig-paths/register scripts/ops/audit-vehicle-booking-handover-data.ts \
  --output=./tmp/vbh-audit-local.json

# Einzelne Organisation
npx ts-node -r tsconfig-paths/register scripts/ops/audit-vehicle-booking-handover-data.ts \
  --organization-id=<uuid> \
  --include-findings \
  --limit=25 \
  --output=./tmp/vbh-audit-local-<uuid>.json

# Einzelfahrzeug (Kennzeichen)
npx ts-node -r tsconfig-paths/register scripts/ops/audit-vehicle-booking-handover-data.ts \
  --organization-id=<uuid> \
  --license-plate="KS FH 660E" \
  --format=markdown \
  --output=./tmp/vbh-audit-ks-fh-660e.md
```

### 3.2 Reportprüfung

Im JSON-Report (`VbhDiagnosticReport`) prüfen:

| Feld | Prüfpunkt |
|------|-----------|
| `summary.byCheck` | Welche der 12 Problemklassen betroffen? |
| `summary.byCategory` | Schwerpunkt `vehicle_raw_status`, `handover_integrity`, …? |
| `checks[].sampleVehicleIds` / `sampleBookingIds` | Maskierte IDs für Stichproben |
| `byOrganization[]` | Findings pro Org |
| `findings` | Nur mit `--include-findings`; keine Kundennamen |

**Diagnose-Check-IDs (Referenz):**

| `checkId` | Bedeutung |
|-----------|-----------|
| `raw_reserved_without_window` | Raw `RESERVED` ohne Reservierungsfenster |
| `raw_rented_without_active_booking` | Raw `RENTED` ohne ACTIVE-Buchung |
| `active_booking_raw_available` | ACTIVE-Buchung bei raw `AVAILABLE` |
| `pickup_completed_booking_not_active` | PICKUP-Protokoll, Booking ≠ ACTIVE |
| `return_completed_booking_still_active` | RETURN-Protokoll, Booking noch ACTIVE |
| `multiple_active_bookings_per_vehicle` | Mehrere ACTIVE pro Fahrzeug |
| `multiple_reservation_window_bookings` | Mehrere Buchungen im Reservierungsfenster |
| `future_booking_legacy_reserved_trigger` | Zukunftsbuchung — nur Info (Legacy vs. kanonisch) |
| `endpoint_canonical_derivation_divergence` | Raw-DB vs. `deriveFleetStatusContext` |
| `cross_org_booking_link` | Cross-Org-Links |
| `booking_date_inconsistency` | Datums-Inkonsistenzen |
| `organization_timezone_missing_or_invalid` | Org-Timezone fehlt/ungültig |

**Nicht automatisch reparierbar** (bewusst `unresolved` oder nur Diagnose):

- `multiple_active_bookings_per_vehicle`, `multiple_reservation_window_bookings`
- `cross_org_booking_link`, `booking_date_inconsistency`
- `organization_timezone_missing_or_invalid`
- `future_booking_legacy_reserved_trigger` (Info — erwartetes Verhalten nach V4.9.499)
- `endpoint_canonical_derivation_divergence` (teilweise durch Raw-Reparatur behoben)
- Unklare `raw_rented_without_active_booking` ohne abgeschlossenen Return-Nachweis

### 3.3 Reparatur-Dry-Run

```bash
cd backend

npx ts-node -r tsconfig-paths/register scripts/ops/repair-vehicle-booking-handover-data.ts \
  --organization-id=<uuid> \
  --output=./tmp/vbh-repair-local-dryrun-<uuid>.json
```

Optional einzelnes Fahrzeug:

```bash
npx ts-node -r tsconfig-paths/register scripts/ops/repair-vehicle-booking-handover-data.ts \
  --organization-id=<uuid> \
  --vehicle-id=<vehicle-uuid> \
  --output=./tmp/vbh-repair-local-dryrun-vehicle.json
```

Erwartung:

- `dryRun: true`, `apply: false`
- `actions[]` mit geplanten Änderungen (`applied: false`)
- `unresolved[]` für unklare Fälle
- `diagnosticBefore` eingebettet
- Stderr-Hinweis: *Dry-run only — pass --apply to execute repairs.*

**Reparatur-Action-IDs (nur eindeutige Fälle):**

| `actionId` | Wann |
|------------|------|
| `clear_stale_reserved_vehicle_status` | RESERVED ohne Fenster/ACTIVE → `AVAILABLE` |
| `clear_stale_rented_after_return` | RENTED nach COMPLETED+RETURN ohne ACTIVE → `AVAILABLE` |
| `complete_booking_after_return_protocol` | ACTIVE + RETURN (+ PICKUP) → `COMPLETED` |
| `activate_booking_after_pickup_protocol` | CONFIRMED + PICKUP → `ACTIVE` (+ Fahrzeug `RENTED`) |

### 3.4 Apply (nur Test-DB)

```bash
cd backend

npx ts-node -r tsconfig-paths/register scripts/ops/repair-vehicle-booking-handover-data.ts \
  --organization-id=<uuid> \
  --apply \
  --batch-size=10 \
  --output=./tmp/vbh-repair-local-apply-<uuid>.json
```

- **Kein `updateMany`** — einzelne `vehicle`/`booking`-Updates in Transaktionen
- **Idempotent:** bereits reparierte Zeilen → `skipped` im Report
- **Audit:** `activity_logs` + append-only `[VBH-REPAIR v1.0.0 …]` in `bookings.notes`
- **Keine Löschung** historischer Handover-Protokolle oder Buchungen

### 3.5 Erneute Diagnose

```bash
cd backend

npx ts-node -r tsconfig-paths/register scripts/ops/audit-vehicle-booking-handover-data.ts \
  --organization-id=<uuid> \
  --output=./tmp/vbh-audit-local-post-<uuid>.json
```

Vergleich vorher/nachher: `summary.byCheck` muss für reparierte Klassen sinken. `diagnosticAfter` im Repair-Report mit Post-Audit abgleichen.

---

## 4. Staging

### 4.1 Ablauf (Checkliste)

- [ ] Backup (Abschnitt 2)
- [ ] `npx prisma migrate status` — keine offenen Migrationen
- [ ] Diagnose mit Report-Archivierung
- [ ] Repair Dry Run + Review mit Domain Owner
- [ ] Repair `--apply` mit `--organization-id` (kleine Batches)
- [ ] Erneute Diagnose
- [ ] API-Vergleich + UI-Smoke-Tests (4.2, 4.3)
- [ ] Ergebnisbericht (Abschnitt 8)

Bei Remote-Staging-DB ggf.:

```bash
VEHICLE_BOOKING_HANDOVER_DIAGNOSTIC_ALLOW_REMOTE=1 npx ts-node -r tsconfig-paths/register scripts/ops/audit-vehicle-booking-handover-data.ts ...
VEHICLE_BOOKING_HANDOVER_REPAIR_ALLOW_REMOTE=1 npx ts-node -r tsconfig-paths/register scripts/ops/repair-vehicle-booking-handover-data.ts ...
```

### 4.2 API-Vergleich

Nach Dry Run / Apply dieselben Fahrzeuge über **alle drei Fleet-Endpunkte** prüfen — sie müssen konsistent ableiten:

| Endpunkt | Zweck |
|----------|-------|
| `GET /api/v1/organizations/:orgId/vehicles` | Fleet-Liste / Dashboard |
| `GET /api/v1/organizations/:orgId/fleet-map` | Karten-Marker |
| `GET /api/v1/organizations/:orgId/vehicles/:vehicleId` | Fahrzeug-Detail |

Prüfpunkte pro Fahrzeug:

- `status` (abgeleiteter Fleet-Label-String) konsistent über alle drei Routen
- Bei Ghost-Raw-Status: Ableitung demoted zu `Available` (kein hollow Reserved/Active Rented)
- `reservedBookingId` / `activeBookingId` passen zur Booking-Wahrheit
- Keine divergierenden Werte zwischen Liste und Detail für dasselbe `vehicleId`

Beispiel (mit gültigem Tenant-Token):

```bash
curl -s -H "Authorization: Bearer <token>" \
  "https://<staging-host>/api/v1/organizations/<uuid>/vehicles/<vehicle-uuid>" | jq '{id, status, reservedBookingId, activeBookingId}'

curl -s -H "Authorization: Bearer <token>" \
  "https://<staging-host>/api/v1/organizations/<uuid>/fleet-map" | jq '.vehicles[] | select(.id=="<vehicle-uuid>") | {id, status, reservedBookingId, activeBookingId}'
```

### 4.3 Fleet / Dashboard / Vehicle-Detail — Smoke-Tests

| Oberfläche | Prüfung |
|------------|---------|
| **Fleet Command Tabs** (V4.9.499) | Available / Reserved / Active / Maintenance / Unknown — Zähler = gefilterte Liste |
| **Fleet Map** | Marker-Ton und HUD-Status passen zum Tab; kein Reserved-Marker bei reiner Zukunftsbuchung |
| **Dashboard KPIs** | `ready-to-rent`, `active-rented`, `overdue-*` — keine Doppelzählung durch Raw-Ghosts |
| **Vehicle Detail** | Status-Badge + Booking-Supplement; bei UNKNOWN neutral (V4.9.500) |
| **Operator App** | Handover-Flow unverändert funktionsfähig |

### 4.4 Konkrete Testfälle (KS-FH-660E-artig)

Referenzfahrzeug aus Staging/Prod-Dokumentation: **KS FH 660E** (Tesla Model 3), Beispiel-`vehicleId`: `68868291-5478-42cd-b0c4-cc77b2a78e21` — **ID in der Zielumgebung verifizieren**.

| # | Szenario | Setup / Erwartung | Diagnose-Check | UI-Erwartung |
|---|----------|-------------------|----------------|--------------|
| A | **Zukunftsbuchung, heute Available** | CONFIRMED-Buchung mit `startDate` > heute (Org-TZ); raw `AVAILABLE` | `future_booking_legacy_reserved_trigger` ggf. Info; **kein** `raw_reserved_without_window` | Tab **Available**; Supplement „Nächste Buchung“; **nicht** Reserved |
| B | **Pickup-Tag Reserved** | CONFIRMED, `startDate` = heute (Org-TZ), raw `RESERVED` oder konsistente Ableitung | Kein Ghost-Reserved-Finding | Tab **Reserved**; `reservedBookingId` gesetzt |
| C | **Pickup abgeschlossen → Active Rented** | PICKUP-Protokoll, Booking `ACTIVE`, raw `RENTED` | Kein `pickup_completed_booking_not_active` | Tab **Active**; `activeBookingId` gesetzt |
| D | **Return abgeschlossen → Available** | RETURN-Protokoll, Booking `COMPLETED`, raw `AVAILABLE` | Kein `return_completed_booking_still_active`; kein `raw_rented_without_active_booking` | Tab **Available**; keine aktive Buchung |
| E | **Ghost RESERVED** | raw `RESERVED`, keine PENDING/CONFIRMED mit `endDate >= now` | `raw_reserved_without_window` → Repair `clear_stale_reserved_vehicle_status` | Nach Apply: Available (wenn keine Wartung) |
| F | **Ghost RENTED nach Return** | raw `RENTED`, COMPLETED+RETURN, kein ACTIVE | `raw_rented_without_active_booking` / Repair `clear_stale_rented_after_return` | Nach Apply: Available |
| G | **Telemetry unzuverlässig** | Fahrzeug wie KS FH 660E ohne belastbares Signal | Kein erzwungenes Available | Status **Unknown** / neutraler Badge (V4.9.500); **nicht** grün Available |
| H | **Handover-Drift** | RETURN existiert, Booking noch ACTIVE | `return_completed_booking_still_active` → Repair `complete_booking_after_return_protocol` | Nach Apply: Booking Completed, Fahrzeug freigegeben |

Diagnose für Referenzfahrzeug:

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/ops/audit-vehicle-booking-handover-data.ts \
  --organization-id=<uuid> \
  --license-plate="KS FH 660E" \
  --include-findings \
  --format=markdown \
  --output=./tmp/vbh-audit-staging-ks-fh-660e.md
```

---

## 5. Produktion

### 5.1 Risikoarmes Zeitfenster

| Kriterium | Empfehlung |
|-----------|------------|
| Zeitfenster | Geringe Pickup/Return-Last (z. B. Nacht / Wochenende) |
| Vorlauf | Keine laufenden Massen-Handover-Batches im selben Fenster |
| Kommunikation | Interne Ankündigung; Operator-Dispatch informiert |
| Dauerplanung | ~10–20 Min. pro Org bei moderaten Findings (abhängig von `--batch-size`) |

### 5.2 Zunächst nur Diagnose

**In Produktion immer zuerst** — mindestens ein voller Diagnose-Lauf **ohne** `--apply`:

```bash
cd backend

npx ts-node -r tsconfig-paths/register scripts/ops/audit-vehicle-booking-handover-data.ts \
  --organization-id=<uuid> \
  --output=/var/log/synqdrive/vbh-audit-prod-<uuid>-$(date +%F).json

npx ts-node -r tsconfig-paths/register scripts/ops/audit-vehicle-booking-handover-data.ts \
  --organization-id=<uuid> \
  --format=markdown \
  --output=/var/log/synqdrive/vbh-audit-prod-<uuid>-$(date +%F).md
```

Erst nach Domain-Owner-Review und Dry Run Freigabe → `--apply`.

### 5.3 Organisationsweises Vorgehen (Pflicht)

**Verboten in Produktion:**

```bash
# ❌ Kein Apply ohne Org-Scope
npx ts-node -r tsconfig-paths/register scripts/ops/repair-vehicle-booking-handover-data.ts --apply

# ❌ Kein paralleles Apply auf dieselbe Org
# ❌ Kein Apply über alle Orgs in einem Lauf
```

**Erlaubt (eine Org pro Apply-Lauf):**

```bash
cd backend

# 1) Diagnose (siehe 5.2)

# 2) Dry Run
npx ts-node -r tsconfig-paths/register scripts/ops/repair-vehicle-booking-handover-data.ts \
  --organization-id=<uuid> \
  --output=/var/log/synqdrive/vbh-repair-prod-dryrun-<uuid>-$(date +%F).json

# 3) Freigabe durch Domain Owner — dann Apply
VEHICLE_BOOKING_HANDOVER_REPAIR_ALLOW_PROD=1 \
  npx ts-node -r tsconfig-paths/register scripts/ops/repair-vehicle-booking-handover-data.ts \
  --organization-id=<uuid> \
  --apply \
  --batch-size=10 \
  --output=/var/log/synqdrive/vbh-repair-prod-apply-<uuid>-$(date +%F).json

# 4) Post-Diagnose
npx ts-node -r tsconfig-paths/register scripts/ops/audit-vehicle-booking-handover-data.ts \
  --organization-id=<uuid> \
  --output=/var/log/synqdrive/vbh-audit-prod-post-<uuid>-$(date +%F).json
```

Nächste Org erst nach Abnahme der vorherigen (Abschnitt 7).

### 5.4 Kleine Batches

| Szenario | `--batch-size` |
|----------|----------------|
| Default | `20` |
| Erster Prod-Lauf / viele Findings | `5`–`10` |
| Einzelfahrzeug nach Stichprobe | `--vehicle-id=<uuid>` statt großer Batch |
| Fehler/Timeouts | Batch halbieren; idempotent wiederholen |

### 5.5 Abbruchkriterien

Lauf **sofort stoppen** (kein weiteres `--apply`, ggf. Rollback), wenn:

| Kriterium | Schwelle |
|-----------|----------|
| `summary.errors` | > 0 nach Apply |
| Unerwartete `actionId` | Actions außerhalb der vier dokumentierten Repair-Regeln |
| Massenhafte `unresolved` | Deutlich mehr als im Dry Run |
| API/UI-Regression | Fleet-Tabs, Map oder Detail widersprechen Diagnose |
| Falscher Status nach Apply | ACTIVE ohne Pickup, RENTED mit offenem ACTIVE, Reserved ohne Pickup-Tag |
| Datenbank-Fehler | FK-Verletzungen, Transaktionsabbrüche |
| Operator-Unsicherheit | Abweichung vom freigegebenen Dry-Run-Report |

### 5.6 Keine globale unkontrollierte Reparatur

- Immer **eine `organization-id` pro Apply-Lauf**
- Dry Run und Apply **getrennt** dokumentieren
- Prod-Override `VEHICLE_BOOKING_HANDOVER_REPAIR_ALLOW_PROD=1` nur mit Ticket-Freigabe
- Kein `--apply` ohne vorherigen Dry Run für dieselbe Org
- Kein Apply bei offenen `cross_org_booking_link`-Findings ohne manuelle Klärung
- Diagnose-Findings der Klasse `multiple_active_bookings_per_vehicle` **manuell** klären — Skript repariert diese nicht automatisch

---

## 6. Rollback

### 6.1 DB-Restore

Wenn Apply irreversible Schäden verursacht oder Abbruchkriterien greifen:

```bash
# App-Writes minimieren (Wartungsmodus / Worker pausieren — org-spezifisch)

# Restore auf Staging zur Validierung
pg_restore -d synqdrive_vbh_rollback_validate /var/backups/synqdrive-vbh-repair-*-pre.dump

# Nach Freigabe: Produktion (mit DBA abstimmen)
pg_restore --clean --if-exists -d "$DATABASE_URL" /var/backups/synqdrive-vbh-repair-*-pre.dump
```

**Hinweis:** Restore betrifft die **gesamte Datenbank**, nicht nur Vehicle/Booking. Nur mit DBA und Change-Freigabe.

### 6.2 Deployment-Rollback

Wenn Fehler im Skript/Code vermutet werden (nicht in den Daten):

```bash
# Auf letztes bekanntes gutes Backend-Release zurück (< V4.9.502)
# Redeploy gemäß Standard-Release-Prozess (vps-deploy-release.sh)
```

Deployment-Rollback **ersetzt nicht** DB-Restore, wenn `--apply` bereits gelaufen ist.

### 6.3 Umgang mit Audit-Einträgen

Das Repair-Skript erzeugt:

| Quelle | Inhalt |
|--------|--------|
| `auditLog[]` im JSON-Report | Chronologie mit `scriptVersion`, `before`, `after`, `reason`, Zeitstempel |
| `activity_logs` | `entity` = `VEHICLE` oder `BOOKING`; `metaJson.provenance` = `VBH_REPAIR` |
| `bookings.notes` | Append-only Zeilen `[VBH-REPAIR v1.0.0 <ISO>] rule=… before=… after=…` |

**Nach DB-Restore:** Activity-Log-Einträge und Booking-Notes aus dem Repair-Fenster sind mit zurückgesetzt.

**Ohne Full-Restore:**

- VBH-REPAIR-Notes und Activity-Logs sind **historische Audit-Spur** — nicht manuell löschen
- Handover-Protokolle werden vom Skript **nie** gelöscht oder überschrieben
- UI kann `metaJson.scriptVersion` und `actionId` für Support anzeigen

---

## 7. Abnahmekriterien

Org gilt als abgenommen, wenn **alle** Kriterien erfüllt sind:

### 7.1 Diagnose-Kriterien (Post-Repair)

| Kriterium | Diagnose-`checkId` | Erwartung |
|-----------|-------------------|-----------|
| Keine raw RESERVED-Ghosts | `raw_reserved_without_window` | **0** |
| Keine raw RENTED-Ghosts | `raw_rented_without_active_booking` | **0** (unklare Fälle dokumentiert in `unresolved`) |
| Kein ACTIVE bei raw AVAILABLE | `active_booking_raw_available` | **0** |
| Handover Pickup konsistent | `pickup_completed_booking_not_active` | **0** |
| Handover Return konsistent | `return_completed_booking_still_active` | **0** |
| Endpunkte konsistent | `endpoint_canonical_derivation_divergence` | **0** oder nur Maintenance-Fälle |
| Keine Multi-ACTIVE | `multiple_active_bookings_per_vehicle` | **0** (manuell geklärt, nicht auto-repariert) |

Post-Diagnose:

```bash
cd backend
npx ts-node -r tsconfig-paths/register scripts/ops/audit-vehicle-booking-handover-data.ts \
  --organization-id=<uuid> \
  --format=console
```

### 7.2 Fachliche Soll-Zustände (UI / Ableitung)

| Szenario | Soll |
|----------|------|
| **Zukünftige Buchung** | Fahrzeug bleibt **Available**; `nextBooking` nur als Supplement (V4.9.499) |
| **Pickup-Tag** | **Reserved** (Reservierungsfenster), nicht nur wegen ferner Buchung |
| **Pickup abgeschlossen** | **Active Rented**; Booking `ACTIVE`; raw `RENTED` |
| **Return abgeschlossen** | Booking `COMPLETED`; Fahrzeug **Available** (wenn kein anderer ACTIVE, keine Wartung) |
| **Nicht belastbare Datenlage** | **Unknown** — neutraler Badge, kein irreführendes Available-Grün (V4.9.500) |
| **Endpunkte** | `/vehicles`, `/fleet-map`, `/vehicles/:id` — gleicher abgeleiteter Status pro Fahrzeug |

### 7.3 Manuelle Stichproben

Mindestens **3 Fahrzeuge** (oder alle betroffenen) aus dem Apply-Report:

| Kategorie | Prüfung |
|-----------|---------|
| Ghost Reserved bereinigt | DB `vehicles.status` + Fleet-Tab Available |
| Ghost Rented bereinigt | DB + Fleet-Tab nach Return |
| Handover-Reconciliation | Booking-Status + Protokolle PICKUP/RETURN |
| Referenz KS-FH-660E-artig | Unknown bei fehlendem Signal; keine Buchungs-Sperre durch falschen Ghost |

### 7.4 Abnahmeprotokoll (Vorlage)

```text
Org-ID:           <uuid>
Operator:         <name>
Datum/Zeit:       <ISO-8601>
Git-Commit:       <sha>
Skriptversion:    1.0.0
Dry-Run-Report:   <pfad>
Apply-Report:     <pfad>
Post-Audit:       <pfad>
Findings vorher:  <n>
Findings nachher: <n>
Unresolved:       <n> (Ticket: <id>)
Abnahme:          ja/nein — <Domain Owner Fleet/Rental>
```

---

## 8. Ergebnisbericht

Nach jedem Lauf (Dry Run **und** Apply) ist ein archivierter JSON-Report Pflicht.

### 8.1 Pflichtfelder (`VbhRepairReport`)

| Feld | Bedeutung |
|------|-----------|
| `vehiclesScanned` / `bookingsScanned` | Analysierte Entitäten |
| `summary.planned` | Geplante Änderungen |
| `summary.applied` | Tatsächlich ausgeführte Änderungen (nur bei `--apply`) |
| `summary.unresolved` | Ausgelassene unklare Fälle |
| `summary.skipped` | Idempotente Übersprünge |
| `summary.errors` | Fehler bei Apply |
| `summary.byAction` | Aufschlüsselung nach `actionId` |
| `actions[]` | Vollständiger Änderungsreport (`before` / `after`, `reason`, `applied`) |
| `unresolved[]` / `skipped[]` | Details |
| `auditLog[]` | Zeitliche Abfolge inkl. `scriptVersion` |
| `diagnosticBefore` / `diagnosticAfter` | Diagnose-Snapshot |
| `generatedAt` | Endzeitpunkt |

Diagnose-Report (`VbhDiagnosticReport`) zusätzlich archivieren bei reinem Diagnose-Lauf.

### 8.2 Auswertung

```bash
jq '{generatedAt, scriptVersion, planned: .summary.planned, applied: .summary.applied, unresolved: .summary.unresolved, skipped: .summary.skipped, errors: .summary.errors, byAction: .summary.byAction}' \
  /var/log/synqdrive/vbh-repair-prod-apply-<uuid>-*.json

jq '.summary.byCheck' /var/log/synqdrive/vbh-audit-prod-post-<uuid>-*.json
```

### 8.3 Management-Zusammenfassung (Vorlage)

```text
Vehicle Operational Status Repair — Ergebnis
==========================================
Umgebung:         Produktion / Staging / Lokal
Organisation:     <uuid> (<name>)
Zeitraum:         <start> — <end> (Dauer: <min>)
Skriptversion:    1.0.0
Modus:            Dry Run / Apply

Fahrzeuge gescannt: <vehiclesScanned>
Buchungen gescannt:<bookingsScanned>
Änderungen geplant: <summary.planned>
Änderungen applied:<summary.applied>
Unklar/skipped:   <summary.unresolved> / <summary.skipped>
Fehler:           <summary.errors>

Top Actions:
  - clear_stale_reserved_vehicle_status: <n>
  - clear_stale_rented_after_return: <n>
  - complete_booking_after_return_protocol: <n>
  - activate_booking_after_pickup_protocol: <n>

Diagnose vorher:  <totalFindings> Findings
Diagnose nachher: <totalFindings> Findings

Kritische Checks nachher:
  - raw_reserved_without_window: <n>
  - raw_rented_without_active_booking: <n>
  - endpoint_canonical_derivation_divergence: <n>

Reports:
  - <pfad-audit-pre>
  - <pfad-dryrun>
  - <pfad-apply>
  - <pfad-audit-post>
```

---

## Anhang: Schnellreferenz Kommandos

```bash
cd backend

# Diagnose (read-only)
npx ts-node -r tsconfig-paths/register scripts/ops/audit-vehicle-booking-handover-data.ts --organization-id=<uuid>
npx ts-node -r tsconfig-paths/register scripts/ops/audit-vehicle-booking-handover-data.ts --organization-id=<uuid> --license-plate="KS FH 660E" --format=markdown

# Repair Dry Run (Default)
npx ts-node -r tsconfig-paths/register scripts/ops/repair-vehicle-booking-handover-data.ts --organization-id=<uuid>

# Repair Apply
npx ts-node -r tsconfig-paths/register scripts/ops/repair-vehicle-booking-handover-data.ts --organization-id=<uuid> --apply --batch-size=10

# Mit Report-Datei
npx ts-node -r tsconfig-paths/register scripts/ops/repair-vehicle-booking-handover-data.ts \
  --organization-id=<uuid> --apply --batch-size=10 --output=./tmp/vbh-repair.json
```

---

*Letzte Aktualisierung: 2026-07-16 — Runbook-Version 1.0 (Skript `VBH_REPAIR_SCRIPT_VERSION=1.0.0`, Backend V4.9.502)*
