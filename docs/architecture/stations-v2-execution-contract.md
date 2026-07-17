# Stations V2 — Verbindlicher Ausführungsvertrag

**Version:** 1.0  
**Date:** 2026-07-17  
**Status:** **Normativ und verbindlich** für alle Prompts **2–78** der Stations-V2-Umsetzung  
**Repository-Git-Commit (Erstellung):** wird beim Abschluss von Prompt 1 dokumentiert  
**Geltungsbereich:** SynqDrive-Repository — Stations-Modul und alle in den jeweiligen Prompts genannten Abhängigkeiten

**Basis-Audits (Ist-Zustand):**

- [`../audits/stations-production-reality.md`](../audits/stations-production-reality.md) (Audit 1 — Production Reality)
- [`../audits/stations-workflow-ux-test-matrix.md`](../audits/stations-workflow-ux-test-matrix.md) (Audit 2 — Workflow/UX-Testmatrix)

---

## Inhaltsverzeichnis

| # | Abschnitt |
|---|-----------|
| 0 | Zweck und Geltung |
| 1 | Vor jeder Änderung (Pre-Flight) |
| 2 | Änderungsregeln |
| 3 | Qualitätsanforderungen |
| 4 | Git-Workflow |
| 5 | Fachliche Schutzregeln (Stations-Domäne) |
| 6 | Abschlussbericht (Pflicht pro Prompt) |
| 7 | Verweise |

---

## 0. Zweck und Geltung

Dieses Dokument ist der **verbindliche Ausführungsvertrag** für die schrittweise Umsetzung von **Stations V2** in 78 Prompts. Es regelt **wie** gearbeitet wird — nicht **was** in jedem einzelnen Prompt implementiert wird (das steht in den jeweiligen Prompt-Beschreibungen).

**Ziele des Vertrags:**

- Reproduzierbare, sichere Inkremente ohne Datenverlust oder Architektur-Regression
- Strikte Trennung der Stations-Semantik (`home` / `current` / `expected`)
- Keine unbeabsichtigten Nebenwirkungen auf Produktion, laufende Prozesse oder fremde Arbeitsstände
- Nachvollziehbare Git-Historie (ein logischer Commit pro Prompt)

**Nicht Gegenstand dieses Vertrags:**

- Deployment auf die Produktions-VPS (nur auf ausdrückliche Anforderung)
- Automatische Aktivierung von Geofence-Automatisierung (explizit ausgeschlossen, siehe §5)
- Hard Delete von Stationen (explizit ausgeschlossen, siehe §5)

---

## 1. Vor jeder Änderung (Pre-Flight)

Jeder Prompt **2–78** beginnt mit denselben Pre-Flight-Schritten. **Keine Code- oder Schema-Änderung**, bevor alle Prüfungen bestanden sind.

### 1.1 Pflichtlektüre

| Quelle | Pflicht |
|--------|---------|
| [`AGENTS.md`](../../AGENTS.md) | Ja — Repository-Layout, lokale Entwicklung, Architekturregeln, Deploy-Hinweise |
| [`.cursor/rules/projektregel.mdc`](../../.cursor/rules/projektregel.mdc) | Ja — SynqDrive-Engineering- und Architekturregeln |
| [`.cursor/rules/Architectur-Updates.mdc`](../../.cursor/rules/Architectur-Updates.mdc) | Ja — Pflicht zu Changes/Architektur-Updates bei relevanten Änderungen |
| [`.cursor/rules/Dimo-Rule.mdc`](../../.cursor/rules/Dimo-Rule.mdc) | Ja, **wenn** der Prompt DIMO/Telemetrie/Segments berührt |
| [`.cursor/rules/Figma-rule.mdc`](../../.cursor/rules/Figma-rule.mdc) | Ja, **wenn** der Prompt UI/UX/Design berührt |
| Dieser Vertrag | Ja — immer |
| Jeweiliger Prompt-Text | Ja — Scope und Akzeptanzkriterien |

### 1.2 Git-Pre-Flight

```bash
git status --short
git branch --show-current
git rev-parse HEAD
```

**Sofort stoppen und berichten**, wenn mindestens eine Bedingung zutrifft:

