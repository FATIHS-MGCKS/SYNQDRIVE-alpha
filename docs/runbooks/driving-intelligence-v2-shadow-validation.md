# Driving Intelligence V2 — Shadow Validation Runbook

Stand: 2026-07-17  
Zielgruppe: Ops / Engineering vor Aktivierung von `DRIVING_INTELLIGENCE_V2_ENABLED` oder Shadow-Detektor-Flags.

---

## 1. Zweck

Shadow-Validierung stellt sicher, dass neue Engine-/HF-Detektoren, erweiterte Assessability und V2-Jobs **keine operative Kunden- oder Readinesswirkung** haben, bevor sie publiziert werden.

**Grundsätze:**

- Telemetrie erzeugt **Empfehlung**, keine finale Entscheidung
- Shadow-Evidence ist **nicht** belastbarer Vorwurf
- Keine automatische Kundenblockierung
- Trip-Detection bleibt unverändert

---

## 2. Voraussetzungen

| Voraussetzung | Prüfung |
|---------------|---------|
| `DRIVING_INTELLIGENCE_V2_ENABLED=false` in Prod (default) | `backend/.env` / VPS `backend.env` |
| Shadow-Flags nur in Staging oder mit Master an | `DRIVING_V2_ENGINE_DETECTOR_SHADOW_ENABLED`, `DRIVING_V2_HF_DETECTOR_SHADOW_ENABLED` |
| Reconciliation aktiv | Scheduler `driving-analysis-reconciliation.scheduler.ts` |
| Tests grün | `docs/testing/driving-intelligence-v2-coverage.md` |

---

## 3. Pre-Flight Checks

```bash
cd backend

# 1) Unit — Shadow framework
npm test -- --testPathPattern="shadow-detector"

# 2) Kein Auto-Block in Pattern Summary
npm test -- --testPathPattern="rental-driving-analysis.pattern-summary"

# 3) Attribution — Time-Window nie allein HIGH
npm test -- --testPathPattern="attribution-resolver"

# 4) Misuse — eventCount aus qualified evidence
npm test -- --testPathPattern="misuse-case-persistence"
```

---

## 4. Staging-Aktivierung (Shadow only)

### 4.1 Flags setzen

```bash
DRIVING_INTELLIGENCE_V2_ENABLED=true
DRIVING_V2_ENGINE_DETECTOR_SHADOW_ENABLED=true
DRIVING_V2_HF_DETECTOR_SHADOW_ENABLED=true
# NICHT aktivieren bis Runbook + Legal OK:
# customerDrivingDecisionEnabled — noch nicht im Code
```

### 4.2 Smoke nach Trip-Abschluss

1. Trip abschließen (bestehende FSM — unverändert).
2. Prüfen: `driving_analysis_runs` mit `analysisType=TRIP_ENRICHMENT`.
3. Prüfen: Shadow-Evidence in `driving_evidence` mit Shadow-Maturity — **kein** Misuse-Publish aus Shadow allein.
4. Prüfen: Kunde **nicht** in Eligibility geblockt.
5. Prüfen: `rental_driving_analyses.payload.patternSummary.automaticBlockingEnabled === false`.

### 4.3 SQL-Snippets (read-only)

```sql
-- Shadow runs ohne operative Misuse-Eskalation
SELECT COUNT(*) FROM driving_evidence de
JOIN driving_analysis_runs r ON r.id = de.analysis_run_id
WHERE de.metadata_json::text LIKE '%SHADOW%'
  AND r.started_at > NOW() - INTERVAL '24 hours';

-- Keine DrivingDecisionAudit (P73 noch nicht deployed)
-- SELECT COUNT(*) FROM driving_decision_audits;
```

---

## 5. Validierungsmatrix

| Check | Erwartung | Fail-Aktion |
|-------|-----------|-------------|
| **Neue Engine/HF-Detektoren** | Nur `driving_evidence` / `driving_analysis_runs`; kein Misuse CONFIRMED aus Shadow | Flag aus; Incident |
| **False Positives** | Detektor-Policy-Specs grün; manuelle Stichprobe 10 Trips | Threshold-Review |
| **Native-Event-Vergleich** | Gleicher Provider-Payload → gleicher Fingerprint; keine Duplikat-Rows | `dimo-native-event-fingerprint` prüfen |
| **Health Eligibility** | Kein produktiver Tire/Brake-Verbrauch aus Shadow | Handler muss `SHADOW_ONLY` / `LIMITED` respektieren (wenn P65–P67 live) |
| **Kundenwirkung** | `CustomerEligibilityService` unverändert durch Driving | Eligibility-Diff auditieren |
| **Readinesswirkung** | Kein `blocksRental` / `preventsReady` aus Driving Shadow | Dashboard/Operational-State prüfen |
| **Impact-Status-Sync** | Nach Impact-Compute: `drivingImpactStatus=READY` | Reconciliation-Lauf (`status_desync`) |

---

## 6. Reconciliation / Repair

```bash
# Periodischer Reconciliation-Job (bereits im Scheduler)
# Manuell triggern falls API/Admin vorhanden — sonst Worker-Log prüfen

# Metrik
# synqdrive_driving_analysis_reconciliation_actions_total{check_type="DRIVING_IMPACT_STATUS_MISMATCH"}
```

**P76-Fix:** `status_desync` synchronisiert `drivingImpactStatus=READY` wenn `trip_driving_impact` existiert — **ohne** Recompute.

---

## 7. Rollback

| Schritt | Aktion |
|---------|--------|
| 1 | `DRIVING_INTELLIGENCE_V2_ENABLED=false` |
| 2 | PM2/Worker restart |
| 3 | Pending V2-Jobs: `driving_intelligence_jobs` Status prüfen (kein Auto-Delete) |
| 4 | Shadow-Evidence bleibt in DB — **kein** Datenverlust nötig |

Legacy Post-Trip-Pipeline (BullMQ `driving-impact`, enrichment) läuft unabhängig vom V2-Master-Flag weiter.

---

## 8. Abnahme vor Promotion (Shadow → Published)

- [ ] 7 Tage Staging ohne Kunden-Eligibility-Regression
- [ ] Shadow FP-Rate dokumentiert (< Team-Schwelle)
- [ ] `docs/audits/driving-intelligence-v2-final-audit.md` — keine offenen P0 für Ziel-Dimension
- [ ] Grafana DI-Funnel live (P74) oder manuelles SQL-Monitoring
- [ ] TripDecisionSummary UI (P72) für Operator-Semantik
- [ ] Legal/Runbook für `customerDrivingDecisionEnabled` (wenn P73)

---

## 9. Referenzen

- `docs/architecture/driving-intelligence-v2-rollout-flags.md`
- `docs/architecture/driving-intelligence-v2.md` §9 (Manuelle Entscheidung)
- `docs/testing/driving-intelligence-v2-coverage.md`
- `docs/audits/driving-intelligence-v2-final-audit.md`
