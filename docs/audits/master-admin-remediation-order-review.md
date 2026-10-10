# Master-Admin VPS Audit — Phase 1D: Remediation-Reihenfolge-Review

| Feld | Wert |
|------|------|
| **Review ID** | `master-admin-remediation-order-review` |
| **Phase** | **1D** — Analyse der Remediation-Reihenfolge (keine Umsetzung) |
| **Basis** | Phase 1A–1C Audit-Dokumente |
| **Erstellt (UTC)** | `2026-07-26` |
| **Modus** | Read-only — **keine** Änderungen an Audit-Dokumenten oder Production |

---

## 1. Ziel und Prüfumfang

Geprüft wurden **alle dokumentierten Remediation-Schritte** auf Fälle, in denen eine **spätere Maßnahme vor einer notwendigen Sicherungsmaßnahme** ausgeführt werden könnte.

**Schwerpunkte:** Stripe · ClickHouse · Backup · Restore · Migrationen · Unique Constraints · Container Recreation · Volume-Änderungen

**Geprüfte Quellen:**

| Quelle | Abschnitt |
|--------|-----------|
| `master-admin-vps-readonly-findings-2026-07.md` | Empfohlene Umsetzungsreihenfolge, Abhängigkeiten, Cursor-Prompts 1–7, P0-Rollback-Anforderungen |
| `master-admin-vps-readonly-audit-2026-07.md` | Kap. 24 (Backup/DR), Kap. 29.11 (Remediation-Reihenfolge) |
| `master-admin-p0-validation.md` | P0-Mitigationen, TOPO/CH-Backup-Henne-Ei |

**Nicht geändert:** Audit-Dokumente, SynqDrive-Code, Infrastruktur.

---

## 2. Inventar — dokumentierte Remediation-Sequenzen

### 2.1 Findings-Datei — Umsetzungsreihenfolge (9 Schritte)

| # | Maßnahme |
|---|----------|
| 1 | Dokumentation/Runbooks (kein Prod-Touch) |
| 2 | P0 Stripe Env/Webhook/Trial-Sub |
| 3 | P0 CH Ghost-Mounts → CH Backup → Offsite |
| 4 | P0 CH `org_id` + DIMO Unique |
| 5 | P1 Alertmanager + Backup-Alerts |
| 6 | P1 Swagger + Audit-WORM |
| 7 | P1 Battery-V2 + CH-Dedup |
| 8 | P2-Cluster |
| 9 | Tests + Post-Remediation-Audit |

### 2.2 Hauptaudit — Kap. 29.11 (10 Schritte)

| # | Maßnahme |
|---|----------|
| 1 | Sofortmaßnahmen ohne Production-Änderung |
| 2 | P0-Sicherheitskorrekturen (**gebündelt**: CH-`org_id`-Plan, Stripe, Webhook, CH-Backup+Offsite, Ghost-Mounts, `dimo_vehicle_id` Unique) |
| 3 | Tenant-Isolation (CH-Pre-Filter, Waypoint-Backfill, Smokes) |
| 4 | Billing/Subscription (Trial-Sync, Webhook, Reconciliation) |
| 5 | DIMO/Fahrzeugkonsistenz |
| 6 | Worker/Queue Hardening |
| 7 | Observability |
| 8 | UI/UX |
| 9 | Tests inkl. **Staging Restore-Drill** |
| 10 | Post-Remediation-Audit |

### 2.3 Cursor-Prompts (parallel dokumentiert)

| Prompt | Inhalt |
|--------|--------|
| 1 | Stripe Live-Cutover (P0-002/003 + P0-001 Trial) |
| 2 | CH DR & Mounts (TOPO-P0 + BKP-P0) |
| 3 | CH Tenant `org_id` (CH-P0-001) |
| 4 | DIMO Unique + transaktionaler Import |
| 5 | Observability (Alertmanager + Backup-Alerts) |
| 6 | Swagger + Audit |
| 7 | Battery V2 Queue |

