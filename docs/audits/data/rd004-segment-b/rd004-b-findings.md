# RD004-B.5 — HF Historical Recovery Policy Design + Counterfactual Simulation

**Evidence ID:** DI-EV-0035B.5
**Phase:** RD004-B.5
**Vehicle:** KS MX 2024 Mercedes-Benz C 63 AMG (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`, DIMO token `187336`)
**Session:** `f1e81e78-f96b-44ee-80c2-ca5270f21248`
**Mode:** Read-only policy design + counterfactual simulation — **no production changes**

---

## Einfache Zusammenfassung (Deutsch) — B.5 (10 Fragen)

### 1. Was ist jetzt genau das Problem im HF-Capture?

SynqDrive fragt HF-Historical **direkt an der Live-Kante** ab (`QUERY_TO ≈ requestStartedAt`). DIMO-Aggregat-Buckets sind aber oft **später verfügbar** (B.4: 53 exact-origin Aggregate-Bucket-Beobachtungen kamen beim Replay nach). Gleichzeitig rückt das Watermark mit nur **2 s Overlap** vor — **26** geschlossene Late-Buckets waren danach **nicht mehr erreichbar**. Das ist **kein** internes Row-Drop, sondern **Provider-Late-Arrival + Watermark-Recovery-Gap**.

### 2. Kommen DIMO-Daten wirklich ungefähr im 1–2-s-Raster?

**Ja, auf Provider-Ebene plausibel** (RD003 ~2 s; B.4 exact-origin Replay **157** 1-s-Buckets vs. **104** sealed). Die sealed ~10,6 s Median-Cadence ist **Akquisitions-Vollständigkeit**, nicht das physische Provider-Raster.

### 3. Warum landen trotzdem große Lücken in SynqDrive?

Drei Schichten: (1) Abfrage zu nah an der Live-Kante → unsettled/late Buckets, (2) **2 s Overlap** reicht nicht (P50-Lag-Lower-Bound **2,129 s**, P95 **4,114 s**), (3) zero-result Capture-Zyklen sind aus sealed Export **nicht rekonstruierbar** → beobachtete Lücken sind **LOWER_BOUND**.

### 4. Reicht nur mehr Overlap?

**Nein allein.** Counterfactual: Overlap ≥6 s reklassifiziert temporale Recovery (LOWER_BOUND), aber **ohne Settlement** bleibt die Live-Kante unsettled. Overlap-only mit 15 s erzeugt **VERY_HIGH** Duplicate-Druck (~15 s / ~7,8 s Fenster). Settlement + moderates Overlap ist effizienter.

### 5. Hilft es, einige Sekunden hinter Echtzeit zu bleiben?

**Ja — zentral.** Settlement Delay `safeQueryTo = requestStartedAt - delay` hält die Abfrage aus der unsettled Zone. Bei **8 s** Delay: **50/50** geschlossene Late-Buckets LOWER_BOUND durch Settlement geschützt (Lag-Lower-Bound ≤ Delay oder Horizon-Deferral).

### 6. Welche Kombination ist am sinnvollsten?

**Empfohlen (Design only):** `SETTLED_HORIZON_PLUS_OVERLAP_PLUS_PERIODIC_SWEEP`
- **Settlement: 8 s** (ceil(max Lag 5,181 s) + 2 s Engineering-Margin)
- **Overlap: 6 s** (≥ P95-Lower-Bound + Margin; HIGH statt VERY_HIGH Duplicate-Druck)
- **Periodischer Recovery-Sweep** für Residual-Lücken (zero-result-Fenster nicht rekonstruierbar)

### 7. Wie viel zusätzliche Abfragelast?

Median HF-Fenster **~7,8 s**; **6 s Overlap ≈ 77 %** wiederholte Abdeckung pro Zyklus (HIGH pressure). Settlement **8 s** reduziert „neue“ Live-Kante pro Fenster auf ~0 s am Rand — akzeptabler Trade-off vs. 15–20 s Overlap-only. Sweep-Last **zeitlich verteilt**, idempotent per Fingerprint.

### 8. Verlieren wir Near-Real-Time-Fähigkeit?

**~8 s HF-Historical-Latenz** für settled horizon — für Driving Intelligence Episode-Reconstruction **akzeptabel**; LATEST_LIVE bleibt für Echtzeit-Signale. Kein Anspruch auf sub-Sekunden-HF-Historical am Live-Rand ohne Late-Arrival-Risiko.

### 9. Was bedeutet das für Driving Intelligence?

Bis Fix: **Reconstruction-Confidence senken** bei großen HF-Lücken — **keine Interpolation** über 10–105 s Gaps. Acceleration/Deceleration, Stop/Launch-Grenzen, Peak-Severity und Episoden-Dauer bleiben **interval-censored / LOW confidence**. Erst nach Capture-Fix: RD004 Speed/Clock/Acceleration erneut validieren.

### 10. Was muss im nächsten Produktions-PR geändert werden?

Siehe `rd004-b-hf-runtime-fix-contract.json`: `resolveHfActualQueryTo()` + Settlement, parametrisierbares Overlap in `computeHfQueryFrom()`, Recovery-Sweep-Scheduler, Observability-Metriken (`hf_query_from/to`, `settlement_delay_ms`, `recovered_late_bucket_count`, …). **Nicht in B.5** — separates Implementierungs-PR nach Staging-Validierung.

---

## Finale Flags (B.5)

| Flag | Wert |
|------|------|
| `RD004_PHASE` | **B.5** |
| `HF_CAPTURE_DEFECT_CHARACTERIZED` | **YES** |
| `PROVIDER_LATE_ARRIVAL_CONFIRMED` | **YES** |
| `CURRENT_2S_OVERLAP_SUFFICIENT` | **NO** |
| `OBSERVED_MISSED_BUCKET_COUNT_IS_LOWER_BOUND` | **YES** |
| `RECOMMENDED_SETTLEMENT_DELAY_SECONDS` | **8** |
| `RECOMMENDED_RECOVERY_OVERLAP_SECONDS` | **6** |
| `RECOMMENDED_HF_RECOVERY_ARCHITECTURE` | **SETTLED_HORIZON_PLUS_OVERLAP_PLUS_PERIODIC_SWEEP** |
| `PERIODIC_DEEP_RECOVERY_RECOMMENDED` | **YES** |
| `RD004_HF_RECOVERY_POLICY_DESIGNED` | **YES** |
| `RD004_HF_RECOVERY_RUNTIME_FIXED` | **NO** |
| `READY_FOR_RD004_ANALYSIS_MERGE` | **YES** |
| `READY_FOR_PRODUCTION_HF_RECOVERY_PR` | **YES** |
| `RAW_SOURCE_OBSERVATIONS_CHANGED` | **NO** |

---

## B.5 Artefakte

- `rd004-b-hf-recovery-policy-simulation.json` — 7×7 settlement×overlap counterfactual grid
- `rd004-b-hf-recovery-policy-design.json` — policy options A–D + DI impact + recommendation
- `rd004-b-hf-runtime-fix-contract.json` — next PR implementation contract (design only)

---

# RD004-B.4 — Exact-Window HF Replay (canonical evidence, preserved)

**Evidence ID:** DI-EV-0035B.4
**Vehicle:** KS MX 2024 Mercedes-Benz C 63 AMG (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`, DIMO token `187336`)
**Session:** `f1e81e78-f96b-44ee-80c2-ca5270f21248`
**Mode:** Read-only offline analysis + read-only DIMO exact-window replay — **no production changes**