| Bedingung | Aktion |
|-----------|--------|
| Uncommittete Änderungen an Dateien **außerhalb** des Prompt-Scopes | Stoppen — nicht `stash`, nicht `reset`, nicht überschreiben |
| Falscher Branch (nicht `main`, sofern der Prompt nichts anderes vorschreibt) | Stoppen — Branch nicht wechseln ohne explizite Anweisung |
| Merge-Konflikte oder unaufgelöste Konfliktmarker | Stoppen |
| Detached HEAD ohne Prompt-Freigabe | Stoppen |

**Verboten (immer):**

- `git reset` (hard/soft/mixed)
- `git clean`
- `git stash` (eigene oder fremde Änderungen)
- Fremde oder unbeabsichtigte Änderungen überschreiben oder verwerfen

**Nur bei sauberem `main`:**

```bash
git fetch origin main
git pull --ff-only origin main
```

- Kein `pull --rebase` ohne explizite Anweisung
- Kein Force-Push

### 1.3 Baseline dokumentieren

Zu Beginn jedes Prompts im Abschlussbericht festhalten:

| Feld | Beispiel |
|------|----------|
| Branch | `main` |
| Baseline-Commit (`HEAD` vor Änderungen) | `c390ebda…` |
| Prompt-Nummer | z. B. `Prompt 12/78` |
| Scope (Dateien/Module laut Prompt) | z. B. `backend/src/modules/stations/…` |

---

## 2. Änderungsregeln

### 2.1 Scope-Disziplin

- **Nur** Dateien ändern, die im jeweiligen Prompt explizit genannt sind oder unmittelbar daraus folgen (z. B. Testdateien zum geänderten Modul).
- **Keine** unrelated Refactors, Format-Sweeps, Umbenennungen oder „Aufräumen“ außerhalb des Scopes.
- Bestehende Module **erweitern und refaktorieren**, nicht parallel neu bauen (vgl. `projektregel.mdc`).

### 2.2 Sicherheit und Daten

| Regel | Detail |
|-------|--------|
| Keine Secrets | Nicht loggen, nicht committen (`.env`, API-Keys, Tokens, `DATABASE_URL`) |
| Keine Produktionsdaten verändern | Keine manuellen SQL/DML auf Prod-DB; keine Seed-Skripte gegen Prod |
| Additiv bevorzugen | Neue Spalten/Endpoints/Flags statt Breaking Changes |
| Rückwärtskompatibel | Bestehende API-Verbraucher und UI-Pfade dürfen nicht unangekündigt brechen |

### 2.3 Laufzeit und Infrastruktur

| Regel | Detail |
|-------|--------|
| Keine Service-Neustarts | PM2-Prozesse, API-Server, Worker **nicht** neu starten |
| Kein Deployment | VPS-Deploy nur auf **ausdrückliche** Anforderung (vgl. `AGENTS.md`, Skill `vps-deploy`) |
| Keine Docker-Annahmen | Nicht voraussetzen, dass Docker/Compose läuft; `infra:up` nicht blind ausführen |
| Keine Prod-SSH-Mutation | Read-only-Prod-Audits nur wenn im Prompt erlaubt; keine schreibenden Ops |

### 2.4 Architektur-Dokumentation

Nach **jeder meaningful implementation change** (vgl. `Architectur-Updates.mdc`):

- Eintrag in SynqDrive Code → **Changes** (`frontend/src/master/components/ChangesView.tsx`)
- Bei Architektur-/Signalfluss-/Routing-Änderungen zusätzlich **Architektur** (`frontend/src/master/components/ArchitekturView.tsx`)

Ausnahme: Reine Dokumentations-Prompts ohne Codeänderung — nur wenn der Prompt es verlangt.

---

## 3. Qualitätsanforderungen

### 3.1 Tests

- **Relevante Tests ergänzen oder anpassen** für geändertes Verhalten.
- Bestehende Test-Patterns des betroffenen Workspaces nutzen (Jest/Vitest).
- Keine trivialen Tests, die nur Implementation details spiegeln.

### 3.2 Workspace-Checks (Pflicht vor Commit)

Im **betroffenen** Workspace ausführen:

| Workspace | Typischer Befehl |
|-----------|------------------|
| `backend/` | `npm run build` (oder projektspezifischer Typecheck), `npm test` für betroffene Suites, `npm run lint` falls im Scope |
| `frontend/` | `npm run build`, `npm test` für betroffene Suites, `npm run lint` falls im Scope |

