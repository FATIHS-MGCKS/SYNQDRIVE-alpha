# Master Admin — Kanonisches Connected Vehicles / DIMO Blueprint

**Datum:** 2026-08-18  
**Phase:** UI-7.2 (Spezifikation — keine Implementierung)  
**Basis:**
- `docs/ui/master-admin-connected-vehicles-dimo-deep-audit.md` (UI-7.1)
- `docs/ui/master-admin-canonical-page-framework.md` (UI-2.2)
- `docs/ui/master-admin-canonical-organization-management-blueprint.md` (UI-5.2)
- `docs/ui/master-admin-canonical-dashboard-blueprint.md` (UI-4.2)
- Kanonische DIMO-/Tenant-Architektur (Backend)
- `backend/src/modules/vehicles/telemetry-freshness.resolver.ts`
- `backend/src/modules/vehicles/vehicle-state-interpreter.ts`

**Leitfrage:** *Welche Fahrzeuge sind plattformweit korrekt zugeordnet, technisch angebunden und telemetrisch vertrauenswürdig — und was erfordert Governance-Eingriff?*

**Grundsatz:** Eine Wahrheit pro Domäne. Keine Frontend-Ableitung von Ownership, DIMO-Connectivity, Telemetry oder Integrität. Keine Tenant-Vehicle-Detail-Duplikation. Keine zweite globale Fahrzeugliste.

---

## 0. Produktrolle & Abgrenzung

| Connected Vehicles Hub **ist** | Connected Vehicles Hub **ist nicht** |
|--------------------------------|--------------------------------------|
| Plattformweite Governance für Fahrzeug ↔ Organisation ↔ DIMO | Ersatz für Rental Vehicle Detail (Specs, Health, Trips) |
| Kanonische Listen + Attention + Import/Reassign/Disconnect | Vollständige Fleet-Operations-Konsole |
| DIMO-/Telemetry-Diagnose auf Plattformebene | High Mobility OEM-Onboarding (→ eigene Integration) |
| Drilldown von Dashboard/Organisationen | Org-scoped Fleet Map / Buchungen |

**10-Sekunden-Ziel (nach Umsetzung):** Master Admin erkennt in der Übersicht: Plattform-DIMO-Status, Anzahl Fahrzeuge mit Aufmerksamkeit, Telemetrie-Histogramm, nächster Governance-Schritt — ohne Tab-Wechsel zwischen drei Sidebar-Einträgen.

**Sidebar-Eintrag (Ziel):** **„Verbundene Fahrzeuge“** — ersetzt den heutigen generischen „Vehicles“-Einstieg für Governance. Org-spezifische Fleet-Ops bleiben unter Organisationen → Fahrzeuge (scoped).

---

## 1. Information Architecture

### 1.1 Entscheidung: Ein Hub — keine parallelen Global Lists

Nach fachlicher Prüfung (Audit UI-7.1 + Anforderung „keine redundanten globalen Fahrzeuglisten“):

| Bereich | Separate Page? | Form im Hub | Begründung |
|---------|----------------|-------------|------------|
| **Vehicle Overview** | **Nein** | Sektion **Übersicht** | KPIs + DIMO-Kontext + Attention-Preview — keine zweite Liste |
| **Connected Vehicles (Liste)** | **Nein** | Sektion **Fahrzeuge** | **Eine** kanonische, paginierte Tabelle |
| **Attention / Integrity** | **Nein** | Filter + Queue auf derselben Liste / Übersicht-Widget | Gleiche API, `attention=true` — kein Duplicate Fetch |
| **DIMO Integration Context** | **Nein** | Banner (Übersicht) + Detail-Sektionen | Plattformstatus ≠ Fahrzeugliste |
| **DIMO Inventar (unregistered)** | **Nein** | **Filter-Preset** auf derselben Liste (`registrationState=unregistered`) | Vermeidet zweite Tabelle |
| **Import** | **Nein** | Sektion **Import** (Wizard) | Kein Listen-Duplikat |
| **Technical Diagnostics** | **Nein** | Detail-Panel **Technische Diagnostik** (+ Vollbild-Modus) | Fleet Connection Inhalt hierher |
| **High Mobility** | **Ja (bestehend)** | Sidebar **High Mobility** | Andere Domäne (OEM Clearance) |
| **Vehicle Logbook** | **Ja (bestehend)** | Sidebar **Fahrzeug-Logbuch** | Audit/Compliance-Domäne |
| **Fleet Connection (Sidebar)** | **Nein** | **Entfällt** als Root — Inhalt MERGE | Redundanz zu Vehicles + falscher Datenpfad |
| **Org Detail → Fahrzeuge** | **Ja (scoped)** | Tab unter Organisation | Tenant-Index; Link in Hub mit `organizationId` |

### 1.2 Ziel-Navigationsbaum

```
Verbundene Fahrzeuge  (?view=connected-vehicles)
├── Übersicht                    cvSection=overview
├── Fahrzeuge                    cvSection=vehicles
│   └── Detail (Drawer/Route)    cvSection=vehicles&vehicleId={id}
├── Import                       cvSection=import
└── (kein eigener Attention-Tab) → Queue in Übersicht + Filter in Fahrzeuge

Cross-Links:
  Dashboard Connectivity KPI     → Übersicht
  Dashboard / Org Attention      → Fahrzeuge?attention=true&organizationId=
  Org Detail → Fahrzeug-Zeile     → Fahrzeuge&vehicleId=
  Platform Health → DIMO          → Übersicht (DIMO-Banner fokussiert)
  High Mobility                   → bleibt ?view=high-mobility
```

