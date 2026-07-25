# Operator App — Production Readiness Audit (Baseline)

| Field | Value |
|-------|-------|
| **Audit ID** | `operator-app-production-readiness-2026-07` |
| **Prompt** | **1** (baseline inventory — no functional changes) |
| **Repository** | `https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha` |
| **Audited commit** | `1d0f2caebe56aa1ecd23295aa33d20e953daa95d` |
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

**Status: Baseline — noch keine systematische Bewertung.**

Dieser Prompt erfasst nur den Ist-Zustand. Findings (P0/P1/P2), Security-Negative-Tests und Production-Gap-Analyse folgen in späteren Prompts der Serie.

---

## 19. Remediation-Status

| Bereich | Status |
|---------|--------|
| Baseline-Audit | ✅ Dieses Dokument (Prompt 1) |
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

## Anhang A — Geänderte Dateien (Prompt 1)

| Datei | Aktion |
|-------|--------|
| `docs/audits/operator-app-production-readiness-2026-07.md` | Neu (dieses Dokument) |

---

## Anhang B — Referenzen

- `frontend/src/operator/README.md`
- `AGENTS.md`
- `docs/audits/booking-post-remediation-production-readiness-2026-07.md`
- `architecture/DOCUMENT_INTAKE_V2_ENTRY_POINTS_2026-07-17.md`
