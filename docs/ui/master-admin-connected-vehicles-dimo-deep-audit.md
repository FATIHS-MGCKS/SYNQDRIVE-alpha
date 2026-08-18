# Master Admin — Connected Vehicles / DIMO Deep Audit

**Datum:** 2026-08-18  
**Phase:** UI-7 (Read-only Audit — keine Implementierung)  
**Scope:** Globale Fahrzeugverwaltung, Connected Vehicles, DIMO, Zuordnung, Connectivity, Telemetry Freshness, Import, Disconnect/Reconnect, Integrität, organisationsübergreifende Diagnose  

**Pflichtquellen:**
- UI-1 `docs/ui/master-admin-information-architecture-audit.md`
- UI-2 `docs/ui/master-admin-canonical-page-framework.md`
- UI-3 Dashboard Remediation + Blueprint
- UI-4 Organizations Remediation + Blueprint
- UI-5/6 Billing Remediation + Blueprint
- `backend/src/modules/vehicles/telemetry-freshness.resolver.ts`
- `backend/src/modules/vehicles/vehicle-state-interpreter.ts`
- ClickHouse-/PostgreSQL-Architektur (`architecture/`, DIMO Worker MRFs)

---

## 1. Executive Summary

Die Master-Admin-Fahrzeug- und DIMO-Oberflächen sind **funktional vorhanden**, aber **architektonisch fragmentiert** und **nicht auf Enterprise-Control-Plane-Niveau** für Plattform-Governance ausgelegt. Im Gegensatz zu den bereits remediierten Bereichen Dashboard (UI-3), Organizations (UI-4) und Billing (UI-6) fehlt für Fahrzeuge/DIMO ein **kanonisches Operational Read Model**, eine **einheitliche Attention-Schicht** und eine **saubere Trennung** von Integration Connectivity, Telemetry Freshness und operativem Fleet-Status.

| Stärke | Schwäche |
|--------|----------|
| Backend liefert `telemetryFreshness` + `onlineStatus` über `interpretVehicleState` / `mapToRegisteredVehicle` | Master Vehicles UI ignoriert `telemetryFreshness` — zeigt Legacy `onlineStatus` + `timeAgo()` |
| `registerFromDimo` mit Advisory Lock + Conflict (`DIMO_VEHICLE_ALREADY_REGISTERED`) | Kein dediziertes Operational API / Attention Queue für Plattform-Fahrzeuge |
| `deregister` erhält DIMO-Identität; Confirm-Dialog erklärt Wirkung klar | Kein separater Disconnect vs. Deregister-Flow; HM-Aktionen im falschen Detail-Kontext |
| Org-Detail (post UI-4) nutzt kanonische Connectivity-Summary | Globale Vehicles-View nutzt anderen Datenpfad als Org-Detail und Fleet Connection |
| Fleet Connection bietet tiefe technische Diagnose (OBD, Jamming, Query Console) | `GET /admin/dimo/fleet-connectivity` implementiert **eigene** Schwellen (inkl. 5-Min-„Live“) statt `telemetry-freshness.resolver` |
| Canonical 5 States im Backend definiert (`live/standby/signal_delayed/offline/no_signal`) | Fleet Connection kennt nur 4 Connection-States ohne `signal_delayed`; DIMO-Tab zeigt `Connected/Disconnected` aus Mirror |

**Kernbefund:** Es existieren **mindestens drei konkurrierende Wahrheiten** für Fahrzeug-Konnektivität/Telemetrie im Master Admin:
1. `PlatformVehiclesView` — `onlineStatus` (ONLINE/STANDBY/OFFLINE) + relatives `lastSignal`
2. `FleetConnectionView` — `connectionStatus` (online/standby/offline/not_connected) via `dimo.controller` mit lokalen Schwellen
3. Dashboard/Org Operational — `telemetry-freshness.resolver` (5 States, kanonisch)

**Fazit:** Die Oberflächen eignen sich teilweise für **operative Tenant-Pflege** (Specs, HM, Exterior Photos), nicht für **Plattform-Diagnose**. Eine Konsolidierung unter einem kanonischen „Connected Vehicles / DIMO Governance“-Hub analog Billing/Organizations ist erforderlich.

### Scores (0–100)

| Dimension | Score | Kurzbegründung |
|-----------|-------|----------------|
| Vehicle Clarity | **42** | Liste mischt Fleet-Status, Health, Signal; fehlende DIMO/Attention-Spalten |
| DIMO Clarity | **38** | DIMO-Status über 4 Views fragmentiert; Mirror-`Connected` ≠ Integritätsbestätigung |
| Tenant Ownership Clarity | **48** | Org-Spalte vorhanden; keine expliziten Orphan/Mapping-Konflikt-Zustände |
| Connectivity Clarity | **32** | Drei parallele Ableitungen; Begriffe vermischt |
| Telemetry Trustworthiness | **35** | Backend kanonisch; Master UI nutzt es nicht konsistent |
| Action Safety | **52** | Deregister-Confirm gut; kein Step-up, keine Audit-Sicht, HM-Aktionen ohne Governance |
| Diagnostic UX | **55** | Fleet Connection stark technisch; falsch platziert im Primary-Flow der Vehicles-View |
| Responsive UX | **46** | DIMO/HM-Tabellen horizontal scroll-only; Drawer ok |
| Accessibility | **50** | Pattern Library teilweise; gemischte EN/DE; Signal nur Farbe+Zeit |
| Technical Cleanliness | **40** | Full client load, kein serverseitiges Filter/Paging in UI, duplicate API paths |

**Gewichteter Gesamtscore (governance-dominant):** ~**44/100**

---

## 2. Vehicle Inventory

### 2.1 Routing & Navigation

