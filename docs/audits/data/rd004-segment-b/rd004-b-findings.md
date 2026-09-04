# RD004-B.3 — Transition Evidence Correctness + HF Capture Completeness Audit

**Evidence ID:** DI-EV-0035B.3
**Phase:** RD004-B.3 (post-refuel ~16:40.498)
**Vehicle:** KS MX 2024 Mercedes-Benz C 63 AMG (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`, DIMO token `187336`)
**Session:** `f1e81e78-f96b-44ee-80c2-ca5270f21248`
**Mode:** Read-only offline analysis + read-only DIMO diagnostic requery — **no production changes**

---

## Einfache Zusammenfassung (Deutsch)

### 1. Was war am Launch-Vorgänger-Bug falsch?

`assessLaunchTransition()` nutzte effektiv `Array.find()` für den **ersten** früheren Sample statt des **unmittelbar vorherigen** physischen Nachbarn im sortierten HF-Series. Dadurch entstand fälschlich `localGapBeforeSeconds ≈ 629 s` statt der echten Lücke **35,102 s** zwischen `03:57:45.685Z` (0 km/h) und `03:58:20.787Z` (20 km/h).

**Fix:** `previousPhysicalSample = sorted[i - 1]` — Invariante `TRANSITION_PREVIOUS_SAMPLE_IS_IMMEDIATE_PREDECESSOR = YES`.

### 2. Wie groß ist die echte HF-Lücke um den Launch?

| Feld | Wert |
|------|------|
| `FIRST_LAUNCH_PROVIDER_OBSERVATION_WINDOW_START` | `2026-09-04T03:57:45.685Z` (0 km/h) |
| `FIRST_LAUNCH_PROVIDER_OBSERVATION_WINDOW_END` | `2026-09-04T03:58:20.787Z` (20 km/h) |
| `FIRST_LAUNCH_PROVIDER_OBSERVATION_WINDOW_SECONDS` | **35,102 s** |
| `localGapBeforeSeconds` (korrigiert) | **35,102 s** |

### 3. Kann +5 s noch als Clock-Evidence gelten?

**Nein.** Der +5,1…+5,6-s-Wert aus B.2 setzte fälschlich den 20-km/h-Sample-Zeitstempel als exakten Launch-Event. Die Provider-Transition ist über **[03:57:45.685, 03:58:20.787]** zensiert; das Video-Fenster **[03:58:15.217, 03:58:15.717]** ergibt nur ein breites Kompatibilitätsintervall (~−30…+5,6 s) — **zu breit für Clock-Kalibrierung**.

| Flag | Wert |
|------|------|
| `FIRST_LAUNCH_CLOCK_FIT_ELIGIBLE` | **NO** |
| `FIRST_LAUNCH_CLOCK_REJECTION_REASON` | `PROVIDER_TRANSITION_INTERVAL_TOO_WIDE` |
| `OFFSET_CANDIDATE_RANGE_SUPPORTIVE` | **null** |

### 4. Was bedeutet 43→0 in 1 s nach einer 28,7-s-Lücke?

Lokal sieht das Paar wie eine scharfe Transition aus (`PAIR_LOCAL_DT_QUALIFIED = YES`, Δv ≈ −11,9 m/s²), aber **nach einer 28,745-s-Upstream-Lücke** ohne kontinuierlichen Kontext. Das Video zeigt hingegen eine ruhige Deceleration bis t≈621,8 s.

| Flag | Wert |
|------|------|
| `PAIR_43_TO_0_LOCAL_DT_SECONDS` | **1,0** |
| `PAIR_43_TO_0_UPSTREAM_GAP_SECONDS` | **28,745** |
| `PAIR_PHYSICAL_CONTINUITY_VALIDATED` | **NO** |
| `PAIR_VIDEO_CONSISTENCY` | **CONTRADICTED_OR_UNRESOLVED** |
| `contextContinuity` | **ISOLATED_BURST** (nicht `CONTINUOUS_CONTEXT`) |

### 5. Ist ~22 s ein Clock-Offset oder nur ein Beobachtungsabstand?

**Nur ein spärlicher Beobachtungsabstand — kein Clock-Offset.**

| Flag | Wert |
|------|------|
| `FIRST_STOP_SPARSE_OBSERVATION_DISPLACEMENT_SECONDS` | **≈ +21,67 s** |
| `FIRST_STOP_DISPLACEMENT_CLOCK_AUTHORITY` | **NO** |
| Segment A | `EXPLORATORY_SPARSE_OBSERVATION_DISPLACEMENT` (~22,205 s), ebenfalls **keine** Clock-Autorität |

Die ~22-s-Wiederholung A/B bleibt diagnostisch interessant, beweist aber **keinen** validierten Provider-Clock.

### 6. Haben wir aktuell überhaupt einen echten Provider-Clock-Landmark?

**Nein.**

| Flag | Wert |
|------|------|
| `CLOCK_FIT_PROVIDER_MATCH_COUNT` | **0** |
| `CLOCK_FIT_ELIGIBLE_LANDMARKS` | **[]** |
| `PROVIDER_TIMESTAMP_OFFSET_VALIDATED` | **NO** |
| `VIDEO_TO_PROVIDER_OFFSET_SECONDS` | **null** |

B-T01/B-T02 haben hohe Video-Autorität, aber die zugehörigen Provider-Transitions sind nicht zuverlässig aufgelöst (sparse/censored). Legacy CLK-B* Landmarks sind explizit `CLOCK_FIT_ELIGIBLE = NO`.

### 7. Warum kann die Speed Accuracy weiterhin nicht final berechnet werden?

Ohne unabhängig validierten `VIDEO_TO_PROVIDER_OFFSET_SECONDS` kann Holdout-Speed-Accuracy nicht kanonisch werden. Zusätzlich verhindert die ~10,6-s-HF-Cadence (und größere Lücken) verlässliche Vergleiche an dynamischen Transitionen.

| Flag | Wert |
|------|------|
| `ABSOLUTE_SPEED_ACCURACY_VALIDATED` | **NO** |
| `SPEED_MAE_KMH` | **null** |
| `HOLDOUT_SPEED_SELECTION_TIME_ONLY` | **YES** |

### 8. Sind die 10–105-s-HF-Lücken wirklich von DIMO oder verlieren wir Samples in unserem Capture-Weg?

**Read-only DIMO-Requery (token 187336, Envelope 03:46–04:05 UTC) vs. sealed Segment B:**

| Kennzahl | Wert |
|----------|------|
| Sealed unique HF speed buckets | **66** |
| Live requery unique buckets | **108** |
| Intersection (1s-normalisiert) | **11** |
| Missing from sealed | **97** |
| `HF_SPARSE_CADENCE_ORIGIN` | **CAPTURE_PIPELINE_SAMPLE_LOSS** |
| `HF_CAPTURE_COMPLETENESS_VALIDATED` | **PARTIAL** |

Die Pipeline-Trace zeigt **keine Pagination** in `captureHistoricalSurface`, aber **Watermark-advancing HF-Fenster** (~50 unique request windows). Die Live-Requery liefert **deutlich mehr** 1s-Buckets als die sealed Capture — starke Evidenz für **verlorene/nicht persistierte Samples** im Capture-Weg, nicht allein „natürliche DIMO-Sparsity“. Provider-Upstream-Sparsity bleibt zusätzlich plausibel (Median sealed ~10,6 s).

### 9. Ist die ursprüngliche ~2-s-RD003-Cadence mit RD004 technisch vereinbar?

**Ja, technisch vereinbar** — RD003 (~2 s median) und RD004 sealed (~4,7 s Segment A, ~10,6 s Segment B) können koexistieren, wenn Capture-Watermarking, Fahrzeug/Session-Kontext und Provider-Bucket-Verfügbarkeit unterschiedlich sind. RD004 ist **nicht** automatisch „DIMO ist immer so sparse“; B.3 zeigt zumindest teilweise **Capture-Pipeline-Verlust**.

### 10. Was ist jetzt die belastbare RD004-Gesamterkenntnis?

1. **Video-Timeline B.2 bleibt kanonisch:** audio-korreliert, 1000,498365 s, T0 `03:47:02.217Z`, Stop **621,8 s**, Launch **[673,0; 673,5] s**.
2. **Clock/Offset:** **nicht validiert** — keine supportive Range, kein +5-s-Launch-Offset als Evidence.
3. **Transition-Semantik:** Launch interval-censored (35,1 s); Stop-Displacement nur sparse observation; Stop-Timing **nicht** tautologisch (kein event-derived zero error).
4. **HF:** Sealed sparsity + Live-Requery deutet auf **Capture-Sample-Loss** hin → `READY_FOR_RD004_FINAL_CLOSEOUT = NO` bis Completeness geklärt/quantifiziert.
5. **Production:** unverändert.

---

## Weitere B.3 Invarianten

| Thema | Status |
|-------|--------|
| `TRANSITION_PREVIOUS_SAMPLE_IS_IMMEDIATE_PREDECESSOR` | **YES** |
| `EVENT_CANNOT_VALIDATE_ITS_OWN_ALIGNMENT_ERROR` | **YES** |
| `NO_STALE_CLOCK_ELIGIBILITY_IN_LEGACY_ARTIFACTS` | **YES** |
| `STOP_TIMING_ERROR_SECONDS` | **null** |
| `STOP_TIMING_ANALYSIS_USED_SUPPORTIVE_OFFSET` | **NO** |
| Legacy `CLOCK_FIT_ELIGIBLE` in exploratory matches | **alle NO** |
| Raw source bytes changed | **NO** |
| Production / deploy | **NO** |
| `READY_FOR_RD004_FINAL_CLOSEOUT` | **NO** |
| `READY_FOR_MERGE` | **NO** |

---

## Artefakte

- `rd004-b-transition-interval-censoring.json` — B-T01/B-T02 interval semantics
- `rd004-b-hf-capture-completeness-diagnostic.json` — pipeline trace + live requery comparison
- `rd004-b-stop-timing.json` — no circular alignment
- `rd004-b-video-clock-alignment.json` — B.3 clock model (0 fit landmarks)
- `rd004-b-session-summary.json` — consolidated flags

**Changes / Architektur:** aktualisiert (DI-EV-0035B.3).
