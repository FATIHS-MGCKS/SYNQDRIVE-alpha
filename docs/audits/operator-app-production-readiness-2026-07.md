# Operator App — Production Readiness Audit (Baseline)

| Field | Value |
|-------|-------|
| **Audit ID** | `operator-app-production-readiness-2026-07` |
| **Prompt** | **1** (baseline) · **2** (vollständige Dateiinventur + Traceability-Matrix) |
| **Repository** | `https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha` |
| **Audited commit** | `1d0f2caebe56aa1ecd23295aa33d20e953daa95d` (Prompt 1) · Branch-HEAD nach Prompt 2 |
| **Audit branch** | `audit/operator-app-production-readiness-2026-07` |
| **Baseline branch** | `main` |
| **Audit date** | 2026-07-25 UTC |
| **Method** | Direct repository inspection (structure, routes, API wiring, permissions, schema, tests). No runtime deployment verification in this prompt. |

---

## 1. Ziel und Scope

### 1.1 Ziel

Dieses Dokument erfasst den **nachweisbaren Ist-Zustand** der SynqDrive **Operator App** als Grundlage für eine vollständige Production-Readiness-Umsetzung (fachlich, technisch, sicherheitsseitig, DSGVO-nah, ISO-27001-nah).

### 1.2 Scope (dieser Prompt)

| In Scope | Out of Scope (spätere Prompts) |
|----------|--------------------------------|
| Projektstruktur, Build-/Test-/Lint-Befehle | Funktionale Änderungen |
| Operator-Frontend (`frontend/src/operator/`) | Remediation-Implementierung |
| Konsumierte Backend-APIs (bestehende Domänen) | Destruktive Migrationen |
| Rollen-/Permission-Wiring (nachweisbar im Code) | Pen-Test / Staging-Smokes |
| Datenmodelle (Prisma) für Operator-Flows | Formale Zertifizierungsnachweise |

### 1.3 Produktdefinition (Repository-Fakt)

Die Operator App ist **keine separate Anwendung**, sondern eine **mobile/tablet-orientierte Route-Oberfläche** innerhalb des bestehenden Vite/React-SPA unter `/operator`. Sie nutzt dieselben autoritativen Backend-Domänen wie die Rental-App (Bookings, Tasks, Vehicle Intelligence, Documents, Customers).

Quelle: `frontend/src/operator/README.md`, `frontend/src/App.tsx`, `frontend/src/operator/OperatorApp.tsx`.

---

## 2. Architekturübersicht

### 2.1 Repository-Layout

| Pfad | Rolle |
|------|-------|
| `backend/` | NestJS modular monolith, Prisma, Workers, API `/api/v1` |
| `frontend/` | Vite + React SPA (Rental, Master, **Operator**) |
| `architecture/` | In-Repo Architektur-Change-Records |
| `docs/audits/` | Audit-Artefakte |
| `shared/` | Geteilte Packages (z. B. evaluations-metrics) |
| `.cursor/` | Cloud-Agent Bootstrap, Regeln, Deploy-Skripte |

### 2.2 Package Manager

| Bereich | Manager | Lockfile |
|---------|---------|----------|
| Backend | **npm** | `backend/package-lock.json` |
| Frontend | **npm** | `frontend/package-lock.json` |

### 2.3 Build- und Deploy-Pfad

- Frontend-Build: `cd frontend && npm run build` → Output nach `backend/public/` (siehe `frontend/vite.config.ts`).
- Backend-Build: `cd backend && npm run build` → NestJS `dist/`.
- Produktions-Deploy: VPS-Skript klont `main`, baut beide, PM2-Restart (siehe `AGENTS.md`).

### 2.4 Operator-Integration in die SPA

```
App (BrowserRouter)
└── /operator/* → ProtectedRoute → OperatorApp
    └── RentalProvider
        └── OperatorAccessGuard
            └── Routes: index | vehicles/:vehicleId | bookings/:bookingId
                └── OperatorShell (Tabs + Sheets + Provider-Stack)
```

Einstieg zusätzlich über `OperatorEntryButton` in der Rental-Topbar (`frontend/src/rental/components/TopBar.tsx`).

### 2.5 Provider-Stack in `OperatorShell`

Reihenfolge (äußer → innen): `OperatorShellProvider` → `OperatorDamageCaptureProvider` → `OperatorHandoverProvider` → `FleetProvider` → `OperatorDataProvider` → UI.

---

## 3. Operator-App-Routen

### 3.1 React-Router (kanonisch)

| Pfad | Komponente | Zweck |
|------|------------|-------|
| `/operator` | `OperatorShell` | Haupt-Shell mit Bottom-Nav-Tabs |
| `/operator/vehicles/:vehicleId` | `OperatorShell` | Deep-Link Fahrzeug |
| `/operator/bookings/:bookingId` | `OperatorShell` | Deep-Link Buchung |
| `/operator/*` (sonst) | Redirect → `/operator` | Fallback |

Quelle: `frontend/src/operator/OperatorApp.tsx`, `frontend/src/App.tsx`.

### 3.2 Bottom-Navigation-Tabs

| Tab-ID | View-Komponente |
|--------|-----------------|
| `today` | `OperatorTodayView` |
| `scan` | `OperatorScanView` |
| `vehicles` | `OperatorVehiclesView` |
| `tasks` | `OperatorTasksView` |
| `more` | `OperatorMoreView` |

Quelle: `frontend/src/operator/lib/operatorTypes.ts`, `frontend/src/operator/OperatorShell.tsx`.

### 3.3 Deep-Link-Auflösung

`resolveOperatorDeepLink()` in `frontend/src/operator/lib/operatorRoutes.ts`:

| Intent | Auslöser |
|--------|----------|
| `vehicle` | Pfad `/vehicles/:vehicleId` oder Query `vehicleId` |
| `booking` | Pfad `/bookings/:bookingId` oder Query `bookingId` |
| `scan` | Query `q` |
| `tab` | Query `tab` ∈ `{today, scan, vehicles, tasks, more}` oder Pfad endet auf `/scan` |

Hilfs-URLs: `buildOperatorEntryUrl()`, `buildOperatorVehicleUrl()`, `buildOperatorBookingUrl()`, `buildOperatorScanQueryUrl()`.

### 3.4 Device Guard (UX, keine Security)

- `useIsOperatorDevice`: Viewport ≤1280px **oder** `(hover: none) and (pointer: coarse)`.
- Desktop ohne Touch: `OperatorDesktopOnlyNotice` (außer `VITE_ALLOW_OPERATOR_DESKTOP=true`).
- Quelle: `frontend/src/operator/hooks/useIsOperatorDevice.ts`, `frontend/src/operator/README.md`.

---

## 4. Frontend-Komponenten

### 4.1 Modul-Umfang

**117 Dateien** unter `frontend/src/operator/` (Stand Audit-Commit), davon **67 `.tsx`** Komponenten/Views.

### 4.2 Views (`frontend/src/operator/views/`)

| Datei | Funktion |
|-------|----------|
| `OperatorTodayView.tsx` | Tagesübersicht Pickups/Returns, Due-Now, Blocked Vehicles |
| `OperatorScanView.tsx` | Suche/Scan (Text; QR als späterer MVP-Hinweis) |
| `OperatorVehiclesView.tsx` | Fahrzeugliste mit Health/Quick-View |
| `OperatorTasksView.tsx` | Aufgabenliste mit Filtern |
| `OperatorMoreView.tsx` | Zusatzaktionen / Einstiegspunkte |

### 4.3 Feature-Bereiche

| Bereich | Pfad | Kernkomponenten |
|---------|------|-----------------|
| Handover | `handover/` | `OperatorHandoverFlow`, 6 Steps, `OperatorHandoverProvider` |
| Schäden | `damages/` | `OperatorDamageCaptureFlow` (Photo → Details → Review) |
| Buchungen | `bookings/` | Create/Edit/Cancel/No-Show Sheets |
| Aufgaben | `tasks/` | `OperatorTaskCard`, Detail, Create, Actions |
| Dokumente | `documents/` | `OperatorBookingDocumentsPanel` |
| AI Upload | `ai-upload/` | `OperatorAiUploadFlow`, `OperatorAiUploadReview` |
| Reifen | `tire-measure/` | `OperatorTireMeasureFlow` |
| Verifikation | `verification/` | `OperatorPickupCheckSheet` |
| Shell/Nav | `components/` | Header, BottomNav, ActionSheets, BookingDetail, QuickView, … |