| Route / View ID | Sidebar-Gruppe | Datei | URL-State |
|-----------------|----------------|-------|-----------|
| `vehicles` | Fleet | `PlatformVehiclesView.tsx` | `?view=vehicles` (+ `vehicleId` gesetzt, aber **nicht konsumiert**) |
| `fleet-connection` | Connectivity | `FleetConnectionView.tsx` | `?view=fleet-connection` |
| `high-mobility` | Connectivity | `HighMobilityDataView.tsx` | `?view=high-mobility&hmTab=…` |
| `vehicle-logbook` | Fleet | `VehicleLogbookView.tsx` | `?view=vehicle-logbook` |
| Org Detail → Tab `vehicles` | (Drilldown) | `OrganizationDetailView.tsx` | `orgId` in-memory |
| Dashboard Connectivity | Overview | `MasterDashboardView.tsx` | operational API |
| Platform Health → DIMO Card | Operations | `PlatformHealthView.tsx` | `?view=platform-health` |

**Nav-Badges:** `vehicles` → `connectivity-warning`; `fleet-connection` / `high-mobility` → `integration-outage` (aus operational cache, post UI-3).

### 2.2 `PlatformVehiclesView` — Vollinventar

#### Page-Level

| Element | Zweck | Datenquelle | Endpoint | Source of Truth | Aktualisierung | Interaktionen | Berechtigung |
|---------|-------|-------------|----------|-----------------|----------------|---------------|--------------|
| `MasterPageHeader` „Vehicles“ | Seitentitel + Tabs | — | — | — | — | Tab-Wechsel | `MASTER_ADMIN` |
| Tab **Registered Vehicles** | Registrierte Flotte plattformweit | Parent state `registeredVehicles` | `GET /admin/vehicles?limit=200` | PostgreSQL `Vehicle` + `latestState` | Mount + nach Mutationen in `App.tsx` | Row click → Drawer | `MASTER_ADMIN` |
| Tab **DIMO** | Nicht registrierte DIMO-Spiegel | Parent `dimoVehicles` | `GET /admin/dimo/non-registered` | PostgreSQL `DimoVehicle` | Mount + Sync | Register, Refresh Snapshot | `MASTER_ADMIN` |
| Tab **HM Telemetry** | HM Clearance-Kandidaten | Local fetch | `GET /admin/high-mobility/telemetry-app-candidates` | PostgreSQL HM tables | Tab activate | Read-only Liste | `MASTER_ADMIN` |
| KPI Row (5× MetricCard) | Fleet-Status-Counts | Client aggregate auf `registeredVehicles` | — | Abgeleiteter `status` aus Backend | Bei Daten-Reload | — | — |
| Search input | Client-Filter | In-memory | — | — | Instant | Tippen | — |
| Filter Org / Status | Client-Filter | In-memory | — | — | Select | Nur Registered-Tab | — |
| **Sync from DIMO** | DIMO Mirror Sync | Mutation | `POST /admin/dimo/sync` | DIMO API → `DimoVehicle` | On click | Button | `MASTER_ADMIN` |

#### Registered Table Columns

| Spalte | Zweck | Datenquelle | Feld / Ableitung | SoT | Problem |
|--------|-------|-------------|------------------|-----|---------|
| Vehicle | Identität | `vehicleName`, `vin` | PG | ✓ | VIN in Liste ok |
| Organization | Ownership | `organizationName` | PG join | ✓ | Kein Link zur Org |
| Status | Operativer Fleet-Status | `status` | `deriveFleetStatusContext` | ✓ | Miet-Status, nicht Plattform-Governance |
| Health | Gesundheits-Ampel | `health` | PG `healthStatus` | ✓ | Tenant-Ops-Detail, fraglich global |
| Station | Heimatstation | `station` | PG | ✓ | Detail-Level |
| Signal | Telemetrie | `onlineStatus`, `lastSignal`, `online` | `interpretVehicleState` | **Teilweise** | Zeigt nicht `telemetryFreshness`; kein kanonisches Label |

**Fehlende Spalten (laut Audit-Anforderung):** Kennzeichen, Make/Model (nur im Namen), DIMO Status, Connectivity (Integration), Telemetry State (kanonisch), Attention, explizite Actions-Spalte.

#### DIMO Tab Columns

| Spalte | Zweck | SoT | Problem |
|--------|-------|-----|---------|
| Vehicle | make/model/year | `DimoVehicle` | ✓ |
| VIN | Identität | `DimoVehicle.vin` | ✓ |
| Odometer / Energy | Snapshot | Mirror | ✓ |
| Signal | `timeAgo(lastSignal)` | Mirror | Kein Freshness-State |
| Connection | `connectionStatus` Connected/Disconnected | `DimoVehicle.connectionStatus` | **Mirror-Enum, keine Integritätsprüfung** |
| HM | Badge HW+HMH | Cross-fetch HM list | Side-effect fetch |
| Actions | Refresh, Register | — | ✓ |

#### Detail Drawer (Registered)

| Section | Zweck | Datenquelle | Governance-relevant? |
|---------|-------|-------------|---------------------|
| General, Battery, Tires, Brakes, Engine, Service History | Tenant-Specs | Bereits geladene `RegisteredVehicle` | **Nein — Tenant-Duplikat** |
| Exterior Photos | Damage Map | `GET/PUT …/exterior-images` | Grenzwertig |
| High Mobility | HM Lifecycle + **Activate/Deactivate** | `api.vehicleIntelligence.hm*` | **Falscher Kontext** — Ops, nicht Plattform-Governance |

#### Actions & Modals

| Aktion | UI | Endpoint | Audit / MFA |
|--------|-----|----------|-------------|
| Register | `VehicleRegistrationModal` | `POST /organizations/:orgId/vehicles/register-from-dimo` | Kein Step-up; `fleet.write` |
| Edit | `VehicleRegistrationModal` (edit) | `PATCH /organizations/:orgId/vehicles/:id` + tires | Kein Step-up |
| Deregister | `ConfirmDialog` | `POST /admin/vehicles/:id/deregister` | Confirm ✓; kein MFA |
| Sync from DIMO | Toolbar | `POST /admin/dimo/sync` | Kein Confirm |
| Refresh Snapshot | DIMO row | `POST /admin/dimo/vehicles/:id/refresh-snapshot` | — |

### 2.3 `FleetConnectionView` — Inventar

