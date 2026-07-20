# Fleet „Zustand & Service“ — Verbindlicher Remediation-Ausführungsvertrag

**Version:** 1.0  
**Date:** 2026-07-20  
**Status:** **Normativ und verbindlich** für alle Prompts **2–66** der Fleet-Health-Service-Remediation  
**Repository-Git-Commit (Erstellung):** `297dfe764fda03432f9abc142ff1800c9b648168` (Prompt 1/66)  
**Geltungsbereich:** SynqDrive-Repository — Fleet-Tab „Zustand & Service“ (FHS) und in den jeweiligen Prompts genannten Abhängigkeiten

**Basis-Audits (Ist-Zustand):**

- [`../audits/fleet-health-service-production-reality.md`](../audits/fleet-health-service-production-reality.md) (Audit 1 — Production Reality)
- [`../audits/fleet-health-service-workflow-ux-test-matrix.md`](../audits/fleet-health-service-workflow-ux-test-matrix.md) (Audit 2 — Workflow/UX-Testmatrix)

**Tracker:** [`fleet-health-service-remediation-tracker.md`](./fleet-health-service-remediation-tracker.md)

---

## Inhaltsverzeichnis

| # | Abschnitt |
|---|-----------|
| 0 | Zweck und Geltung |
| 1 | Vor jeder Änderung (Pre-Flight) |
| 2 | Änderungsregeln |
| 3 | Qualitätsanforderungen |
| 4 | Git-Workflow |
| 5 | Fachliche Schutzregeln (FHS-Domäne) |
| 6 | Phasenplan (66 Prompts — Übersicht) |
| 7 | Abschlussbericht (Pflicht pro Prompt) |
| 8 | Verweise |

---

## 0. Zweck und Geltung

Dieses Dokument ist der **verbindliche Ausführungsvertrag** für die schrittweise Remediation des Fleet-Tabs **„Zustand & Service“** in **66 Prompts**. Es regelt **wie** gearbeitet wird — nicht **was** in jedem einzelnen Prompt implementiert wird (Details im [Tracker](./fleet-health-service-remediation-tracker.md)).

**Ziele des Vertrags:**

- Reproduzierbare, sichere Inkremente ohne Architektur-Regression
- Strikte Trennung: Rental Health (Diagnose) · Task (Arbeit) · Service Case (Vorgang) · Runtime State (Mietbereitschaft)
- Keine unbeabsichtigten Nebenwirkungen auf Produktion, laufende Prozesse oder fremde Arbeitsstände
- Nachvollziehbare Git-Historie (ein logischer Commit pro Prompt)

**Nicht Gegenstand dieses Vertrags:**

- Deployment auf die Produktions-VPS (nur auf ausdrückliche Anforderung)
- Automatische Änderung an DIMO-Trip-Segmentierung oder Live-Trip-FSM
- Vermischung von `ServiceCase.blocksRental` in Rental Health (gehört in Runtime State)

### Repository- vs. Deployment-Baseline

| Quelle | Commit / Stand | Hinweis |
|--------|----------------|---------|
| **Repository-Baseline (Tracker-Erstellung)** | `7192fb4e4e8ad854b3b3415b909513a08b669f90` (`main`) | Source of truth für Code-Änderungen |
| **Audit 1 Repository-Commit** | `ffcb3e0c…` / später `8d2780ac…` | Audit-Zeitpunkt; kann älter als `main` sein |
| **Audit 2 Repository-Commit** | `8d2780ac32db22332f5d4530525e738844373208` | Testmatrix-Baseline |
| **Deployter VPS-Commit (Audit 1)** | `ac856881300f9f44f0f5e2eb12a117145f76d70c` | Release `20260718004214_v4994` |

**Wichtig:** Der **deployte Stand kann vom Repository und von den Audits abweichen**. Es wird **nicht** angenommen, dass `main` bereits deployed ist. Produktionsbefunde aus den Audits sind **zeitpunktbezogen**; vor Prod-Verifikation erneut prüfen.

---

## 1. Vor jeder Änderung (Pre-Flight)

Jeder Prompt **2–66** beginnt mit denselben Pre-Flight-Schritten. **Keine Code- oder Schema-Änderung**, bevor alle Prüfungen bestanden sind (Ausnahme: reine Dokumentations-Prompts Phase 0).

### 1.1 Pflichtlektüre