### 2.4 Abhängigkeitsgraph (Findings)

```
P0_STRIPE → P1_RECON
P0_CH_MOUNT → P0_CH_BKP → P1_BKP_ALERT
P0_CH_ORG → P1_CH_DEDUP
P0_DIMO → P2_IMPORT (transaktional)
```

| Blocker | Blockiert laut Doku |
|---------|---------------------|
| MA-TOPO-P0-001 | CH-Backup-Job |
| MA-BILL-P0-002/003/001 | Stripe Live-Cutover |

---

## 3. Referenz — sichere Gesamtreihenfolge (Empfehlung, nicht umgesetzt)

Die folgende Reihenfolge erfüllt **alle** dokumentierten Rollback-Anforderungen und löst das Ghost-Mount/Backup-Henne-Ei:

| Phase | Maßnahme | Sicherungsvorbedingung |
|-------|----------|------------------------|
| **0** | Runbooks, Staging-Parität, Restore-Playbooks | — |
| **1a** | Manueller **PG-`pg_dump`** (zusätzlich zu Deploy-Dump) | — |
| **1b** | **CH-Volume-Sicherung** ohne Ghost-Mount (`docker run`/`clickhouse-client BACKUP` auf Volume oder Host-Snapshot `backend_clickhouse_data`) | Vor jedem CH-Recreate |
| **2** | Ghost-Mounts fixen + **Container Recreate** (TOPO-P0) | **1b** abgeschlossen |
| **3** | CH-Backup-Cron + Offsite PG+CH (BKP-P0) | **2** — CH healthy, `/backups`-Mount funktionsfähig |
| **4** | **Staging** CH-Restore-Drill | **3** — mindestens ein verifiziertes Backup |
| **5** | Stripe: Env-Backup → Webhook Secret+Endpoint → Live-Key → `stripe_mode` harmonisieren → Trial-Sync | Env-Backup vor Cutover |
| **6** | CH `org_id`-Migration + Backfill (CH-P0-001) | **3+4** — verifiziertes CH-Backup |
| **7** | PG Duplikat-Scan → Prisma Unique `dimo_vehicle_id` (DIMO-P0) | **1a** — PG-Snapshot |
| **8** | CH-Dedup (P1), transaktionaler DIMO-Import (P2) | **6** — Backup nach `org_id`-Migration |
| **9** | Observability, übrige P1/P2 | Alertmanager vor Backup-Alert-Tests |
| **10** | Prod Restore-Drill + Re-Audit | Nach allen strukturellen Änderungen |

---

## 4. Gefundene Reihenfolge-Probleme

### R-01 — Kap. 29.11 Schritt 2: P0-Maßnahmen ohne interne Reihenfolge

| Feld | Inhalt |
|------|--------|
| **Quelle** | `master-admin-vps-readonly-audit-2026-07.md` Kap. 29.11, Schritt 2 |
| **Betroffene Domänen** | ClickHouse, Backup, Stripe, Migrationen, Unique Constraints, Container Recreation |

**Aktueller Ablauf:** Ein Schritt bündelt parallel: CH-`org_id`-Migration **planen**, Stripe Live/Test, Webhook-Secret, CH-Backup+Offsite, Ghost-Mounts fixen, `dimo_vehicle_id` Unique — ohne feste Reihenfolge.

**Risiko:** **Hoch.** Ausführende könnten z. B. CH-`org_id`-Migration oder DIMO-Unique **vor** CH-Volume-Backup oder Ghost-Mount-Fix starten. Widerspricht Rollback-Anforderungen MA-CH-P0-001 („CH-Migration nur nach Backup“) und MA-TOPO-P0-001 („Backup vor Recreate“).

**Sicherer Ablauf:** Schritt 2 in Unterphasen 1b→2→3→5→6→7 der Referenz-Reihenfolge (§3) zerlegen; nicht als paralleles Bündel kommunizieren.

