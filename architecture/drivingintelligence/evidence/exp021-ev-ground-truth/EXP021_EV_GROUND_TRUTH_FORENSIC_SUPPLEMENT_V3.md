# EXP021 — forensic supplement v3 (45s cohort + 269 ROW_ABSENT)

**Observed at (UTC):** see `forensic-readonly-exports-2026-10-16-supplement-v3/SUMMARY_SUPPLEMENT_V3.json`  
**Additive only:** `pre-deploy/`, supplement v1/v2 export trees unchanged.

## Selection (45 seconds)

`positionAvailability=PRESENT` **and** `motionState=NO_MOTION_EVIDENCE` **and** `l3SpeedKmh=null` on frozen pre-deploy replay (1136 s parity verified).

## Ergebnisgruppen

| Gruppe | Anzahl | Kurzbedeutung |
|--------|-------:|----------------|
| **A** | **45** | Enthaltung wegen fehlender/kompromittierter Evidenz (L3-±1s-Fenster mit `ROW_ABSENT` an mindestens einem Support-Punkt; S1 `abstentionReason=ROW_ABSENT`) |
| **B** | **0** | Kein Fall mit vollständigem `L3_WINDOW_COMPLETE` und verwertbarer Bein-Geometrie bei gleichzeitig null L3 |
| **C** | **0** | — |

### Mechanismus (CONFIRMED, gepinnte Evidenz)

- Mittelpunkt oft `PRESENT` / `FRESH`, aber **Nachbar-±1s** häufig `ROW_ABSENT_EXPLICIT` → `supportCondition` ≠ `L3_WINDOW_COMPLETE`.
- `noNumericDisjointV2` typisch `POS_GAP_ROW_ABSENT_EXPLICIT` (oder kombinierte Gap-Signatur).
- `speedEvidenceState=NONE`, QC `UNTRUSTED` / `NO_NUMERIC`.
- `holdTransitionDetail=NO_MOTION_EVIDENCE` folgt S1, ist hier **Folge** der Positionslücke, kein Hold/Release-Release-Event am Mittelpunkt.

Details pro Sekunde: `PRESENT_NO_MOTION_NULL_L3_COHORT_SUPPLEMENT_V3.json` (L3-Triplet, QC-Beine, Video-Tacho aus `comparison.json`).

### Video-Tacho

- Meist `tachoKmh=null` mit `videoTimeUncertainty` aus Kompakt-Review (keine lesbare Anzeige / keine Samples).
- **2** Sekunden der Kohorte haben annotiertes `tachoKmh=0` (CONFIRMED aus `comparison.json`); Unsicherheit je Eintrag im JSON.

### Zusammenhängende Lückenereignisse

`contiguousGapEvents` im Kohorten-JSON: Runs nach UTC-Kontinuität + identischer Support-Gap-Signatur (überwiegend isolierte 1s-Ereignisse mit Nachbar-`ROW_ABSENT`).

## Gruppe B — Offline-Hypothese (vorbereitet, nicht ausgelöst)

`groupBExperimentHypothesis` im Kohorten-JSON: Re-Schatzung aus **nur** `PRESENT_OK`-Triplet-Beinen, Bucket-zeitbezug, Risiken (Hold/Gap/Stop-Band). **Keine** Schutzgrenzen-Lockerung, keine produktive Freigabe.

## 269 fehlende Positionssekunden (`ROW_ABSENT`)

Separates Artefakt: `ROW_ABSENT_269_AUDIT_SUPPLEMENT_V3.json`

- **CONFIRMED:** 269 Buckets `ROW_ABSENT` im gepinnten POSITION-Snapshot; `providerRowCount=0` auf diesen Buckets; **0** `rejectedProviderRows` (konsistent mit supplement v2).
- **Overlap:** 133 der 135 Video-Tacho-Nullsekunden liegen auf `ROW_ABSENT` (nicht in der 45er-Kohorte, die PRESENT am Mittelpunkt verlangt).
- **Vergleichsabruf:** DIMO historical `currentLocationCoordinates` 1s AVG — **1** Call, Fenster min/max ROW_ABSENT-Label (Alternative: volles Trip-Fenster), **nicht ausgeführt** (`comparisonFetchExecuted: false`).

Regenerate:

```bash
cd backend && npm run exp021:ev-ground-truth:forensic-supplement-v3 -- --out-dir ../architecture/drivingintelligence/evidence/exp021-ev-ground-truth/forensic-readonly-exports-2026-10-16-supplement-v3
```