Mindestens: **Typecheck/Build erfolgreich** für alle geänderten Packages.

### 3.3 Prisma (bei Schemaänderungen)

```bash
cd backend && npx prisma format
cd backend && npx prisma validate
```

Zusätzlich:

- Jede neue Migration auf **destruktives SQL** prüfen (`DROP`, `TRUNCATE`, irreversible `ALTER`, Datenmigration ohne Rollback-Plan).
- Destruktive Migrationen **nur** mit expliziter Prompt-Freigabe und dokumentiertem Rollback.
- Additive, nullable Spalten und Default-Werte bevorzugen.

### 3.4 DIMO-bezogene Änderungen

Wenn der Prompt DIMO berührt: **DIMO MCP** zur Verifikation von API-Shape, Auth und Segment-Architektur nutzen (vgl. `Dimo-Rule.mdc`). Keine erfundenen Fallbacks, wenn ein DIMO-Integrationspfad existiert.

### 3.5 UI-Änderungen

Wenn der Prompt UI berührt: **Figma MCP** als visuelle Quelle nutzen; funktionale Code-Only-Elemente beibehalten und visuell harmonisieren (vgl. `Figma-rule.mdc`).

---

## 4. Git-Workflow

### 4.1 Staging

- **Nur beabsichtigte Dateien** stagen (`git add <pfad>` — kein blindes `git add .`).
- Keine temporären Dateien, `.env`, Credentials oder Audit-SQL-Dumps committen.

### 4.2 Commit

- **Ein logischer Commit pro Prompt** mit präziser Message, z. B.  
  `feat(stations-v2): prompt 12 — enforce station scope on list endpoint`
- Message beschreibt **was** und **warum** (nicht nur „fix“).

### 4.3 Push

- Nach erfolgreichen Checks: `git push origin main` — **sofern** der Prompt Push erlaubt und Pre-Flight sauber war.
- Bei Push-Fehler: bis zu 4 Retries mit exponentiellem Backoff (4s, 8s, 16s, 32s).
- Kein Force-Push auf `main`.

### 4.4 Feature-Branches

- Nur wenn der Prompt oder Cloud-Agent-Anweisungen es verlangen.
- Branch-Namen gemäß Cloud-Agent-Policy: `cursor/<beschreibung>-c2c2`.

---

## 5. Fachliche Schutzregeln (Stations-Domäne)

Diese Regeln sind **nicht verhandelbar** über Prompts 2–78 hinweg. Verstöße gelten als Blocker.

### 5.1 Semantik der Stations-Beziehungen

| Feld | Bedeutung | Änderungsprinzip |
|------|-----------|------------------|
| `homeStationId` | **Organisatorische Heimat** — Stammdaten-Zuordnung, Planung, KPI-Heimatflotte | Nur über explizite „Home“- oder Stammdaten-Operationen |
| `currentStationId` | **Bestätigter physischer Standort** — wo das Fahrzeug nachweislich ist (Handover, bestätigte Zuweisung) | Nur über explizite „Current“-/Standort-Operationen |
| `expectedStationId` | **Erwarteter Standort** aus Transfer-, Buchungs- oder Logistik-Kontext | Nur über explizite Erwartungs-/Transfer-Operationen |

**Invariante S1:** Keine dieser drei Beziehungen darf **still** gemeinsam mit einer anderen verändert werden.

Beispiele verbotener Kopplung (Ist-Probleme aus Audit 1/2):

- `assignVehicle` mit Target `home` setzt heute **sowohl** `homeStationId` **als auch** `currentStationId` — V2 muss das entkoppeln, nicht perpetuieren.
- `setStationVehicles` (SET-Semantik) darf nicht implizit `expectedStationId` ungereinigt lassen oder mitschreiben, ohne explizite Regel.

### 5.2 Keine vollständige SET-Operation aus partiellen Frontend-Daten

- UI-Listen (z. B. mit Pagination/Limit 500) dürfen **nicht** als vollständige Flottenwahrheit für `PUT …/vehicles` dienen.
- Backend-SET-Endpoints erfordern entweder vollständige Server-seitige Validierung oder werden durch explizite Einzel-Attach/Detach-Operationen ersetzt.
- **Invariante S2:** Partielle Client-Payload → kein stillschweigendes Detach nicht gelisteter Fahrzeuge.