### 4.4 Sheet-Aktionen (`OperatorSheetAction`)

Typen in `frontend/src/operator/lib/operatorTypes.ts`: `ai-upload`, `tire-measure`, `task-create`, `task-detail`, `booking-create`, `booking-edit`, `booking-cancel`, `booking-no-show`, `pickup-verification`.

Orchestriert über `OperatorActionSheets` / `OperatorShellContext.openSheet()`.

### 4.5 Wiederverwendung Rental-Domäne

Operator importiert bewusst Rental-Logik, u. a.:

- `bookingHandoverGates` (`frontend/src/rental/lib/bookingHandoverGates.ts`)
- `useDocumentExtractionFlow` (AI Upload)
- `FleetContext` / `FleetProvider`
- `RentalContext` / `RentalProvider`

Kein paralleles Operator-Backend im Frontend nachweisbar.

---

## 5. Provider und Contexts

| Context / Provider | Datei | Verantwortung |
|--------------------|-------|---------------|
| `RentalProvider` | `frontend/src/rental/RentalContext.tsx` | `orgId`, Org-Kontext |
| `OperatorAccessGuard` | `components/OperatorAccessGuard.tsx` | Auth, Rolle, Org-Profil, Rental businessType |
| `OperatorShellProvider` | `context/OperatorShellContext.tsx` | Tab, Deep-Link-State, Sheets, Sync-State, Refresh-Token |
| `OperatorDamageCaptureProvider` | `damages/OperatorDamageCaptureProvider.tsx` | Schaden-Erfassungs-Kontext |
| `OperatorHandoverProvider` | `handover/OperatorHandoverProvider.tsx` | Handover-Buchungsdaten, Stations, Schäden |
| `FleetProvider` | `frontend/src/rental/FleetContext.tsx` | Fahrzeugliste, Health-Map |
| `OperatorDataProvider` | `context/OperatorDataContext.tsx` | Today Pickups/Returns, Tasks, Summary |

### 5.1 Datenladung (`OperatorDataContext`)

Bei `orgId`-Wechsel / `refreshToken`:

- `api.bookings.todayPickups(orgId)`
- `api.bookings.todayReturns(orgId)`
- `fetchAllTasks(orgId, { bucket: 'ALL_OPEN' })`
- `api.tasks.summary(orgId)` (optional, Fehler geschluckt)

Task-Invalidierung über `subscribeTaskQueryInvalidation`.

---

## 6. Backend-Endpunkte

Die Operator App hat **keinen dedizierten Operator-Controller**. Sie konsumiert bestehende org-scoped APIs.

### 6.1 Bookings (`BookingsController` — Präfix `/organizations/:orgId/bookings`)

| Methode | Route (relativ) | Operator-Nutzung | Permission (Decorator) |
|---------|-----------------|------------------|------------------------|
| GET | `today/pickups` | Today-View | `bookings.read` |
| GET | `today/returns` | Today-View | `bookings.read` |
| GET | `/` (list) | Scan-Suche | `bookings.read` |
| GET | `:id` | Scan, Detail | `bookings.read` |
| GET | `:id/detail` | Handover-Vorbereitung | `bookings.read` |
| POST | `/` | Booking anlegen | `bookings.write` |
| PATCH | `:id` | Booking bearbeiten | `bookings.write` |
| DELETE | `:id` | Cancel | `bookings.manage` |
| POST | `:id/no-show` | No-Show | `bookings.write` |
| GET | `:id/handover` | Handover-Status | `bookings.read` |
| POST | `:id/handover/pickup` | Pickup-Handover | `bookings.write` |
| POST | `:id/handover/return` | Return-Handover | `bookings.write` |

Quelle: `backend/src/modules/bookings/bookings.controller.ts`.

### 6.2 Tasks (`TasksController`)

| Methode | Route | Operator-Nutzung | Permission |
|---------|-------|----------------|------------|
| GET | `organizations/:orgId/tasks` | Tasks-View, Listen | `tasks.read` → module `tasks`, level `read` |
| GET | `organizations/:orgId/tasks/summary` | Today-Badge / Feed | `tasks.read` |
| GET | `organizations/:orgId/tasks/:id` | Task-Detail | `tasks.read` |
| POST | `organizations/:orgId/tasks` | Task anlegen | `tasks.create` → `tasks.write` |
| PATCH | `…/start`, `…/waiting`, `…/complete` | Task-Aktionen | `tasks.update` / `tasks.complete` |
| POST | `…/comments` | Kommentar | `tasks.update` |
| PATCH | `…/checklist/:itemId` | Checkliste | `tasks.update` |

Quelle: `backend/src/modules/tasks/tasks.controller.ts`, `task-permission.constants.ts`.

Guards: `OrgScopingGuard`, `RolesGuard`, `PermissionsGuard`.

### 6.3 Documents (`DocumentsController` — Präfix `/organizations/:orgId`)

| Route | Operator-Nutzung | Permission |
|-------|------------------|------------|
| `bookings/:bookingId/documents` (list) | Handover-Dokumente | `bookings.read` |
| `documents/:id/open` | PDF öffnen | `bookings.read` |
| Rental-Contract-Routen | indirekt über Booking-Docs | `bookings.read` |

Quelle: `backend/src/modules/documents/documents.controller.ts`.

### 6.4 Vehicle Intelligence / Schäden / Reifen

Präfix: `vehicles/:vehicleId` — Guards: `RolesGuard`, `VehicleOwnershipGuard` (kein `PermissionsGuard` auf Controller-Ebene nachweisbar).

| Route (relativ) | Operator-Nutzung |
|-----------------|------------------|
| `damages`, `damages/active` | Handover-Schadenliste, Quick-View |
| POST `damages` | `OperatorDamageCaptureFlow` |
| `tires`, tire health, measurements | `OperatorTireMeasureFlow` |
| `document-extractions` | Quick-View |

Zusätzlich: `GET organizations/:orgId/damages/stats` — `DamagesOrgController` mit `OrgScopingGuard`, `RolesGuard` only.

Quelle: `backend/src/modules/vehicle-intelligence/vehicle-intelligence.controller.ts`, `damages-org.controller.ts`.

### 6.5 Weitere konsumierte APIs

| API-Bereich | Operator-Verwendung |
|-------------|---------------------|
| `api.organizations.getProfile` | Rental businessType Gate |
| `api.customers` / `customerDocuments` | Booking-Form, Dokumente |
| `api.stations` | Booking-Form, Handover |
| `api.users` | Handover Staff-Auswahl |
| `api.dashboardInsights` | Operational Alerts |
| `api.customerVerification.submitManualPickupCheck` | Pickup-Verifikation |

### 6.6 Document Extraction (AI Upload)

Operator setzt `uploadSource: 'operator_app'` (`operatorAiUpload.config.ts`). Backend erkennt `operator_app` u. a. für Upload-Rate-Limits (`document-upload-rate-limit.service.ts`).

Legal-Dokument-Scope enthält Kanal `OPERATOR_APP` (`legal-document-scope.constants.ts`).

---

## 7. Rollen und Berechtigungen

### 7.1 Frontend-Zugang (`operatorAccess.ts`)

| Rolle | Operator-Zugang |
|-------|-----------------|
| `MASTER_ADMIN` | erlaubt |
| `ORG_ADMIN` | erlaubt |
| `SUB_ADMIN` | erlaubt |
| `WORKER` | erlaubt |
| `DRIVER` | explizit verweigert |
| unbekannt / leer | verweigert |

Zusätzliche Gates: authentifiziert, `orgId` vorhanden, `businessType === 'RENTAL'`.

