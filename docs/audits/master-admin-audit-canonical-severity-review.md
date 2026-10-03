# Master-Admin VPS Audit — Phase 1A: Kanonische Severity-Matrix (Review)

| Feld | Wert |
|------|------|
| **Review ID** | `master-admin-audit-canonical-severity-review` |
| **Phase** | **1A — Analyse only** (keine Korrekturen an Audit-Dokumenten) |
| **Bezug** | `master-admin-vps-readonly-audit-2026-07`, `master-admin-vps-readonly-findings-2026-07` |
| **Erstellt (UTC)** | `2026-07-26` |
| **Modus** | Read-only — ausschließlich Audit-Dokumente analysiert |

---

## 1. Ziel und Prüfumfang

Diese Review prüft, ob der Master-Admin-VPS-Audit **eine einzige kanonische Severity-Matrix** besitzt. Geprüft wurden:

| Dokument / Kapitel | Geprüft |
|--------------------|---------|
| Executive Summary | Kap. 29.1 |
| Findings-Datei | `master-admin-vps-readonly-findings-2026-07.md` (Header, P0/P1-Detail) |
| Severity Matrix | Kap. 26 (§26.0 + Haupttabelle) |
| Production Readiness | Kap. 28, Kap. 29.9 (Gates) |
| Abschlusskapitel | Kap. 29.3–29.11 |
| Appendix | Anhang A–C |

**Nicht geändert:** SynqDrive-Code, Infrastruktur, bestehende Audit-Berichte.

---

## 2. Kurzfassung der Befunde

Der Audit enthält **zwei parallele Severity-Systeme**:

1. **Schritt-/Kap.-26-Matrix** — registriert beim Audit-Fortschritt (P0=0 in Haupttabelle, P1=12, P2=53, P3=38).
2. **Abschluss-Matrix** — in Kap. 26.0, Kap. 29.3 und der Findings-Datei eingeführt (P0=7).

Die **Gesamtzahlen** (7/12/53/38) addieren historische und aktive IDs ohne klare Trennung. Dadurch entstehen **Doppelzählungen** auf Finding-Ebene (nicht auf ID-Ebene): **10 historische IDs** repräsentieren Issues, die in der kanonischen Matrix bereits als **P0** oder zusammengeführt sind.

**Kap. 29.4** nennt „3 inhaltlich P0-duplikat“, tatsächlich sind es **5 historische P1-IDs** plus **5 historische P2-IDs** (siehe §4).

---

## 3. Dokumentierte vs. kanonische Zählungen

### 3.1 Aktuell dokumentierte Gesamtzahlen (inkonsistent)

| Quelle | P0 | P1 | P2 | P3 | Summe (ohne OBS) |
|--------|----|----|----|----|------------------|
| Findings-Datei Header | 7 | 12 | 53 | 38 | **110** |
| Kap. 26 Abschluss-Klassifikation | 7 | 12 | 53 | 38 | **110** |
| Kap. 29.3 / 29.5 | 7 | 12 | 53 | 38 | **110** |
| Kap. 26 Haupttabelle (Severity-Spalte) | **0** | 12 | 53 | 38 | 103 (+ 7 P0 nur in §26.0) |

Zusätzlich: **34 `MA-*-OBS-*`** Beobachtungen in Kap. 26 — korrekt **nicht** in P0–P3-Zählungen enthalten.

### 3.2 Vorgeschlagene kanonische aktive Zählung

| Severity | Aktive IDs | Historische IDs (nur Dokumentation) |
|----------|------------|-------------------------------------|
| **P0** | **7** | — |
| **P1** | **7** | 5 (siehe §4.1) |
| **P2** | **48** | 5 (siehe §4.2) |
| **P3** | **38** | — |
| **Summe aktiv** | **100** | 10 historisch |
| **OBS** | 34 | (separat, nicht severitized) |

**Regel für Phase 1B:** Historische IDs bleiben im Register, fließen aber **nicht** in P0/P1/P2/P3-Gesamtzahlen ein.

---

## 4. Inkonsistenzen im Detail

### 4.1 Hochgestufte / zusammengeführte Findings (P1 → P0)

