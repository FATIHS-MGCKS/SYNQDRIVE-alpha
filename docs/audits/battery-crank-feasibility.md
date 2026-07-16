# Battery Health — Crank Feasibility Audit (Prompt 4/8)

| Feld | Wert |
|------|------|
| **Audit-Zeitpunkt (UTC)** | 2026-07-16T10:50:00Z |
| **Repository-Git-Commit (lokal)** | `1754069` (`battery-rest-window-reality`) |
| **VPS-deployed Commit** | `2cd57c8` (zum Analysezeitpunkt) |
| **Basis-Dokumente** | [`battery-runtime-topology.md`](./battery-runtime-topology.md), [`battery-signal-cadence-reality.md`](./battery-signal-cadence-reality.md), [`battery-rest-window-reality.md`](./battery-rest-window-reality.md) |
| **Methodik** | Read-only PostgreSQL, ClickHouse, PM2-Logs; **keine** historischen DIMO-Nachabfragen |
| **Untersuchte Umgebung** | **Produktion** (`app.synqdrive.eu` / VPS) |

---

## Executive Summary

**Kernbefund:** SynqDrive kann mit den **real verfügbaren DIMO-Signalen keinen belastbaren echten Starterspannungseinbruch (Crank Drop) in Production erfassen.** Die Crank-Pipeline feuert bei **54 %** der ICE-Tripstarts, liefert aber in **91 %** dieser Fälle `vPre=— drop=—` (kein messbarer Einbruch). Nur **2 von 234** ICE-Trips (**0,9 %**) zeigen einen `crankDrop ≥ 0,3 V`. Ein **sub-sekündiger** Crank ist mit der aktuellen **5-Sekunden-DIMO-Aggregation** architektonisch **nicht** auflösbar.

| Klassifikation (ICE, n=234) | Anteil |
|-----------------------------|-------:|
| **EXACT_ENOUGH** | **0 %** |
| **USABLE_START_PROXY** | **0,9 %** (2) |
| **RECOVERY_ONLY** | **3,8 %** (9) |
| **INSUFFICIENT_CADENCE** | **49,6 %** (116) |
| **NO_DATA** | **45,7 %** (107) |

**Antwort Leitfrage:** Echter Crank Drop ist **nicht production-ready**. Maximal ein **grober Start-/Recovery-Proxy** ist sporadisch möglich; für EV gilt **PROFILE_UNSUPPORTED** (kein LV-Signal).

---

## 1. Zeitraum und Stichprobe

| Parameter | Wert | Beleg |
|-----------|------|-------|
| **Zeitraum** | ~30 Tage (`startTime ≥ 2026-06-16`) | PG |
| **Tripstarts gesamt** | **338** | PG |
| **ICE-Tripstarts** | **234** (Ziel ≥50: **erfüllt**) | PG |
| **BEV-Tripstarts** | **104** (Ziel ≥30: **erfüllt**) | PG |
| **PHEV/HEV** | **0** | Flotte |

### Datenquellen

| Quelle | Inhalt | Limitierung |
|--------|--------|-------------|
| `vehicle_trips` | `startTime`, `createdAt`, `startDetectionMode` | `possibleStartAt` / `firstActivityAt` im Fenster **null** |
| `battery_features` | Aktueller Crank-Stand pro Fahrzeug (überschrieben) | **Keine** Trip-Historie |
| PM2-Logs | `Crank features captured` mit `tripId`, `vPre`, `drop` | 134 Einträge / 127 unique Trips |
| `dimo_poll_logs` | Poll-Kadenz um Starts | Kein LV-Spannungsfeld |
| `telemetry_snapshots` (CH) | speed, ignition | **Kein** `lvBatteryVoltage`; `recorded_at` = Provider-Zeit |
| `telemetry_hf_points` (CH) | HF-Signale post-trip | **Kein** LV-Voltage-Signal; RPM nur post-trip-Mirror |

**Wichtig:** Historische Crank-Fenster-Rohpunkte werden **nicht persistiert**. Punkt-Kadenz-Analyse stützt sich auf Code-Spezifikation (5 s), Poll-Logs, CH-Proxies und Log-Ausgaben — **keine** DIMO-Requeries (Kostenregel).

---

## 2. Fahrzeugprofile

| Label | Profil | Tripstarts (30d) | Crank-Log | `crankDrop` in Features |
|-------|--------|-----------------:|----------:|------------------------:|
| veh-c10351f8 | ICE (Audi A4) | ~55 | ja | **null** (Recovery ~12,55 V) |
| veh-a60c0749 | ICE (AMG C63) | ~40 | ja | **null** |
| veh-19fedd4b | ICE (Tiguan) | ~35 | ja | **0,048 V** |
| veh-8c850ff1 | ICE (Arteon) | ~30 | ja | **null** |
| veh-c43c3b45 | ICE (Golf) | ~25 | ja | **null** |
| **KS FH 660E** | BEV (Tesla Model 3) | **104** | **0** | n/a |