**Expliziter Hinweis im Code:** Frontend-Gate ist UX/Routing-Defense; Backend-Autorisierung bleibt maßgeblich (`operatorAccess.ts`, `README.md`).

### 7.2 Prisma `MembershipRole`

```
ORG_ADMIN | SUB_ADMIN | WORKER | DRIVER
```

Quelle: `backend/prisma/schema.prisma`.

### 7.3 Backend Permission-Module (Auszug)

Kanonical keys in `permission.constants.ts` — u. a. `bookings`, `tasks`, `document-upload`, `legal-documents`, `fleet`, `customers`.

Membership-spezifische JSON-Rechte `{ read, write, manage? }` pro Modul (siehe Kommentar in `permission.constants.ts`).

### 7.4 Task-Permission-Mapping

| Action | Modul | Level |
|--------|-------|-------|
| `tasks.read` | `tasks` | `read` |
| `tasks.create` | `tasks` | `write` |
| `tasks.update` / `assign` / `complete` / `cancel` | `tasks` | `write` |
| `tasks.manage_costs` | `tasks` | `manage` |

### 7.5 Handover Gate Override

`pickupGateOverrideReason` erfordert serverseitig Permission `legal_documents.override_handover` (`booking-pickup-gate.service.ts`).

---

## 8. Datenmodelle

Relevante Prisma-Modelle (autoritative Persistenz):

| Modell | Operator-Relevanz |
|--------|-------------------|
| `Booking` | Buchungen, Status, Stationen, Kunde/Fahrzeug |
| `BookingHandoverProtocol` | Pickup/Return-Protokolle inkl. Signaturen, Odometer, Fuel, `damageIds` JSON |
| `OrgTask` (+ `TaskChecklistItem`, `TaskComment`, `TaskEvent`, `TaskAttachment`) | Operative Aufgaben |
| `VehicleDamage` (+ `VehicleDamageImage`) | Schadenserfassung |
| `VehicleComplaint` | Technische Beobachtungen (Handover) |
| `VehicleDocumentExtraction` / Archive-Index | AI Upload Pipeline |
| `BookingDocumentBundle` / Generated Documents | Buchungsdokumente |

Handover-Payload-Vertrag: `backend/src/modules/bookings/handover.types.ts`  
Frontend-Mapping: `frontend/src/operator/handover/operatorHandoverPayload.ts`.

---

## 9. Übergabe- und Rückgabeprozesse

### 9.1 UI-Flow

6 Schritte (`OPERATOR_HANDOVER_STEPS`): `vehicle` → `condition` → `damages` → `documents` → `signatures` → `review`.

Komponenten: `OperatorHandoverStep*.tsx`, Submit via `OperatorHandoverFlow.tsx`.

### 9.2 API-Aufrufe

- Pickup: `api.bookings.createPickupHandover(orgId, bookingId, payload)`
- Return: `api.bookings.createReturnHandover(orgId, bookingId, payload)`

### 9.3 Gate-Logik (keine zweite Wahrheit im Frontend)

Pickup/Return-Gates werden über `deriveBookingPickupGate` / `deriveBookingReturnGate` aus `rental/lib/bookingHandoverGates.ts` abgeleitet; Operator mappt nur (`operatorData.ts`).

### 9.4 Payload-Inhalte (Server-Vertrag)

Odometer, Fuel, Checks (exterior/interior/tires/warning lights), Signaturen (Kunde/Mitarbeiter), `damageIds`, `technicalObservations`, optional `performedAt`, `actualStationId`, `pickupGateOverrideReason`, `eligibilityApprovalId`.

---

## 10. Dokumente und Uploads

### 10.1 Buchungsdokumente

- `useOperatorBookingDocuments` → `api.documents.listForBooking`
- `OperatorBookingDocumentsPanel` — Öffnen via `api.documents.open`
- Kundendokumente: `api.customers.customerDocuments.list`

### 10.2 AI Upload (Operator)

- `OperatorAiUploadFlow` nutzt `useDocumentExtractionFlow` mit `uploadSource: 'operator_app'`, `sourceSurface: 'operator_ai_upload'`
- Doc-Typen gemappt auf bestehende `DocumentExtractionType` Keys (`operatorAiUpload.config.ts`)
- Review/Confirm über `OperatorAiUploadReview` — **kein Auto-Apply** (shared AI-Upload-Architektur)

### 10.3 Backend-Kanal

`OPERATOR_APP` als `bookingChannel` in Legal-Document-Scope (`legal-document-scope.constants.ts`).

---

## 11. Schäden

### 11.1 Erfassungs-Flow

`OperatorDamageCaptureFlow`: Photo → Details → Review → Submit.

Submit: `api.vehicleIntelligence.createVehicleDamage(vehicleId, payload)` (`OperatorDamageCaptureFlow.tsx`).

### 11.2 Handover-Integration

Aktive Schäden: `api.vehicleIntelligence.damagesActive(vehicleId)` in `useOperatorHandoverForm.ts`. Ausgewählte IDs werden im Handover-Payload als `damageIds` übergeben.

### 11.3 Backend

`VehicleDamage` / `VehicleDamageImage` in Prisma; REST unter `vehicles/:vehicleId/damages*`. AI-Exterior-Analyse-Endpoint existiert, liefert derzeit „not available yet“-Antwort (`vehicle-intelligence.controller.ts`).

---

## 12. Aufgaben

### 12.1 Operator-Oberfläche

- Today-Feed: `OperatorTodayTaskFeed`, Aggregation via `operatorTodayFeed.utils`
- Tasks-Tab: `OperatorTasksView` mit `api.tasks.list` + Filtern
- Aktionen: `useOperatorTaskActions` (start, waiting, complete, comment, checklist)
- Erstellung: `OperatorTaskCreateForm` → `api.tasks.create`

### 12.2 Datenquelle

Tasks stammen aus `OrgTask` (Backend `TasksService`), org-scoped, mit `TaskEvent`-Audit-Timeline.

---

## 13. Offline/PWA

### 13.1 Nachweisbarer Stand

| Aspekt | Befund |
|--------|--------|
| Web App Manifest | **Nicht vorhanden** (`frontend/index.html` ohne manifest link) |
| Service Worker / Workbox | **Nicht vorhanden** (kein `vite-plugin-pwa`, kein `registerSW`) |
| Installierbarkeit | Nicht implementiert |
| Offline-Queue | **Nicht vorhanden** |
| Netzwerk-Hinweis | `OperatorConnectivityBanner` bei `navigator.onLine === false` |
| README | Bezeichnet Modul als „Web / PWA foundation“ |

### 13.2 Scan

`OperatorScanView` enthält Hinweis: QR-Scanner später — kein nativer Scanner im MVP.

---

## 14. Datenschutz

### 14.1 Personenbezogene Daten in Operator-Flows

- Kundennamen, Buchungsdaten, Signaturen (Handover), Dokumente, Verifikationsdaten (Pickup-Check).

### 14.2 Datenminimierung (Backend, Bookings)

`redactHandoverProtocolForList()` wird in `bookings.service.ts` für Today-Listen (`findTodaysPickups`, `findTodaysReturns`) und paginierte Listen verwendet — Signaturen in Listen redigiert.

Quelle: `booking-handover-privacy.util.ts`, `bookings.service.ts` (Zeilen mit `redactHandoverProtocolForList`).

### 14.3 Frontend

- Keine lokale Persistenz von Handover-Signaturen über Session hinaus dokumentiert in Access-Hardening-Changelog (Memory cleanup in `useOperatorHandoverForm`).
- Operator-UI enthält überwiegend **deutsch hardcodierte** Strings (kein durchgängiges i18n in Operator-Modul nachweisbar).

### 14.4 DSGVO / ISO

**Keine formale DSGVO- oder ISO-27001-Zertifizierung** aus diesem Repository ableitbar. Technische Bausteine (Tenant-Scoping, Permission-Guards, Audit-Events bei Tasks) sind vorhanden; organisatorische Nachweise liegen außerhalb des Repos.

---

## 15. Security

### 15.1 Authentifizierung

