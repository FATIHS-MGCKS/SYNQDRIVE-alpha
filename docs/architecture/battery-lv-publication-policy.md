# Battery LV Publication Policy

**Prompt:** 44/78  
**Policy version:** `LV_PUBLICATION_POLICY_VERSION` 1.0.0

## Zweck

Publication Policy für LV Battery Health V2 — standardmäßig hinter deaktiviertem Feature Flag `batteryV2PublicationEnabled` / `BATTERY_V2_PUBLICATION_ENABLED`.

## Maturity-Zustände

| State | Bedeutung |
|-------|-----------|
| `UNAVAILABLE` | Flag aus, unsupported Profil, kein Assessment |
| `CALIBRATING` | Gates nicht erfüllt (Evidence, Zyklen, Confidence, Kontamination) |
| `SHADOW` | Shadow-Assessment — nicht user-facing |
| `PROVISIONAL` | Erste user-facing Publication, Stabilisierung läuft |
| `STABLE` | Stabile Wiederholung über Messzyklen |
| `STALE` | Publication-Evidence veraltet |
| `SUPERSEDED` | Durch neuere Publication ersetzt (auditierbar) |

## Publication-Gates

Publication nur bei:

- unterstütztem Profil
- ausreichender valider Evidence
- Mindestanzahl kompatibler Messzyklen
- akzeptabler Confidence
- ausreichender Freshness (**Assessment-Evidence**, nie Live-Spannung)
- stabiler Wiederholung (6 Zyklen / 14 Tage für STABLE)
- keiner Kontaminationsdominanz

## Regeln

| Regel | Verhalten |
|-------|-----------|
| Feature Flag | `BATTERY_V2_PUBLICATION_ENABLED` default `false` |
| Shadow | Nicht user-facing publiziert |
| Hysterese | `stabilize()` + `shouldPublish()` verhindert Flattern |
| Supersede | Neue `battery_publications`-Row mit `supersedePublicationId`; alte Row `maturity: SUPERSEDED` |
| Freshness | Live-Spannung aktualisiert Publication-Freshness **nicht** |
| Score-Semantik | `publishedEstimatedHealth` — nie `publishedSohPct` |
| Readiness | Keine Wirkung in Prompt 44 |

## Pipeline

```
LV_ESTIMATED_HEALTH Assessment
  → evaluateLvPublicationPolicy()
  → BatteryPublicationRepository.persistLvPublication()
  → (optional) markPublicationSuperseded()
```

Job: `BATTERY_PUBLICATION_UPDATE` → `BatteryPublicationUpdateHandler` → `BatteryPublicationService`.

## Implementierung

- `lv-publication-thresholds.ts` — zentrale Gates
- `lv-publication.policy.ts` — reine Policy
- `battery-publication.repository.ts` / `battery-publication.service.ts`
- Legacy `SohPublicationState` Mapping für DB-Kompatibilität; V2-Maturity in `reason` JSON