**Keine Mikro-Pages:** Vehicle Governance Detail ist **an Fahrzeuge gebunden** (`vehicleId` URL), keine eigene Sidebar-Root.

**Keine doppelten Tabellen:** Registrierte und nicht-registrierte Fahrzeuge = **ein** `MasterTableShell`, unterschiedliche Filter-Presets.

### 1.3 Page Shell (UI-2)

```
MasterAdminShell
└── PageContainer variant="wide"
    ├── MasterPageHeader
    │   title: „Verbundene Fahrzeuge"
    │   description: „Plattformweite Zuordnung, DIMO-Anbindung und Telemetrie-Governance"
    │   status: DIMO-Plattform-Chip (wenn degraded)
    │   actions: kontextabhängig (s. §13)
    ├── MasterPageTabs (3 Primärsektionen — URL-gebunden)
    │   ├── Übersicht
    │   ├── Fahrzeuge
    │   └── Import
    └── Page Content (eine Scroll-Achse)
```

**Sprache:** DE kanonisch (`master.cv.*`).  
**Tabs:** `MasterPageTabs` + `chrome-tab-bar` — keine `sq-tab-bar`-Pills.

### 1.4 Abgrenzung Organisationen ↔ Connected Vehicles

| Kontext | Oberfläche | Scope |
|---------|------------|-------|
| „Wie steht Org X?“ | Organisationen → Übersicht / Fahrzeuge-Tab | `organizationId` fix |
| „Welche Fahrzeuge brauchen plattformweit Aufmerksamkeit?“ | Verbundene Fahrzeuge | Cross-tenant |
| Operative Miet-Flotte | Rental / Operator | Tenant-user |

Org-Detail **Fahrzeuge-Tab** bleibt: kompakte scoped Liste + Connectivity-Summary (kanonisch, UI-4). Row-Click → Hub mit `vehicleId` + `organizationId` vorausgefüllt.

---

## 2. Global Vehicle List

### 2.1 Eine kanonische Liste

**Komponente:** `MasterTableShell` + `DataTable` (Desktop) / `MobileVehicleCardList` (Mobile).

**API:** `GET /admin/vehicles/operational` (**neu**, Backend-Prerequisite) — einziges Listen-Aggregat für den Hub.

| Aspekt | Regel |
|--------|-------|
| Pagination | Server-seitig (`page`, `limit`; default 50, max 100) |
| Sort | Default: `attentionSeverity desc`, dann `lastSignalAt desc` |
| Search | Server-seitig `q` |
| Filter | Server-seitig (s. §11) |
| Client aggregate | **Verboten** für Status/Attention/Telemetry |

### 2.2 Spalten (Desktop — max 7 sichtbar + Actions)

| # | Spalte | Inhalt | Priorität |
|---|--------|--------|-----------|
| **1** | **Fahrzeug** | Primär: `licensePlate` oder fachlicher Name; Sekundär: `make model`; VIN mono subline | P0 |
| **2** | **Organisation** | `organizationName` (Link zu Org Detail) | P0 |
| **3** | **DIMO** | Link-Chip: `Verknüpft` / `Nicht verknüpft` / `Konflikt` | P0 |
| **4** | **Anbindung** | DIMO Connectivity Chip (Integration) | P0 |
| **5** | **Telemetrie** | Kanonischer Freshness-Chip | P0 |
| **6** | **Aufmerksamkeit** | Icon + Count oder „—“ | P0 |
| **7** | **Letztes Signal** | Relative Zeit (`observedAtIso`) — **sekundär**, nie allein | P1 |
| **8** | **Aktionen** | Overflow: „Details“, „Diagnostik“ | P2 |

**Nicht in der globalen Liste:**
- Fleet-Rental-Status (Available/Rented) — nur im Governance-Detail unter „Operativer Status“ optional
- Health-Ampel (Tires/Brakes/Battery) — Rental-Domäne
- Station, Specs, HM-State
- Token ID, UUID, `dimo_vehicle_id` (→ Diagnostics)
- OBD/Jamming/Poll-Logs

### 2.3 Row-Verhalten

| Interaktion | Verhalten |
|-------------|-----------|
| Row click | → `cvSection=vehicles&vehicleId={id}` (Governance Detail Drawer) |
| Org click | → `view=organizations&orgId={id}` (stop propagation) |
| Attention click | → Detail, Tab „Aktive Probleme“ fokussiert |
| Keyboard | Row focusable; Enter öffnet Detail |

### 2.4 Filter-Presets (keine extra Pages)

| Preset | Query | UI |
|--------|-------|-----|
| Alle registrierten | `registrationState=registered` (default) | Toolbar-Chip |
| DIMO-Inventar | `registrationState=unregistered` | Toolbar-Chip „DIMO-Inventar“ |
| Mit Aufmerksamkeit | `attention=true` | Toolbar-Chip + Übersicht-Widget |
| Org-scoped | `organizationId=` | Von Org Detail verlinkt |

### 2.5 Empty / Loading / Error

| State | UI |
|-------|-----|
| Loading | `MasterTableShell` skeleton |
| Empty (keine Fahrzeuge) | `MasterEmptyState` + CTA „Import starten“ |
| Empty (Filter) | „Keine Treffer“ + Filter zurücksetzen |
| Error | `MasterErrorState` + Retry |
| Stale | Banner „Daten älter als {threshold}“ (s. §14) |

---

## 3. Vehicle Identity

### 3.1 Prioritätsregel (verbindlich)