- SPA: `ProtectedRoute` erfordert `isAuthenticated()` für `/operator`.
- API: JWT via Backend `AuthGuard` (global Nest-Pipeline).

### 15.2 Autorisierung (Backend)

| Mechanismus | Anwendung |
|-------------|-----------|
| `OrgScopingGuard` | orgId-Pfad vs. JWT-Organisation |
| `RolesGuard` | Plattform-/Membership-Rollen |
| `PermissionsGuard` | Modul-Level `read`/`write`/`manage` |
| `VehicleOwnershipGuard` | Fahrzeug gehört zur Organisation |
| `@RequirePermission` / `@RequireTaskPermission` | Bookings, Tasks, Documents |

### 15.3 Bekannte Architektur-Hinweise (faktisch, ohne Bewertung)

- Vehicle-Intelligence-Schaden-Routen: `RolesGuard` + `VehicleOwnershipGuard`, **ohne** explizite `@RequirePermission` auf den Damage-Handleren im Controller.
- `DamagesOrgController`: nur `OrgScopingGuard`, `RolesGuard`.
- Frontend `canAccessOperatorApp()` ist **kein** Sicherheitsgrenze.

### 15.4 Schreiboperationen

Operator-Mutationen (Booking, Handover, Task, Damage, Document Apply) gehen über bestehende API-Endpunkte mit serverseitiger Validierung (DTOs/Service-Layer). Keine rein frontendseitige Autorisierung als alleiniger Schutz dokumentiert.

---

## 16. Observability

### 16.1 Operator-spezifisch

**Keine dedizierten Prometheus-Metriken oder strukturierten Log-Namespaces** für „operator_app“ im Backend nachweisbar.

### 16.2 Plattform-Observability (geteilt)

- Prometheus-Metriken u. a. für Vehicle Detail, Battery, Stations v2, Payments, DIMO Connectivity (`backend/src/modules/**/observability/`).
- Platform-Admin liefert Prometheus/Grafana-Hinweise (`platform-admin.service.ts`).

### 16.3 Frontend

- Sync-State in `OperatorShellContext` (`loading`, `lastSyncAt`, `error`).
- Kein Operator-spezifisches Client-Telemetry-Modul nachweisbar.

---

## 17. Tests

### 17.1 Package Manager & Befehle

#### Frontend (`frontend/package.json`)

| Befehl | Zweck |
|--------|-------|
| `npm ci` | Dependencies installieren |
| `npm run dev` | Vite Dev-Server (:5173) |
| `npm run build` | `tsc -b && vite build` |
| `npm run lint` | ESLint (scoped paths) |
| `npm run lint:all` | ESLint gesamtes `src/` + `test/` |
| `npm run test` | Vitest (`vitest run`) |
| `npm run test:e2e` | Playwright |
| Domänen-Suites | `test:bookings`, `test:document-intake:v2`, `test:vehicle-detail`, … |

#### Backend (`backend/package.json`)

| Befehl | Zweck |
|--------|-------|
| `npm ci` | Dependencies installieren |
| `npx prisma generate` | Prisma Client |
| `npm run build` | `nest build` |
| `npm run lint` / `lint:all` | ESLint |
| `npm run test` | Jest |
| `npm run test:e2e` | Jest E2E config |
| Domänen-Suites | `test:bookings`, `test:bookings:security`, `test:legal-documents`, `test:iam:security`, … |

### 17.2 Operator-Frontend-Tests (Vitest)

10 Testdateien unter `frontend/src/operator/`:

- `lib/operatorStatus.test.ts`
- `hooks/operatorTodayFeed.utils.test.ts`
- `views/operatorTodayView.utils.test.ts`
- `handover/operatorHandoverPayload.test.ts`
- `verification/operatorPickupCheckPayload.test.ts`
- `tasks/operatorTodayTasks.test.ts`, `operatorTaskDisplay.utils.test.ts`, `operatorTaskCard.utils.test.ts`, `OperatorTaskCard.test.tsx`
- `components/OperatorTodayTaskFeed.test.tsx`

### 17.3 Operator E2E

**Keine dedizierte Playwright-Suite** mit `operator` im Dateinamen gefunden. Operator wird indirekt in Document-Intake-/Fleet-Fixtures referenziert.

### 17.4 Backend-Tests (relevant, nicht operator-spezifisch)

- `test:bookings`, `test:bookings:security`
- `test:legal-documents`, `test:legal-documents:security`
- `test:iam:security`
- Document-extraction inkl. `operator_app` Rate-Limit-Spec

---

## 18. Findings

**Status: Inventur-basierte Vorfindings (Prompt 2) — noch keine vollständige P0/P1/P2-Bewertung.**

| ID | Schwere | Bereich | Finding | Evidenz |
|----|---------|---------|---------|---------|
| INV-001 | P1 | Security | `tasks.start` / `tasks.waiting` ohne `@RequireTaskPermission` | `tasks.controller.ts` L193–201 |
| INV-002 | P1 | Security | Vehicle-Damage-Routen ohne `@RequirePermission` (nur `VehicleOwnershipGuard`) | `vehicle-intelligence.controller.ts` damages-Handler |
| INV-003 | P1 | Security | Frontend-Zugang (`canAccessOperatorApp`, Device-Guard) ist explizit **kein** Security-Boundary | `operatorAccess.ts`, `README.md` |
| INV-004 | P2 | PWA/Offline | Kein Service Worker, kein Manifest, keine Offline-Queue; Banner suggeriert Sync | `index.html`, `OperatorConnectivityBanner.tsx` |
| INV-005 | P2 | Tests | Keine dedizierte Operator-E2E-/Security-Matrix | `frontend/e2e/` |
| INV-006 | P2 | Datenfluss | Parallele Task-Ladepfade (`OperatorDataContext`, `useOperatorTodayFeed`, `OperatorTasksView` remote) | Mehrfach `api.tasks.*` |
| INV-007 | P2 | UX/Fehler | `OperatorTasksView.fetchRemoteTasks` schluckt Fehler (`catch → []`) | `OperatorTasksView.tsx` L65–67 |
| INV-008 | P3 | Doku | `README.md` „Wire placeholders“ veraltet — Flows sind verdrahtet | `README.md` L21–23 |
| INV-009 | P3 | API | Deprecated Alias `vehicleIntelligence.damagesActive` noch in Handover-Form | `useOperatorHandoverForm.ts` |
| INV-010 | P3 | Feature | QR-Scanner / QR-Link-Generator nur Platzhalter-UI | `OperatorScanView`, `OperatorLinkCard` |

---

## 19. Remediation-Status

| Bereich | Status |
|---------|--------|
| Baseline-Audit (Prompt 1) | ✅ |
| Vollständige Dateiinventur (Prompt 2) | ✅ Kap. 21–24 |
| Traceability-Matrix | ✅ Kap. 22 |
| Security-Hardening | ⏳ Ausstehend |
| PWA/Offline | ⏳ Ausstehend |
| E2E Operator-Matrix | ⏳ Ausstehend |
| DSGVO/ISO-Evidence-Pack | ⏳ Ausstehend |

---

## 20. Production Gates

**Status: Noch nicht definiert für Operator App.**

Vorbild im Repository: `docs/audits/booking-post-remediation-production-readiness-2026-07.md` (Go/No-Go-Kriterien für Booking-Domäne). Operator-spezifische Gates werden in späteren Prompts ergänzt.

Vorläufige Kategorien (ohne Pass/Fail):

1. Keine offenen P0/P1 Security-Findings für Operator-konsumierte Endpunkte
2. Jede Schreiboperation serverseitig autorisiert, validiert, mandantengetrennt, auditierbar
3. Keine zweite fachliche Wahrheit (Bookings, Tasks, Damages, Documents, Handover)
4. Mobile Readiness (320–1280px) und Accessibility-Baseline
5. Operator E2E + Security-Negative-Tests grün
6. DSGVO-technische Controls (Datenminimierung in Listen, Signaturen, Retention) verifiziert
7. Observability/Runbooks für Feldbetrieb
8. PWA/Offline-Strategie bewusst entschieden (implementiert oder explizit out-of-scope)