---

### R-02 — Prompt 2: Container-Recreate und Backup im selben Prompt ohne erzwungene Vorab-Sicherung

| Feld | Inhalt |
|------|--------|
| **Quelle** | Findings Prompt 2; MA-TOPO-P0-001, MA-BKP-P0-001 |
| **Betroffene Domänen** | Container Recreation, Backup, Volume, ClickHouse |

**Aktueller Ablauf:**
```
ClickHouse-Container mit current/shared-Pfaden neu binden,
clickhouse:backup:docker als Cron, Offsite-S3-Sync …
```
Recreate und Backup-Setup stehen **gleichberechtigt** im selben Prompt.

**Risiko:** **Kritisch.** Ghost-Mounts auf gelöschtes Release (`//deleted`, Kap. 6.2). `docker compose up`/Recreate **ohne** vorherige Volume-Sicherung kann bei Fehlkonfiguration zu CH-Ausfall führen; Daten-Volume ist zwar getrennt, aber Recreate-Fehler ohne Backup = kein Rollback-Pfad für ~2,8 GiB Telemetrie. Zusätzlich: `clickhouse:backup:docker` nutzt `Disk('backups')` — der `/backups`-Bind-Mount zeigt **ebenfalls** auf Ghost-Release (Kap. 24.3) → Backup-Job ist **heute nicht ausführbar**, bis Mounts gefixt sind (Henne-Ei).

**Sicherer Ablauf:**
1. CH-Volume `backend_clickhouse_data` **ohne** Container-Recreate sichern (Volume-Snapshot / `BACKUP` via `docker exec` auf internen Pfad).
2. Ghost-Mounts auf `current`/`shared` korrigieren.
3. Container Recreate; Health-Check.
4. Erst dann `clickhouse:backup:docker` + Cron + Offsite.

---

### R-03 — Prompt 1 vor Prompt 2: Stripe-Cutover vor CH-Infrastruktur

| Feld | Inhalt |
|------|--------|
| **Quelle** | Findings Reihenfolge Schritt 2 vor 3; Prompt-Nummerierung 1 vor 2 |
| **Betroffene Domänen** | Stripe, Backup, Deploy |

**Aktueller Ablauf:** Schritt 2 / Prompt 1 (Stripe Live-Cutover inkl. Trial-Sync) kann **vor** Schritt 3 / Prompt 2 (CH-Mounts, Backup, Offsite) ausgeführt werden.

**Risiko:** **Mittel–Hoch.**
- Billing-Gate-Freigabe vor DR-Gate — Live-Subscription/Trial-Sync ohne belastbare CH/PG-Offsite-Backups.
- `vps-deploy-release.sh` für Env-Änderungen: Pre-Deploy-`pg_dump` (Kap. 24.2) sichert PG, **nicht** ClickHouse.
- Live-Stripe-Events nach Key-Wechsel ohne funktionierenden Platform-Webhook (P0-003) → Drift.

**Sicherer Ablauf:** Mindestens Phase **1b–3** (§3) vor Stripe Live-Cutover; oder explizit dokumentieren, dass Stripe in **Test-Modus** bleibt bis DR Phase 3 abgeschlossen.

---

### R-04 — Prompt 1: Interne Stripe-Reihenfolge (Trial vor Webhook/Key)

| Feld | Inhalt |
|------|--------|
| **Quelle** | Findings Prompt 1; MA-BILL-P0-001/002/003 Rollbacks |
| **Betroffene Domänen** | Stripe, Webhooks, Migrationen (DB) |

**Aktueller Ablauf:** Ein Prompt behandelt gemeinsam:
- `STRIPE_SECRET_KEY` harmonisieren (P0-002)
- `STRIPE_WEBHOOK_SECRET` + Endpoint (P0-003)
- TRIALING-Subscription synchronisieren (P0-001)