---

## 3. Methodik zur Startzeitbestimmung

### Implementiert (Battery V2)

| Zeitanker | Verwendung | Beleg |
|-----------|------------|-------|
| **`effectiveStartAt`** | Crank-Fenster + `onTripStart(tripStartAt)` | `trip-detection-orchestration.service.ts:930` |
| **Fenster** | `[start − 30 s, start + 120 s]` | `battery-v2.service.ts:246–247` |
| **DIMO-Intervall** | **5 s**, Voltage `MIN`, RPM `MAX` | `battery-crank.query.ts` |

**Abweichung vom Audit-Ziel (−60 s … +180 s):** Code nutzt **−30 s … +120 s** (**durch Code belegt**).

### Verfügbare Startzeit-Proxies in PG

| Feld | Verfügbarkeit im Stichprobe |
|------|----------------------------|
| `vehicle_trips.startTime` | **100 %** (= `effectiveStartAt` bei Erstellung) |
| `vehicle_trips.createdAt` | **100 %** (Trip-Record-Anlage) |
| `possibleStartAt` / `firstActivityAt` | **0 %** befüllt im 30d-Fenster |
| Ignition-/RPM-Flanke (CH) | **grob**; CH-`recorded_at` misaligned zu `startTime` |
| Trip-Bestätigungszeit | PM2-Log-Präfix ≈ Hook-Ausführung |

**Trip-Bestätigung vs. `startTime`:** Median **169 s**, P95 **293 s** zwischen `startTime` und Crank-Log-Zeitstempel (**durch Produktionsdaten belegt**). `startTime` ist **rückdatiert** auf Bewegungsbeginn; der Hook läuft bei Bestätigung **deutlich später** — das Crank-Fenster endet aber **vor** dem Hook (start + 120 s < start + 169 s median).

---

## 4. Reale Punktkadenz rund um Tripstarts

### DIMO Crank-Query (einzige LV-Zeitreihe)

| Parameter | Wert | Klassifikation |
|-----------|------|----------------|
| **Bucket-Intervall** | **5 s** | **durch Code belegt** |
| **Theoretische Punkte** im Fenster 150 s | **≤ 31** | Code |
| **Minimale Auflösung Crank-Dip** | **≥ 5 s** (MIN-Agg pro Bucket) | Code |
| **Sub-sekündiger Einbruch** | **Nicht erfassbar** | Code + Daten |

### Poll-Kadenz (Request-Ebene, Stichprobe n=10 ICE-Trips mit Crank-Log)

| Metrik | Wert |
|--------|------|
| Polls in [−60 s, +180 s] | **7–8** |
| Median Poll-Abstand | **~30 s** |

### CH `telemetry_snapshots` (Stichprobe n=40 ICE-Crank-Trips)

| Fenster | Median Punkte |
|---------|--------------|
| Vor Start (`recorded_at` < start) | **0** |
| ±5 s / ±15 s / ±30 s | **0** |
| Start … +180 s | **4** |
| Median Abstand (wenn Punkte) | **~28 s** |
| P95 Abstand | **~37 s** |
| Max Lücke | **~168 s** |

**Interpretation:** CH-Spiegel folgt **Provider-`recorded_at`**, nicht Poll-Wanduhr — Alignment zu `startTime` ist **schlecht** (**durch Produktionsdaten belegt**). Für LV-Spannung ist CH **nicht nutzbar**.

### HF `telemetry_hf_points`

| Signal (30d) | Punkte | Um Start? |
|--------------|-------:|-----------|
| `powertrainCombustionEngineSpeed` | 8 643 | **0** in [−60,+180] um Start (Mirror post-trip) |
| `lowVoltageBattery*` | **0** | **Nicht gespiegelt** |

---

## 5. Coverage-Verteilung

### Spannungspunkte (inferiert aus Crank-Hook-Ergebnis)

| Phase | Beobachtung |
|-------|-------------|
| **Vor Start (PRE)** | In **91 %** der Hook-Läufe: `vPre=—` → kein belastbarer Pre-Crank-Punkt |
| **±5 s / ±15 s / ±30 s (CRANK_MIN)** | `vMinCrank` meist **null** in `battery_features` |
| **+5 s / +30 s Recovery** | **Häufig** befüllt (`vRecovery5s`/`vRecovery30s` ≈ 12,3–13,9 V) |
| **Bis +180 s** | Recovery aus 5-s-Buckets; oft **identischer** Wert für +5s und +30s |