---

## 21. Vollständige Dateiinventur (`frontend/src/operator/**`)

**Stand:** 117 Dateien (67× `.tsx`, 49× `.ts`, 1× `README.md`). Keine Service-Worker-/PWA-Dateien im Operator-Modul oder Frontend-Root.

**Legende Spalten:** API = direkte `api.*`-Aufrufe oder transitive Hooks; W = Schreiboperation; Rolle = Frontend-Rollenprüfung; Org = `orgId`-Bezug; St = Stationsbezug; State = Cache/State; L/E = Loading/Error; T = Testdatei vorhanden.

### 21.1 Root & Routing

| Datei | Verantwortung | API | W | Rolle | Org | St | State | L/E | T | TODO/Platzhalter |
|-------|---------------|-----|---|-------|-----|----|----|-----|---|------------------|
| `OperatorApp.tsx` | Router `/operator`, `RentalProvider`, Toaster | — | — | via Guard | via Rental | — | — | — | — | — |
| `OperatorShell.tsx` | Provider-Stack, Tab-Switch, Device-Guard | — | — | `useIsOperatorDevice` | — | — | Shell-Context | — | — | — |
| `index.ts` | Public exports für Rental/Master | — | — | — | — | — | — | — | — | — |
| `README.md` | Dev-Doku Entry/Device/Security | — | — | dokumentiert | — | — | — | — | — | **TODO veraltet** (L21–23) |

### 21.2 `lib/` — Typen, Routen, Access, Daten

| Datei | Verantwortung | API | W | Rolle | Org | St | State | L/E | T |
|-------|---------------|-----|---|-------|-----|----|----|-----|---|
| `operatorTypes.ts` | Tab-IDs, `OperatorSheetAction`, Sync-State-Typen | — | — | — | — | — | Typen | — | — |
| `operatorRoutes.ts` | Deep-Link-Auflösung, URL-Builder | — | — | — | — | — | Pure fn | — | — |
| `operatorAccess.ts` | Frontend-Zugang ORG_ADMIN/SUB_ADMIN/WORKER/MASTER | — | — | **Ja** (`evaluateOperatorAccess`) | — | — | `getStoredUser` | — | — |
| `operatorAccess.types.ts` | Allowed/Denied Roles, Denial-Reasons | — | — | Konstanten | — | — | — | — | — |
| `operatorData.ts` | Today-Snapshot, Gate-Ableitung, Scan→Detail-Mapping | — (nutzt Rental-Gates) | — | — | indirekt | St aus API-Rows | Pure/derive | — | — |
| `operatorStatus.ts` | Vehicle-Status-Badges für Listen | — | — | — | — | — | Pure | — | ✅ |
| `operatorVehicleQuickView.utils.ts` | Quick-View-Labels, Health-Module, Pickup/Return-Row-Finder | — | — | — | — | St aus Rows | Pure | — | — |

### 21.3 `context/`

| Datei | Verantwortung | API | W | Rolle | Org | St | State | L/E | T |
|-------|---------------|-----|---|-------|-----|----|----|-----|---|
| `OperatorShellContext.tsx` | Tab, Deep-Link-State, Sheets, `refreshToken`, `syncState` | — | — | — | — | — | React Context | — | — |
| `OperatorDataContext.tsx` | Today Pickups/Returns + Tasks + Summary | `bookings.todayPickups/Returns`, `tasks.summary`, `fetchAllTasks` | — | — | **orgId** | — | useState, invalidation subscribe | ✅ loading/error per domain | — |

### 21.4 `hooks/`

| Datei | Verantwortung | API | W | Rolle | Org | St | State | L/E | T |
|-------|---------------|-----|---|-------|-----|----|----|-----|---|
| `useIsOperatorDevice.ts` | Viewport/Touch UX-Guard | — | — | — | — | — | matchMedia | — | — |
| `useOperatorNetworkStatus.ts` | `navigator.onLine` | — | — | — | — | — | useSyncExternalStore | — | — |
| `useOperatorTabletLayout.ts` | Tablet Split-Layout (≥768px) | — | — | — | — | — | matchMedia | — | — |
| `useOperatorToday.ts` | Today-Aggregat Hook | transitiv DataContext + TodayFeed | — | — | orgId | — | useMemo snapshot | ✅ stale/offline/reload | — |
| `useOperatorTodayFeed.ts` | Task-Buckets NOW/TODAY/… via `useTaskList` | `tasks.list` (5× bucket), `tasks.summary` | — | **hasPermission** für UNASSIGNED | orgId | — | React Query hooks | ✅ per bucket | — |
| `operatorTodayFeed.utils.ts` | Bucket-Slice-Builder, UNASSIGNED-Gate | — | — | role+permission check | — | — | Pure | — | ✅ |
| `useOperatorVehiclesData.ts` | Fleet-Liste + Health (FleetContext) | transitiv `vehicles.fleetMap`, `rentalHealth.*` | — | — | orgId | St in VehicleData | FleetContext | ✅ health L/E | — |
| `useOperatorVehicleQuickViewData.ts` | Quick-View-Datenaggregation | damages, tires, docs, `tasks.forVehicle` | — | — | orgId | St aus vehicle/pickups | local useState + OperatorData | ✅ partial swallow `.catch` | — |
| `useOperatorScanSearch.ts` | Scan: Fleet-Filter + Booking-Suche | `bookings.get`, `bookings.list` | — | — | orgId | — | useState | ✅ bookingsError | — |
| `useOperatorBookingMutations.ts` | Booking CRUD/Cancel/NoShow | `bookings.create/update/cancel/markNoShow` | **Ja** | — | orgId | St in payload | mutating/error + toast | ✅ toast errors | — |
| `useOperatorOperationalAlerts.ts` | Dashboard-Insights (max 5) | `dashboardInsights.get` | — | — | orgId | — | useState | ✅ catch→[] | — |

### 21.5 `views/`

| Datei | Verantwortung | API | W | Rolle | Org | St | State | L/E | T |
|-------|---------------|-----|---|-------|-----|----|----|-----|---|
| `OperatorTodayView.tsx` | Tagesüberblick, Handover-CTAs, Alerts | transitiv Hooks | Sheet-W | — | orgId | St in Cards | local detail state | ✅ Skeleton/Error/Empty | — |
| `operatorTodayView.utils.ts` | Empty/stale/banner-Logik | — | — | — | — | — | Pure | — | ✅ |
| `OperatorVehiclesView.tsx` | Fahrzeugliste + Filter + Quick View | transitiv | Sheet-W | — | orgId | St in list | filter/search local | ✅ | — |
| `OperatorScanView.tsx` | Textsuche, Booking/Vehicle-Treffer | transitiv scan hook | Handover-W | — | orgId | — | shell deep-link state | ✅ | — |
| `OperatorTasksView.tsx` | Task-Liste, Filter, Detail | `tasks.list` (+ DataContext) | Sheet-W | scope mine/all | orgId | booking filter | remoteTasks local | ⚠️ remote catch→[] | — |
| `OperatorMoreView.tsx` | Shortcuts AI/Tire/Booking, Theme, Link Rental | — | Sheet open | — | — | — | picker local | — | — |

**Scan-Platzhalter:** `OperatorScanView.tsx` L114 — QR-Scanner „später/MVP“.

### 21.6 `components/` (Shell, Nav, Cards, Bridges)

