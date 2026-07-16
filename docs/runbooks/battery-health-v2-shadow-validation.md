# Battery Health V2 — Shadow Validation Runbook

Stand: 2026-07-16 (Prompt 76/78)  
Ziel: **Technische Shadow-Validierung** über 4–8 Wochen — Auswertung und Gates **ohne** automatische Kundenpublication oder Readiness-Freigabe.

---

## 1. Grundsätze

| Regel | Bedeutung |
|-------|-----------|
| **Shadow only** | Flags `BATTERY_V2_PUBLICATION_ENABLED`, `BATTERY_V2_HV_SOH_PUBLICATION_ENABLED`, `BATTERY_V2_READINESS_ENABLED` bleiben `false` |
| **Read-only Report** | Auswertung liest DB/Metriken — **keine** Writes, **keine** Flag-Änderung durch den Report |
| **Manuelles Go/No-Go** | `gates_ready_for_manual_review` ist **kein** Auto-Rollout — Domain Owner entscheidet |
| **Beobachtungsfenster** | Minimum **28 Tage** (4 Wochen), empfohlen **28–56 Tage** (4–8 Wochen) |

Verwandte Dokumente:

- Deployment-Phasen: `docs/runbooks/battery-health-v2-deployment.md`
- LV REST Shadow AC: `docs/architecture/lv-rest-shadow-acceptance.md`
- Prometheus/Grafana: `docs/architecture/battery-v2-grafana-prometheus-ops.md`

---

## 2. Beobachtungszeitraum (4–8 Wochen)

### 2.1 Planung

1. **T0** — Shadow-Flags für Canary-Org aktivieren (siehe Deployment-Runbook §7–9)
2. **T0 dokumentieren** — Startdatum, Org-ID, Fahrzeugliste, aktive Flags
3. **Wöchentlich** — Shadow-Report generieren (gleicher Zeitraum, wachsendes Fenster)
4. **T+28d** — Erstes formales Gate-Review (Minimum)
5. **T+56d** — Empfohlenes Ende des Kern-Beobachtungsfensters (HV M2/M3-Stabilität)

### 2.2 Report-Zeitraum setzen

```bash
# Letzte 35 Tage (ab heute rückwärts)
--observation-days=35

# Explizites Fenster
--from=2026-06-11T00:00:00.000Z --to=2026-07-16T23:59:59.999Z
```

Der Report markiert `observationPeriod.meetsMinimumPeriod` erst ab ≥ 28 Tagen als `true`.

---

## 3. Ausführung — Report erzeugen

### 3.1 CLI (empfohlen für Ops)

```bash
cd backend

# Org-spezifisch, Markdown-Artefakt
npx ts-node -r tsconfig-paths/register scripts/ops/battery-shadow-validation-report.ts \
  --organization-id=<ORG_UUID> \
  --observation-days=35 \
  --format=markdown \
  --output=./tmp/battery-shadow-validation.md

# JSON auf stdout
npx ts-node -r tsconfig-paths/register scripts/ops/battery-shadow-validation-report.ts \
  --organization-id=<ORG_UUID> \
  --observation-days=35

# Gesamte Plattform (alle Orgs) — nur mit expliziter Freigabe
npx ts-node -r tsconfig-paths/register scripts/ops/battery-shadow-validation-report.ts \
  --observation-days=35 \
  --allow-remote-db
```

**Sicherheit:** Gleiche DB-Guards wie `audit-battery-data.ts` — kein Prod ohne Override.

### 3.2 HTTP — Platform Admin (MASTER_ADMIN)

```
GET /api/v1/admin/battery-shadow-validation-report
  ?organizationId=<ORG_UUID>
  &observationDays=35
  &vehicleSampleLimit=10
```

- Read-only JSON-Report
- Audit-Log: `Admin generated Battery V2 shadow validation report`
- **Aktiviert keine Flags**

### 3.3 HTTP — Data Analyse (Org-scoped)

```
GET /api/v1/organizations/:orgId/data-analyse/battery-shadow-validation-report
  ?observationDays=35
  &from=<ISO>
  &to=<ISO>
  &vehicleId=<optional>
```