```
Primär:     Kennzeichen  →  wenn leer: vehicleName  →  wenn leer: „{make} {model}"
Sekundär:   make / model / year (subline)
Kontext:    organisationName (eigene Spalte / Card-Zeile)
Technical:  VIN, vehicle.id, dimoVehicleId, tokenId (nur Diagnostics)
```

### 3.2 Darstellung

| Kontext | Titel (h1) | Subline |
|---------|------------|---------|
| Listenzeile | Kennzeichen / Name | `VW ID.4 · WVG…` |
| Detail Header | Kennzeichen / Name | `Organisation · make model year` |
| Import Wizard | VIN + make/model | DIMO-Inventar-Kontext |
| Mobile Card | Kennzeichen | Org → Attention → Connectivity → Telemetry |

**Verboten:** UUID oder Token ID als Seitentitel, Drawer-Titel oder Tab-Titel.

### 3.3 Identitätsfelder (DTO)

```typescript
interface VehicleIdentityDto {
  vehicleId: string | null;           // null wenn unregistered DIMO only
  dimoVehicleId: string | null;
  licensePlate: string | null;
  vehicleName: string | null;
  vin: string;
  make: string;
  model: string;
  year: number;
  displayTitle: string;               // server-computed per rules above
  displaySubtitle: string;
}
```

`displayTitle` / `displaySubtitle` werden **serverseitig** berechnet — Frontend kopiert keine Fallback-Kette.

---

## 4. Status Model

### 4.1 Vier orthogonale Dimensionen

**Regel:** Jede Dimension = **eigener Chip**. Niemals zu einem Universal-Badge fusionieren.

#### A. Ownership (Organisation Mapping)

| Wert | Bedingung (kanonisch) | DE Label |
|------|----------------------|----------|
| `assigned` | `Vehicle.organizationId` gesetzt | Zugeordnet |
| `unassigned` | Nur `DimoVehicle`, kein `Vehicle` | Nicht zugeordnet |
| `conflict` | Duplicate binding / reconciliation conflict | Zuordnungskonflikt |

**Quelle:** PG `Vehicle` + `DimoVehicle` + reconciliation flags (**ADD** im Operational DTO).

#### B. DIMO Connectivity (Integration)

Spiegelt **technische Anbindung/Autorisierung** — nicht Telemetrie-Frische.

| Wert | Bedingung | DE Label |
|------|-----------|----------|
| `connected` | `dimoVehicleId` + `DimoVehicle.connectionStatus=CONNECTED` + token scope OK + kein auth error | Verbunden |
| `disconnected` | Link vorhanden, `DISCONNECTED` oder kein aktives Device | Getrennt |
| `error` | `ERROR` / `PENDING` / auth failure / unauthorized scope | Fehler |
| `none` | Kein `dimoVehicleId` | Keine DIMO-Verknüpfung |

**Quelle:** `DimoVehicle.connectionStatus` + platform token health + per-vehicle auth scope check (**ADD** `integrationConnectivity` im Operational Service).  
**Nicht:** `lastSignal` oder `telemetryFreshness` für diesen Chip.

#### C. Telemetry Freshness

**Einziger Resolver:** `telemetry-freshness.resolver.ts` → `classifyTelemetryFreshness`.

| Kanonischer Code | DE Label (UI) | Alias (Doku) |
|------------------|---------------|--------------|
| `live` | Live | — |
| `standby` | Standby | — |
| `signal_delayed` | Signal verzögert | Soft-Offline |
| `offline` | Offline | — |
| `no_signal` | Kein Signal | Unknown |

**Schwellen:** 15 min / 24 h / 48 h (`vehicle-state-interpreter.ts`).

**Anzeige:** Immer Label + optional relative Zeit in Klammern (`Standby · 3 Std.`).  
**Verboten:** `onlineStatus` (ONLINE/STANDBY/OFFLINE), `online` boolean, lokales `timeAgo`-only Badge.

#### D. Integrity (nur wenn Backend liefert)

| Wert | Bedingung | DE Label |
|------|-----------|----------|
| `healthy` | Keine offenen Attention-Reasons der Kategorie integrity | OK |
| `attention` | ≥1 integrity-related attention reason | Prüfen |
| `conflict` | `MAPPING_CONFLICT` oder duplicate binding | Konflikt |

**Quelle:** `vehicle-attention.util` (**ADD**). Frontend **darf** Integrity nicht selbst ableiten.

### 4.2 Chip-Layout

```
Desktop Liste:  [DIMO Link] [Anbindung] [Telemetrie]  |  Attention separat
Detail Header:  [Ownership] [Anbindung] [Telemetrie] [Integrität]
```

**Operativer Fleet-Status** (Available / Active Rented / …): nur im Detail unter Sektion „Operativer Status“ — **nicht** in der globalen Liste.

---

## 5. Attention Model

### 5.1 Prinzip

Analog `billing-attention.util.ts`: **serverseitig berechnet**, Frontend mappt Codes → Label, Severity, Drilldown. Keine neue Business-Logik im UI.

### 5.2 Kanonische Reason-Codes

Nur Codes, die aus **existierenden** Backend-Signalen ableitbar sind:

| Code | Severity | Quelle (bestehend/geplant) | DE Label | Drilldown |
|------|----------|---------------------------|----------|-----------|
| `MAPPING_CONFLICT` | critical | `registerFromDimo` conflict + device-connection reconciliation | Zuordnungskonflikt | Detail → DIMO Mapping |
| `MISSING_ORG_MAPPING` | warning | `DimoVehicle` ohne `Vehicle` | Nicht zugeordnet | Import / Detail |
| `DIMO_AUTH_ERROR` | critical | Token health + per-vehicle auth | DIMO-Autorisierung fehlgeschlagen | Detail → Authorization |
| `DIMO_DISCONNECTED` | warning | `connectionStatus=DISCONNECTED` bei registriertem Fahrzeug | DIMO getrennt | Detail → Connectivity |
| `TELEMETRY_PERSISTENT_OFFLINE` | warning | `telemetryFreshness=offline` > 7d (**ADD** threshold in util) | Länger offline | Detail → Telemetrie |
| `TELEMETRY_NO_SIGNAL` | info | `no_signal` bei registriertem + DIMO-linked | Kein Signal | Detail → Pipeline |
| `INGESTION_ERROR` | critical | `DimoPollLog` FAILURE/ TIMEOUT recent (**ADD** aggregate) | Ingestion-Fehler | Detail → Pipeline |
| `PIPELINE_STALE` | warning | last successful ingest > platform threshold (**ADD**) | Pipeline veraltet | Detail → Pipeline |
| `PLATFORM_DIMO_DEGRADED` | info | **Suppressed per-vehicle** wenn global; nur in Übersicht | DIMO-Plattform gestört | Übersicht Banner |

**Nicht als per-vehicle Attention** (nur Plattform-Übersicht):
- Globale DIMO API outages → `PLATFORM_DIMO_DEGRADED` aggregiert, nicht N× `INGESTION_ERROR` ohne Deduplizierung

### 5.3 Attention-Item DTO (pro Reason)

```typescript
interface VehicleAttentionItemDto {
  code: string;
  severity: 'info' | 'warning' | 'critical';
  reason: string;              // DE human label
  source: string;              // e.g. "dimo_poll_log", "telemetry_resolver", "registration"
  firstSeenAt: string;         // ISO
  lastSeenAt: string;          // ISO
  drilldown: {
    section: 'mapping' | 'connectivity' | 'telemetry' | 'pipeline' | 'import';
    vehicleId?: string;
    dimoVehicleId?: string;
  };
}
```

### 5.4 Aggregat (Liste + Header)

```typescript
interface VehicleAttentionSummaryDto {
  severity: 'none' | 'info' | 'warning' | 'critical';
  reasons: VehicleAttentionItemDto[];
  primaryReason: string | null;
  reasonCount: number;
}
```

### 5.5 Attention Queue (Übersicht)

- Top **8** Einträge cross-org (`GET /admin/vehicles/attention-queue`)
- Gruppiert nach `code` wenn `PLATFORM_DIMO_DEGRADED` — „142 Fahrzeuge betroffen“ statt 142 Zeilen
- Row → Hub Detail

---

## 6. Vehicle Detail (Governance)

### 6.1 Shell

**Typ:** Detail Drawer (Desktop `sm:max-w-[640px]`) / Fullscreen Sheet (Mobile).  
**Route:** `?view=connected-vehicles&cvSection=vehicles&vehicleId={id}`

**Nicht:** Tenant Vehicle Detail duplizieren. Keine Tires/Brakes/Battery-Editoren, kein HM Activate, keine Exterior Photos.

### 6.2 Aufbau (Sektionen)

```
MasterPageHeader (context) + Back zur Liste
├── Header-Statuszeile (Chips: Ownership, Anbindung, Telemetrie, Integrität)
│
├── § Operativer Status (read-only, kompakt)
│     Fleet-Status, Station — Link „Im Mandanten öffnen“ → Rental/Org
│
├── § Konnektivität & Telemetrie
│     Zwei Spalten: Anbindung (Integration) | Telemetrie (Freshness + last signal)
│
├── § DIMO-Zuordnung
│     Mapping-Status, dimoVehicleId (masked), Token, Device type
│
├── § Autorisierung
│     Scope status, last auth check, errors
│
├── § Daten-Pipeline
│     Letzte erfolgreiche Verarbeitung (ingest, poll, worker snapshot)
│
├── § Aktive Probleme
│     Attention-Liste (volle Items mit first/last seen)
│
├── § Technische Diagnostik (eingeklappt default)
│     IDs, correlation, ClickHouse/PG hints, OBD/Jamming, Poll log tail
│     CTA „Erweiterte Diagnostik“ → Vollbild-Modus (ex Fleet Connection)
│
└── § Audit & Verlauf
      Register, Deregister, Sync, Reassign — letzte 20 Events
```

### 6.3 Cross-Links aus Detail

| CTA | Ziel |
|-----|------|
| Organisation anzeigen | Org Detail |
| Im Mandanten öffnen | Rental Vehicle (org-scoped) |
| High Mobility | `?view=high-mobility` (read-only Kontext) |
| Plattformstatus DIMO | `?view=platform-health` |

---

## 7. DIMO Platform Status

### 7.1 Trennung Plattform vs. Fahrzeug

| Ebene | Wo | Inhalt |
|-------|-----|--------|
| **Plattform** | Übersicht-Banner + Header-Chip | Token health, API reachability, poll error rate, worker queue |
| **Organisation** | Org Detail (UI-4) | Org connectivity histogram |
| **Fahrzeug** | Detail Chips + Attention | Per-vehicle nur wenn **nicht** durch Plattformincident erklärbar |

### 7.2 Plattform-DIMO gestört — UX-Regeln

Wenn `platform-health.integrations.dimo` critical/degraded **oder** poll error rate > Schwellwert:

1. **Globaler Banner** in Übersicht (und dezent in Fahrzeuge-Toolbar):
   - „DIMO-Plattform eingeschränkt — Fahrzeugtelemetrie kann veraltet sein."
   - CTA: „Plattformstatus anzeigen"