| Datei | Verantwortung | API | W | Rolle | Org | St | State | L/E | T |
|-------|---------------|-----|---|-------|-----|----|----|-----|---|
| `OperatorAccessGuard.tsx` | Auth + Rolle + Rental businessType | `organizations.getProfile` | — | **Ja** | **orgId** | — | gate state machine | ✅ retry | — |
| `OperatorAccessDeniedScreen.tsx` | Denial UX | — | — | — | — | — | — | — | — |
| `OperatorAccessLoadingScreen.tsx` | Loading UX | — | — | — | — | — | — | — | — |
| `OperatorActionSheets.tsx` | Sheet-Router (AI, Task, Booking, Verify, Tire) | — | — | — | — | — | shell `sheetAction` | — | — |
| `OperatorDeepLinkBridge.tsx` | URL→Shell-State Sync | — | — | — | — | — | useEffect | — | — |
| `OperatorHandoverRefreshBridge.tsx` | Invalidation nach Handover/Damage/Task | — | — | — | orgId | — | window events + registry | — | — |
| `OperatorConnectivityBanner.tsx` | Offline-Hinweis | — | — | — | — | — | `navigator.onLine` | — | — |
| `OperatorHeader.tsx` | Titel, Sync-Indikator, Refresh | — | — | — | — | — | `syncState` | ✅ error dot | — |
| `OperatorBottomNav.tsx` | 5 Tabs | — | — | — | — | — | shell tab | — | — |
| `OperatorDesktopOnlyNotice.tsx` | Desktop-Blocker | — | — | Device | — | — | — | — | — |
| `OperatorEntryButton.tsx` | Rental-Topbar-Einstieg | — | — | `canAccessOperatorApp` | — | — | modal state | — | — |
| `OperatorEntryModal.tsx` | Desktop: URL kopieren | — | — | — | — | — | — | — | — |
| `OperatorLinkCard.tsx` | Deep-Link-Karte | — | — | — | — | — | — | — | **QR folgt später** |
| `OperatorBookingCard.tsx` | Today/Scan Booking-Karte | — | — | — | — | St | props | — | — |
| `OperatorBookingDetailSheet.tsx` | Booking-Detail + Gates | `bookings.detail` | Sheet actions | — | orgId | St | local load | ✅ | — |
| `OperatorScanBookingCard.tsx` | Scan Booking-Karte | — | — | — | — | — | props | — | — |
| `OperatorScanVehicleCard.tsx` | Scan Vehicle-Karte | — | — | — | — | St | props | — | — |
| `OperatorTodaySection.tsx` | Section-Wrapper | — | — | — | — | — | — | — | — |
| `OperatorTodayTaskFeed.tsx` | Task-Bucket-Rendering | — | — | — | — | — | props | — | ✅ |
| `OperatorListCard.tsx` | Generische Listenkarte | — | — | — | — | — | — | — | — |
| `OperatorGlassCard.tsx` | Glassmorphism Card | — | — | — | — | — | — | — | — |
| `OperatorStatusChip.tsx` | Status-Chip | — | — | — | — | — | — | — | — |
| `OperatorTabletFrame.tsx` | Split List/Detail Layout | — | — | — | — | — | — | — | — |
| `OperatorVehicleQuickView.tsx` | Fahrzeug-Hub (Handover, Damage, AI, Tasks) | transitiv quick-view hook | **Ja** (sheets) | — | orgId | St | hook state | ✅ Skeleton | — |
| `OperatorAiUploadSheet.tsx` | Sheet wrapper AI Upload | — | — | — | — | — | — | — | — |
| `OperatorTireMeasureSheet.tsx` | Sheet wrapper Tire | — | — | — | — | — | — | — | — |
| `OperatorTaskSheet.tsx` | Sheet wrapper Task create/detail | — | — | — | — | — | — | — | — |

### 21.7 `handover/` — Pickup & Return (gemeinsamer Flow, `kind` unterscheidet)

| Datei | Verantwortung | API | W | Rolle | Org | St | State | L/E | T |
|-------|---------------|-----|---|-------|-----|----|----|-----|---|
| `OperatorHandoverProvider.tsx` | Modal-State, Staff-Liste, Booking-Hydration | `users.listByOrg`, `bookings.detail/get` | — | — | orgId | **Ja** (stations in booking) | isOpen/booking state | ✅ fallback get | — |
| `OperatorHandoverFlow.tsx` | 6-Step Wizard, Submit | `createPickup/ReturnHandover` | **Ja** | — | orgId | actualStationId | step/form state | ✅ submit error | — |
| `useOperatorHandoverForm.ts` | Form-State, Damages, Docs, Telemetry | `stations.list`, `documents.listForBooking`, `damagesActive`, telemetry | — | — | orgId | **Ja** | useState + cleanup sigs | ✅ | — |
| `operatorHandoverPayload.ts` | Validierung, Payload-Build | — | — | — | — | St in payload | Pure | — | ✅ |
| `operatorHandoverUi.tsx` | Shared UI bits | — | — | — | — | — | — | — | — |
| `operatorHandoverTechnicalObservations.ts` | Observation drafts/chips | — | — | — | — | — | Pure | — | — |
| `OperatorHandoverStepVehicle.tsx` | Step 1 Fahrzeug/Station | — | — | — | — | **Ja** | form | — | — |
| `OperatorHandoverStepCondition.tsx` | Step 2 Odometer/Fuel/Checks | — | — | — | — | — | form | — | — |
| `OperatorHandoverStepDamages.tsx` | Step 3 Schaden-Auswahl/Erfassung | via DamageCapture | — | — | — | — | form | — | — |
| `OperatorHandoverStepDocuments.tsx` | Step 4 Dokument-Ack | via documents hook | — | — | orgId | — | form | — | — |
| `OperatorHandoverStepSignatures.tsx` | Step 5 Kunde/Mitarbeiter-Signaturen | — | — | — | — | — | canvas state | — | — |
| `OperatorHandoverStepReview.tsx` | Step 6 Review | — | — | — | — | — | — | — | — |
| `OperatorHandoverTechnicalObservationsSection.tsx` | Tech-Obs UI | — | — | — | — | — | drafts | — | — |
| `handover/index.ts` | Re-exports | — | — | — | — | — | — | — | — |

**Hinweis:** Separater Return-Flow existiert nicht — `HandoverDialogKind` = `PICKUP` | `RETURN` steuert API-Endpunkt und Validierung.

### 21.8 `damages/`

| Datei | Verantwortung | API | W | Rolle | Org | St | State | L/E | T |
|-------|---------------|-----|---|-------|-----|----|----|-----|---|
| `OperatorDamageCaptureProvider.tsx` | Modal-State, Context | — | — | — | — | — | isOpen/context | — | — |
| `OperatorDamageCaptureFlow.tsx` | 4-Step Capture + Submit | `createVehicleDamage` | **Ja** | — | via vehicle org | booking link | form/photos | ✅ submit error | — |
| `operatorDamagePayload.ts` | Form defaults, validation, payload | — | — | — | — | — | Pure | — | — |
| `operatorDamageImage.utils.ts` | Image resize/dataURL | — | — | — | — | — | Pure | — | — |
| `OperatorDamagePhotoStep.tsx` | Foto-Step | — | — | — | — | — | local photos | — | — |
| `OperatorDamageDetailsStep.tsx` | Klassifizierung-Step | — | — | — | — | — | form | — | — |
| `OperatorDamageReviewStep.tsx` | Review-Step | — | — | — | — | — | — | — | — |

### 21.9 `bookings/`

| Datei | Verantwortung | API | W | Rolle | Org | St | State | L/E | T |
|-------|---------------|-----|---|-------|-----|----|----|-----|---|
| `OperatorBookingFormSheet.tsx` | Create/Edit Booking | `stations.list`, `customers.list/get`, `bookings.detail`, mutations | **Ja** | — | orgId | **Ja** pick/return station | form state | ✅ | — |
| `OperatorBookingCancelSheet.tsx` | Cancel | `bookings.detail`, `cancel` | **Ja** | — | orgId | — | form | ✅ | — |
| `OperatorBookingNoShowSheet.tsx` | No-Show | `bookings.detail`, `markNoShow` | **Ja** | — | orgId | — | form | ✅ | — |
| `operatorBooking.utils.ts` | Error formatting, display helpers | — | — | — | — | — | Pure | — | — |
| `operatorBookingSheetShell.tsx` | Shared sheet chrome | — | — | — | — | — | — | — | — |

### 21.10 `tasks/`