---

## B.3 superseded (methodological correction)

B.3 concluded `HF_SPARSE_CADENCE_ORIGIN = CAPTURE_PIPELINE_SAMPLE_LOSS` from a **cross-origin** broad requery (108 vs 66 buckets, intersection 11). That comparison used global 1-second UTC flooring across queries with **different `from` origins** — invalid for DIMO **query-from-anchored** bucket identity.

| Flag | B.3 (superseded) | B.4 (canonical) |
|------|------------------|-----------------|
| `CROSS_ORIGIN_BUCKET_IDENTITY_COMPARISON_VALID` | (implicit yes) | **NO** |
| `B3_BROAD_REQUERY_SAMPLE_LOSS_PROOF_VALID` | (implicit yes) | **NO** |
| `B3_108_VS_66_RESULT` | used as proof | **DENSITY_DIAGNOSTIC_ONLY_NOT_BUCKET_IDENTITY_PROOF** |
| `HF_SPARSE_CADENCE_ORIGIN` | CAPTURE_PIPELINE_SAMPLE_LOSS | **NOT_DETERMINABLE** (acquisition completeness gap proven separately) |

B.3 transition corrections (launch 35.102 s, stop ~21.7 s observation-only, `CLOCK_FIT=0`, etc.) remain **unchanged**.

---

## Einfache Zusammenfassung (Deutsch) — 10 Fragen