### Verhältnis Trips → Crank-Messungen (ICE)

| Metrik | Anzahl | Rate |
|--------|-------:|-----:|
| ICE-Tripstarts | 234 | 100 % |
| Crank-Hook geloggt | **127** | **54,3 %** |
| Messbarer `drop` in Logs | **11** | **4,7 %** |
| `drop ≥ 0,3 V` (USABLE) | **2** | **0,9 %** |
| `drop < 0,3 V` (RECOVERY_ONLY) | **9** | **3,8 %** |
| Hook ohne Drop (`vPre=— drop=—`) | **116** | **49,6 %** |
| Kein Crank-Log | **107** | **45,7 %** |

**`crankObservationCount` (Features):** 2–8 pro Fahrzeug — zählt nur Events mit `crankDrop != null` (**durch Code belegt**); konsistent mit wenigen echten Drops.

---

## 6. Zeitabweichungen (Ziel vs. tatsächlich)

Zielzeitpunkte laut `battery-v2.service.ts`; Abweichung aus 5-s-Buckets + `find(>= target)`:

| Anker | Ziel | Empirische Abweichung | Beleg |
|-------|------|----------------------|-------|
| **PRE_START** | Letzter Punkt ≤ start | Oft **fehlend** (`vPre` null) | Logs + Features |
| **CRANK_MIN** | Min in [−30 s, +30 s] | Meist **fehlend**; wenn vorhanden: Bucket-Auflösung **±5 s** | Code |
| **RECOVERY_5S** | Erster Punkt ≥ start+5 s | **0–5 s** Bucket-Toleranz | Code |
| **RECOVERY_30S** | Erster Punkt ≥ start+30 s | **0–5 s**; oft **gleicher** Wert wie +5s | Features |

**Empirisch abgeleitete maximale Punktdistanz:** **5 s** (DIMO-Query-Intervall) — **durch Code belegt**, nicht willkürlich gesetzt.

**+5 s beobachtbar?** **Ja** (Recovery-Felder häufig befüllt). **+30 s beobachtbar?** **Ja**, aber oft **redundant** mit +5s. **Sub-sekündiger Crank?** **Nein.**

---

## 7. Providerverzögerung

| Frage | Befund | Klassifikation |
|-------|--------|----------------|
| Wann `observed`? | DIMO `signals()`-Buckets (5 s) | Code |
| Wann empfangen? | Bei Trip-Bestätigung (`onTripStart`) | Code |
| Hook vs. `startTime` | Median **+169 s**, P95 **+293 s** | PM2 + PG |
| War Fenster [−30,+120] vollständig? | **Ja** (Hook median +169 s > +120 s) | Rechnung |
| Spätere Werte nach Hook? | Nicht nachgeladen; **kein Retry** | Code |

**Fazit:** Providerverzögerung der **Bestätigung** erklärt **nicht** die fehlenden Crank-Drops — das Fenster liegt vollständig in der Vergangenheit, wenn der Hook läuft. Fehlende Drops sind **Kadenz-/Signalqualitätsproblem**, nicht primär Timing (**aus Stichprobe abgeleitet**).

---

## 8. Signalkontext

| Signal | ICE um Start | BEV |
|--------|--------------|-----|
| **RPM** | In Crank-Query (5 s MAX); nicht in CH um Start | HF post-trip only |
| **Ignition** | CH 100 % wenn online; misaligned | **0 %** in CH |
| **engineRunning** | **Nicht provider-gestützt** (Prompt 2) | n/a |
| **Speed** | CH grob; 30 s Provider-Kadenz | CH 100 % |
| **Charging / DC-DC** | Nicht im Crank-Pfad geprüft | `traction_kw` in CH |
| **LV Voltage** | Nur via einmaliger Crank-Query | **null** (KS FH 660E) |

---

## 9. Battery-V2-Ausgabe (Ist)

| Feld | Befund |
|------|--------|
| `crankDrop` gespeichert? | **Selten** — 1/5 Fahrzeuge aktuell ≠ null (0,048 V) |
| Recovery gespeichert? | **Ja** — alle 5 ICE-Features mit `vRecovery5s/30s` |
| Kadenz ausreichend? | **Nein** für Crank; **grob** für Recovery |
| Providerfehler → leeres Fenster? | Log `Crank features captured` trotzdem mit `—` — **kein** expliziter Fehlerstatus |
| Doppelte Crank pro Trip? | **0** doppelte `tripId` in Logs |