| Datei | Verantwortung | API | W | Rolle | Org | St | State | L/E | T |
|-------|---------------|-----|---|-------|-----|----|----|-----|---|
| `OperatorTasksView.tsx` | (siehe views) | — | — | — | — | — | — | — | — |
| `OperatorTaskCard.tsx` | Task-Karten-UI | — | — | — | — | — | props | — | ✅ |
| `OperatorTaskCardConnected.tsx` | Card + Actions wiring | via `useOperatorTaskActions` | **Ja** | — | orgId | — | — | toast | — |
| `OperatorTaskDetail.tsx` | Task-Detail in Sheet | `tasks.get` | via actions | — | orgId | — | local | ✅ | — |
| `OperatorTaskCreateForm.tsx` | Manuelle Task-Erstellung | `tasks.create` | **Ja** | — | orgId | optional stationId metadata | form | ✅ | — |
| `useOperatorTaskActions.ts` | start/wait/complete/comment/checklist | `tasks.*` mutations | **Ja** | — | orgId | — | busy via parent | toast | — |
| `useOperatorTaskCardController.ts` | Card expand/collapse | — | — | — | — | — | local | — | — |
| `operatorTask.utils.ts` | Filter/sort/API filter build | — | — | — | — | — | Pure | — | — |
| `operatorTodayTasks.ts` | Canonical task filter | — | — | — | — | — | Pure | — | ✅ |
| `operatorTaskDisplay.utils.ts` | Labels, vehicle map | — | — | — | — | — | Pure | — | ✅ |
| `operatorTaskCard.utils.ts` | Card helper | — | — | — | — | — | Pure | — | ✅ |

### 21.11 `documents/`, `ai-upload/`, `tire-measure/`, `verification/`

| Datei | Verantwortung | API | W | Rolle | Org | St | State | L/E | T |
|-------|---------------|-----|---|-------|-----|----|----|-----|---|
| `useOperatorBookingDocuments.ts` | Booking-Dokument-Slots | `documents.listForBooking` | — | — | orgId | — | useState | ✅ | — |
| `operatorBookingDocuments.utils.ts` | Slot-Mapping | — | — | — | — | — | Pure | — | — |
| `OperatorBookingDocumentsPanel.tsx` | UI + Kundendokumente | `customerDocuments.list`, `documents.open` | — | — | orgId | — | local | ✅ | — |
| `OperatorAiUploadFlow.tsx` | AI Upload UI | `useDocumentExtractionFlow` → ~12 endpoints | **confirm** | — | orgId | — | flow state | ✅ flow errors | — |
| `OperatorAiUploadReview.tsx` | Review/Confirm panel | confirm via flow | **Ja** | — | orgId | — | — | — | — |
| `operatorAiUpload.config.ts` | Doc types, `operator_app` source | — | — | — | — | — | constants | — | — |
| `OperatorTireMeasureFlow.tsx` | Reifen-UI | via payload hook | **Ja** | — | — | — | multi-step | ✅ | — |
| `useOperatorTireMeasureData.ts` | Tire setups load | `tires`, `tireHealthSummary` | — | — | — | — | useState | ✅ catch | — |
| `operatorTireMeasurePayload.ts` | Measurement submit | `addTireMeasurement`, `addTireHealthMeasurement` | **Ja** | — | — | — | — | throw | — |
| `operatorTireMeasure.utils.ts` | Tread parsing | — | — | — | — | — | Pure | — | — |
| `operatorTireMeasure.types.ts` | Types | — | — | — | — | — | — | — | — |
| `OperatorTireMeasureTreadGrid.tsx` | Tread input grid | — | — | — | — | — | — | — | — |
| `OperatorPickupCheckSheet.tsx` | Manuelle Pickup-Verifikation | `customerVerification.submitManualPickupCheck` | **Ja** | — | service-resolved | — | form | ✅ | — |
| `operatorPickupCheckPayload.ts` | Payload build | — | — | — | — | — | Pure | — | ✅ |

### 21.12 Globale Provider (außerhalb `operator/`, von Operator genutzt)

| Provider | Datei | Operator-relevante APIs | Org | Rolle/Permission |
|----------|-------|-------------------------|-----|------------------|
| `RentalProvider` | `rental/RentalContext.tsx` | `auth.memberships`, `auth.switchOrganization`, `organizations.list` | **Ja** | membership role, `hasPermission` |
| `FleetProvider` | `rental/FleetContext.tsx` | `vehicles.fleetMap`, `rentalHealth.getFleetScoped` | **Ja** | `fleet.read` (health) |
| `AppThemeProvider` | `context/AppThemeContext.tsx` | — | — | — |
| `ProtectedRoute` | `App.tsx` | JWT session | — | `isAuthenticated` |

### 21.13 Service Worker / PWA

| Suche | Ergebnis |
|-------|----------|
| `serviceWorker`, `service-worker`, `manifest.webmanifest`, `vite-plugin-pwa` im `frontend/` | **0 Treffer** |
| `index.html` | Kein Manifest-Link, kein SW-Register |

### 21.14 Redundante / obsolete Implementierungen

| Befund | Details |
|--------|---------|
| Doppelte Task-Loads | `OperatorDataContext` lädt `ALL_OPEN`; `useOperatorTodayFeed` lädt 5 Buckets; `OperatorTasksView` lädt gefiltert remote — gleiche Domäne, verschiedene Caches |
| Deprecated API-Alias | `damagesActive` vs `getVehicleDamagesActive` |
| Veraltete README | Behauptet unwired placeholders — Handover/Damage/Task sind implementiert |
| `useHandover` Alias | `OperatorHandoverProvider` exportiert Drop-in für Rental `useHandover` — beabsichtigt, kein Duplicate-Flow |

---

## 22. Traceability-Matrix (Operator UI → Backend)

**Legende:** `GAP` = Verbindung nicht vollständig nachweisbar oder Permission/Audit unklar.

### 22.1 Schreiboperationen (kritische Pfade)