| Historische ID | Alte Severity | Kanonische ID | Neue Severity | Typ | Begründung |
|----------------|---------------|---------------|---------------|-----|------------|
| **MA-TOPO-P1-001** | P1 | **MA-TOPO-P0-001** | P0 | Upgrade | ClickHouse Ghost-Mounts auf gelöschtes Release — Container-Recreate = kritischer Production-Ausfall |
| **MA-BILL-P1-001** | P1 | **MA-BILL-P0-002** | P0 | Upgrade | `STRIPE_SECRET_KEY`=TEST auf Prod bei DB `stripe_mode=LIVE` — Go-Live-Blocker |
| **MA-BILL-P1-002** | P1 | **MA-BILL-P0-003** | P0 | Upgrade | `STRIPE_WEBHOOK_SECRET` fehlt — Platform-Billing nicht betriebsbereit |
| **MA-BKP-P1-001** | P1 | **MA-BKP-P0-001** | P0 | Merge | Kein Offsite-Backup — Teil des DR-P0 |
| **MA-BKP-P1-002** | P1 | **MA-BKP-P0-001** | P0 | Merge | ClickHouse ~2,8 GiB ohne Backup — Teil des DR-P0 |

**Dokumentierte Hinweise vorhanden:** Findings-Datei markiert alle fünf als „P1-Historie“. Kap. 29.4 verweist auf TOPO/BILL, nicht auf BKP-Merge.

**Doppelzählung:** Alle fünf erscheinen weiterhin in Kap.-26-Haupttabelle als **P1** und in der **P1=12**-Zählung.

---

### 4.2 Hochgestufte Findings (P2 → P0)

| Historische ID | Alte Severity | Kanonische ID | Neue Severity | Typ | Begründung |
|----------------|---------------|---------------|---------------|-----|------------|
| **MA-CH-P2-001** | P2 | **MA-CH-P0-001** | P0 | Upgrade | `telemetry_snapshots` / `telemetry_state_changes` ohne `org_id` — Tenant-Datenleck-Pfad |
| **MA-DIMO-P2-001** | P2 | **MA-DIMO-P0-001** | P0 | Upgrade | Kein Unique auf `vehicles.dimo_vehicle_id` — falsche Fahrzeugzuordnung / Cross-Org-Re-Import |
| **MA-BILL-P2-002** | P2 | **MA-BILL-P0-001** | P0 | Upgrade | TRIALING ohne `stripe_subscription_id` — falsche Subscription-Freischaltung |
| **MA-BILL-P2-001** | P2 | **MA-BILL-P0-002** | P0 | Upgrade | `stripe_mode=LIVE` bei Runtime TEST-Key — Reconciliation-Drift KRITISCH |
| **MA-BILL-P2-003** | P2 | **MA-BILL-P0-003** | P0 | Upgrade | Kein Platform-Webhook-Endpoint — Zahlungs-/Subscription-Sync unmöglich |

**Dokumentierte Hinweise:** Kein expliziter „P2-Historie“-Hinweis in der Findings-Datei; Kap. 26 Haupttabelle listet alle fünf weiterhin als **P2**.

**Doppelzählung:** Diese fünf P2-IDs bleiben in der **P2=53**-Zählung, obwohl inhaltlich durch P0 abgedeckt.

---

### 4.3 Neue P0-IDs ohne Entsprechung in Kap.-26-Haupttabelle

Die sieben P0-IDs existieren nur in **§26.0**, **Kap. 29.3** und der Findings-Datei — **nicht** als Zeilen mit `Severity=P0` in der Kap.-26-Haupttabelle:

| Kanonische P0-ID | Titel |
|------------------|-------|
| MA-CH-P0-001 | ClickHouse-Telemetrie ohne `org_id` |
| MA-BILL-P0-001 | TRIALING ohne Stripe-Objekt |
| MA-BILL-P0-002 | Stripe TEST-Key bei DB-LIVE-Mode |
| MA-BILL-P0-003 | Platform-Webhook-Secret fehlt |
| MA-BKP-P0-001 | CH ohne Backup + kein Offsite (Merge) |
| MA-TOPO-P0-001 | ClickHouse Ghost-Mounts |
| MA-DIMO-P0-001 | `dimo_vehicle_id` ohne Unique-Constraint |

**Inkonsistenz:** Kap.-26-Header behauptet „7× P0“, die Haupttabelle hat **0× P0**-Zeilen.

---

### 4.4 Zähl-Inkonsistenz Kap. 29.4