2. **Aggregation:** Attention Queue zeigt **einen** Gruppeneintrag `PLATFORM_DIMO_DEGRADED` mit betroffener Fahrzeuganzahl
3. **Suppression:** Per-vehicle `INGESTION_ERROR` / `PIPELINE_STALE` werden im Attention-Aggregat **dedupliziert** hinter Plattform-Reason (Backend-Regel in `vehicle-attention.util`)
4. **Keine** rote Flut identischer Zeilen in der Liste — Telemetrie-Chips bleiben sichtbar, Attention zeigt max. Hinweis „Plattformvorfall"

**Quellen:** `GET /admin/platform-health`, `GET /admin/connectivity/platform-summary`, DIMO poll metrics (**bestehend**).

---

## 8. Import Flow

### 8.1 Sicherer Workflow (9 Schritte)

Wizard-Sektion `cvSection=import` — kann aus DIMO-Inventar-Zeile mit `dimoVehicleId` vorausgefüllt starten.

| Step | UI | Backend | Abbruch |
|------|-----|---------|---------|
| **1. Identifizieren** | Suche: VIN, Kennzeichen, DIMO-ID | `GET /admin/vehicles/operational?q=` + DIMO inventory filter | — |
| **2. DIMO prüfen** | Read-only Karte: Mirror-Daten, Connectivity, letztes Signal | `GET /admin/dimo/vehicles/:id/preflight` (**ADD**) | Stop wenn nicht in DIMO |
| **3. Organisation wählen** | Org-Suche (Name, nicht UUID) | `GET /admin/organizations/operational?q=` | Required |
| **4. Preflight** | Summary: Org, Billing vehicle count impact (**ADD**), bestehende Bindings | `POST …/import/preflight` (**ADD**) | Warnings anzeigen |
| **5. Conflict Check** | Explizite Konflikt-Karte wenn `DIMO_VEHICLE_ALREADY_REGISTERED` | preflight response | **Hard stop** |
| **6. Wirkung anzeigen** | Bullet list: was erstellt wird, was nicht überschrieben wird | copy from preflight | — |
| **7. Confirm** | Reason field (Pflicht) + Checkbox „Ich bestätige die Zuordnung" | — | — |
| **8. Transaction** | Loading; idempotent submit | `POST /organizations/:orgId/vehicles/register-from-dimo` (bestehend) | — |
| **9. Result** | Success / Partial / Failure Karte + Link zum Detail | response | Retry CTA |

### 8.2 Konflikt — kein stilles Überschreiben

Wenn preflight `existingVehicle` + `existingOrganization` liefert:

```
┌─────────────────────────────────────────────┐
│ ⚠ Zuordnungskonflikt                         │
│ Dieses DIMO-Fahrzeug ist bereits registriert │
│ Organisation: Acme Fleet GmbH                  │
│ Fahrzeug: B-AB 1234 · VIN …                  │
│ [Konflikt anzeigen]  [Abbrechen]              │
└─────────────────────────────────────────────┘
```

**Kein** „trotzdem importieren". CTA „Konflikt anzeigen“ → Hub Detail des bestehenden Fahrzeugs.

### 8.3 Vereinfachung gegenüber Ist

`VehicleRegistrationModal` heute: Specs, AI, Tires, HM — **nicht** Teil des Governance-Import.  
Specs-Nachpflege → Org/Rental nach erfolgreichem Import (Link im Result).

---

## 9. Reassignment (Organization)

### 9.1 Fachliche Entscheidung

Organization Reassignment ist **High-Risk** — nur wenn Produkt/Backend explizit erlauben (**ADD** `POST /admin/vehicles/:id/reassign-organization`).

### 9.2 Flow (eigener Dialog — kein Dropdown)

| Step | Inhalt |
|------|--------|
| Auslöser | Detail → Overflow „Organisation zuweisen" (nur wenn Backend `canReassign`) |
| Ist-Zustand | Aktuelle Organisation, dimo mapping, billing connected count |
| Ziel | Org-Suche + Auswahl |
| Auswirkungen | Bullet: Billing, historical data bleibt, DIMO token unchanged, bookings unaffected (**ADD** backend copy) |
| Datenhistorie | Hinweis: Trips/ClickHouse behalten orgId history — **keine** stillen Moves |
| Bestätigung | Reason + MFA Step-up (**Pflicht**) |
| Audit | `VEHICLE_ORG_REASSIGNED` event |
| Result | Success → Detail reload |

**Verboten:** Org-Änderung im allgemeinen Edit-Modal per `<select>`.

---

## 10. Disconnect

### 10.1 Begriffsklärung (verbindliche Copy)

| Aktion | UI-Name | Wirkung |
|--------|---------|---------|
| **SynqDrive-Registrierung aufheben** | „Registrierung aufheben" (ehem. Deregister) | Löscht `Vehicle` + cascaded ops data; **behält** `DimoVehicle` |
| **DIMO-Verknüpfung trennen** | „DIMO trennen" (**ADD** falls Backend existiert) | Entfernt Mapping; optional unterschiedliche Scope |
| **Fahrzeug endgültig löschen** | „Endgültig löschen" (nur wenn API existiert) | Destructive — alle Spuren |

### 10.2 Was bleibt / was geht — Tabelle im Confirm

