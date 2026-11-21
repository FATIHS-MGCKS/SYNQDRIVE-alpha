# Vehicle Warnings — Production-Readiness Audit Charter

| Feld | Wert |
|------|------|
| **Audit-ID** | `vehicle-warnings-production-readiness-2026-07` |
| **Prompt** | **1 von 26** — Audit-Charter und Arbeitsregeln |
| **Repository** | [SYNQDRIVE-alpha](https://github.com/FATIHS-MGCKS/SYNQDRIVE-alpha) |
| **Erstellt (UTC)** | 2026-07-25 |
| **Status** | **Aktiv** — verbindlich für alle Folge-Prompts (2–26) |
| **Modus** | **Analyse only** — keine Produktionsänderungen |
| **Produktionsdaten verändert** | **Nein** |

---

## 1. Ziel und Scope

### 1.1 Ziel

Dieser Audit stellt die **Production Readiness** der SynqDrive-Fahrzeugwarnmeldungen und aller damit verbundenen operativen Zustände her. Ziel ist ein belastbarer Nachweis, dass:

1. **Eine kanonische Backend-Wahrheit** existiert und von allen relevanten Oberflächen konsumiert wird.
2. **Warnzähler, Schweregrade, Blockaden und Bereitschaftsstatus** fachlich und technisch konsistent sind.
3. **Mandantenisolation** (`organizationId`) in allen Pfaden eingehalten wird.
4. **Keine stillen Fallbacks** Warnungen, Blockaden oder operative Risiken verbergen.
5. **Bekannte visuelle Inkonsistenzen** (siehe §10) durch belegte Ursachen erklärt und priorisiert bewertet werden.

### 1.2 Fachlicher Grundsatz (verbindlich)

> SynqDrive darf für Fahrzeugwarnungen, Fahrzeugzustand, Mietbereitschaft, technische Blockierungen und Warnzähler **keine zweite Wahrheit** besitzen. Alle Oberflächen und Verbraucher müssen dieselben **kanonischen Backenddaten** und dieselben **fachlichen Regeln** verwenden.

### 1.3 In Scope

| Domäne | Beschreibung |
|--------|--------------|
| **Vehicle Warnings / Alerts** | Health Findings, DTC, HM/Vehicle Alerts, Rental Health, operative Issues |
| **Technical State** | `operationalState`, `rentalReadiness`, `blockLevel`, Telemetry/Connectivity |
| **Rental Readiness** | `deriveIsReadyForRenting`, Runtime-Builder, Booking-Gate |
| **Commercial Availability** | Booking-abgeleiteter Fleet-Status (Available / Reserved / Rented / …) |
| **Warnzähler & Schweregrade** | KPI-Strips, Fleet Command Tabs, Critical Drawer, Zustand & Service KPIs |
| **Konsumenten-Oberflächen** | Dashboard (Bereitschaft), Fleet Command, Zustand & Service, Fleet Map, Vehicle Detail, Booking Picker/Preflight, Notifications/Action Queue |
| **Backend-Pfade** | Rental Health, Fleet Health Service, Vehicle Intelligence (Battery/Tire/Brake/DTC), Connectivity Runtime, Booking Eligibility Gatekeeper, Operational Issues |
| **Runtime & Ops** | VPS read-only Inspektion, PM2/Queue-Metriken, Prometheus/Grafana (read-only), Log-Auszüge (anonymisiert) |

### 1.4 Audit-Artefakt-Struktur

| Pfad | Zweck |
|------|-------|
| `docs/audits/vehicle-warnings/00-audit-charter-2026-07.md` | Dieser Charter (verbindliche Regeln) |
| `docs/audits/vehicle-warnings/evidence/` | Beweisartefakte (Screenshots, CSV, JSON, Log-Auszüge — anonymisiert) |
| `docs/audits/vehicle-warnings/queries/` | Read-only SQL/Prisma/API-Queries und Reproduktionsskripte |
| `docs/audits/vehicle-warnings/runtime/` | VPS/PM2/Queue/Prometheus-Laufzeitbefunde |
| `docs/audits/vehicle-warnings/remediation/` | Empfohlene Korrekturen (ohne Umsetzung in Prompt 1) |
| `docs/audits/vehicle-warnings/acceptance/` | Abnahmekriterien, Smoke-Matrizen, Verifikationsprotokolle |

---

## 2. Ausschlüsse

Bis zur expliziten Freigabe in einem späteren Prompt sind **ausgeschlossen**:

| # | Ausschluss |
|---|------------|
| A1 | Produktionsdaten ändern (INSERT/UPDATE/DELETE) |
| A2 | Datenbankmigrationen ausführen |
| A3 | Queues leeren, Jobs re-enqueuen oder Worker neu starten |
| A4 | Warnungen bestätigen, schließen, löschen oder manuell auflösen |
| A5 | Container, PM2-Prozesse oder Dienste neu starten |
| A6 | Neue UI-Features oder neue Produktfunktionen entwickeln |
| A7 | Bestehende fachliche Funktionen vorschnell ersetzen oder parallel neu bauen |
| A8 | Secrets, Tokens, Passwörter, vollständige PII oder Connection Strings in Berichte, Commits oder Logs |
| A9 | Schreibzugriffe auf Produktion (nur read-only bis Freigabe) |
| A10 | Remediation-Code in Prompt 1 |

**Erlaubt in Prompt 1:** Repository-Analyse, Dokumentation, read-only Code-Inspektion, Charter-Erstellung, Git-Baseline-Erfassung.

---

## 3. Definition „Single Source of Truth“ (SSOT)

### 3.1 Prinzip

Für jede fachliche Dimension gibt es **genau einen kanonischen Owner** (Backend-Service oder definierter Runtime-Builder). Consumer (Frontend, Notifications, AI-Tools, WhatsApp/Voice) **dürfen diese Wahrheit nicht neu berechnen**, es sei denn, der Owner ist explizit als reiner Read-Model-Adapter dokumentiert und konsumiert denselben kanonischen Input.

### 3.2 Bekannte SSOT-Schichten (Ausgangshypothese — in Folge-Prompts zu verifizieren)

| Dimension | Kanonischer Owner (Hypothese) | Verbotene Parallelwahrheit |
|-----------|------------------------------|----------------------------|
| Booking-abgeleiteter Fleet-Status | `buildBookingContextMap` → `deriveFleetStatusContext` | Raw `vehicles.status` für operative KPIs |
| Mietbereitschaft / Runtime | `vehicleRuntimeStateBuilder` + `deriveIsReadyForRenting` | Frontend-eigene OR-Logik über Flat-Status |
| Technische Mietblockade | Rental Health (`rental_blocked`, `blocking_reasons`) | ServiceCase/Task-Status als Ersatz-Blockade |
| Health Findings | Rental Health V1 pro Modul (Battery/Tire/Brake/DTC/…) | UI-seitige Severity-Neuberechnung |
| Connectivity / Telemetry Freshness | `VehicleConnectivityRuntimeStateBuilder` / `telemetryFreshness` | Legacy Fleet-Connectivity-API parallel |
| Operative Issues (UI) | `normalizeOperationalIssues` | Parallele Action-Queue-Pfade ohne Normalisierung |
| Fleet Command Tab-Counts | `runtimeSliceConsistency` / `canonicalTabCounts` | Separate Zähler aus Rohlisten |
| Zustand & Service KPIs | Fleet Health Service View Model | Dashboard-Runtime als zweite Health-Wahrheit |

### 3.3 SSOT-Verletzung (Finding-Kriterium)

Eine SSOT-Verletzung liegt vor, wenn:

- zwei Oberflächen für dieselbe `organizationId` + `vehicleId` **unterschiedliche operative Entscheidungen** zeigen (z. B. „Verfügbar“ vs. „Nicht bereit“),
- ein Consumer **eigene Schwellenwerte** oder **eigene Aggregationen** ohne dokumentierten Adapter nutzt,
- ein **still fallback** auf `null`/`[]`/`UNKNOWN`/`0` eine Warnung oder Blockade **unsichtbar** macht,
- Zähler aus **unterschiedlichen Quellmodellen** ohne dokumentierte Transformation verglichen werden.

### 3.4 Abgrenzung: Diagnose vs. Produktion

Diagnose-Utilities (`vehicle-booking-handover-diagnostic`, Dry-Run-Skripte) sind **kein SSOT**. Abweichungen zwischen Diagnose und Produktion sind Findings, wenn sie zu irreführenden Operator-Entscheidungen führen.

---

## 4. Priorisierungssystem

Jede Feststellung wird **genau einer** Priorität zugeordnet:

| Prio | Definition | Beispiele |
|------|------------|-----------|
| **P0** | Sicherheits-, Mandanten-, Datenintegritäts- oder **falsche operative Entscheidung** | Cross-tenant leak; Fahrzeug buchbar trotz technischer Blockade; Critical ohne sichtbare Warnung |
| **P1** | **Erhebliche fachliche Inkonsistenz** oder Produktionsrisiko | Unterschiedliche Warnzähler zwischen Fleet Command und Zustand & Service; Offline + „Verfügbar“ |
| **P2** | Robustheit, Wartbarkeit, Performance oder UX | Fehlende Pagination; stille API-Fehler → leere KPI; PM2-Restart-Spikes |
| **P3** | Kleinere Verbesserung | Copy-Inkonsistenz; redundante Listener; veraltete Deprecated-Helfer |

### 4.1 Finding-Pflichtfelder

Jede Feststellung **muss** enthalten:

| Feld | Beschreibung |
|------|--------------|
| **ID** | Stabile Kennung (z. B. `VW-P1-03`) |
| **Priorität** | P0–P3 |
| **Beweis** | Code-Zeile, API-Response, Query-Ergebnis, Screenshot, Log-Auszug |
| **Betroffene Komponente** | Datei, Service, API-Route, UI-Surface, Runtime-Prozess |
| **Fachliche Auswirkung** | Was der Operator/Kunde falsch sieht oder falsch tut |
| **Technische Ursache** | Belegte Ursache oder klar als **Hypothese** markiert |
| **Empfohlene Korrektur** | Konkreter Remediation-Vorschlag (ohne Umsetzung bis Freigabe) |
| **Verifikation** | Wie der Fix nachweisbar ist (Test, Query, Smoke) |

### 4.2 Epistemische Kennzeichnung

| Kennzeichnung | Bedeutung |
|---------------|-----------|
| **CODE_VERIFIED** | Direkt im Repository nachgewiesen |
| **API_VERIFIED** | Read-only API-Aufruf (anonymisiert dokumentiert) |
| **PRODUCTION_DATA_VERIFIED** | Read-only Prod-Daten (keine IDs/PII in Git) |
| **LOG_VERIFIED** | Log-Auszug (redigiert) |
| **HYPOTHESIS** | Plausible Erklärung, noch nicht vollständig verifiziert |
| **SAMPLE_INFERENCE** | Schluss aus Stichprobe, nicht fleet-weit belegt |

---

## 5. Sicherheitsregeln für VPS-Zugriffe

Gilt ab dem ersten read-only Produktionszugriff (Prompt ≥ 2):

| Regel | Beschreibung |
|-------|--------------|
| **S1** | Nur SSH über konfigurierten Cloud-Agent-Pfad (`CLOUD_AGENT_VPS_HOST`); keine Ad-hoc-Credentials in Git |
| **S2** | Produktionszugriffe zunächst **ausschließlich read-only** (`SELECT`, `GET`, Log-Tail, `pm2 status`, Metrics-Scrape) |
| **S3** | Kein `pm2 restart`, kein `redis-cli FLUSH`, kein `prisma migrate`, kein Queue-Purge ohne explizite Freigabe |
| **S4** | DB: nur Read-Replica oder read-only Session; keine DDL/DML auf Produktion im Audit-Modus |
| **S5** | Vor jedem späteren Schreibzugriff: Ursache belegen → Auswirkungen → Rollback → Tests (siehe §8) |
| **S6** | Deploy-Skripte (`cloud-agent-deploy.sh`) **nicht** auslösen, solange Audit im Analysemodus |
| **S7** | VPS-Artefakte in `runtime/` anonymisieren; keine `.env`-Inhalte kopieren |
| **S8** | Tailscale/Public-SSH-Pfad gemäß `AGENTS.md`; keine Umgehung der Network-Allowlist |

---

## 6. Umgang mit personenbezogenen Daten (PII)

| Regel | Beschreibung |
|-------|--------------|
| **P1** | Keine vollständigen Namen, E-Mails, Telefonnummern, Kennzeichen oder Adressen in Git-Artefakten |
| **P2** | Fahrzeug-IDs in Evidence nur als `VEHICLE_###` oder Hash-Kürzel |
| **P3** | Org-IDs als `ORG_###`; User-IDs als `USER_###` |
| **P4** | API-Response-Dumps: Felder mit PII entfernen oder maskieren vor Ablage in `evidence/` |
| **P5** | Logs: nur relevante Zeilen, Secrets und PII redigieren |
| **P6** | Zeitstempel in UTC; lokale Anzeige (CET/CEST) separat dokumentieren |

---

## 7. Beweisstandard

### 7.1 Mindeststandard

Ein Finding ohne Beweis ist **kein Finding** — höchstens eine **Hypothese** im Arbeitsnotizbuch.

Akzeptierte Beweisarten:

1. **Code-Referenz** — Dateipfad + Zeilenbereich + relevanter Ausschnitt
2. **Test-Referenz** — grüner/roter Test, der Verhalten fixiert oder Lücke zeigt
3. **Read-only Query** — SQL/Prisma mit anonymisiertem Ergebnis in `queries/` + `evidence/`
4. **API-Trace** — Request/Response-Shape (ohne Auth-Header, ohne PII)
5. **Runtime-Snapshot** — PM2/Queue/Metrics-Zähler in `runtime/`
6. **UI-Evidence** — Screenshot mit anonymisierten Labels in `evidence/`

### 7.2 Reproduzierbarkeit

Jeder Beweis muss für einen zweiten Prüfer **reproduzierbar** sein: Commit-Hash, Route, Query, Filter (`organizationId`), UTC-Zeitfenster.

### 7.3 Widersprüche

Widersprechen Code und Produktion, gilt:

1. **Beobachtete Tatsache** (Prod/API) dokumentieren
2. **Code-Erwartung** dokumentieren
3. **Deployment-Drift** (Repo-Commit ≠ VPS-Commit) explizit vermerken
4. Erst dann **Schlussfolgerung** oder **Hypothese**

---

## 8. Arbeitsregeln für spätere Eingriffe

Vor **jedem** nicht-read-only Eingriff (Remediation-Prompts):

| Schritt | Pflicht |
|---------|---------|
| 1. Ursache belegen | Finding-ID + Beweis aus diesem Audit |
| 2. Auswirkungen bestimmen | Betroffene Orgs, Fahrzeuge, Surfaces, Downstream-Consumer |
| 3. Rollback definieren | Revert-Commit, Feature-Flag, DB-Rollback-Plan |
| 4. Tests definieren | Unit/Integration/E2E + manuelle Smoke-Matrix |
| 5. Mandantencheck | `organizationId`-Scoping in allen geänderten Pfaden |
| 6. Keine stillen Fallbacks | Fail-closed oder explizites `UNKNOWN`/`DEGRADED` — nie „grün“ bei fehlender Datenlage |

---

## 9. Fachdefinitionen

### 9.1 warning

Eine **Warning** ist ein fachlich relevanter Hinweis auf einen abnormalen oder grenzwertigen Fahrzeugzustand, der **operatorische Aufmerksamkeit** erfordert, aber nicht zwingend eine technische Mietblockade auslöst.

- **Quellen:** Rental Health Findings, DTC, HM Alerts, Connectivity-Degradation, Compliance-Overdue (je nach Schwere)
- **Nicht jede Warning ist „Critical“** — Severity kommt vom kanonischen Modul-Owner
- **Abgrenzung:** `notification` (Zustellkanal) ≠ `warning` (fachlicher Inhalt)

### 9.2 finding

Ein **Finding** ist ein **auditierter, dokumentierter Mangel** gegen SSOT, Sicherheit, Konsistenz oder Production Readiness — mit Priorität, Beweis und Verifikationsplan (siehe §4.1).

### 9.3 signal

Ein **Signal** ist ein **roher oder normalisierter Telemetrie-/Zustandsdatenpunkt** (DIMO, Snapshot, ClickHouse, OBD), **ohne** allein eine operatorische Entscheidung zu sein.

- Beispiele: `obdIsPluggedIn`, GPS-Fix, SOC, tire pressure, DTC code raw
- Signale werden von Health-/Connectivity-Services **interpretiert**, nicht direkt in UI-Schweregrade übersetzt (außer dokumentierte Adapter)

### 9.4 observation

Eine **Observation** ist ein **vom System oder Operator erfasster Beobachtungssatz** (Complaint, Schadensverdacht, Inspektionsnotiz), der noch **kein bestätigtes Health Finding** sein muss.

- Observations können Tasks/Service Cases auslösen
- **Abgrenzung:** Observation ≠ bestätigte `warning` ≠ `block`

### 9.5 technical state

Der **Technical State** beschreibt den **technisch-diagnostischen Gesamtzustand** eines Fahrzeugs für Miet- und Wartungsentscheidungen.

- Umfasst: Rental Health Module-States, `rental_blocked`, Connectivity/Telemetry-Qualität, Data-Coverage
- Kanonische Aggregation: Rental Health + Runtime Builder
- **Nicht** identisch mit kommerziellem Buchungsstatus

### 9.6 rental readiness

**Rental Readiness** („Mietbereitschaft“, „Bereitschaft“) ist die **operative Eignung zur Ausgabe/Übergabe**, abgeleitet aus Technical State, Buchungskontext und dokumentierten Gates.

- Kanonisch: `deriveIsReadyForRenting` / `vehicleRuntimeStateBuilder.rentalReadiness`
- Oberflächen: Dashboard-Slice „Bereitschaft“, Fleet Command Tab „Bereit“, Booking Preflight
- **Fail-closed:** fehlende Datenlage → nicht „bereit“ ohne explizite Policy

### 9.7 commercial availability

**Commercial Availability** ist der **buchungs- und kalenderbezogene Verfügbarkeitsstatus** (Available, Reserved, Rented, Maintenance, …).

- Kanonisch: `deriveFleetStatusContext` / `selectOperationalStatus`
- **Abgrenzung:** Ein Fahrzeug kann commercial „Available“ und rental readiness „nicht bereit“ gleichzeitig sein — das ist ein Konsistenz-**Finding**, kein Widerspruch per Definition, sofern UI es klar trennt

### 9.8 telemetry state

**Telemetry State** beschreibt **Erreichbarkeit und Frische** der Telematik (online, stale, offline, unknown) inkl. Device-Connection-Episoden.

- Kanonisch: Connectivity Runtime / `telemetryFreshness`
- **Offline** bedeutet nicht automatisch „nicht verfügbar“ — aber **Offline + „Verfügbar“ ohne Hinweis** ist ein typisches Symptom (§10)

### 9.9 block

Ein **Block** ist eine **erzwungene operative Sperre** (technisch oder prozessual), die Ausgabe, Buchung oder Übergabe verhindert oder einschränkt.

- **Technische Blockade:** `rental_blocked` / Booking Eligibility Gatekeeper
- **Prozessual:** offene Service Cases mit `blocksRental` (wenn Policy aktiv — Zielarchitektur prüfen)
- **Abgrenzung:** Warning ohne Block ≠ Block ohne sichtbare Warning (Finding)

### 9.10 notification

Eine **Notification** ist ein **zugestelltes oder ausstehendes Benachrichtigungsobjekt** (In-App, E-Mail, Push, WhatsApp) — **Transport**, nicht kanonische Warnlogik.

- Notifications müssen aus SSOT-Wahrheit **abgeleitet** werden, nicht umgekehrt
- Duplikate/Dedupe über `semanticKey` / Operational Issues

### 9.11 task

Ein **Task** (`OrgTask`) ist ein **operatives Arbeitsobjekt** zur Abarbeitung (Dokument, Inspektion, Partner, …).

- Tasks **besitzen nicht** die Health-Wahrheit
- Tasks können aus Findings/Warnings entstehen, dürfen aber Severity nicht überschreiben
- Task-Counts in KPIs ≠ Warning-Counts ohne dokumentierte Mapping-Regel

---

## 10. Bekannte visuelle Ausgangssymptome

Diese Symptome sind **Ausgangslage** des Audits (operatorisch beobachtet / aus Vor-Audits übernommen). Jede Erklärung muss in Folge-Prompts **belegt** werden.

| ID | Symptom | Audit-Hypothese (vor Verifikation) |
|----|---------|-----------------------------------|
| **SYM-01** | Unterschiedliche Counts zwischen **Fleet Command**, **Bereitschaft** (Dashboard) und **Zustand & Service** | Parallele Aggregatoren (`runtimeSliceConsistency` vs. FHS View Model vs. Rental Health KPIs) |
| **SYM-02** | Fahrzeuge gleichzeitig „Verfügbar“, „Nicht bereit“, „Warnung“ und „Technisch prüfen“ | Vermischung von `commercial availability`, `rental readiness`, Health-Severity und Telemetry ohne klare Hierarchie |
| **SYM-03** | **Offline**-Fahrzeuge mit verfügbarem Status | Connectivity-State nicht in Commercial-Availability-Selector eingebunden; oder stale Cache |
| **SYM-04** | „Technisch unauffällig“-Fahrzeuganzahl weicht zwischen Ansichten ab | Unterschiedliche Module-Thresholds / `unknown` vs. `ok` / fehlende Battery-Publikation |
| **SYM-05** | **„Critical“-Zähler** passt nicht zur sichtbaren Warnschwere | `operationalHealthModuleSeverity` vs. Fleet Command `canonicalTabCounts` vs. Critical Drawer Filter |

**Status:** SYM-01–SYM-05 = **HYPOTHESIS** bis Evidence in `evidence/` und `queries/` vorliegt.

---

## 11. Exit-Kriterien für Production Readiness

Der Audit gilt als **READY** nur wenn **alle** Kriterien erfüllt sind:

| # | Kriterium |
|---|-----------|
| E1 | **SSOT-Matrix** für alle Dimensionen in §3.2 verifiziert; keine unbelegten Parallelwahrheiten in P0/P1 offen |
| E2 | **SYM-01–SYM-05** erklärt (behoben oder als akzeptierte, dokumentierte Semantik mit UI-Klarstellung) |
| E3 | **Cross-Surface-Consistency-Test** — dieselbe `organizationId`-Stichprobe liefert konsistente Counts und Status pro `vehicleId` |
| E4 | **Mandantenisolation** — keine Query/Route ohne `organizationId`-Filter in warnrelevanten Pfaden (P0) |
| E5 | **Fail-closed** — API/Worker-Fehler erzeugen `UNKNOWN`/`DEGRADED`, nie stilles „grün“ |
| E6 | **Booking Gate** — technisch blockierte Fahrzeuge nicht buchbar (E2E + API-Nachweis) |
| E7 | **Telemetry/Offline** — sichtbare Kennzeichnung wenn Commercial Available aber Telemetry offline/stale |
| E8 | **Critical-Severity** — einheitliche Regel über Fleet Command, Drawer, Zustand & Service, Vehicle Detail |
| E9 | **Regression-Tests** — bestehende Suites grün + audit-spezifische Consistency-Tests |
| E10 | **Remediation-Tracker** — alle P0/P1 mit Verifikationsnachweis geschlossen oder explizit waived |
| E11 | **VPS-Parität** — deployter Commit ≤ dokumentierte Remediation oder Drift erklärt |
| E12 | **Acceptance-Protokoll** in `acceptance/` signiert (Pass/Pass with Conditions/Fail) |

**Verdict-Werte:** `READY` | `READY_WITH_CONDITIONS` | `NOT_READY`

---

## 12. Git-Ausgangszustand (Prompt 1)

Erfasst am **2026-07-25** (UTC), Workspace `/workspace`:

| Feld | Wert |
|------|------|
| **Branch (Start)** | `main` |
| **Arbeitsbranch (Charter)** | `cursor/vehicle-warnings-audit-charter-c960` |
| **Commit** | `1d0f2caebe56aa1ecd23295aa33d20e953daa95d` |
| **Commit-Message** | `fix(iam): restore processing_status column map for IamAuditOutbox` |
| **Uncommitted changes** | **Keine** (working tree clean zum Erfassungszeitpunkt) |
| **Detached HEAD beim Agent-Start** | Ja (`HEAD detached at 1d0f2cae…`) — Charter-Branch von `main` erstellt |
| **Produktionsänderungen** | **Keine** |

---

## 13. Relevante vorhandene Audit- und Architektur-Dokumente

Diese Dokumente sind **Vorarbeit** und müssen in Folge-Prompts referenziert oder aktualisiert werden — nicht widersprüchlich dupliziert.

### 13.1 Direkt relevant (Vehicle State, Health, Warnings, Counts)

| Dokument | Relevanz |
|----------|----------|
| `docs/operational-issue-normalization.md` | Kanonische Operational-Issue-Taxonomie, Visibility, Source-Priority |
| `docs/audits/vehicle-operational-state-v2-final-audit.md` | Rental Fleet Pipeline SSOT, R-01–R-08 Remediation |
| `docs/audits/fleet-health-service-production-reality.md` | Zustand & Service Produktionsrealität |
| `docs/audits/fleet-health-service-post-remediation-readiness.md` | FHS Nach-Remediation |
| `docs/audits/fleet-health-service-workflow-ux-test-matrix.md` | UX/Test-Matrix FHS |
| `docs/architecture/fleet-health-service-domain-boundaries.md` | Normative Schichten: Rental Health → Tasks → Runtime → Booking Gate |
| `frontend/src/rental/components/fleet-health-service/FLEET_HEALTH_SERVICE_CONTRACT.md` | UI-Fachvertrag Zustand & Service |
| `docs/implementation/fleet-health-service-callsite-baseline.md` | Callsite-Inventur |
| `docs/implementation/fleet-health-service-remediation-tracker.md` | Remediation-Tracker FHS |
| `docs/audits/fleet-operational-derivation-cleanup-p28.md` | Operative Ableitungs-Cleanup |

### 13.2 Connectivity & Telemetry (Warnsymptome Offline/Verfügbar)

| Dokument | Relevanz |
|----------|----------|
| `docs/audits/fleet-connectivity-production-readiness-2026-07.md` | Connectivity SSOT, NOT_READY Verdict, Cross-Surface |
| `architecture/FLEET_CONNECTIVITY_RUNTIME_DOMAIN_2026-07-19.md` | Runtime-Domain Connectivity |
| `architecture/FLEET_CONNECTIVITY_CONSUMER_MIGRATION_2026-07-19.md` | Consumer-Migration |

### 13.3 Health-Module (Warning Sources)

| Dokument | Relevanz |
|----------|----------|
| `docs/audits/brake-health-production-readiness-2026-07.md` | Brake Health |
| `docs/audits/battery-v2-implementation-inventory.md` | Battery V2 |
| `docs/architecture/battery-readiness-policy.md` | Battery Readiness Policy |
| `docs/architecture/fleet-health-service-readiness-alerts-slo.md` | SLOs/Alerts FHS |

### 13.4 Noch nicht vorhanden (wird durch diesen Audit angelegt)

| Pfad | Status |
|------|--------|
| `docs/audits/vehicle-warnings/` | **Neu** (Prompt 1) |
| Vorherige `vehicle-warnings-*` Audits | **Keine** im Repository gefunden |

---

## 14. Prompt-Roadmap (Überblick)

| Prompt | Fokus (geplant) |
|--------|-----------------|
| **1** | Charter, Regeln, Git-Baseline ← **dieses Dokument** |
| 2–26 | Code-Inventur, SSOT-Matrix, Cross-Surface-Vergleich, Queries, Runtime, Findings, Acceptance, ggf. Remediation-Plan |

Einzelheiten der Prompts 2–26 folgen den verbindlichen Regeln in §2, §5, §7 und §8.

---

## 15. Bestätigung Prompt 1

| Prüfpunkt | Status |
|-----------|--------|
| Produktionsdaten verändert | **Nein** |
| Migrationen ausgeführt | **Nein** |
| Queues geleert | **Nein** |
| Warnungen geschlossen/gelöscht | **Nein** |
| Dienste neu gestartet | **Nein** |
| Secrets in Dokumentation | **Nein** |
| Modus | **Analyse / Dokumentation only** |

---

*Ende Audit-Charter — Prompt 1 von 26*