| Aussage | Dokument | Problem |
|---------|----------|---------|
| „**Anzahl P1: 12**“ | Kap. 29.4, Findings-Header | Enthält 5 historische P1-IDs |
| „**davon 3 inhaltlich P0-duplikat**“ | Kap. 29.4 | Unterzählt — es sind **5** P1-Historie-IDs (inkl. 2× BKP-Merge) |
| „P0-Matrix in Findings-Datei ist maßgeblich“ | Kap. 29.4 | Korrekt als Intent, aber P1/P2-Gesamtzahlen nicht angepasst |

**Interpretation der „3“:** Vermutlich TOPO-P1-001 + BILL-P1-001 + BILL-P1-002; die beiden BKP-P1-Merge-Teile werden nicht als „Duplikat“ gezählt, obwohl sie in der P1=12-Summe enthalten sind.

---

### 4.5 Inline-Severity vs. kanonische Matrix (Körpertext)

| Kapitel / Stelle | Inline-Severity | Kanonische ID/Severity | Issue |
|------------------|-----------------|------------------------|-------|
| Kap. 6 — ClickHouse Topologie | **P1** (Ghost-Mounts) | MA-TOPO-**P0**-001 | Veraltete P1-Referenz (MA-TOPO-P1-001) |
| Kap. 13.5 — Tenant-Scope CH | **P2** (`org_id` fehlt) | MA-CH-**P0**-001 | Unterbewertet im Schritt-9-Text |
| Kap. 17 — DIMO Unique | **P2** (inline) | MA-DIMO-**P0**-001 | Unterbewertet |
| Kap. 25.3 — Telemetrie-Tenant-Scope | **P1** | MA-CH-**P0**-001 | Kontrollmatrix widerspricht P0-Abschluss |
| Kap. 23 — Konsistenzmatrix | **KRITISCH** + P0-IDs | Konsistent | ✓ |
| Kap. 29.6 — Architekturabweichungen | **P0** / **P1** | Konsistent mit kanonischer Intent | ✓ |
| Kap. 24 — Stripe-Referenzen | MA-BILL-**P1**-001/002 | MA-BILL-**P0**-002/003 | Veraltete P1-IDs im Fließtext |
| Anhang C — Step-up Master-Reads | **P3** | MA-API-**P3**-002 / MA-IAM-**P2**-001 | Step-up als P3, IAM-Register als P2 — konsistent mit Kap. 26, kein P0-Konflikt |

---

### 4.6 Findings-Datei: Header vs. Inhalt

| Aspekt | Befund |
|--------|--------|
| Header P2=53, P3=38 | Korrekt als Kap.-26-Spiegel, **inkl.** historischer P2 |
| P2-Detailabschnitte | Nur **2** P2-IDs detailliert (MA-DIMO-P2-002, MA-OBS-P2-003 in Remediation-Graph) — **keine** Severity-Inkonsistenz, aber unvollständige P2-Abdeckung |
| P1-Abschnitt | Listet alle 12 IDs; 5 mit Historie-Hinweis — korrekt dokumentiert, falsch gezählt |
| Remediation-Prompts | Referenzieren kanonische P0-IDs — ✓ |

---

### 4.7 Schritt-Inkrement-Notizen vs. Abschluss (Kap. 26)

Die Zeilen „Schritt N: X× P1 neu …“ summieren sich zu:

| Severity | Summe Schritt-Inkremente | Kap.-26-Tabellen-Totale |
|----------|--------------------------|-------------------------|
| P1 | 12 | 12 |
| P2 | 41 | 53 |
| P3 | 26 | 38 |

**Befund:** Schritt-Inkremente sind **„neu in diesem Schritt“**, nicht Gesamtzählung — kein direkter Widerspruch, aber verwirrend neben der Abschluss-P0-Einführung (P0 in keinem Schritt-Inkrement erwähnt).

---

### 4.8 Verwandte, aber nicht zusammengeführte Findings

| IDs | Verhältnis | Kanonische Behandlung |
|-----|------------|----------------------|
| MA-OBS-P1-001 + MA-BKP-P1-003 | Beide Alerting/Backup — Remediation-Prompt 5 behandelt gemeinsam | **Beide aktiv P1** (unterschiedliche Scope: Alertmanager vs. Backup-Job-Monitoring) |
| MA-BILL-P2-004 | Webhook Health (0 Events) | **Aktiv P2** — Folge von P0-003, nicht identisch |
| MA-CH-P1-001 | CH-Duplikate 94,7 % | **Aktiv P1** — separates Issue von MA-CH-P0-001 (Tenant-Scope) |
| MA-BKP-P2-001…006 | DR-Detailfindings | **Aktiv P2** — ergänzen MA-BKP-P0-001, keine Merge-Kandidaten |