| Quelle | Pflicht |
|--------|---------|
| [`AGENTS.md`](../../AGENTS.md) | Ja |
| [`.cursor/rules/projektregel.mdc`](../../.cursor/rules/projektregel.mdc) | Ja |
| [`.cursor/rules/Architectur-Updates.mdc`](../../.cursor/rules/Architectur-Updates.mdc) | Ja, bei Code-Änderungen |
| [`.cursor/rules/Dimo-Rule.mdc`](../../.cursor/rules/Dimo-Rule.mdc) | Ja, wenn DIMO/Telemetrie berührt |
| [`.cursor/rules/Figma-rule.mdc`](../../.cursor/rules/Figma-rule.mdc) | Ja, wenn UI/UX berührt |
| Dieser Vertrag | Ja — immer |
| [Tracker](./fleet-health-service-remediation-tracker.md) | Ja — Status, Abhängigkeiten, Akzeptanz |
| Jeweiliger Prompt-Text | Ja |

### 1.2 Git-Pre-Flight

```bash
git status --short
git branch --show-current
git rev-parse HEAD
```

**Sofort stoppen**, wenn: uncommittete Änderungen außerhalb des Scopes, falscher Branch, Merge-Konflikte, Detached HEAD ohne Freigabe.

**Verboten:** `git reset`, `git clean`, `git stash`, fremde Änderungen überschreiben.

**Nur bei sauberem `main`:**

```bash
git fetch origin main
git pull --ff-only origin main
```

### 1.3 Baseline dokumentieren

| Feld | Beispiel |
|------|----------|
| Branch | `main` |
| Baseline-Commit | `7192fb4e…` |
| Prompt-Nummer | `Prompt 12/66` |
| Scope | `frontend/src/rental/components/fleet-health-service/…` |

---

## 2. Änderungsregeln

### 2.1 Scope-Disziplin

- Nur Dateien ändern, die im Prompt genannt sind oder unmittelbar folgen (Tests, Types).
- Keine unrelated Refactors.
- Bestehende Module erweitern, nicht parallel neu bauen.

### 2.2 Sicherheit und Daten

| Regel | Detail |
|-------|--------|
| Keine Secrets | Nicht loggen, nicht committen |
| Keine Produktionsdaten verändern | Kein DML auf Prod-DB |
| Additiv bevorzugen | Neue Endpoints/Flags statt Breaking Changes |
| Tenant-Isolation | Striktes `organizationId`-Scoping |

### 2.3 Laufzeit und Infrastruktur

| Regel | Detail |
|-------|--------|
| Keine Service-Neustarts | PM2/API/Worker nicht neu starten (außer Prompt verlangt Deploy) |
| Kein Deployment | VPS nur auf ausdrückliche Anforderung |
| Keine Prod-SSH-Mutation | Read-only-Audits nur wenn erlaubt |

### 2.4 Architektur-Dokumentation

Bei Code-Änderungen: Eintrag in **Changes** und ggf. **Architektur** (`ChangesView.tsx`, `ArchitekturView.tsx`).

---

## 3. Qualitätsanforderungen

### 3.1 Tests

- Relevante Tests ergänzen oder anpassen.
- Bestehende Patterns (Jest/Vitest) nutzen.
- FHS-relevante Suites siehe [`fleet-health-service-callsite-baseline.md`](./fleet-health-service-callsite-baseline.md) §10.

### 3.2 Workspace-Checks

| Workspace | Mindestanforderung |
|-----------|-------------------|
| `backend/` | Build/Typecheck + betroffene `npm test` |
| `frontend/` | Build/Typecheck + betroffene `npm test` |

### 3.3 Prisma (bei Schemaänderungen)

`npx prisma format`, `npx prisma validate`; destruktive Migrationen nur mit expliziter Freigabe und Rollback-Plan.

---

## 4. Git-Workflow

- **Ein logischer Commit pro Prompt**, z. B. `fix(fleet-health-service): prompt 11 — tighten health-task duplicate match`
- Nur beabsichtigte Dateien stagen.
- Nach Checks: `git push origin main` sofern erlaubt.
- Tracker-Status, Commit-Hash und Testnachweis nach Abschluss aktualisieren.

---

## 5. Fachliche Schutzregeln (FHS-Domäne)

Diese Regeln sind **nicht verhandelbar** über Prompts 2–66 hinweg.

### 5.1 Vier-Schichten-Modell

| Schicht | Kanonische Quelle | Darf nicht ersetzt werden durch |
|---------|-------------------|--------------------------------|
| **Rental Health** | `RentalHealthService` / `healthMap` | Task-Status, Vendor-Waiting, Service-Case-Status |
| **Task** | `OrgTask` / `useServiceCenterData` | Health-`overall_state`, `rental_blocked` |
| **Service Case** | `ServiceCase` API | Task-Liste allein; Rental Health |
| **Runtime State** | `vehicleRuntimeStateBuilder`, `deriveIsReadyForRenting` | Rental Health allein |

### 5.2 Invarianten (aus Audits)