| Element | Zweck | Endpoint | SoT | Aktualisierung |
|---------|-------|----------|-----|----------------|
| Summary KPIs | online/standby/offline/not_connected counts | `GET /admin/dimo/fleet-connectivity` | **Lokale Schwellen in `dimo.controller`** | Mount once |
| Search | Client filter | — | — | Instant |
| Status filter tabs | connectionStatus | — | — | Client |
| Expandable rows | Technische Diagnose | Same API | PG + poll logs | Expand |
| Query Console | DIMO GraphQL ad-hoc | `api.dimo.queryGraphQL` | DIMO API | Modal |
| OBD / Jamming | Connectivity snapshot | `extractConnectivitySnapshot` | Latest state payload | — |

**Berechtigung:** `MASTER_ADMIN` (Controller-level). Keine org-scope Guards — korrekt für Plattform-View.

### 2.4 `HighMobilityDataView`

| Tab | Zweck | Endpoint |
|-----|-------|----------|
| Vehicle List | HM-registrierte Fahrzeuge | HM admin APIs |
| Eligibility Check | Brand/Model/Year Probe | HM eligibility |
| MQTT Diagnostics | Streaming debug | HM diagnostics |

**IA:** Gehört zur Integrations-/Connectivity-Domäne, überschneidet sich mit HM-Section im Vehicle Drawer.

### 2.5 `OrganizationDetailView` → Vehicles Tab (post UI-4)

| Element | Zweck | Endpoint | SoT |
|---------|-------|----------|-----|
| Connectivity summary line | Freshness histogram | Org operational detail | **`telemetry-freshness.resolver`** ✓ |
| Vehicle table | Org-scoped list | `GET /organizations/:orgId/vehicles` | PG + interpreted state |
| Row click | Navigate to global vehicles | `?view=vehicles&vehicleId=` | **Deep link broken** (s.u.) |

### 2.6 Dashboard & Platform Health (Querschnitt)

| Surface | Fahrzeug-relevanter Inhalt | Endpoint | Kanonisch? |
|---------|---------------------------|----------|------------|
| Dashboard Connectivity Summary | Freshness histogram | `GET /admin/connectivity/platform-summary` | ✓ |
| Dashboard DIMO chip | Token/API health | `platform-health.integrations.dimo` | Plattform, nicht pro Fahrzeug |
| Platform Health DIMO card | connected/total | `GET /admin/platform-health` | Count only |

---

## 3. Global Vehicle List

### 3.1 Ist-Zustand vs. Anforderung

| Anforderung | Ist | Bewertung |
|-------------|-----|-----------|
| Fahrzeugidentität | Name + VIN (mono) | Ausreichend in Liste |
| Organisation | `organizationName` | ✓; nicht klickbar |
| Kennzeichen | Nur im Drawer | **Gehört in Liste** (Support-Suche) |
| Make/Model | Im `vehicleName` | Akzeptabel |
| DIMO Status | Nicht in Registered-Liste | **Fehlt** |
| Connectivity | `onlineStatus` Dot | **Vermischt** mit Telemetrie |
| Telemetry State | Backend liefert `telemetryFreshness` — **UI zeigt es nicht** | **P0** |
| Last Signal | `timeAgo()` ohne State-Label | Unklar |
| Health / Issue | `health` Ampel | Tenant-Ops; global zu breit |
| Attention | Nicht vorhanden | **Fehlt** |
| Actions | Nur via Drawer | Ok für Governance-Liste |

### 3.2 Global vs. Detail — Empfohlene Spaltengrenze

**In der globalen Liste behalten (operativ für Master Admin):**
- Fahrzeug (Name, VIN, Kennzeichen)
- Organisation (Name, optional Org-Status-Chip)
- DIMO Link Status (linked / unlinked / conflict)
- Integration Connectivity (authorized / error / none)
- Telemetry Freshness (kanonisches 5-State-Label)
- Attention (ein Chip + count)
- Letztes Signal (relative Zeit, sekundär)

**Nur ins Detail / Technical Diagnostics:**
- Station, Fleet-Rental-Status, Health-Ampel, Specs (Tires/Brakes/Battery)
- Token ID, dimo_vehicle_id, device serial, poll logs
- HM clearance details, exterior photos

### 3.3 Skalierung

| Aspekt | Ist | Risiko |
|--------|-----|--------|
| Datenladung | `listAll()` default `limit=200`, **kein Paging in UI** | Flotten >200 unsichtbar |
| Filter/Search | 100 % client-side | CPU/Memory bei großen Beständen |
| Backend | `findAllPlatform` unterstützt Pagination | **UI nutzt es nicht** |
| N+1 | Backend batcht Bookings pro Org in `findAllPlatform` | Akzeptabel pro Page; bei Full-Load problematisch |

**Bewertung:** Nicht skalierbar für Enterprise-Flotten ohne serverseitiges `q`, Filter und cursor/page Pagination.

---

## 4. Vehicle Identity

### 4.1 Identifikatoren im System

| ID | Wo sichtbar | Operativ nötig? | UI-Empfehlung |
|----|-------------|-----------------|---------------|
| `vehicle.id` (internal) | Drawer-Footer implizit, URLs | Support/Debug | Technical Diagnostics only |
| VIN | Liste, Drawer, DIMO tab | **Ja** | Primary human ID |
| Kennzeichen | Drawer, Fleet Connection | **Ja** | Liste + Suche |
| `dimo_vehicle_id` | Nicht in Master Vehicles UI | Support | Diagnostics |
| `tokenId` | Fleet Connection expanded | Support/DIMO ops | Diagnostics |
| `organization_id` | Confirm dialog fallback | Support | Diagnostics; Liste zeigt Name |
| `DimoVehicle.externalId` | Nicht exponiert | Rare | Diagnostics |
| HM VIN link | HM tabs | HM ops | HM-Subsektion |

### 4.2 Bewertung

Der Master Admin braucht operativ: **Kennzeichen, VIN, Make/Model, Organisation, DIMO-Link-Status**. Technische IDs (UUID, tokenId) gehören in Diagnostics — Fleet Connection macht das teilweise richtig; Vehicles-View zeigt UUIDs nicht (gut), aber auch keine DIMO-IDs (ok für Primary UX).