---

## 5. Doppelzählungs-Matrix (Finding-Ebene)

Wenn die dokumentierte Summe **110** (7+12+53+38) verwendet wird, werden folgende Issues **zweimal** gezählt:

| Issue (inhaltlich) | Gezählt als | Sollte nur zählen als |
|--------------------|-------------|------------------------|
| CH Ghost-Mounts | P1 (MA-TOPO-P1-001) + P0 (MA-TOPO-P0-001) | P0 |
| Stripe TEST-Key | P1 + P2 + P0 | P0 (MA-BILL-P0-002) |
| Webhook-Secret fehlt | P1 + P2 + P0 | P0 (MA-BILL-P0-003) |
| TRIALING ohne Stripe-Sub | P2 + P0 | P0 (MA-BILL-P0-001) |
| CH ohne org_id | P2 + P0 | P0 (MA-CH-P0-001) |
| dimo_vehicle_id Unique | P2 + P0 | P0 (MA-DIMO-P0-001) |
| Kein Offsite + CH-Backup | P1×2 + P0 | P0 (MA-BKP-P0-001) |

**Inflation:** +10 Zählungen gegenüber 100 aktiven unique Issues.

---

## 6. Endgültige kanonische Severity-Matrix

### 6.1 P0 — Production-Blocker (7 aktiv)

| ID | Titel | Komponente |
|----|-------|------------|
| **MA-CH-P0-001** | ClickHouse-Telemetrie ohne `org_id` | ClickHouse / Tenant |
| **MA-BILL-P0-001** | TRIALING-Subscription ohne Stripe-Objekt | Billing |
| **MA-BILL-P0-002** | Stripe TEST-Key bei DB-LIVE-Mode | Billing |
| **MA-BILL-P0-003** | Platform-Webhook-Secret fehlt | Billing |
| **MA-BKP-P0-001** | ClickHouse ohne Backup + kein Offsite | DR |
| **MA-TOPO-P0-001** | ClickHouse Ghost-Mounts | Container / Ausfall |
| **MA-DIMO-P0-001** | `dimo_vehicle_id` ohne Unique-Constraint | DIMO / Fahrzeug |

### 6.2 P1 — Hoch priorisiert (7 aktiv)

| ID | Titel |
|----|-------|
| MA-NET-P1-001 | Swagger UI öffentlich |
| MA-NET-P1-002 | OpenAPI Spec öffentlich |
| MA-REDIS-P1-001 | 28 failed `battery.v2` Jobs |
| MA-CH-P1-001 | 94,7 % CH-Snapshot-Duplikate |
| MA-OBS-P1-001 | Kein Alertmanager |
| MA-AUD-P1-001 | Audit-Logs löschbar (kein WORM) |
| MA-BKP-P1-003 | Keine Backup-Alarmierung |

### 6.3 P1 — Historisch (5, nicht in Zählung)

| ID | Ersetzt durch | Hinweis |
|----|---------------|---------|
| MA-TOPO-P1-001 | MA-TOPO-P0-001 | Upgrade |
| MA-BILL-P1-001 | MA-BILL-P0-002 | Upgrade |
| MA-BILL-P1-002 | MA-BILL-P0-003 | Upgrade |
| MA-BKP-P1-001 | MA-BKP-P0-001 | Merge-Teil |
| MA-BKP-P1-002 | MA-BKP-P0-001 | Merge-Teil |

### 6.4 P2 — Mittel (48 aktiv)

Alle **53** Kap.-26-P2-IDs **minus**:

| Historische P2-ID | Ersetzt durch |
|-------------------|---------------|
| MA-CH-P2-001 | MA-CH-P0-001 |
| MA-DIMO-P2-001 | MA-DIMO-P0-001 |
| MA-BILL-P2-001 | MA-BILL-P0-002 |
| MA-BILL-P2-002 | MA-BILL-P0-001 |
| MA-BILL-P2-003 | MA-BILL-P0-003 |

Vollständige aktive P2-Liste: Kap. 26 Haupttabelle abzüglich der fünf obigen IDs (48 verbleibende).