### 1. Warum war der 108-vs-66-Vergleich methodisch nicht sauber?

DIMO liefert **query-from-anchored** 1-Sekunden-Aggregat-Buckets: Die Bucket-Gitter hängen vom **`from`-Parameter** der jeweiligen Abfrage ab. B.3 verglich sealed Segment-B-Samples (Fenster ab z. B. `03:47:50.768Z`) mit einer **breiten** 5-Minuten-Requery ab `03:46:00.000Z` und normalisierte beide Seiten per globalem UTC-Sekunden-Floor. Das erzeugt **verschiedene Bucket-Identitäten** für dieselbe physische Zeit — der Schnitt von 11/97/66 beweist **keinen** Sample-Verlust, nur eine Dichte-Diagnose über inkompatible Ursprünge.

### 2. Was bedeutet „query-from-anchored bucket“?

Jeder historische DIMO-Aggregat-Bucket ist an das **exakte `from` der Originalabfrage** verankert (`aggArgs.FromTS → selectInterval(..., origin)`). Bucket-Timestamp = **Intervallstart**. Zwei Abfragen mit unterschiedlichem `from` erzeugen **unterschiedliche 1-s-Raster** — auch wenn man Timestamps auf ganze UTC-Sekunden rundet. Vergleichbar sind Buckets nur bei **identischem tokenId, Feld, `from`, Intervall und Aggregation**.

### 3. Was ergibt der Replay mit exakt denselben ursprünglichen Query-Fenstern?

**75** rekonstruierte Original-HF-Fenster (volle Session), jeweils mit **identischem `hfWindowFrom` / `hfActualQueryTo`**, Intervall `1s`, Feld `speed`, Token `187336`:

| Kennzahl | Wert |
|----------|------|
| Original speed buckets (exakt-origin) | **104** |
| Replay speed buckets | **157** |
| Exakte Schnittmenge | **104** (alle Original-Buckets im Replay vorhanden) |
| Neu im Replay | **53** |
| Jetzt fehlend | **0** |
| Geänderte Werte | **0** |

Die sealed Capture hat **keine** Original-Buckets verloren, die heute fehlen — aber **53 zusätzliche** Provider-Buckets erscheinen beim Replay.

### 4. Sind später zusätzliche DIMO-Buckets aufgetaucht?

**Ja — 53** speed-Buckets waren beim ursprünglichen Request **nicht** in der sealed Antwort, sind aber beim exakt-origin Replay heute vorhanden (`NEW_REPLAY_BUCKET_COUNT = 53`). Das ist **Provider-Late-Arrival** (oder verzögerte Bucket-Verfügbarkeit), nicht SynqDrive-internes Löschen empfangener Zeilen.

### 5. Waren diese Buckets beim ursprünglichen Request bereits geschlossen?

Von 53 Late-Arrival-Buckets waren **50 bereits geschlossen** (`CLOSED_LATE_ARRIVAL_BUCKET_COUNT = 50`) zum Zeitpunkt `requestCompletedAt` — d. h. das Intervall war vor Response-Ende beendet, der Bucket aber noch nicht (oder nicht mehr) in der Original-Antwort enthalten. **3** waren noch offen.

Verfügbarkeits-Lag (untere Schranke, geschlossene Buckets):

| Statistik | Sekunden |
|-----------|----------|
| Min | **0,074** |
| P50 | **2,129** |
| P95 | **4,114** |
| Max | **5,181** |

### 6. Hätte unser 2-s-Overlap sie später noch abholen können?

**Für 26 Buckets: nein** — `DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK`. Das nächste Capture-Fenster beginnt **nach** dem Bucket-Intervall; der 2-s-Watermark-Overlap (`HF_QUERY_OVERLAP_MS = 2000`) reicht nicht, weil P50-Lag **~2,1 s** und P95 **~4,1 s** über dem Overlap liegt.

| Klassifikation | Anzahl |
|----------------|--------|
| `DEFINITELY_EXCLUDED_BY_NEXT_WATERMARK` | **26** |
| `PARTIALLY_OVERLAPPED_BY_NEXT_WINDOW` | **11** |
| `POTENTIALLY_REQUERYABLE` | **16** |

`CURRENT_2S_OVERLAP_SUFFICIENT = **NO**` (Audit only — Produktionspolicy in B.4 **nicht** geändert).

### 7. Verlieren wir Daten innerhalb SynqDrive oder kommen Provider-Daten zu spät und unser Watermark läuft daran vorbei?