- Permission: `data-analyse` → `read`
- Für interne Analysten / Domain Owner

### 3.4 Ergänzend: Per-Fahrzeug-Detail

| Endpoint | Zweck |
|----------|-------|
| `GET .../battery-health/lv-rest-shadow-summary` | LV REST-Detail |
| `GET .../battery-health/lv-start-proxy-diagnostic` | Start-Proxy-Detail |
| `GET .../data-analyse/vehicles/:id/hv-capacity-shadow-evaluation` | HV M2/M3/SOH-Gate |

---

## 4. Metriken-Matrix

### 4.1 LV (12V / REST / Start-Proxy)

| Metrik | Report-Feld | Gate / Schwelle |
|--------|-------------|-----------------|
| Ruhefenster | `lv.restWindowCount`, `lv.vehiclesWithRestWindows` | > 0 bei aktivem REST-Shadow |
| REST 60m Capture | `lv.rest60m.captureRatePct` | Dokumentiert; Ziel: stabile Erfassung |
| REST 6h Capture | `lv.rest6h.captureRatePct` | Dokumentiert |
| MISSED | `lv.missedTotal` | Dokumentiert (kein Massen-MISSED ohne Root-Cause) |
| Wake-Kontamination | `lv.wakeContaminationRatePct` | **≤ 35 %** (`BatteryRestWakeContaminationHigh`) |
| Charging-Kontamination | `lv.chargingContaminationCount` | Informativ |
| Profilverteilung | `lv.profileDistribution` | ICE/PHEV/BEV/Chemistry plausibel |
| Start-Proxy Coverage | `lv.startProxyMeasurements` | > 0 bei aktivem Start-Proxy-Flag |
| INSUFFICIENT_COVERAGE | `lv.startProxyInsufficientCoverage` | Dokumentiert, nicht massenhaft |
| Assessment-Streuung | `lv.shadowLvScoreStdDevMedian`, `lv.shadowLvScoreRange` | Informativ — keine harten Auto-Gates |
| False-Positive-Kandidaten | `lv.falsePositiveCandidates` | Shadow LV-Score < 55; **Warn** bei > 5 |

### 4.2 HV (Recharge / M2 / M3)

| Metrik | Report-Feld | Gate / Schwelle |
|--------|-------------|-----------------|
| Recharge-Segment-Abdeckung | `hv.rechargeSegmentCoveragePct` | > 0 Sessions |
| Session-Qualität | `hv.sessionQualityDistribution` | QUALIFIED/VALID/SHADOW-Anteil prüfen |
| M2-Stichproben | `hv.m2ObservationCount` | **≥ 3** |
| M2 Session CV p95 | `hv.m2SessionCvP95` | **≤ 2 %** |
| Intra-Session-Streuung | `hv.m2SessionCvMedian` | Informativ |
| Cross-Session-Streuung | `hv.crossSessionScatterPct` | Informativ |
| M3-Übereinstimmung | `hv.m3AgreementRatePct` | **≥ 75 %** (Konflikt ≤ 25 %) |
| Capability-Stabilität | `hv.capabilityChangedCount`, `capabilityUnavailableCount` | Keine Massen-UNAVAILABLE |
| Referenzkapazität | `hv.referenceCapacityActiveCount` | ≥ 1 für BEV-Canary |
| Speicherwachstum | `hv.storageGrowth.*` | Informativ — Retention separat |

### 4.3 Safety (immer)

| Gate | Erwartung |
|------|-----------|
| `safety_publication_disabled` | `publicationEnabled=false`, `hvSohPublicationEnabled=false` |
| `safety_readiness_disabled` | `readinessEnabled=false` |
| `safety_no_battery_rental_blockers` | 0 neue Battery-Blocker (manuell Rental-Health querchecken) |

---

## 5. Report-Empfehlungen (`overallRecommendation`)