### 6.5 P2 — Historisch (5, nicht in Zählung)

Siehe Tabelle §6.4.

### 6.6 P3 — Niedrig (38 aktiv, unverändert)

Keine P3→P0/P1-Upgrades im Abschluss. Alle 38 Kap.-26-P3-IDs bleiben aktiv.

### 6.7 Beobachtungen (34, außerhalb Severity-Matrix)

`MA-*-OBS-*` — nicht in P0–P3-Totals; korrekt getrennt.

---

## 7. Kanonische Gesamtzahlen (Soll-Zustand Phase 1B)

| Severity | Aktive Zählung | Historische IDs (Dokumentation only) |
|----------|----------------|--------------------------------------|
| **P0** | **7** | 0 |
| **P1** | **7** | 5 |
| **P2** | **48** | 5 |
| **P3** | **38** | 0 |
| **Aktive Findings gesamt** | **100** | — |
| **Registrierte IDs gesamt** | **100** | **+10 historisch** |
| **OBS** | **34** | (separat) |

---

## 8. Kapitelweise Konsistenz-Checkliste

| Kapitel | Severity konsistent? | Anmerkung |
|---------|---------------------|-----------|
| Kap. 28 Production Readiness | ✓ (qualitativ) | Keine numerischen P-Summen |
| Kap. 29.1 Executive Summary | ✓ (qualitativ) | Risiken ohne ID-Zählung; aligned mit P0-Themen |
| Kap. 29.3 P0 | ✓ | 7 P0 korrekt |
| Kap. 29.4 P1 | ✗ | P1=12 inkl. Historie; „3 Duplikat“ falsch |
| Kap. 29.5 P2/P3 | ✗ | P2=53 inkl. 5 historische P2 |
| Kap. 29.9 Gates | ✓ | Qualitativ, keine Doppelzählung |
| Kap. 29.10 Urteil | ✓ | „7× P0-Findings“ korrekt |
| Kap. 26 Header | ✗ | P0/P1/P2-Mix aus zwei Systemen |
| Kap. 26 Haupttabelle | ✗ | P0 fehlt; historische P1/P2 noch aktiv gelistet |
| Findings-Header | ✗ | Spiegelt Kap. 26 ohne Kanonisierung |
| Anhang A–B | ✓ | Keine Severity-Zahlen |
| Anhang C | ✓ | Inline-Severities aligned mit Kap.-26-Register (nicht Abschluss-P0) |

---

## 9. Empfohlene Korrekturen (Phase 1B — noch nicht ausgeführt)

1. **Eine kanonische Zählzeile** in Findings-Header, Kap. 26 und Kap. 29.4/29.5: `P0=7, P1=7, P2=48, P3=38` (aktiv).
2. **Historische-ID-Register** als Anhang oder Spalte `Status: historisch → <kanonische ID>`.
3. **Kap.-26-Haupttabelle:** P0-Zeilen ergänzen; historische P1/P2 als `Historisch` markieren oder in separates Register verschieben.
4. **Inline-Texte** (Kap. 6, 13, 17, 24, 25.3) auf kanonische IDs/Severities aktualisieren.
5. **Kap. 29.4** Formulierung korrigieren: „5 historische P1-IDs, nicht in aktiver P1-Zählung“.
6. **Schritt-Inkrement-Notizen** mit Fußnote: „pre-closure severity; Abschluss siehe §26.0“.

---

## 10. Methodik

- Volltext-Parse beider Audit-Markdown-Dateien
- Regex-Extraktion aller `MA-*-P[0-3]-NNN` und `MA-*-OBS-NNN` IDs
- Abgleich Kap.-26-Haupttabelle vs. §26.0 vs. Kap. 29.3/29.4
- Manuelle Querverifikation Inline-Severities in Kapiteln 6, 13, 17, 23–25, 29, Anhang C
- Keine VPS-Befehle, kein Code, keine Produktionsänderungen

---

## 11. Status

| Item | Status |
|------|--------|
| Analyse abgeschlossen | ✅ |
| Audit-Dokumente korrigiert | ❌ (bewusst — Phase 1A nur Analyse) |
| SynqDrive Code/Infra geändert | ❌ |
| Changes / Architektur aktualisiert | ❌ (keine Produkt-Architektur-Änderung) |

**Nächster Schritt:** Phase 1B — Harmonisierung der Audit-Dokumente gemäß §6 und §9.