| Artefakt | Registrierung aufheben | DIMO trennen (wenn ADD) |
|----------|------------------------|-------------------------|
| Fahrzeug-Stammdaten (SynqDrive) | **Entfernt** | Bleibt (ohne DIMO) |
| Historische Telemetrie (PG latest + CH) | **Bleibt** (CH org-scoped history) | Bleibt |
| DIMO Authorization / Token | **Bleibt** am DimoVehicle | **Entfernt/invalidiert** |
| Organisation-Zuordnung | Entfällt mit Vehicle | Bleibt bis Reassign |
| Buchungen / Trips | Historie bleibt | Historie bleibt |

### 10.3 UI-Regeln

- Icon: **nicht** Trash für „Registrierung aufheben" — `RotateCcw` oder `Unlink`
- Destructive rot nur für endgültige Löschung
- Nach Aktion: Result-State mit klarem nächsten Schritt („Im DIMO-Inventar sichtbar")

---

## 11. Search & Filter

### 11.1 Search (`q`)

Server-seitig, debounced 300ms:

| Feld | Priorität |
|------|-----------|
| `licensePlate` | P0 |
| `vin` | P0 |
| `vehicleName`, `make`, `model` | P0 |
| `organizationName` | P1 |
| `dimoVehicleId`, `tokenId` | P2 — nur wenn `supportMode=true` Query-Flag |

### 11.2 Filter (Toolbar)

| Filter | Parameter | Werte |
|--------|-----------|-------|
| Organisation | `organizationId` | Org picker |
| DIMO Connectivity | `integrationConnectivity` | connected / disconnected / error / none |
| Telemetry State | `telemetryFreshness` | live / standby / signal_delayed / offline / no_signal |
| Attention | `attention` | true / false |
| Registration | `registrationState` | registered / unregistered |

**Nicht exponieren:** 12 technische Einzelfilter (poll status, OBD, jamming) — nur in Diagnostics.

### 11.3 URL-Persistenz

```
?view=connected-vehicles&cvSection=vehicles
  &q=…&organizationId=…&integrationConnectivity=…
  &telemetryFreshness=…&attention=true&registrationState=…
  &page=1&limit=50
```

---

## 12. Technical Diagnostics

### 12.1 Platzierung

| Tiefe | Wo |
|-------|-----|
| **Kompakt** | Detail § Technische Diagnostik (collapsed) |
| **Vollständig** | Vollbild-Modus `cvSection=vehicles&vehicleId=&diagnostics=1` |

Inhalt **migriert** aus heutigem `FleetConnectionView` (OBD, Jamming, Signal Coverage, Poll logs, Query Console).

### 12.2 Erlaubte Felder

| Feld | Quelle |
|------|--------|
| `vehicle.id`, `dimoVehicleId`, `tokenId` | PG |
| `deviceSerial`, `connectionType`, `sourceType` | DimoVehicle raw |
| `lastIngestAt`, `lastPollStatus`, `lastPollError` | Poll logs |
| `correlationId` / `requestId` | Last failed poll (**ADD** in DTO) |
| `queueState` | platform-health worker subset |
| `clickhouse.tripCount` / `hasRecentSignals` | **ADD** optional read-only flags |
| `postgres.latestStateUpdatedAt` | PG |

### 12.3 Query Console

- Nur in Vollbild-Diagnostik
- **High Risk:** MFA + Reason + Audit (s. §13)
- Rate-limit Hinweis im UI

**Verboten:** Roh-JSON in Primary List oder Overview.

---

## 13. Privileged Action Model

### 13.1 Kategorien

| Kategorie | Beispiele | Placement | Confirm | Step-up | Reason | Audit |
|-----------|-----------|-----------|---------|---------|--------|-------|
| **Normal** | Drilldown, Filter, Export read | Row/Toolbar | Nein | Nein | Nein | Nein |
| **Sensitive** | Sync DIMO, Refresh Snapshot, Retry Import | Toolbar / Row | Ja | Nein | Optional | Ja |
| **High Risk** | Reassign Org, DIMO Disconnect, GraphQL Console | Detail Overflow | Ja | **MFA** | **Pflicht** | Ja |
| **Destructive** | Registrierung aufheben, Endgültig löschen | Detail Overflow | Ja + Impact | **MFA** | **Pflicht** | Ja |

### 13.2 Result States

Nach jeder Mutation:

| State | UI |
|-------|-----|
| Success | Toast + Detail reload + Audit-Zeile |
| Conflict | Inline conflict card (kein Toast-only) |
| Partial | Warning banner mit „Was ist fehlgeschlagen" |
| Error | `MasterErrorState` mit correlation id (copy button) |

### 13.3 Header Actions (kontextabhängig)

| Sektion | Primary | Secondary |
|---------|---------|-----------|
| Übersicht | — | Daten neu laden |
| Fahrzeuge | — | Daten neu laden, Export (read) |
| Import | Import starten | Abbrechen |
| Detail | — | Overflow: Sensitive/High/Destructive |

---

## 14. Data Freshness

### 14.1 Modul-Matrix

| Modul | Source | Endpoint | Refresh | Stale Threshold | Error Behavior |
|-------|--------|----------|---------|-----------------|----------------|
| Übersicht KPIs | operational aggregate | `GET /admin/vehicles/operational/overview` (**ADD**) | 120s polling + manual | 10 min | Partial degrade; Banner |
| Fahrzeugliste | operational list | `GET /admin/vehicles/operational` | on filter change + 120s | 5 min | `MasterErrorState` |
| Attention Queue | attention service | `GET /admin/vehicles/attention-queue` | with overview | 10 min | Hide queue + warning |
| Vehicle Detail | detail aggregate | `GET /admin/vehicles/operational/:id` | on open + 60s | 3 min | Section-level error |
| DIMO Platform Banner | platform-health | `GET /admin/platform-health` | shared operational cache (60s) | 10 min | Assume unknown |
| Telemetry Chips | telemetry resolver | embedded in operational DTO | with parent | **Telemetry age** ≠ page refresh | Show last computed + stale chip |
| Diagnostics | diagnostics aggregate | `GET /admin/vehicles/:id/diagnostics` (**ADD**) | on expand / manual | 2 min | Inline retry |

### 14.2 Telemetry vs. Page Refresh

- **Page Refresh** (`Daten neu laden`): invalidiert operational cache — lädt API neu.
- **Telemetry Freshness**: computed server-side from `observedAtMs` — UI zeigt `computedAt` in Detail („Stand: vor 2 Min.").
- **Verboten:** Client-seitiges Re-Labeling von Telemetrie nach elapsed time ohne Backend roundtrip.

---

## 15. Mobile

### 15.1 Card-Priorität (strikt)

```
1. Fahrzeugidentität (Kennzeichen / Name)
2. Organisation
3. Aufmerksamkeit
4. DIMO Anbindung (Integration)
5. Telemetrie
6. Letztes Signal
7. Aktionen (Details)
─── fold ───
8. Technische Details
```

### 15.2 Layout

- **Keine** horizontale Desktop-Tabelle
- `MobileVehicleCardList` — gleiche API wie Desktop
- Detail: Fullscreen Sheet
- Import: Stepper vertical
- Diagnostics: eigener Screen, nicht im Drawer gequetscht

---

## 16. Data Contract

### 16.1 Wesentliche UI-Elemente

| UI Element | Canonical Source | Endpoint | Refresh | Stale Rule | Action |
|------------|------------------|----------|---------|------------|--------|
| Listenzeile Identität | `VehicleIdentityDto.displayTitle` | operational list | 120s | 5 min | Open detail |
| Organisation | `organizationId`, `organizationName` | operational list | 120s | 5 min | → Org detail |
| DIMO Link Chip | `dimoLinkStatus` | operational list | 120s | 5 min | → Detail mapping |
| Anbindung Chip | `integrationConnectivity` | operational list | 120s | 5 min | → Detail connectivity |
| Telemetrie Chip | `telemetryFreshness` via resolver | operational list | 120s | per observedAt | → Detail telemetry |
| Letztes Signal | `telemetryObservedAtIso` | operational list | 120s | per observedAt | — |
| Attention | `VehicleAttentionSummaryDto` | operational list | 120s | 10 min | → Detail issues |
| Übersicht KPI „Registriert" | count registered | overview (**ADD**) | 120s | 10 min | Filter preset |
| Übersicht KPI „DIMO-Inventar" | count unregistered | overview | 120s | 10 min | Filter preset |
| Freshness Histogram | `telemetry-freshness.resolver` batch | overview / platform-summary | 120s | 10 min | Filter by state |
| DIMO Platform Banner | `platform-health.integrations.dimo` | platform-health | 60s cache | 10 min | → platform-health |
| Attention Queue | `vehicle-attention.util` | attention-queue (**ADD**) | 120s | 10 min | → detail |
| Detail Mapping | PG + reconciliation | operational/:id | 60s | 3 min | Import/Repair CTAs |
| Detail Pipeline | poll logs + worker | operational/:id | 60s | 3 min | Retry ingest |
| Diagnostics OBD/Jamming | `extractConnectivitySnapshot` | diagnostics/:id (**ADD**) | manual | 2 min | — |
| Import Preflight | preflight service | import/preflight (**ADD**) | on step | — | Block on conflict |
| Register | `registerFromDimo` | existing POST | on submit | — | Result screen |
| Deregister | `deregister` | existing POST | on submit | — | Result screen |

### 16.2 Backend Prerequisites (ADD)

| Endpoint | Rolle |
|----------|-------|
| `GET /admin/vehicles/operational` | Kanonische Liste |
| `GET /admin/vehicles/operational/overview` | Übersicht KPIs + histogram |
| `GET /admin/vehicles/operational/:vehicleId` | Governance Detail |
| `GET /admin/vehicles/attention-queue` | Cross-org Queue |
| `GET /admin/vehicles/:vehicleId/diagnostics` | Technical diagnostics |
| `POST /admin/vehicles/import/preflight` | Import steps 4–5 |
| `GET /admin/dimo/vehicles/:id/preflight` | Import step 2 |
| `POST /admin/vehicles/:id/reassign-organization` | High-risk (optional) |
| Refactor `GET /admin/dimo/fleet-connectivity` | Deprecate in favor of operational + diagnostics |

**Shared util:** `vehicle-attention.util.ts` (analog `billing-attention.util.ts`).

---

## 17. IA Change Matrix

| Aktion | Objekt | Von | Nach | Begründung |
|--------|--------|-----|------|------------|
| **KEEP** | Sidebar: High Mobility | `high-mobility` | — | Eigene OEM-Domäne |
| **KEEP** | Sidebar: Vehicle Logbook | `vehicle-logbook` | — | Compliance-Domäne |
| **KEEP** | Org Detail → Fahrzeuge Tab | scoped list | — | Tenant-Index (UI-4) |
| **KEEP** | Dashboard Connectivity Summary | dashboard | — | Plattform-Aggregat (kanonisch) |
| **KEEP** | `registerFromDimo` / `deregister` APIs | backend | — | Fachlich korrekt; UI/Flow anpassen |
| **KEEP** | `telemetry-freshness.resolver` | backend | — | Single truth |
| **KEEP** | Confirm copy Deregister Wirkung | dialog text | — | Gute Basis — DE + MFA |
| **REMOVE** | Sidebar: Fleet Connection | `fleet-connection` | — | Redundant + falscher Resolver |
| **REMOVE** | Tab „HM Telemetry" in Vehicles | PlatformVehiclesView | — | HM gehört zu high-mobility |
| **REMOVE** | Tab „DIMO" als separate Tabelle | PlatformVehiclesView | — | → Filter-Preset |
| **REMOVE** | KPI Fleet-Status (Available/Rented…) | Overview | — | Rental-Ops, nicht Governance |
| **REMOVE** | Health/Station/Signal-Spalten (Ist) | Registered table | — | Falsche Domäne / vermischt |
| **REMOVE** | Spec sections im Detail Drawer | PlatformVehiclesView | — | Tenant-Duplikat |
| **REMOVE** | HM Activate/Deactivate im Vehicle Drawer | PlatformVehiclesView | — | Falsche Ebene |
| **REMOVE** | Client-side `listAll` bulk load | App.tsx | — | Nicht skalierbar |
| **REMOVE** | `onlineStatus` / `online` als UI-Truth | Frontend | — | Legacy |
| **MOVE** | Fleet Connection diagnostics | `FleetConnectionView` | Detail § Diagnostics + Vollbild | Konsolidierung |
| **MOVE** | DIMO Sync | DIMO tab toolbar | Übersicht + Import | Klarer Kontext |
| **MOVE** | Register CTA | DIMO row | Import wizard | Sicherer Flow |
| **MOVE** | Connectivity badge nav | `vehicles` | `connected-vehicles` | Semantik |
| **MERGE** | Vehicles + DIMO unregistered lists | 2 tabs | 1 table + `registrationState` filter | Keine Duplikate |
| **MERGE** | Attention view | (neu) | Overview queue + list filter | Eine API |
| **MERGE** | Platform DIMO + vehicle attention | separate alerts | Platform banner + deduped queue | Keine Alert-Flut |
| **RENAME** | Sidebar „Vehicles" | `vehicles` | `connected-vehicles` / „Verbundene Fahrzeuge" | Governance-Semantik |
| **RENAME** | „Deregister" | EN | „Registrierung aufheben" | Klarheit vs. Löschen |
| **RENAME** | `signal_delayed` label | — | „Signal verzögert" (Soft-Offline) | DE kanonisch |
| **ADD** | Operational vehicles API + attention util | — | backend | Billing/Org Pattern |
| **ADD** | Import preflight + conflict UI | — | Import section | Safety |
| **ADD** | DIMO Platform banner + dedup | — | Übersicht | §7 |
| **ADD** | Governance Detail sections | — | Drawer | §6 |
| **ADD** | Reassign high-risk flow | — | Detail | §9 (wenn fachlich erlaubt) |
| **ADD** | MFA + Reason on destructive/high | — | privileged actions | §13 |
| **ADD** | `vehicleId` URL consumption | — | Fahrzeuge section | Deep links |
| **ADD** | Mobile card list | — | Fahrzeuge section | §15 |
| **ADD** | `master.cv.*` i18n keys | — | frontend | DE kanonisch |

---

## 18. Umsetzungsreihenfolge (Vorschlag)

| Phase | Inhalt | Abhängigkeit |
|-------|--------|--------------|
| **1** | Backend: `vehicle-attention.util`, operational list/detail/overview, resolver refactor | — |
| **2** | Frontend: Hub shell + Übersicht + kanonische Liste | Phase 1 |
| **3** | Governance Detail + Diagnostics merge | Phase 2 |
| **4** | Import wizard + preflight | Phase 1 |
| **5** | Privileged actions (MFA, Reason) + Reassign (wenn API) | Phase 3–4 |
| **6** | IA cleanup: remove Fleet Connection root, nav rename, App.tsx decouple | Phase 2–3 |
| **7** | i18n DE, mobile cards, a11y pass | Phase 2 |

---

## 19. Akzeptanzkriterien (Spezifikation)

1. **Eine** globale Fahrzeugliste — DIMO-Inventar nur als Filter.
2. Vier Status-Dimensionen als **getrennte Chips** — nirgends Universal-Badge.
3. Telemetrie ausschließlich über `telemetry-freshness.resolver` Labels.
4. Attention nur aus serverseitigen Codes — mit Severity, Source, First/Last Seen, Drilldown.
5. Vehicle Detail **ohne** Tenant-Spec-Duplikation.
6. Plattform-DIMO-Störung als **ein** aggregiertes Signal — keine künstliche Per-Vehicle-Flut.
7. Import mit Preflight + Conflict hard-stop.
8. Disconnect/Reassign mit expliziter Wirkungstabelle + MFA wo vorgesehen.
9. Deep Link `vehicleId` öffnet Governance Detail.
10. Mobile: Card-Layout ohne horizontale Pflicht-Tabelle.

---

## Anhang — Referenz-Dateien (Ist)

| Rolle | Pfad |
|-------|------|
| Audit | `docs/ui/master-admin-connected-vehicles-dimo-deep-audit.md` |
| Page Framework | `docs/ui/master-admin-canonical-page-framework.md` |
| Org Blueprint (Pattern) | `docs/ui/master-admin-canonical-organization-management-blueprint.md` |
| Telemetry resolver | `backend/src/modules/vehicles/telemetry-freshness.resolver.ts` |
| Attention pattern | `backend/src/modules/billing/billing-attention.util.ts` |

---

*Ende des Blueprints — keine Implementierung in dieser Phase.*