**Problem:** `vehicleId` Deep Link wird in URL geschrieben (`App.tsx` `onNavigateToVehicle`), aber `PlatformVehiclesView` **liest `vehicleId` nicht** — Drawer öffnet nicht. Broken cross-surface navigation (P1).

---

## 5. Organization Ownership

### 5.1 Darstellung

| Kontext | Ownership sichtbar? | Mapping-Konflikte? | Orphan-Zustand? |
|---------|---------------------|--------------------|-----------------|
| Registered list | `organizationName` | Nein | Nein |
| DIMO tab | Keine Org (unregistered) | — | Implizit „available“ |
| Fleet Connection | `organizationName` | Nein | `not_connected` wenn kein `dimoVehicle` |
| Org Detail vehicles | Org-scoped | — | — |
| Register modal | Org picker required | Backend conflict on duplicate | — |

### 5.2 Implizite Zustände (nicht als First-Class UI)

| Zustand | Backend-Signal | UI heute |
|---------|----------------|----------|
| DIMO vehicle ohne Org-Zuordnung | `non-registered` list | DIMO tab ✓ |
| Vehicle ohne DIMO link | `dimoVehicleId == null` | Fleet Connection `not_connected` |
| DIMO bereits an andere Org | `ConflictException` | Toast only on register |
| Duplicate token mapping | Reconciliation services | **Nicht in Master UI** |
| Unauthorized DIMO scope | Auth/token health | Nur Platform Health aggregate |
| Orphaned registration | — | Kein expliziter Attention-State |

**Bewertung:** Ownership ist für **registrierte** Fahrzeuge lesbar, aber **Integritäts-Ausnahmen** (duplicate, stale auth, missing mapping) sind nicht als Attention modelliert.

---

## 6. DIMO Integrity

### 6.1 Prüfmatrix

| Integritätsaspekt | Backend | Sichtbar in UI | Korrekt dargestellt? |
|-------------------|---------|----------------|----------------------|
| `dimo_vehicle_id` mapping | PG FK `Vehicle.dimoVehicleId` | Indirekt (registered vs DIMO tab) | Teilweise |
| Token mapping | `DimoVehicle.tokenId` | Fleet Connection detail | ✓ (Diagnostics) |
| Organization mapping | `Vehicle.organizationId` | Liste | ✓ |
| Duplicate mapping | `registerFromDimo` advisory lock + unique | Conflict on register only | **Kein proaktiver Scan** |
| Missing mapping | `non-registered` | DIMO tab | ✓ |
| Disconnected mapping | `DimoVehicle.connectionStatus` | DIMO tab „Disconnected“ | **Mirror only** |
| Unauthorized mapping | DIMO auth / token health | Platform Health | Nicht pro Fahrzeug |
| Stale authorization | Telemetry auth sync | **Nicht in Vehicles UI** | — |

### 6.2 „Connected“-State Risiko

Die DIMO-Tab-Spalte **Connection: Connected** stammt aus `DimoVehicle.connectionStatus` (Mirror-Enum), **ohne** Verifikation gegen:
- aktuelle DIMO API Erreichbarkeit
- Token-Scope für Fahrzeug
- Telemetry-Ingest-Pipeline

**Regelverletzung:** UI darf keinen „connected“-State zeigen, wenn Backend-Integrität nicht bestätigt ist → **verletzt** im DIMO-Tab und teilweise in Fleet Connection (online bei frischem `lastSeenAt` ohne Auth-Check).

---

## 7. Telemetry State

### 7.1 Kanonische States (Backend + Rental Frontend)

| State | Schwellen (`vehicle-state-interpreter`) | Label (DE, Rental) |
|-------|----------------------------------------|---------------------|
| `live` | < 15 min | Live |
| `standby` | 15 min – 24 h | Standby |
| `signal_delayed` | 24 h – 48 h | Signal verzögert / Soft-Offline |
| `offline` | > 48 h | Offline |
| `no_signal` | kein `lastSeenAt` | Kein Signal |

**Resolver:** `telemetry-freshness.resolver.ts` — Timestamp-Priorität (provider observed → last valid → lastSignal mit backfill guard).

### 7.2 Master Admin Abweichungen

| Surface | Was gezeigt wird | Abweichung |
|---------|------------------|------------|
| `PlatformVehiclesView` Signal | `onlineStatus` ONLINE/STANDBY/OFFLINE + `timeAgo` | **Ignoriert `telemetryFreshness`**; kein `signal_delayed` |
| `PlatformVehiclesView` Drawer chips | Online/Standby/Offline (3) | Kein `signal_delayed`, kein `no_signal` |
| `FleetConnectionView` | online/standby/offline/not_connected | **Eigene Schwellen** in `dimo.controller` (5 min „Live“ label; 15 min online) |
| `FleetConnectionView` | Kein `signal_delayed` | Soft-offline fehlt |
| Org Detail (UI-4) | live/standby/offline/no_signal histogram | **Kanonisch** ✓ |
| Dashboard (UI-3) | platform-summary freshness | **Kanonisch** ✓ |

### 7.3 Legacy-Felder

`mapToRegisteredVehicle` setzt weiterhin `online: interpreted.isFresh` und `onlineStatus` — Master UI konsumiert Legacy statt `telemetryFreshness`.

**Fazit:** Exakt **eine** fachliche Wahrheit existiert im Backend, aber Master Vehicles + Fleet Connection **brechen die Konvention**.

---

## 8. Connectivity Model

### 8.1 Drei Dimensionen (Soll)

| Dimension | Frage | Soll-Quelle | Ist im Master Admin |
|-----------|-------|-------------|---------------------|
| **Integration Connectivity** | Ist DIMO technisch verbunden/autorisiert? | `DimoVehicle.connectionStatus` + token health + device binding | Mirror in DIMO tab; Poll logs in Fleet Connection |
| **Telemetry Freshness** | Wie frisch sind Daten? | `telemetry-freshness.resolver` | Nur Dashboard/Org Detail |
| **Operational State** | Ist Fahrzeug betrieblich verfügbar? | `deriveFleetStatusContext` / rental status | Registered list „Status“ |

### 8.2 Vermischung