| UI-Aktion | React-Komponente | Hook/Provider | API-Client | Backend-Controller | Service | Prisma | Permission | Audit Event | Test |
|-----------|------------------|---------------|------------|-------------------|---------|--------|------------|-------------|------|
| Pickup-Handover abschließen | `OperatorHandoverFlow` | `useOperatorHandoverForm` | `bookings.createPickupHandover` | `BookingsController.createPickupHandover` | `BookingsHandoverService.createHandover` | `BookingHandoverProtocol`, `Booking`, `VehicleComplaint`, `VehicleDamage` | `bookings.write` | `BookingPickupGateAuditEvent` (bei Override); TaskAutomation | `operatorHandoverPayload.test.ts`; Backend handover specs |
| Return-Handover abschließen | `OperatorHandoverFlow` |同上 | `bookings.createReturnHandover` | `BookingsController.createReturnHandover` | `BookingsHandoverService.createHandover` |同上 | `bookings.write` | TaskAutomation on return |同上 |
| Buchung anlegen | `OperatorBookingFormSheet` | `useOperatorBookingMutations` | `bookings.create` | `BookingsController.create` | `BookingsService.create` | `Booking` | `bookings.write` | TaskAutomation | `test:bookings` (domain) |
| Buchung bearbeiten | `OperatorBookingFormSheet` | `useOperatorBookingMutations` | `bookings.update` | `BookingsController.update` | `BookingsService.update` | `Booking` | `bookings.write` | TaskAutomation | domain |
| Buchung stornieren | `OperatorBookingCancelSheet` | `useOperatorBookingMutations` | `bookings.cancel` | `BookingsController.cancel` | `BookingsService.cancel` | `Booking` | `bookings.manage` | TaskAutomation | domain |
| No-Show markieren | `OperatorBookingNoShowSheet` | `useOperatorBookingMutations` | `bookings.markNoShow` | `BookingsController.markNoShow` | `BookingsService.markNoShow` | `Booking` | `bookings.write` | TaskAutomation | domain |
| Schaden erfassen | `OperatorDamageCaptureFlow` | `OperatorDamageCaptureProvider` | `vehicleIntelligence.createVehicleDamage` | `VehicleIntelligenceController.createDamage` | `DamagesService.create` | `VehicleDamage`, `VehicleDamageImage` | **GAP** — nur `VehicleOwnershipGuard` | **GAP** — kein dediziertes Audit-Event nachgewiesen | — |
| Task erstellen | `OperatorTaskCreateForm` | — | `tasks.create` | `TasksController.create` | `TasksService.createManualTask` | `OrgTask`, `TaskChecklistItem` | `tasks.create` | `TaskEvent` CREATED | `operatorTodayTasks.test.ts` |
| Task starten | `OperatorTaskCardConnected` | `useOperatorTaskActions` | `tasks.start` | `TasksController.start` | `TasksService.startTask` | `OrgTask` | **GAP** — kein `@RequireTaskPermission` | `TaskEvent` STATUS_CHANGED | — |
| Task → Wartend | `OperatorTaskCardConnected` | `useOperatorTaskActions` | `tasks.waiting` | `TasksController.waiting` | `TasksService.moveTaskToWaiting` | `OrgTask` | **GAP** | `TaskEvent` | — |
| Task abschließen | `OperatorTaskCardConnected` | `useOperatorTaskActions` | `tasks.complete` | `TasksController.complete` | `TasksService.completeTask` | `OrgTask` | `tasks.complete` | `TaskEvent` | — |
| Task Kommentar | `OperatorTaskDetail` | `useOperatorTaskActions` | `tasks.addComment` | `TasksController.addComment` | `TasksService.addComment` | `TaskComment` | `tasks.update` (implizit) | `TaskEvent` COMMENT | — |
| Checklist-Item | `OperatorTaskDetail` | `useOperatorTaskActions` | `tasks.updateChecklistItem` | `TasksController.updateChecklistItem` | `TasksService.updateChecklistItem` | `TaskChecklistItem` | `tasks.update` | `TaskEvent` | — |
| Reifen messen | `OperatorTireMeasureFlow` | `operatorTireMeasurePayload` | `addTireMeasurement` / `addTireHealthMeasurement` | `VehicleIntelligenceController` | `TireLifecycleService.recordMeasurement` | `VehicleTireTreadMeasurement`, `TireEvent` | **GAP** — ownership only | `TireEvent` | — |
| AI Upload bestätigen | `OperatorAiUploadFlow` | `useDocumentExtractionFlow` | `confirmDocumentExtraction` / `confirmByOrg` | `DocumentExtractionController.confirm` | `DocumentExtractionService.confirm` | `VehicleDocumentExtraction` + apply targets | `document-upload.write` | extraction pipeline | document-intake tests |
| Pickup-Verifikation | `OperatorPickupCheckSheet` | — | `customerVerification.submitManualPickupCheck` | `CustomerVerificationController.createManualPickupCheck` | `CustomerVerificationService.createManualPickupCheck` | `CustomerVerificationCheck` | **GAP** — `RolesGuard` only | `CustomerTimelineEvent` | `operatorPickupCheckPayload.test.ts` |

### 22.2 Leseoperationen (Auswahl)

| UI-Aktion | Komponente | API-Client | Controller | Service | Permission | Test |
|-----------|------------|------------|------------|---------|------------|------|
| Today Pickups/Returns | `OperatorDataContext` | `todayPickups/Returns` | `BookingsController` | `BookingsService.findTodays*` | `bookings.read` | — |
| Task-Buckets Today | `useOperatorTodayFeed` | `tasks.list` (bucket) | `TasksController.findAll` | `TasksService.listTasks` | `tasks.read` | `operatorTodayFeed.utils.test.ts` |
| Fahrzeug-Flotte | `FleetProvider` | `vehicles.fleetMap` | `VehiclesController.getFleetMap` | `VehiclesService.getFleetMapData` | OrgScoping | fleet tests |
| Fleet Health | `FleetProvider` | `rentalHealth.getFleetScoped` | `RentalHealthController` | `RentalHealthFleetService` | `fleet.read` | — |
| Booking-Detail Gates | `OperatorBookingDetailSheet` | `bookings.detail` | `BookingsController.findDetail` | `BookingsService.findDetail` | `bookings.read` | — |
| Scan-Suche | `useOperatorScanSearch` | `bookings.list/get` | `BookingsController` | `BookingsService` | `bookings.read` | — |
| Booking-Dokumente | `useOperatorBookingDocuments` | `documents.listForBooking` | `DocumentsController` | `BookingDocumentBundleService` | `bookings.read` | — |
| Aktive Schäden | Quick View / Handover | `getVehicleDamagesActive` | `VehicleIntelligenceController` | `DamagesService.findActive` | **GAP** | — |
| Org-Gate Rental | `OperatorAccessGuard` | `organizations.getProfile` | `TenantOrganizationProfileController` | `OrganizationsService.getTenantProfile` | OrgScoping | — |
| Dashboard Alerts | `useOperatorOperationalAlerts` | `dashboardInsights.get` | `DashboardInsightsController` | `DashboardInsightsRepository` | OrgScoping | — |

### 22.3 API-Verbindungsstatistik (Prompt 2)

| Metrik | Anzahl |
|--------|--------|
| Geprüfte Operator-Dateien | **117** |
| Distinct `api.*`-Client-Methoden (direkt + transitive Provider/Flows) | **51** |
| Davon Schreiboperationen | **18** |
| Traceability-Zeilen mit explizitem `GAP` | **9** |

---

## 23. GAP-Register

| GAP-ID | Beschreibung | Betroffene Pfade |
|--------|--------------|------------------|
| GAP-001 | Kein `@RequirePermission` auf Vehicle-Damage-CRUD | `POST/PATCH /vehicles/:id/damages*` |
| GAP-002 | `tasks.start` / `tasks.waiting` ohne `@RequireTaskPermission` | `PATCH .../tasks/:id/start|waiting` |
| GAP-003 | `customerVerification.submitManualPickupCheck` — Permission-Modell unklar vs. `customers`/`bookings` | `POST /customer-verification/manual-pickup-check` |
| GAP-004 | `customers.list/get` — kein explizites `@RequirePermission` im Operator-Pfad nachgewiesen | `CustomersController` |
| GAP-005 | Kein Operator-E2E-Test → UI→API→DB End-to-End nicht abgesichert | `frontend/e2e/` |
| GAP-006 | Kein PWA/Offline-Persistenz → „Sync“-Copy irreführend bei Offline | Operator Connectivity/Today stale banner |
| GAP-007 | Damage-Create ohne nachgewiesenes dediziertes Audit-Event | `DamagesService.create` |
| GAP-008 | Tire-Measurement ohne explizite Permission-Deklaration | `VehicleIntelligenceController` tire routes |
| GAP-009 | `OperatorAiUploadReview` — Schema/Action-Plan-Hooks laut Code-Pfad optional/inaktiv | AI Upload confirm path |

---

## 24. TODO- und Platzhalter-Register

| ID | Datei | Zeile/Inhalt | Typ |
|----|-------|--------------|-----|
| PH-001 | `README.md` | „Wire placeholders in OperatorShell“ | **Veraltetes TODO** |
| PH-002 | `OperatorScanView.tsx` | QR-Scanner später / MVP | **Feature-Platzhalter** |
| PH-003 | `OperatorLinkCard.tsx` | QR-Code-Generator folgt später | **Feature-Platzhalter** |
| PH-004 | `OperatorAiUploadFlow.tsx` | „Typ kann später korrigiert werden“ | UX-Hinweis (kein Blocker) |

**Anzahl echte TODO/Platzhalter:** **4** (davon 1 veraltete Doku)

---

## Anhang A — Geänderte Dateien

| Prompt | Datei | Aktion |
|--------|-------|--------|
| 1 | `docs/audits/operator-app-production-readiness-2026-07.md` | Neu |
| 1 | `frontend/src/master/components/ChangesView.tsx` | Changelog V4.9.827 |
| 2 | `docs/audits/operator-app-production-readiness-2026-07.md` | Kap. 18–24 Inventur + Matrix |

---

## Anhang B — Referenzen

- `frontend/src/operator/README.md`
- `AGENTS.md`
- `docs/audits/booking-post-remediation-production-readiness-2026-07.md`
- `architecture/DOCUMENT_INTAKE_V2_ENTRY_POINTS_2026-07-17.md`