Keine feste Reihenfolge innerhalb des Prompts.

**Risiko:** **Hoch** bei falscher Ausführungsreihenfolge:

| Falsche Reihenfolge | Risiko |
|---------------------|--------|
| Live-Key **vor** Webhook-Secret/Endpoint | Stripe-Events gehen verloren; `stripe_webhook_events` bleibt 0 |
| Trial-Sub anlegen **vor** Live-Key + Webhook | Subscription in Stripe ohne verifizierten Sync-Pfad; Drift |
| `stripe_mode=LIVE` in PG **vor** `sk_live` in Env | CRITICAL-Drift bleibt oder invertiert |
| Trial-Sync **ohne** vorherigen DB-Snapshot | Rollback MA-BILL-P0-001 nicht möglich |

**Sicherer Ablauf:**
1. `backend.env.bak-*` / manueller Env-Export (Rollback P0-002).
2. Manueller PG-`pg_dump` (Rollback P0-001).
3. Platform-Webhook in Stripe Dashboard registrieren + `STRIPE_WEBHOOK_SECRET` setzen (P0-003).
4. `STRIPE_SECRET_KEY` auf Live (P0-002) + `stripe_mode` harmonisieren.
5. PM2/Deploy-Restart; Webhook-Test (`stripe trigger` Staging).
6. TRIALING-Subscription synchronisieren oder lokal korrigieren (P0-001).
7. Reconciliation-Job; 0 CRITICAL-Drifts.

---

### R-05 — Kap. 29.11 Schritt 2 vs. Schritt 4: Doppelte Stripe-Remediation

| Feld | Inhalt |
|------|--------|
| **Quelle** | Kap. 29.11 Schritte 2 und 4 |
| **Betroffene Domänen** | Stripe |

**Aktueller Ablauf:**
- Schritt 2: „Stripe Live/Test trennen; Webhook-Secret; …“
- Schritt 4: „Trial-Sub mit Stripe synchronisieren; Platform-Webhook registrieren; Reconciliation-Drifts schließen“

**Risiko:** **Mittel.** Schritt 4 kann als **zweite** Stripe-Welle interpretiert werden — Trial-Sync in Schritt 4 **nach** anderen P0-Arbeiten in Schritt 2, aber **ohne** erneute Backup-Pflicht. Wenn Schritt 2 Stripe nur „geplant“ und Schritt 4 ausgeführt wird, fehlt möglicherweise Env-Backup aus Schritt 2.

**Sicherer Ablauf:** Stripe vollständig in **einer** Phase (Referenz Phase 5) mit klarer interner Reihenfolge (R-04); Schritt 4 auf Reconciliation-Validierung **nach** Abschluss reduzieren.

---

### R-06 — Prompt 3 / Schritt 4: CH-`org_id`-Migration ohne explizite Backup-Vorbedingung im Prompt

| Feld | Inhalt |
|------|--------|
| **Quelle** | Findings Prompt 3; Schritt 4; MA-CH-P0-001 Rollback |
| **Betroffene Domänen** | ClickHouse, Migrationen, Backup, Restore |

**Aktueller Ablauf:**
```
org_id auf telemetry_snapshots/state_changes (Migration + Backfill),
Insert-Guard, API Pre-Filter
```
Kein Verweis auf abgeschlossenes CH-Backup oder Restore-Drill.

**Risiko:** **Hoch**, wenn Prompt 3 **vor** Prompt 2 oder ohne verifiziertes Backup ausgeführt wird. Rollback-Anforderung: „CH-Migration nur nach Backup; Rollback = Schema-Release + Restore aus `clickhouse:backup:docker`“. Bei fehlgeschlagenem `ALTER`/Backfill auf 602k+ Rows ohne Backup → Telemetrie-Evidence-Verlust.