| UI-Element | Vermischte Dimensionen |
|------------|------------------------|
| Signal-Spalte (dot + time) | Telemetry + Legacy online boolean |
| DIMO Connection chip | Integration (mirror) dargestellt wie Telemetrie-Health |
| Fleet Connection `connectionStatus` badge | Telemetry thresholds + „not_connected“ (Integration) |
| KPI „Available/Rented/…“ | Pure Operational — ok, aber dominieren die Page |

**Empfehlung:** Drei unabhängige Chips/Badges — nie ein einzelner „Online“-Badge.

---

## 9. DIMO Platform Health

### 9.1 Aggregationsebenen

| Problemtyp | Korrekte Darstellung | Ist |
|------------|---------------------|-----|
| DIMO API Problem | Platform Health + Dashboard DIMO chip | ✓ (UI-3) |
| Authorization Problem | Token health critical | ✓ aggregate |
| Einzelnes Fahrzeugproblem | Vehicle Attention | **Fehlt** |
| Telemetry Delay | Freshness state per vehicle | Nur in Fleet Connection (falsche Schwellen) |
| SynqDrive Plattformproblem | Worker/queue incidents | Platform Health |

### 9.2 Risiko: Plattform-Ausfall → Massen-Fahrzeugfehler

Heute kann ein DIMO API Ausfall dazu führen, dass **jede Zeile** in Fleet Connection „offline“ zeigt — ohne Plattform-Banner, das erklärt: „DIMO ingest degraded — vehicle states may be stale“. Dashboard kann DIMO critical zeigen, aber **Vehicles-View hat keinen Plattform-Kontext**.

---

## 10. Import Flow

### 10.1 Schritt-Audit

| Schritt | Implementierung | Bewertung |
|---------|-----------------|-----------|
| Fahrzeug finden | DIMO tab nach `sync` | ✓ |
| VIN / DIMO Search | Client search auf VIN/make/model | ✓ client-only |
| Organization Auswahl | `VehicleRegistrationModal` — required | ✓ |
| Mapping | `dimoVehicleId` + org | Backend connect |
| Preflight | Kein dedizierter preflight endpoint in UI | Modal zeigt Specs |
| Duplicate Check | Backend `ConflictException` + advisory lock | ✓ server-side |
| Confirmation | Großes Modal, kein separater Confirm step | Schwach für Governance |
| Success | Toast + list reload | ✓ |
| Partial Failure | AI specs degraded mode | Nur für AI prefill |
| Rollback | Transaction in `registerFromDimo` | ✓ DB-level |

### 10.2 Risiken

| Risiko | Status |
|--------|--------|
| Race Conditions | Mitigated via `acquirePgAdvisoryXactLock` |
| Doppelte Imports | Backend blockt; UI zeigt nicht proaktiv duplicates |
| Unklare Ownership | Org picker ok; kein „target org billing limit“ hint |
| Fehlende Konfliktanzeige | Conflict nur als Error toast |
| Unzureichende Error Messages | Generische catch in mehreren HM actions |

**HM Telemetry tab:** Read-only Kandidaten — kein Import-Flow von dort in SynqDrive registration (nur informativ).

---

## 11. Disconnect / Reconnect

### 11.1 Aktionen-Inventar

| Aktion | Existiert? | Fachliche Wirkung | DIMO Side Effect | Datenhaltung |
|--------|------------|-------------------|------------------|--------------|
| **Deregister** | ✓ | Löscht `Vehicle` row, cascades ops data | `DimoVehicle` bleibt (SetNull) | HM deactivate nicht automatisch im UI-Flow sichtbar |
| **Disconnect** (DIMO only) | ✗ dediziert | — | — | — |
| **Reconnect** | Via Re-register from DIMO tab | Neues `Vehicle` | Re-link dimoVehicleId | — |
| **Sync from DIMO** | ✓ | Mirror refresh | DIMO API pull | Updates `DimoVehicle` |
| **Refresh Snapshot** | ✓ | Single vehicle telemetry snapshot | DIMO API | Updates mirror fields |

### 11.2 Deregister UX

**Positiv:** Confirm dialog erklärt klar Unterschied zu „löschen“ — DIMO identity preserved, erscheint in Non Registered.

**Fehlend:**
- Audit log sichtbar im UI
- Step-up / MFA
- Billing quantity hook (backend exists) — nicht im Confirm erwähnt
- Kein „Disconnect DIMO but keep vehicle“ — nur full deregister

### 11.3 Telemetry Stop

Deregister stoppt SynqDrive-ops; DIMO polling may continue for mirror if vehicle row gone — **architektonisch korrekt** (DimoVehicle bleibt), aber nicht im UI erklärt.

---

## 12. Vehicle Detail — Master Admin

### 12.1 Ist vs. Soll

| Anforderung | Ist (Drawer) | Soll (Governance Detail) |
|-------------|--------------|--------------------------|
| Fahrzeug | ✓ General section | ✓ compact |
| Organisation | ✓ field | ✓ mit Link zu Org Detail |
| DIMO Mapping | ✗ nicht gezeigt | ✓ status + ids in Diagnostics |
| Connectivity | ✗ nur online chip | ✓ Integration chip |
| Telemetry Freshness | ✗ | ✓ kanonisches Label |
| Letzte Verarbeitung | ✗ | ✓ last ingest / worker |
| Relevante Fehler | ✗ | ✓ attention reasons |
| Technical Diagnostics | Teilweise in Fleet Connection | ✓ eigener Tab/Section |
| Audit History | ✗ | ✓ privileged actions log |

**Befund:** Der Drawer ist eine **Kopie der Tenant-Vehicle-Detail-Pflege** (Specs, HM activate, Exterior) — widerspricht dem Master-Admin-Zweck „Plattformdiagnose und Governance“.

---

## 13. Attention Model

### 13.1 Soll-Reasons (kanonisch aus Backend)

| Reason | Backend-Signal vorhanden? | UI exponiert? |
|--------|----------------------------|---------------|
| duplicate mapping | register conflict / reconciliation | Nein |
| missing organization mapping | non-registered | Indirekt (DIMO tab) |
| DIMO authorization failure | platform-health, token | Aggregate only |
| prolonged offline | `telemetryFreshness === offline` | Nein (kein Label) |
| telemetry ingestion failure | poll logs FAILURE | Fleet Connection only |
| stale pipeline | worker/platform-health | Dashboard |
| data integrity issue | reconciliation modules | Nein |