**Pipeline-Reihenfolge** (**durch Code belegt**):

```
Trip-Bestätigung (ACTIVE_TRIP)
  → BatteryV2.onTripStart (async)     ← DIMO fetchCrankWindow
  → scheduleActiveTick
```

`onSnapshot` (Rest) läuft **vor** Trip-Detection auf dem Snapshot-Tick, nicht am Crank-Hook.

---

## 10. Ist echter Crank Drop messbar?

**Nein** — **durch Produktionsdaten belegt**:

1. **91 %** der Hook-Läufe: kein `vPre`/`drop` in Logs.
2. Nur **11/234** Trips (4,7 %) mit numerischem Drop; nur **2** ≥ 0,3 V.
3. **5-s-MIN-Aggregation** kann typischen **0,5–2 V sub-sekunden** Dip verwischen (**durch Code belegt**).
4. Viele `vPre`-Werte in den wenigen Hits sind **13–14,5 V** (Lade-/Wake-Niveau, kein reiner Ruhewert).

### Beispiele messbarer Drops (Logs)

| Fahrzeug | Trip (prefix) | vPre | drop | Klassifikation |
|----------|---------------|-----:|-----:|----------------|
| veh-8c850ff1 | 60d55df5 | 13,38 | **0,91** | USABLE_START_PROXY |
| veh-c10351f8 | f8c97553 | 12,54 | 0,06 | RECOVERY_ONLY |
| veh-19fedd4b | 139eb21e | 12,47 | 0,00 | RECOVERY_ONLY |

---

## 11. Nur grober Start-Proxy möglich?

**Ja, opportunistisch** — **aus Stichprobe abgeleitet**:

- **Recovery-Spannungen** (+5s/+30s) werden **häufig** persistiert (~12,3–13,9 V).
- **`crankDrop`** als SOH-Input (35 % Gewicht) ist in Production **praktisch leer**.
- Nutzbarer Proxy: **Vor/Nach-Delta** mit grober 5-s-Auflösung, wenn `vPre` und `vMin` **zufällig** vorhanden — **nicht zuverlässig**.

---

## 12. EV-Wake-Befunde

| Frage | Befund | Klassifikation |
|-------|--------|----------------|
| Spannungsdip beim Wake? | **Kein LV-Signal** (`lvBatteryVoltage` null) | Prompt 2 + 3 |
| DC/DC-Start? | `traction_kw` / charging in CH/VLS; **17** HF-Traction-Punkte / 30d | CH |
| Mit ICE-Crank verwechselt? | **Nein** — `onTripStart` läuft, aber LV-Crank leer; **0** BEV Crank-Logs | Logs |
| EV-spezifische Auswertung? | HV-SOC, Traction-Power, Charging-State — **separater** Pfad (`HvBatteryHealthService`) | Code |

**KS FH 660E:** 104 Tripstarts, **kein** Crank-Log, **PROFILE_UNSUPPORTED** für LV-Crank.

---

## 13. PHEV/HEV

**Nicht vorhanden** in der Produktionsflotte (**durch Produktionsdaten belegt**). Keine empirische Bewertung möglich.

---

## 14. Doppelte / fehlerhafte Erfassungen

| Typ | Befund |
|-----|--------|
| Doppelte Logs pro `tripId` | **0** |
| `battery_features.crankTripId` | Nur **letzter** Trip pro Fahrzeug — Historie **verloren** |
| `vRecovery5s === vRecovery30s` | **Häufig** (gleicher Bucket / gleicher erster Punkt) |
| `crankDrop` mit `vPre > 13,2 V` | In Logs — **Ladekontext**, nicht reiner Crank |

---

## 15. Empfohlene Qualitätsklassen (für spätere Umsetzung)

| Klasse | Kriterium (empirisch vorgeschlagen) |
|--------|-------------------------------------|
| **CRANK_EXACT** | Drop ≥ 0,5 V, ≥2 Punkte in Crank-Zone, `vPre ≤ 13,0 V` |
| **CRANK_PROXY** | Drop 0,2–0,5 V oder 5-s-Bucket-Min |
| **RECOVERY_ONLY** | `crankDrop` null, Recovery vorhanden |
| **WAKE_CHARGING** | `vPre > 13,2 V` oder Recovery > 13,5 V |
| **NO_LV_DATA** | Kein LV-Signal (BEV) |
| **INSUFFICIENT** | Hook ohne verwertbare Punkte |

---

## 16. Empfohlene Delay-/Retry-Strategie (nur Empfehlung, kein Code)

