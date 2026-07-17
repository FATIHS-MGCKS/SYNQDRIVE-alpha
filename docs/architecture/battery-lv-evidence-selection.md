# Battery LV Evidence Selection Policy

**Prompt:** 41/78  
**Policy version:** `LV_EVIDENCE_SELECTION_POLICY_VERSION` 1.0.0

## Zweck

Zentrale Auswahlregel für LV-Assessment-Inputs. Kombiniert nur kompatible Messzyklen und liefert strukturierte Auswahlmetadaten für Assessments und Read-Models.

## Kombinieren (nur wenn alle Gates passieren)

| Gate | Regel |
|------|-------|
| Profil | Unterstütztes Drive-Profil + Chemie; `lvAssessmentAllowed` |
| Messart | In `ResolvedBatteryPolicy.supportedMeasurementTypes` |
| Qualität Ruhe | Nur `VALID` als qualifizierte Rest-Evidence |
| Qualität Start | `VALID` / `VALID_PROXY` nur als **DIAGNOSTIC** |
| Freshness | `restMeasurementObservation` (48 h), `startProxyObservation` (7 d) |
| Provenienz | Provider-Timestamp + `receivedAt` (Telemetrie); Werkstatt `serviceEventId` |
| Periode | Gleiche Rest-Session **oder** gleiche ICE-Start-Session **oder** Rest↔Start ≤ 14 Tage |

## Nicht kombinieren

| Fall | Rejection reason |
|------|------------------|
| Neue Ruhewerte + monatealter Start-Proxy | `TEMPORALLY_INCOMPATIBLE_PERIOD` |
| Kontaminierte Measurements | `CONTAMINATED_MEASUREMENT` |
| Legacy CRANK_MIN (Flag aus) | `LEGACY_CRANK_DEPRECATED` |
| Unbekannte Chemie | `UNKNOWN_CHEMISTRY` |
| BEV ohne LV-Signal | `BEV_WITHOUT_LV_SIGNAL` |
| `VALID_PROXY` als Ruhe-Evidence | `VALID_PROXY_NOT_REST_EQUIVALENT` |
| Inkompatible Rest-Lebenszyklen | `MIXED_INCOMPATIBLE_LIFECYCLES` |

## Output

```typescript
selectLvAssessmentEvidence({
  policy: ResolvedBatteryPolicy,
  candidates: LvAssessmentEvidenceCandidate[],
  now?: Date,
})
```

| Feld | Bedeutung |
|------|-----------|
| `selectedEvidence` | Kompatible Measurements mit `evidenceStrength` |
| `rejectedEvidence` | Abgelehnte Measurements + `reasons` / `reasonLabels` |
| `evidenceWindow` | `restPeriodKey`, `startPeriodKey`, Zeitfenster, `temporallyCompatible` |
| `evidenceStrength` | Aggregat: `OVERRIDE` > `PRIMARY` > `SUPPLEMENTARY` > `DIAGNOSTIC` |
| `dataQuality` | `VERIFIED` / `ESTIMATED` / `PROXY` / `UNAVAILABLE` |

## Evidence strength mapping

| Quelle | Strength |
|--------|----------|
| `WORKSHOP_*` | `OVERRIDE` |
| `REST_*` + `VALID` | `PRIMARY` |
| Start-Proxy (`START_DIP_PROXY`, `RECOVERY_*`, `PRE_START_VOLTAGE`) | `DIAGNOSTIC` |
| `VALID_PROXY` (nicht-Ruhe) | `SUPPLEMENTARY` |

## Implementierung

- `backend/src/modules/vehicle-intelligence/battery-health/lv-assessment/lv-evidence-selection.policy.ts`
- Nutzt `LV_TEMPORAL_INCOMPATIBILITY_MS` (14 Tage), `battery-freshness.policy`, `battery-policy-profile.resolver`

## Tests

- Gemischte Lebenszyklen (zwei Rest-Fenster, dominantes Fenster gewinnt)
- Frische REST + alter Start-Proxy → temporal incompatible
- Kompatible REST + Start-Proxy → PRIMARY + DIAGNOSTIC
- Kontamination, Legacy-Crank, BEV ohne LV, unbekannte Chemie, `VALID_PROXY`-Ruhe, stale, incomplete provenance