**Bewertung:** Kein `vehicle-attention.util` analog Billing. Frontend erfindet keine Attention — gut — aber **Backend-Signale werden nicht gebündelt** für Master Vehicles.

---

## 14. Search & Filter

### 14.1 Search (Ist)

| Tab | Felder | Server-side |
|-----|--------|-------------|
| Registered | name, vin, plate, org | Nein |
| DIMO | vin, make, model | Nein |
| Fleet Connection | vin, plate, make/model, device serial, org | Nein |

**Fehlt:** dimo id, organization id, token id (Diagnostics-Suche).

### 14.2 Filter (Ist)

| Filter | Registered | Fleet Connection |
|--------|------------|------------------|
| Organization | Client select (unique names) | Search only |
| DIMO Connection | ✗ | ✗ |
| Telemetry State | ✗ | status tabs (non-canonical) |
| Attention Required | ✗ | ✗ |
| Integration Error | ✗ | ✗ |
| Fleet Status | Status select (inkl. **„Rented“** — Backend sendet **„Active Rented“**) | ✗ |

**Bug:** Filter option `Rented` matcht nie → stille Filterlücke (P2).

### 14.3 Soll-Filter (hochwertig, wenige)

Organization · DIMO Link Status · Telemetry Freshness · Attention Required · Integration Error — alles **server-side** auf Operational API.

---

## 15. Privileged Actions

| Aktion | Permission | Step-up/MFA | Reason | Confirm | Audit Event | Idempotency | Rollback |
|--------|------------|-------------|--------|---------|-------------|-------------|----------|
| Connect (Register) | `fleet.write` + MASTER_ADMIN path | Nein | Nein | Modal only | Backend logs | Advisory lock | TX rollback |
| Reconnect | Register flow | Nein | Nein | Modal | — | — | — |
| Disconnect | — | — | — | — | — | — | — |
| Org Reassignment | Edit org in modal | Nein | Nein | Nein | — | — | — |
| Mapping Repair | — | — | — | — | — | — | — |
| Force Sync | `POST dimo/sync` | Nein | Nein | Nein | — | — | — |
| Retry Import | Re-register | Nein | Nein | — | — | — | — |
| Remove Mapping | Deregister | MASTER_ADMIN | Nein | ✓ Confirm | Log | — | Irreversible vehicle delete |
| Delete | = Deregister | MASTER_ADMIN | Nein | ✓ | Log | — | — |
| HM Activate/Deactivate | vehicleIntelligence | Nein | Nein | Nein | — | — | — |
| DIMO GraphQL Query | dimo.query | Nein | Nein | Nein | — | — | — |

**Tenant Safety:** `registerFromDimo` scoped via `orgId` path; `deregister` platform-wide by vehicleId — korrekt für Master Admin, aber **ohne MFA** schwächer als Billing/Settings.

---

## 16. Technical Diagnostics

### 16.1 Sinnvoll sichtbar (Diagnostics-Bereich)

| Feld | Quelle | Heute |
|------|--------|-------|
| DIMO vehicle id | PG | Fleet Connection (teilweise) |
| Token ID | PG | Fleet Connection ✓ |
| Last ingest | `latestState`, poll logs | Fleet Connection ✓ |
| Worker processing | platform-health | Andere View |
| ClickHouse presence | data-analyse paths | Nicht in Master Vehicles |
| PG state | latestState | Fleet Connection |
| API error | poll logs | Fleet Connection |
| Correlation IDs | logs | Nicht in UI |

**Positiv:** Fleet Connection ist als Diagnostics-Surface stark.

**Negativ:** Dieselben Daten erscheinen nicht strukturiert am Vehicle Governance Detail; Query Console ist mächtig aber ungeschützt (kein MFA/Reason).

---

## 17. Responsive

| Surface | Mobile | Tablet | Notebook | Desktop | Problem |
|---------|--------|--------|----------|---------|---------|
| Registered table | `DataTable` pattern | ✓ | ✓ | ✓ | Ok |
| DIMO table | `overflow-x-auto` | Horizontal scroll | scroll | scroll | **Kein card fallback** |
| HM Telemetry table | scroll | scroll | scroll | scroll | Same |
| Filters | `flex-col sm:flex-row` | ✓ | ✓ | ✓ | Ok |
| Detail Drawer | `sm:max-w-[520px]` | ✓ | Long scroll | ok | Sehr lang durch Spec-Sections |
| Fleet Connection | Expandable cards | ✓ | Grid cols | ✓ | Besser als DIMO raw table |

**Framework-Verstoß:** Page Framework verbietet verschachteltes Scroll + breite Desktop-Tabellen auf Mobile ohne Card-Alternative — DIMO/HM-Tabs verletzen das.

---

## 18. Accessibility

| Kriterium | Registered | DIMO/HM | Fleet Connection | Drawer |
|-----------|------------|---------|------------------|--------|
| Tabellen | DataTable (ok) | Native `<table>` | Custom rows | — |
| Status | Dot + text partial | Chips | StatusDot + label | Chips |
| Actions | Row click | Buttons | Expand + console | Footer buttons |
| Dialoge | ConfirmDialog ✓ | Modal groß | Query console modal | — |
| Fehlerzustände | EmptyState ✓ | EmptyState ✓ | ErrorState ✓ | HM silent catch |
| Keyboard | DataTable | Tables weak | Expand rows | Drawer |
| Focus | Pattern lib | Ad-hoc tables | Mixed | ok |
| Screenreader | `tabsAriaLabel` DE | EN headers | EN labels | EN |
| Touch Targets | ok | small icon buttons | ok | ok |

**Sprache:** Vehicles-View überwiegend **EN** — Page Framework fordert **DE kanonisch** (P2).

---

## 19. Technical Architecture

### 19.1 Datenfluss (Ist)