1. **Deferred Crank-Fetch:** Hook bei Bestätigung + **Retry** bei +180 s / +300 s (Fenster dann erweitert), falls Provider nachliefert — nur wenn kostenseitig akzeptiert.
2. **Fenster erweitern** auf [−60 s, +180 s] passend zum Audit-Ziel.
3. **Feineres Intervall** (1 s) wenn DIMO/API-Kosten tragbar — sonst explizit **kein EXACT_ENOUGH** versprechen.
4. **Persistenz:** Crank-Rohpunkte pro `tripId` speichern (CH oder PG) für Nachanalyse.
5. **Gates:** `vPre > 13,2 V` → `WAKE_CHARGING`, nicht als Crank werten.
6. **EV:** Crank-Pfad **deaktivieren**; Wake über HV/DC-DC modellieren.

---

## 17. P0 / P1 / P2 Findings

| ID | Prio | Finding | Klassifikation |
|----|------|---------|----------------|
| **R-K01** | **P0** | Nur **0,9 %** ICE-Trips mit `crankDrop ≥ 0,3 V` — SOH-Crank-Komponente (35 %) faktisch leer | **durch Produktionsdaten belegt** |
| **R-K02** | **P0** | **91 %** der Crank-Hooks liefern `vPre=— drop=—` trotz ausgeführtem Fetch | **durch Produktionsdaten belegt** |
| **R-K03** | **P1** | **5-s-MIN-Aggregation** verhindert sub-sekündigen Crank — **EXACT_ENOUGH unmöglich** | **durch Code belegt** |
| **R-K04** | **P1** | Crank-Rohdaten **nicht persistiert** — keine Nachauditierung | Architektur |
| **R-K05** | **P1** | `battery_features` überschreibt Crank pro Fahrzeug — nur letzter Trip | PG |
| **R-K06** | **P2** | **45,7 %** ICE-Trips ohne Crank-Log (Hook nicht gelaufen / Logs / Pfad) | **durch Produktionsdaten belegt** |
| **R-K07** | **P2** | Recovery +5s/+30s oft identisch — geringe Informationstiefe | Features |
| **R-K08** | **P2** | BEV: 104 Starts, LV-Crank **nicht anwendbar** | **durch Produktionsdaten belegt** |

---

## 18. Read-only Queries und Befehle

### Tripstarts zählen

```sql
SELECT v.fuel_type, count(*)
FROM vehicle_trips t
JOIN vehicles v ON v.id = t.vehicle_id
WHERE t.start_time >= NOW() - INTERVAL '30 days'
GROUP BY v.fuel_type;
```

### battery_features Crank-Stand

```sql
SELECT vehicle_id, crank_trip_id, crank_at, v_pre_crank, v_min_crank,
       crank_drop, v_recovery_5s, v_recovery_30s, crank_observation_count
FROM battery_features;
```

### PM2 Crank-Logs

```bash
grep -h "Crank features captured" /root/.pm2/logs/synqdrive-out*.log
grep -h "Crank features captured" /root/.pm2/logs/synqdrive-out*.log | grep -v "drop=—V" | wc -l
```

### Poll-Kadenz um Start

```sql
SELECT vehicle_id, count(*) AS polls
FROM dimo_poll_logs
WHERE job_type = 'SNAPSHOT' AND status = 'SUCCESS'
  AND started_at BETWEEN :start - INTERVAL '60 seconds' AND :start + INTERVAL '180 seconds'
GROUP BY vehicle_id;
```

### CH HF-Signale (30d)

```sql
SELECT signal_name, count() FROM telemetry_hf_points
WHERE recorded_at >= now() - INTERVAL 30 DAY
GROUP BY signal_name ORDER BY count() DESC;
```

---

## 19. Nicht verifizierbare Punkte

| Punkt | Grund |
|-------|-------|
| Exakte LV-Punktzahl pro Trip in [−60,+180] | Roh-Crank-Query nicht historisch gespeichert; keine DIMO-Requery |
| RPM-Flanke exakt am Start | HF-RPM nicht um Startzeit gespiegelt |
| Ob DIMO leere Arrays vs. null voltage liefert | Nur Log-Summary, keine Roh-JSON-Archive |
| PHEV-Crank-Verhalten | Keine Fahrzeuge |
| Sub-sekundliche Crank-Form | Auflösung nicht vorhanden |

---

## 20. Klassifikations-Legende

- **durch Produktionsdaten belegt** — VPS PG, CH, PM2
- **durch Code belegt** — Repository
- **aus Stichprobe abgeleitet** — analytische Einordnung
- **nicht verifizierbar** — Daten fehlen

---

**Changes / Architektur:** Nicht aktualisiert — reine read-only Audit-Dokumentation.