| Wert | Bedeutung | Aktion |
|------|-----------|--------|
| `continue_shadow` | Noch sammeln | Flags unverändert, weiter beobachten |
| `insufficient_data` | < 28 Tage oder zu wenig Samples | Fenster verlängern / Canary vergrößern |
| `review_required` | Warn/Fail-Gates | Domain-Review, Root-Cause, **kein** Auto-Publish |
| `gates_ready_for_manual_review` | Alle Gates grün | **Manuelles** Go für nächste Deployment-Phase |

**Explizit verboten:** Report → automatisch `BATTERY_V2_PUBLICATION_ENABLED=true` setzen.

---

## 6. Wöchentlicher Ablauf (Checkliste)

1. [ ] Grafana Dashboard `synqdrive-battery-v2` — Alerts nicht dauerhaft firing
2. [ ] Shadow-Report CLI/API für Canary-Org (`observation-days` = Tage seit T0)
3. [ ] Markdown-Artefakt in Ops-Ticket / Change-Log ablegen
4. [ ] Auffällige Fahrzeuge über `vehicleSamples` → Per-Fahrzeug-Endpoints vertiefen
5. [ ] Bei `review_required`: Incident/RCA, **kein** Flag-Flip
6. [ ] Rental-Health manuell: keine neuen `battery_readiness_not_ready` Blocker auf Canary
7. [ ] Speicherwachstum vs. Retention-Plan (`battery-v2-retention.md`)

---

## 7. Gate-Review nach 4–8 Wochen

### 7.1 LV-Freigabe-Vorbereitung (manuell)

- [ ] REST capture stabil über Canary-ICE
- [ ] Wake-Kontamination < 35 %
- [ ] MISSED erklärt (Provider-Delay vs. echte Lücken)
- [ ] Start-Proxy diagnostisch ausreichend
- [ ] False-Positive-Kandidaten reviewed

### 7.2 HV-Freigabe-Vorbereitung (manuell)

- [ ] ≥ 14 Tage Recharge-Sessions auf Canary-BEV
- [ ] M2 CV p95 < 2 % über ≥ 3 Sessions
- [ ] M3-Konfliktrate < 25 %
- [ ] Referenzkapazität verifiziert wo nötig
- [ ] Capability stabil

### 7.3 Nächster Schritt (nur nach menschlicher Freigabe)

Siehe `battery-health-v2-deployment.md` §13 — Publication-Flags **separat** und **bewusst** aktivieren. Shadow-Report ist **Voraussetzung**, nicht **Trigger**.

---

## 8. Troubleshooting

| Symptom | Prüfen |
|---------|--------|
| `insufficient_data` überall | Beobachtungsfenster < 28d oder Canary zu klein |
| Hohe Wake-Kontamination | FSM/REST-Anchor, Trip-End-Timing, DIMO-Signal |
| M2 CV hoch | Session-Qualität, Segment-Grenzen, Energie-SOC-Konsistenz |
| M3-Konflikte | `hv-capacity-shadow-evaluation` pro Session |
| Speicher schnell wachsend | Retention dry-run, Aggregates |

---

## 9. Implementierung (Code-Referenz)

| Komponente | Pfad |
|------------|------|
| Service | `battery-health/shadow-validation/battery-shadow-validation.service.ts` |
| Aggregator | `battery-shadow-validation.aggregator.ts` |
| Gates | `battery-shadow-validation.policy.ts` |
| Admin API | `GET /api/v1/admin/battery-shadow-validation-report` |
| Org API | `GET .../data-analyse/battery-shadow-validation-report` |
| CLI | `backend/scripts/ops/battery-shadow-validation-report.ts` |
| Tests | `battery-shadow-validation.policy.spec.ts` |

---

## 10. Abgrenzung

| Tool | Zweck |
|------|-------|
| **Shadow Validation Report** (dieses Runbook) | Rollout-Gates, 4–8-Wochen-Beobachtung |
| `audit-battery-data.ts` | Datenintegrität (13 Checks) |
| `repair-battery-data.ts` | Kontrollierte Remediation (mit `--apply`) |
| Grafana Alerts | Echtzeit-Überwachung |
| Retention Job | Speicher-Lifecycle (kein Publish) |