```
App.tsx mount
  ├─ GET /admin/vehicles?limit=200  → registeredVehicles (client state)
  ├─ GET /admin/dimo/non-registered → dimoVehicles
  └─ GET /admin/dimo/stats          → dimoConnected flag

PlatformVehiclesView
  └─ props only (no own fetch except HM tab)

FleetConnectionView
  └─ GET /admin/dimo/fleet-connectivity (full fleet, no pagination)

OrganizationDetailView (vehicles tab)
  └─ GET /organizations/:orgId/vehicles
  └─ operational detail connectivity (canonical)
```

### 19.2 Datenarchitektur (PG vs ClickHouse)

| Datentyp | Store | Master Admin Nutzung |
|----------|-------|---------------------|
| Vehicle identity, org FK, specs | PostgreSQL | ✓ primary |
| DimoVehicle mirror, connectionStatus | PostgreSQL | ✓ |
| Latest telemetry snapshot | PostgreSQL `VehicleLatestState` | ✓ Fleet Connection, interpreted lists |
| Historical signals / trips / waypoints | ClickHouse | **Nicht** in Master Vehicles (korrekt für Governance-Liste) |
| Poll logs | PostgreSQL `DimoPollLog` | Fleet Connection |
| Device connection episodes | PostgreSQL | Rental data-analyse; nicht Master |

### 19.3 API-Lücken (vs. Billing/Org Pattern)

| Endpoint | Status | Needed |
|----------|--------|--------|
| `GET /admin/vehicles` paginated | Existiert | UI nutzt limit=200 only |
| `GET /admin/vehicles/operational` | **Fehlt** | List + attention + filters |
| `GET /admin/vehicles/operational/:id` | **Fehlt** | Governance detail |
| `GET /admin/connectivity/platform-summary` | Existiert (UI-3) | Nicht in Vehicles view |
| `GET /organizations/:orgId/fleet-connectivity` | Existiert (Rental) | Kanonisch für org scope |
| `GET /admin/dimo/fleet-connectivity` | Existiert | **Sollte canonical resolver nutzen** |

### 19.4 Anti-Patterns

- **Full client load** statt server pagination
- **Duplicate fetching:** vehicles in App.tsx global + org tab separate
- **Lokale Telemetry-Ableitung:** `timeAgo` only; Fleet Connection controller thresholds
- **Lokale DIMO-Ableitung:** `connectionStatus` chip aus mirror
- **Optimistic updates:** Keine — reload after mutation (ok)
- **vehicleId URL:** geschrieben, nicht gelesen

---

## 20. Duplicate Truth Risks

| # | Risiko | Surfaces | Severity |
|---|--------|----------|----------|
| R1 | `telemetryFreshness` (5-state) vs `onlineStatus` (3-state) vs Fleet `connectionStatus` (4-state) | Vehicles, Fleet Connection, Dashboard | **P0** |
| R2 | `dimo.controller` fleet-connectivity eigene Schwellen (5 min Live label, 15 min online) vs `telemetry-freshness.resolver` | Fleet Connection vs Org/Dashboard | **P0** |
| R3 | `DimoVehicle.connectionStatus` „Connected“ vs tatsächliche Telemetry/Auth | DIMO tab | **P0** |
| R4 | `signal_delayed` existiert kanonisch, fehlt in Master UI | Vehicles, Fleet Connection | **P1** |
| R5 | Fleet operational `status` vs Telemetry vs Health in einer Liste | Registered table | **P1** |
| R6 | HM vehicle state in Drawer vs High Mobility view | Vehicles drawer, HM view | **P2** |
| R7 | `api.vehicles.listAll` limit 200 vs `findAllPlatform` total count | App.tsx | **P1** |
| R8 | Filter „Rented“ vs „Active Rented“ | Vehicles filter | **P2** |

---

## 21. Findings P0 / P1 / P2 / P3

### P0 — Governance / Trust

| ID | Finding |
|----|---------|
| V-P0-01 | Master Vehicles UI zeigt nicht den kanonischen `telemetryFreshness`-State trotz Backend-Lieferung |
| V-P0-02 | `GET /admin/dimo/fleet-connectivity` nutzt parallele Schwellenlogik statt `telemetry-freshness.resolver` / `fleet-connectivity.util` |
| V-P0-03 | DIMO-Tab „Connected“ basiert auf Mirror-Enum ohne Integritäts-/Auth-Bestätigung |
| V-P0-04 | Kein kanonisches Operational Read Model für Plattform-Fahrzeuge (Attention, Filter, Pagination) |
| V-P0-05 | Connectivity- und Telemetry-Dimensionen in einem Signal-Dot vermischt |

### P1 — Operational Gaps

| ID | Finding |
|----|---------|
| V-P1-01 | `vehicleId` Deep Link wird gesetzt aber `PlatformVehiclesView` öffnet Drawer nicht |
| V-P1-02 | Client-only load mit `limit=200` — Flotten >200 falsch/unsichtbar |
| V-P1-03 | Vehicle Detail Drawer dupliziert Tenant-Ops (Specs, HM actions) statt Governance |
| V-P1-04 | Kein Attention Model für duplicate mapping, offline, ingestion failure |
| V-P1-05 | `signal_delayed` (soft-offline) in Master Surfaces nicht darstellbar |
| V-P1-06 | Plattform-DIMO-Ausfall nicht kontextualisiert in Vehicles-View (Massen-Offline) |
| V-P1-07 | Keine serverseitige Search/Filter API für Master Vehicle List |

### P2 — UX / IA / Consistency

| ID | Finding |
|----|---------|
| V-P2-01 | IA-Fragmentierung: Vehicles, Fleet Connection, HM, Platform Health überlappen (UI-1 bestätigt) |
| V-P2-02 | EN/DE-Mischung in Vehicles vs. DE Framework |
| V-P2-03 | Status-Filter „Rented“ stale (sollte „Active Rented“) |
| V-P2-04 | DIMO/HM tables: horizontal scroll only on mobile — kein responsive card pattern |
| V-P2-05 | Kennzeichen fehlt in globaler Liste |
| V-P2-06 | Health-Spalte in globaler Liste — zu granular für Master Admin |
| V-P2-07 | Import ohne Governance-Confirm (Reason, org impact summary) |
| V-P2-08 | HM Activate/Deactivate im Vehicle Drawer ohne klare Permission/audit UX |