**Sicherer Ablauf:**
1. Verifiziertes CH-Backup (Post-Prompt-2).
2. Staging-Migration + Backfill testen (Kap. 29.11 Schritt 9 — sollte **vor** Prod-Migration, nicht nur danach).
3. Prod-Migration mit erneutem Backup unmittelbar davor.
4. Insert-Guard + API Pre-Filter deployen.

---

### R-07 — Schritt 4: CH-`org_id` und DIMO Unique ohne Trennung der Sicherungspfade

| Feld | Inhalt |
|------|--------|
| **Quelle** | Findings Schritt 4; Prompt 3 + 4 |
| **Betroffene Domänen** | ClickHouse, PostgreSQL, Unique Constraints, Migrationen |

**Aktueller Ablauf:** „CH `org_id` + DIMO Unique“ als ein Schritt.

**Risiko:** **Mittel.**
- CH-Migration braucht **CH-Backup** (R-06).
- DIMO Unique braucht **PG-Snapshot + Duplikat-Scan** vor Constraint (MA-DIMO-P0-001 Rollback: „Duplikat-Scan; Datenbereinigung vor Unique“).
- Kombinierter Deploy könnte Prisma-Migrate + CH-`ALTER` in einem Release-Fenster — erhöhtes Rollback-Risiko.

**Sicherer Ablauf:** Zwei getrennte Releases/Phasen (Referenz 6 und 7); zwischenzeitlich jeweils eigene Backup-Sicherung.

---

### R-08 — Prompt 4: Unique Constraint ohne expliziten Duplikat-Scan und PG-Backup

| Feld | Inhalt |
|------|--------|
| **Quelle** | Findings Prompt 4; MA-DIMO-P0-001 |
| **Betroffene Domänen** | Unique Constraints, PostgreSQL, Migrationen |

**Aktueller Ablauf:**
```
Unique Constraint dimo_vehicle_id,
registerFromDimo in $transaction …
```

**Risiko:** **Mittel.** Deploy via `vps-deploy-release.sh` erzeugt Pre-Deploy-`pg_dump` (Kap. 24.2) — **partielle Mitigation**. Aber: kein expliziter Duplikat-Scan vor Migration; bei unentdeckten Duplikaten → Prisma-Migrate **FAIL**, potenziell blockierender Deploy. Code-Änderung (`$transaction`) im selben Prompt wie Constraint — Constraint-Fehler vor Code-Deploy = Import weiterhin nicht transaktional.

