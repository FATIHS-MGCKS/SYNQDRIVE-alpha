# Battery LV Estimated Health Assessment

**Prompt:** 43/78  
**Policy version:** `LV_ESTIMATED_HEALTH_ASSESSMENT_POLICY_VERSION` 1.0.0  
**Model version:** `LV_ESTIMATED_HEALTH_ASSESSMENT_MODEL_VERSION` 1

## Zweck

Versioniertes `LV_ESTIMATED_HEALTH`-Assessment für den geschätzten 12V-Batteriezustand. Der Score ist **kein SOH** — Confidence bleibt getrennt. Hysterese erfolgt erst im Publication-Schritt.

## Output

| Feld | Semantik |
|------|----------|
| `estimatedHealthScore` | 0–100 Verhaltens-/Spannungscomposite (**nicht** SOH %) |
| `confidence` / `confidenceScore` | Getrennt vom Score (Chemie-, Temperatur-, Coverage-Kontext) |
| `evidenceStrength` | `OVERRIDE` / `PRIMARY` / … aus Evidence Selection |
| `dataQuality` | Aggregiert aus Selection |
| `measurementCoverage` | Ausgewählte/gewichtete Inputs |
| `modelVersion` | Assessment-Modell (Integer, idempotent) |
| `validFrom` / `validUntil` | Zeitliche Gültigkeit des Assessment-Runs |
| `reasons` | Strukturierte Begründungen (inkl. `score_is_not_soh`) |
| `publicationEligible` | `false` für Shadow / insufficient confidence |

## Regeln

| Regel | Verhalten |
|-------|-----------|
| Profil | Kein Output bei `UNSUPPORTED_PROFILE` / `UNKNOWN_PROFILE` |
| Start-Proxy | Initial **0 %** Score-Gewicht |
| REST VALID | Gewichtete Telemetrie-Inputs (REST_6H 20 %, REST_60M 15 %, …) |
| Werkstatt / Load-Test | Separates `WORKSHOP_OVERRIDE`-Assessment |
| Shadow REST | Nur im `SHADOW`-Modus, `publicationEligible: false` |
| Idempotenz | `vehicleId` + `idempotencyKey` (Fingerprint aus Evidence + Modell) |
| Hysterese | **Nicht** im Assessment — `hysteresisDeferredToPublication: true` |

## Pipeline

```
Measurements → selectLvAssessmentEvidence()
            → buildLvChemistryAssessmentContext()
            → computeLvEstimatedHealthAssessment()
            → BatteryAssessmentRepository.persistLvEstimatedHealth()
```

Job: `BATTERY_ASSESSMENT_RECOMPUTE` → `BatteryAssessmentRecomputeHandler` → `BatteryAssessmentService`.

## Implementierung

- `lv-estimated-health-assessment.policy.ts`
- `battery-assessment.service.ts` / `battery-assessment.repository.ts`
- Score-Gewichte in `lv-assessment-thresholds.ts`