### P3 — Nice to Have / Cleanup

| ID | Finding |
|----|---------|
| V-P3-01 | `dimoConnected` state in App.tsx kaum genutzt in Vehicles UI |
| V-P3-02 | Vehicle Logbook separate Nav — schwache Verknüpfung zu Connectivity |
| V-P3-03 | Query Console ohne Rate-Limit/Reason im UI |
| V-P3-04 | Legacy `online` boolean in DTO könnte nach UI-Migration entfernt werden |
| V-P3-05 | Architektur-Doku in `ArchitekturView` beschreibt Rental fleet paths — Master paths unterdokumentiert |

---

## 22. Recommended Target State

### 22.1 Informationsarchitektur (Ziel)

Konsolidierung unter **einem** kanonischen Hub (Sidebar: „Connected Vehicles“ oder erweiterte „Vehicles“):

```
Connected Vehicles (Master)
├── Overview          — KPIs: registered, dimo-linked, freshness histogram, attention count
├── All Vehicles      — Operational list (paginated, canonical columns)
├── DIMO Inventory    — non-registered + sync (read from same operational API)
├── Attention Queue   — duplicate, auth, offline, ingestion failures
├── Import            — guided flow (preflight, conflict, confirm)
└── Diagnostics       — per-vehicle technical drawer OR link to Fleet Connection detail

Fleet Connection → wird Sub-Route „Diagnostics“ oder merge in vehicle detail technical tab
High Mobility → bleibt Integration, aber keine HM actions im Vehicle Spec drawer
```

### 22.2 Kanonische List Columns

| Column | Source |
|--------|--------|
| Vehicle (plate, make/model, VIN secondary) | PG |
| Organization | PG + link |
| DIMO Link | `dimoVehicleId` presence + integrity flags |
| Integration Status | `DimoVehicle.connectionStatus` + token health |
| Telemetry | `resolveTelemetryFreshness` label |
| Attention | `vehicle-attention.util` (neu, analog billing) |
| Last Signal | `observedAtIso` relative |

### 22.3 Backend Prerequisites (Blueprint-Skizze)

| Endpoint | Beschreibung |
|----------|--------------|
| `GET /admin/vehicles/operational` | Paginated, `q`, `organizationId`, `dimoLink`, `telemetryFreshness`, `attention`, `integrationError` |
| `GET /admin/vehicles/operational/:vehicleId` | Governance detail: ownership, dimo mapping, connectivity summary, attention, audit tail |
| `GET /admin/vehicles/attention-queue` | Top N attention items cross-org |
| Refactor `GET /admin/dimo/fleet-connectivity` | Delegate to `telemetry-freshness.resolver` + `fleet-connectivity.util`; add `signal_delayed` |

**Single resolver path:** `telemetry-freshness.resolver.ts` → alle Consumer.

### 22.4 Vehicle Governance Detail (Ziel)

Sections:
1. **Übersicht** — Identity, Org, Attention chips
2. **DIMO & Connectivity** — mapping status, integration vs telemetry (getrennte Chips)
3. **Letzte Verarbeitung** — ingest, poll, worker
4. **Fehler & Incidents** — attention reasons
5. **Technische Details** — IDs, token, device serial, link „Open in Diagnostics“
6. **Audit** — register, deregister, sync events

**Entfernen aus Primary:** Tires, Brakes, Battery specs, Exterior editor, HM activate — verlinken zu Org-scoped Rental/Master HM view.

### 22.5 Privileged Actions (Ziel)

- Einheitlicher **Reason + Confirm** Dialog für Register, Deregister, Force Sync
- **Step-up MFA** für Deregister und DIMO GraphQL (align mit Billing)
- **Audit** visible in detail panel
- Klare Copy: **Deregister ≠ DIMO Disconnect**

### 22.6 Responsive & A11y (Ziel)

- `DataTable` responsive mode oder card list für `<md`
- DE Labels via `master.page.vehicles.*` i18n keys
- Telemetry/status: immer Text + Icon, nie nur Farbe
- `vehicleId` URL → auto-open governance drawer

### 22.7 Remediation-Reihenfolge (Vorschlag)

1. **Backend:** Operational vehicles API + attention util + fleet-connectivity controller refactor (P0)
2. **Frontend:** Replace App.tsx bulk load with paginated operational hook (P0/P1)
3. **Frontend:** Canonical status chips (`telemetryFreshness`, integration) (P0)
4. **Frontend:** Governance detail drawer; move specs to org context (P1)
5. **IA:** Merge/Mapping Fleet Connection diagnostics (P2)
6. **Polish:** i18n DE, responsive tables, MFA (P2)

---

## Anhang A — Dateien (Audit-Basis)

| Bereich | Pfade |
|---------|-------|
| Master Vehicles UI | `frontend/src/master/components/PlatformVehiclesView.tsx` |
| Registration | `frontend/src/master/components/VehicleRegistrationModal.tsx` |
| Fleet Connection | `frontend/src/master/components/FleetConnectionView.tsx` |
| App data loading | `frontend/src/master/App.tsx` |
| Nav | `frontend/src/master/navigation/master-nav.config.ts` |
| Org vehicles | `frontend/src/master/components/OrganizationDetailView.tsx` |
| API client | `frontend/src/lib/api.ts` |
| Platform vehicles service | `backend/src/modules/vehicles/vehicles.service.ts` |
| Telemetry canonical | `backend/src/modules/vehicles/telemetry-freshness.resolver.ts`, `vehicle-state-interpreter.ts` |
| DIMO admin connectivity | `backend/src/modules/dimo/dimo.controller.ts` |
| Controllers | `backend/src/modules/vehicles/vehicles.controller.ts` |

---

## Anhang B — Changes / Architektur

**Changes:** nicht aktualisiert (read-only Audit).  
**Architektur:** nicht aktualisiert (read-only Audit). Empfohlene Folge-Story: `MASTER_ADMIN_CONNECTED_VEHICLES_BLUEPRINT` analog Organizations/Billing.

---

*Ende des Audits — keine Implementierung in dieser Phase.*