**Primär: Provider zu spät + Watermark-Recovery-Gap** — nicht internes Persistenz-Drop empfangener Rows.

| Root Cause | Klassifikation |
|------------|----------------|
| `HF_CAPTURE_ROOT_CAUSE` | **PROVIDER_LATE_ARRIVAL_PLUS_CAPTURE_WATERMARK_RECOVERY_GAP** |

Semantik: DIMO stellte Aggregate **nach** dem Original-Request bereit; SynqDrive hat sie beim ersten Mal nicht erhalten; das nächste Fenster mit nur 2 s Overlap holt **26** geschlossene Late-Buckets **nicht** mehr ab. Kein Beweis für `INTERNAL_PERSISTENCE_LOSS` oder `INTERNAL_DEDUP_LOSS`.

### 8. Ist die RD003-~2-s-Cadence damit erklärt?

**Ja, vereinbar und nicht widersprüchlich.** RD003 beobachtete ~1–2 s Provider-Aggregat-Auflösung. RD004 sealed Segment B median ~10,6 s entsteht durch **Akquisitions-Vollständigkeit** (späte Provider-Buckets + 2 s Watermark), nicht weil DIMO physisch nur alle ~10 s misst. Exact-origin Replay zeigt **157** 1-s-Buckets vs. **104** sealed über dieselben Fenster.

`RD003_APPROX_2S_VS_RD004_SPARSE_EXPLAINED = YES` (acquisition-layer explanation).

### 9. Was ist jetzt die echte erreichbare HF-Dichte?

- **Provider-Layer (exact-origin replay):** deutlich dichter — **157** speed-Buckets über 75 Fenster (vs. **104** sealed full-session, **66** Segment-B-Envelope).
- **Sealed Capture-Layer:** median ~10,6 s zwischen physischen Samples im Segment-B-Envelope; große Lücken bis ~105 s bleiben.
- `HF_SPARSE_CADENCE_ORIGIN = **NOT_DETERMINABLE**` als einzelne Ursache — die Sparsity ist **gemischt**: Provider-Late-Arrival + Watermark-Policy, nicht ein monolithischer „DIMO ist immer sparse“-Befund.

### 10. Braucht die Produktions-Capture-Architektur später eine Änderung?

**Wahrscheinlich ja** — aber **nicht in B.4 implementiert**. Evidenz: P95 Late-Arrival-Lag **> 2 s** Overlap; **26** definitiv ausgeschlossene Buckets. Spätere Optionen (nicht Teil dieses PR): längeres Overlap, gezieltes Late-Bucket-Recovery, oder provider-seitige Verfügbarkeitsfenster berücksichtigen. `REFERENCE_CAPTURE_RUNTIME_CHANGED = NO`, `DEPLOYED = NO`.

---

## Finale Flags (B.4)

| Flag | Wert |
|------|------|
| `RD004_PHASE` | **B.4** |
| `DIMO_BUCKET_SEMANTICS` | QUERY_FROM_ANCHORED |
| `ORIGINAL_HF_QUERY_WINDOWS_RECONSTRUCTED` | **75** |
| `ORIGINAL_ZERO_RESULT_WINDOWS_RECONSTRUCTIBLE` | **NO** |
| `EXACT_WINDOW_REPLAY_ATTEMPTED` | **YES** |
| `EXACT_WINDOW_REPLAY_SUCCEEDED` | **YES** |
| `HF_CAPTURE_COMPLETENESS_VALIDATED` | **PARTIAL** |
| `HF_SPARSE_CADENCE_ORIGIN` | **NOT_DETERMINABLE** |
| `PROVIDER_TIMESTAMP_OFFSET_VALIDATED` | **NO** |
| `ABSOLUTE_SPEED_ACCURACY_VALIDATED` | **NO** |
| `RAW_SOURCE_OBSERVATIONS_CHANGED` | **NO** |
| `READY_FOR_RD004_FINAL_CLOSEOUT` | **NO** |

---

## Artefakte

- `rd004-b-hf-exact-window-replay.json` — per-window exact-origin comparison
- `rd004-b-hf-late-arrival-analysis.json` — late-arrival differential rows
- `rd004-b-hf-watermark-recovery-analysis.json` — overlap audit vs measured lag
- `rd004-b-hf-capture-completeness-diagnostic.json` — B.3 broad requery marked diagnostic-only + B.4 summary
- `rd004-b-session-summary.json` — consolidated flags
- B.3 artifacts preserved: `rd004-b-transition-interval-censoring.json`, etc.