| ID | Invariante |
|----|------------|
| I1 | `unknown` ≠ safe — begrenzte Datenqualität, kein „grün“ |
| I2 | `warning` blockiert Miete **nicht** automatisch |
| I3 | Task `DONE` löst **kein** Health-Finding auf |
| I4 | `ServiceCase.blocksRental` → **Runtime State**, nicht Rental Health |
| I5 | Keine zweite Health-Bewertung in Service/FHS-ViewModel |
| I6 | Health→Task-Brücke nur über `health-task-bridge` — kein Task-Text als Health-Ersatz |
| I7 | Vendor-/Task-/Case-API-Fehler **nicht** still zu leerem Erfolg degradieren (Zielbild) |
| I8 | Per-vehicle Health-Fehler **nicht** als `rental_blocked: false` maskieren (Zielbild) |

### 5.3 Verboten ohne dedizierten Prompt

- Rental Health aus Service-Case-Status ableiten
- Task-Overdue als `rental_blocked` verwenden
- Service Cases nur als Task-Metadaten-Workaround ohne API-Anbindung
- Pagination entfernen, sobald eingeführt
- Hard Delete von Tasks/Cases

---

## 6. Phasenplan (66 Prompts — Übersicht)

Vollständige Zeilen im [Tracker](./fleet-health-service-remediation-tracker.md).

| Phase | Prompts | Schwerpunkt |
|-------|---------|-------------|
| **0 — Planung & Baseline** | 1–6 | Vertrag, Tracker, ADR, Call-Site-Baseline, Testplan, Rollout |
| **1 — P0 Kritisch** | 7–16 | Vendor-Fehler, Service Cases, Health-Degradation, Pagination, Battery V2, Refresh |
| **2 — Service Cases Tiefe** | 17–24 | Termine, Historie, Runtime-Blockade, KPI-Schichten, Tests |
| **3 — Health→Task-Brücke** | 25–30 | `sourceFindingId`, Dedup, Multi-Finding, Bridge-Tests |
| **4 — RBAC** | 31–36 | `tasks.read`/`tasks.write`, Controller-Guards, UI-Gating |
| **5 — Skalierung & API** | 37–44 | Batch Health POST, Chunking, Virtualisierung, Lasttests |
| **6 — Partial Failure & Freshness** | 45–50 | Timestamps, KPI-Fehlerzustände, Focus-Refetch |
| **7 — UX / i18n / a11y** | 51–58 | DE-Strings, Labels, Keyboard, Mobile, IA |
| **8 — Observability** | 59–62 | Metriken, Grafana, SLOs, Runbook |
| **9 — E2E & Abnahme** | 63–66 | Playwright, Gate-Review, Post-Remediation-Audit |

---

## 7. Abschlussbericht (Pflicht pro Prompt)

```markdown
## Fleet Health Service — Abschluss Prompt N/66

### Pre-Flight
- Branch: …
- Baseline-Commit: …
- Working tree: sauber | unsauber

### Änderungen
- Dateien: …
- Kurzbeschreibung: …

### Tests & Checks
- [ ] Backend build/typecheck
- [ ] Frontend build/typecheck
- [ ] Relevante Tests (Liste + Ergebnis)

### Git
- Commit: `<hash>` — `<message>`
- Push: erfolgreich | fehlgeschlagen | nicht erlaubt

### Domänen-Compliance (§5)
- Vier-Schichten eingehalten: ja/nein/n.a.
- Kein silent vendor/health fail: ja/nein/n.a.

### Tracker
- Status auf DONE gesetzt: ja
- Testnachweis eingetragen: ja

### Changes / Architektur
- ChangesView: ja/nein
- ArchitekturView: ja/nein

### Blocker / Follow-ups
- …
```

---

## 8. Verweise

| Dokument | Zweck |
|----------|-------|
| [`fleet-health-service-remediation-tracker.md`](./fleet-health-service-remediation-tracker.md) | Prompt-Status, Abhängigkeiten, Akzeptanz |
| [`fleet-health-service-callsite-baseline.md`](./fleet-health-service-callsite-baseline.md) | Call-Site-Inventur (Prompt 4) |
| [`../audits/fleet-health-service-production-reality.md`](../audits/fleet-health-service-production-reality.md) | Production Reality Audit |
| [`../audits/fleet-health-service-workflow-ux-test-matrix.md`](../audits/fleet-health-service-workflow-ux-test-matrix.md) | Workflow/UX-Matrix (142 Fälle) |
| [`../../frontend/src/rental/components/fleet-health-service/FLEET_HEALTH_SERVICE_CONTRACT.md`](../../frontend/src/rental/components/fleet-health-service/FLEET_HEALTH_SERVICE_CONTRACT.md) | UI-Fachvertrag |

---

**Ende des Ausführungsvertrags.** Prompts 2–66 sind nur gültig, wenn sie diesen Vertrag einhalten.