### 5.3 Geofence — nicht automatisch operativ schalten

- Geofence-Konfiguration (Radius, Koordinaten, UI-Badge) darf erweitert werden.
- **Automatische** Aktualisierung von `currentStationId` aus GPS/Telemetrie/Geofence ist **nicht** Teil der frühen V2-Prompts, bis ein dedizierter Prompt mit Rollout-Flag und Abnahme existiert.
- **Invariante S3:** Kein Hintergrund-Job und kein Webhook darf Geofence-Logik produktiv aktivieren, ohne expliziten Rollout-Prompt.

### 5.4 Kein Hard Delete von Stationen

- Stationen werden **archiviert** (`archived` / Soft-Delete-Pattern), nicht physisch gelöscht.
- Lösch-APIs, die `DELETE` auf `Station`-Rows ausführen, sind **nicht** Zielbild — bestehende Pfade nur absichern/deprecaten, nicht ausweiten.
- **Invariante S4:** `prisma.station.delete` bzw. gleichwertiges Hard-Delete ist für Produktionscode ausgeschlossen.

### 5.5 Weitere fachliche Leitplanken (aus Audits)

| Thema | Regel bis expliziter Prompt |
|-------|----------------------------|
| RBAC `stations` read/write | Nicht als „fertig“ markieren ohne `PermissionsGuard`-Wiring |
| `StationScopeGuard` | Nicht aktivieren ohne JWT-`stationScope` und Tests |
| Opening Hours / Holidays / Capacity | Speichern und anzeigen erlaubt; **durchsetzende** Validierung nur mit eigenem Prompt |
| `expectedStationId` bei Detach/Archiv | Muss konsistent bereinigt werden, sobald Entkopplungs-Prompt läuft |
| Tenant-Isolation | Alle Queries `organizationId`-scoped — keine Hardcodes |

---

## 6. Abschlussbericht (Pflicht pro Prompt)

Jeder Prompt **2–78** endet mit einem strukturierten Bericht:

```markdown
## Stations V2 — Abschluss Prompt N/78

### Pre-Flight
- Branch: …
- Baseline-Commit: …
- Working tree vor Start: sauber | unsauber (Details)

### Änderungen
- Dateien: …
- Kurzbeschreibung: …

### Tests & Checks
- [ ] Backend build/typecheck
- [ ] Frontend build/typecheck
- [ ] Relevante Tests (Liste)
- [ ] Prisma format/validate (falls Schema)
- [ ] Migration destruktiv geprüft (falls Migration)

### Git
- Commit: `<hash>` — `<message>`
- Push: erfolgreich | fehlgeschlagen | nicht erlaubt

### Domänen-Compliance (§5)
- home/current/expected getrennt behandelt: ja/nein/n.a.
- Kein SET aus partiellen UI-Daten: ja/nein/n.a.
- Geofence nicht auto-aktiviert: ja/n.a.
- Kein Hard Delete: ja/n.a.

### Changes / Architektur
- ChangesView aktualisiert: ja/nein
- ArchitekturView aktualisiert: ja/nein

### Blocker / Follow-ups
- …
```

---

## 7. Verweise

| Dokument | Zweck |
|----------|-------|
| [`AGENTS.md`](../../AGENTS.md) | Agent- und Deploy-Anleitung |
| [`../audits/stations-production-reality.md`](../audits/stations-production-reality.md) | Ist-Zustand Production + Code-Inventar |
| [`../audits/stations-workflow-ux-test-matrix.md`](../audits/stations-workflow-ux-test-matrix.md) | Workflow-/UX-Testmatrix |
| [`task-domain-v2.md`](./task-domain-v2.md) | Beispiel für normative Domänenspezifikation |
| [`driving-intelligence-v2-migration-rollout-plan.md`](./driving-intelligence-v2-migration-rollout-plan.md) | Beispiel für Migrations-/Rollout-Vertrag |

---

**Ende des Ausführungsvertrags.** Prompts 2–78 sind nur gültig, wenn sie diesen Vertrag einhalten.