**Sicherer Ablauf:**
1. `SELECT dimo_vehicle_id, COUNT(*) … HAVING COUNT(*) > 1` — Scan (0 erwartet laut Audit).
2. Manueller/extra PG-Dump.
3. Prisma-Migration Unique Constraint.
4. Deploy Code mit `$transaction` + Pre-Import-Check.
5. Import-Smoke (Post-Remediation #7).

---

### R-09 — Schritt 7 / P1-CH-Dedup: Dedup nach `org_id`-Migration ohne Zwischen-Backup

| Feld | Inhalt |
|------|--------|
| **Quelle** | Findings Schritt 7; MA-CH-P1-001 Rollback; Abhängigkeitsgraph |
| **Betroffene Domänen** | ClickHouse, Migrationen, Backup |

**Aktueller Ablauf:** Schritt 7 „CH-Dedup“ folgt Schritt 4 „CH `org_id`“. Abhängigkeit `P0_CH_ORG → P1_CH_DEDUP` ist korrekt. Rollback MA-CH-P1-001: „**CH-Backup vor Dedup-Migration**“.

**Risiko:** **Mittel.** Logische Reihenfolge stimmt, aber **kein** explizites Zwischen-Backup nach `org_id`-Migration vor Dedup (94,7 % Duplikate, 570k Rows). Dedup auf `ReplacingMergeTree`/Bereinigung ohne frisches Backup → bei Fehler Rollback auf pre-`org_id`-Backup unzureichend.

**Sicherer Ablauf:** Nach Phase 6 (`org_id` live) → **neues CH-Backup** → Dedup-Migration (Phase 8).

---

### R-10 — Kap. 29.11 Schritt 9: Restore-Drill erst am Ende

| Feld | Inhalt |
|------|--------|
| **Quelle** | Kap. 29.11 Schritte 2–8 vs. 9 |
| **Betroffene Domänen** | Restore, Backup, ClickHouse, PostgreSQL |

**Aktueller Ablauf:** Staging Restore-Drill in Schritt 9 — **nach** allen P0-Korrekturen in Schritten 2–8.

**Risiko:** **Hoch** für CH-`org_id`-Migration und Container-Recreate: Erstes Restore-Testing **nach** strukturellen Änderungen, nicht **vor** Prod-Migration. Prompt 2 erwähnt „Staging Restore-Drill dokumentieren“, nicht „ausführen vor Prod“. Widerspricht MA-CH-P0-001 Test-Anforderung und Best Practice „Restore vor Migration“.

**Sicherer Ablauf:** **Zwei** Restore-Drills:
- **Vor** CH-Recreate/`org_id`-Migration: Staging-Drill mit Phase-3-Backup (Referenz Phase 4).
- **Nach** allen Remediationen: Prod-ähnlicher Full-Stack-Drill (Kap. 29.11 Schritt 9).

---

### R-11 — Deploy (`vps-deploy-release.sh`) während CH-Recreate-Fenster

| Feld | Inhalt |
|------|--------|
| **Quelle** | Kap. 24.2, 4.5; Prompt 1–4 (alle erwähnen Deploy) |
| **Betroffene Domänen** | Container Recreation, Backup, Migrationen |

**Aktueller Ablauf:** Mehrere Prompts enden mit „VPS-Deploy über `vps-deploy-release.sh`“. Deploy erzeugt PG-`pg_dump`, migriert Prisma, baut Frontend/Backend, restartet PM2. **Nicht** dokumentiert: ob/wie Deploy ClickHouse-Container berührt.

**Risiko:** **Mittel–Hoch.**
- Standard-Deploy + paralleles manuelles `docker compose` für CH → Race auf CH-Verfügbarkeit.
- Ghost-Mounts: unkoordinierter `docker compose up` während Deploy → CH-Ausfall, Readiness degraded.
- PG-Backup durch Deploy ersetzt **kein** CH-Backup.

**Sicherer Ablauf:** CH-Recreate in **eigenem Wartungsfenster** außerhalb Standard-Deploy; Deploy-Freeze für CH-Phase; nach CH healthy erst App-Deploy mit Migrationen.

---

### R-12 — Alertmanager (Schritt 5) nach Backup-Setup (Schritt 3) — korrekt, aber Prompt 5-Reihenfolge

| Feld | Inhalt |
|------|--------|
| **Quelle** | Findings Schritte 3→5; Prompt 5 |
| **Betroffene Domänen** | Backup-Alarmierung, Observability |

**Aktueller Ablauf:** Schritt 3 etabliert Backups; Schritt 5/Prompt 5 deployt Alertmanager + Backup-Alerts. Reihenfolge **korrekt**.

**Risiko:** **Niedrig** — solange Schritt 3 vor 5 eingehalten wird. **Ausnahme:** Wenn Prompt 5 vor Prompt 2 ausgeführt wird (numerische Prompt-Reihenfolge ist 5 nach 2 — OK).

**Sicherer Ablauf:** Unverändert beibehalten; Backup-Alerts erst nach erstem erfolgreichen Backup-Job aktivieren.

---

### R-13 — Volume-Änderung: `docker compose down -v` nicht explizit verboten außer in Rollback

| Feld | Inhalt |
|------|--------|
| **Quelle** | MA-BKP-P0-001 Rollback; Kap. 24.3 |
| **Betroffene Domänen** | Volume, Container Recreation, Backup |

**Aktueller Ablauf:** Rollback fordert „kein `docker compose down -v` ohne Backup“ — nur in P0-Rollback-Tabelle, **nicht** in Prompts oder Kap. 29.11.

**Risiko:** **Kritisch** bei CH-Recreate: Versehentliches `-v` löscht `backend_clickhouse_data` (~2,8 GiB, unwiederbringlich ohne Backup).

**Sicherer Ablauf:** In Runbook/CH-Recreate-Playbook explizit: `docker compose down` **ohne** `-v`; Volume-Name dokumentieren; Backup-Pflicht vor jedem Recreate.

---

## 5. Übersicht — Risiko-Matrix

| ID | Kurztitel | Schwere | Domänen | Dokument-Konflikt |
|----|-----------|---------|---------|-------------------|
| **R-01** | Kap. 29.11 Schritt 2 parallel | Hoch | CH, Stripe, Backup, Migrate | Kap. 29.11 vs. P0-Rollbacks |
| **R-02** | Recreate vor Backup (Prompt 2) | **Kritisch** | CH, Container, Volume | Prompt 2 vs. TOPO/BKP-Rollback |
| **R-03** | Stripe vor CH-DR | Mittel–Hoch | Stripe, Backup | Schritt 2 vor 3 |
| **R-04** | Stripe interne Reihenfolge | Hoch | Stripe, Webhook | Prompt 1 |
| **R-05** | Doppelte Stripe-Schritte | Mittel | Stripe | Kap. 29.11 Schritt 2+4 |
| **R-06** | CH-Migrate ohne Backup-Hinweis | Hoch | CH, Migrate | Prompt 3 vs. CH-P0-Rollback |
| **R-07** | CH + PG Migrate gebündelt | Mittel | CH, PG, Unique | Schritt 4 |
| **R-08** | Unique ohne Duplikat-Scan | Mittel | PG, Unique | Prompt 4 vs. DIMO-Rollback |
| **R-09** | Dedup ohne Zwischen-Backup | Mittel | CH, Backup | Schritt 7 vs. P1-Rollback |
| **R-10** | Restore-Drill zu spät | Hoch | Restore | Kap. 29.11 Schritt 9 |
| **R-11** | Deploy während CH-Recreate | Mittel–Hoch | Deploy, CH | Alle Deploy-Prompts |
| **R-12** | Alertmanager nach Backup | Niedrig | Observability | ✅ korrekt |
| **R-13** | `down -v` nicht in Prompts | Kritisch | Volume | Rollback nur in P0-Tabelle |

**Konflikte gesamt:** 12 (11 mit Handlungsbedarf, 1 bestätigt korrekt)

---

## 6. Domänen-Querschnitt

### 6.1 ClickHouse — Henne-Ei Ghost-Mount / Backup

```
[Aktuell dokumentiert]
  Prompt 2: Recreate + Backup zusammen
       ↓
  Problem: /backups-Mount → Ghost-Release → Backup-Job nicht lauffähig
            Recreate ohne Volume-Backup → Ausfall-/Datenrisiko

[Sicherer Ablauf]
  Volume-Backup (ohne /backups-Mount)
       → Mount-Fix
       → Recreate
       → clickhouse:backup:docker
       → org_id-Migration
       → Dedup
```

### 6.2 Stripe — Abhängigkeit zu Backup/DR

| Maßnahme | Vorbedingung laut Analyse |
|----------|---------------------------|
| Live-Key (P0-002) | Env-Backup; Webhook bereit (P0-003) |
| Webhook (P0-003) | Endpoint registriert **vor** Live-Key-Aktivierung |
| Trial-Sync (P0-001) | PG-Snapshot; P0-002/003 abgeschlossen |
| Go-Live-Freigabe | CH+PG Offsite-Backup (Phase 3) empfohlen |

### 6.3 Migrationen — Sicherungsmatrix

| Migration | Backup-Typ erforderlich | Dokumentiert in | Lücke |
|-----------|-------------------------|-----------------|-------|
| CH `org_id` + Backfill | CH-Backup + Staging-Test | P0-Rollback | Prompt 3 ohne Verweis |
| CH Dedup (P1) | CH-Backup **nach** `org_id` | P1-Rollback | Schritt 7 ohne Zwischen-Backup |
| Prisma Unique `dimo_vehicle_id` | PG-Dump + Duplikat-Scan | P0-Rollback | Prompt 4 ohne Scan |
| Container Recreate | CH-Volume-Backup | TOPO/BKP-Rollback | Prompt 2 Reihenfolge |

---

## 7. Positive Befunde (keine Reihenfolge-Konflikte)

| Element | Bewertung |
|---------|-----------|
| Findings Schritt 3: Ghost-Mounts **→** CH Backup **→** Offsite | ✅ Korrekte Kernreihenfolge |
| Abhängigkeitsgraph: `P0_CH_MOUNT → P0_CH_BKP` | ✅ TOPO vor Backup-Job |
| Abhängigkeitsgraph: `P0_CH_ORG → P1_CH_DEDUP` | ✅ `org_id` vor Dedup |
| `vps-deploy-release.sh` Pre-Deploy-`pg_dump` | ✅ Partielle PG-Mitigation bei Deploys |
| Post-Remediation Restore-Drill (#4, #5) vorhanden | ✅ Vorhanden (Timing siehe R-10) |
| MA-BKP-P0-001 Rollback: „Erst Backup verifizieren“ | ✅ Korrekt formuliert, nicht in allen Prompts verankert |

---

## 8. Empfohlene Korrekturen (Phase 1E — noch nicht ausgeführt)

| Priorität | Aktion |
|-----------|--------|
| **P0** | Prompt 2 in **3 Teilprompts** splitten: Volume-Backup → Mount/Recreate → Backup-Cron/Offsite |
| **P0** | Prompt 3 mit Hard-Dependency: „nur nach verifiziertem CH-Backup + Staging-Drill“ |
| **P0** | Prompt 1 interne Reihenfolge dokumentieren (R-04) |
| **P1** | Kap. 29.11 Schritt 2 entflechten; Stripe nur in einem Schritt |
| **P1** | Staging Restore-Drill **vor** Prod-CH-Migration (R-10) |
| **P1** | Prompt 4: expliziter Duplikat-Scan vor Unique |
| **P2** | Runbook-Ergänzung: `docker compose down` ohne `-v` (R-13) |
| **P2** | Deploy-Freeze während CH-Recreate-Fenster (R-11) |

---

## 9. Validierungsstatus

| Prüfpunkt | Ergebnis |
|-----------|----------|
| Alle Remediation-Quellen geprüft | ✅ |
| Reihenfolge-Konflikte identifiziert | ✅ — 12 (R-01–R-13) |
| Sichere Abläufe dokumentiert | ✅ — §3, §4 |
| Audit-Dokumente geändert | ❌ (bewusst — nur Analyse) |
| SynqDrive Code/Infra geändert | ❌ |

**Phase 1D Status:** ✅ **Abgeschlossen**

**Nächster logischer Schritt:** Phase 1E — Harmonisierung der Remediation-Dokumente gemäß §8 (ohne Production-Änderungen).

---

## 10. Referenzen

| Dokument | Verwendung |
|----------|------------|
| `master-admin-vps-readonly-findings-2026-07.md` | Reihenfolge, Prompts, Rollbacks |
| `master-admin-vps-readonly-audit-2026-07.md` | Kap. 6.2, 24, 29.11 |
| `master-admin-p0-validation.md` | TOPO/CH-Backup-Henne-Ei |
| `master-admin-audit-summary-validation.md` | Gate-Kontext (5× FAIL) |
