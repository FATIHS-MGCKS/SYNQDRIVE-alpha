# RD004-B.6.1 — HF Recovery Policy Semantic Hygiene Closeout

**Evidence ID:** DI-EV-0035B.6 (B.6.1 hygiene closeout)
**Phase:** RD004-B.6.1
**Mode:** Read-only naming/API hygiene — **no production changes**

## Kurz (Deutsch) — 5 Fragen

1. **Wurde noch irgendein „geschützt/verfügbar“-Claim aus Lower Bounds abgeleitet?**
   **Nein.** `closedLateBucketProtectedBySettlementDelay()` entfernt. Keine kanonische API mit „ProtectedBySettlement“.

2. **Bedeutet Overlap jetzt nur noch zeitliche Wiederabdeckung?**
   **Ja.** Felder heißen `temporalCoverageCandidateCount` / `temporallyExcludedCount`; Interpretation `TEMPORAL_QUERY_COVERAGE_ONLY`.

3. **Wissen wir die tatsächliche DIMO-Verfügbarkeit weiterhin nicht?**
   **Ja.** `actualProviderFirstAvailabilityAt = UNKNOWN`; `actualRecoveryCount = null`.

4. **Bleiben 8 s / 6 s provisorisch?**
   **Ja.** `PARAMETERS_VALIDATED = NO`, `PRODUCTION_HF_POLICY_PARAMETERS_VALIDATED = NO`.

5. **Ist #1532 danach wirklich bereit für Analyse-Merge?**
   **Ja.** `READY_FOR_RD004_ANALYSIS_MERGE = YES`, `READY_FOR_PRODUCTION_HF_RECOVERY_PR = YES`.

---

# RD004-B.6 — HF Recovery Policy Lower-Bound Semantics Correction

**Evidence ID:** DI-EV-0035B.6
**Phase:** RD004-B.6
**Vehicle:** KS MX 2024 Mercedes-Benz C 63 AMG (`a60c0749-a7cd-494e-b5b9-dea3c6b97d63`, DIMO token `187336`)
**Session:** `f1e81e78-f96b-44ee-80c2-ca5270f21248`
**Mode:** Read-only semantics correction + policy authority closeout — **no production changes**

**Supersedes:** B.5 parameter authority (`B5_8S_SETTLEMENT_50_OF_50_PROTECTION_CLAIM_VALID = NO`)

---

## Einfache Zusammenfassung (Deutsch) — B.6 (10 Fragen)

### 1. Was war an „8 s schützen 50/50“ falsch?

B.5 behandelte `availabilityLagLowerBoundSeconds ≤ 8 s` fälschlich als Beweis, dass DIMO den Bucket **nach 8 s verfügbar** hätte. Eine **untere Schranke** von 5,181 s bedeutet nur: die echte Verfügbarkeit war **> 5,181 s** — sie kann 9 s, 15 s oder 30 s sein. „Konsistent mit Kandidat“ ≠ „geschützt“.

### 2. Was wissen wir über die echte DIMO-Verfügbarkeit sicher?

Nur: für 53 Late-Buckets war `actualProviderFirstAvailabilityAt > originalRequestCompletedAt`. Die **obere Schranke ist unbekannt**. Replay-Zeitpunkt darf **nicht** als obere Schranke verwendet werden.

### 3. Was bedeutet die 5,181-s-Zahl wirklich?

`AVAILABILITY_DELAY_LOWER_BOUND = originalRequestCompletedAt − bucketEnd`. Das ist die **minimale** beobachtete Verzögerung — nicht die tatsächliche Provider-Verfügbarkeit.

### 4. Wissen wir, ob 8 s reichen?

**NEIN.** 8 s ist ein **PROVISIONAL_ENGINEERING_CANDIDATE** für Settlement-Horizon-Deferral (Hot-Edge-Abfrage verschieben), **nicht** ein validierter Provider-Verfügbarkeitsbeweis.

### 5. Wissen wir, dass 2 s nicht reichen?

**JA.** 26 geschlossene Late-Buckets waren **definitiv** außerhalb des nächsten 2-s-Overlap-Fensters (`CURRENT_2S_OVERLAP_SUFFICIENT = NO`).

### 6. Ist 6 s Overlap sicher ausreichend?

**Noch nicht bewiesen.** 6 s ist **PROVISIONAL_COVERAGE_CANDIDATE** — geänderte Query-Origins und unbekannte First-Availability verhindern Vollständigkeitsgarantie.

### 7. Welche Architektur empfehlen wir trotzdem?

`SETTLED_HORIZON_PLUS_OVERLAP_PLUS_PERIODIC_SWEEP` — Fast HF Loop + settled horizon + bounded overlap + **periodischer Deep-Recovery-Sweep** (für Robustheit bei unbekannter Verfügbarkeitsverteilung).

### 8. Können wir den Produktions-Fix trotzdem bauen?

**JA** — als **parametrisierbare Architektur** mit provisorischen Startwerten (`HF_SETTLEMENT_DELAY_MS`, `HF_RECOVERY_OVERLAP_MS`) und Observability. `PRODUCTION_HF_POLICY_PARAMETERS_VALIDATED = NO` bis Live-Kalibrierung.

### 9. Wie bestimmen wir danach die optimalen Sekunden?

Live-Availability-Kalibrierungsexperiment (siehe `buildLiveAvailabilityCalibrationContract`): für jeden geschlossenen 1-s-Bucket kontrollierte Re-Queries bei +1…+30 s, Aufzeichnung von `firstObservedPresentAt` → P50/P90/P95/max `actualAvailabilityDelaySeconds`.

### 10. Was muss vor erneuter Speed/Clock-Validierung passieren?

HF-Recovery-Runtime-Fix + **frische dichte Reference-Capture**. RD004 sealed series ist acquisition-incomplete — `RD004_ABSOLUTE_SPEED_VALIDATION_COMPLETE = NO`, `RD004_CLOCK_VALIDATION_COMPLETE = NO`.

---

## Finale Flags (B.6)

| Flag | Wert |
|------|------|
| `RD004_PHASE` | **B.6** |
| `B5_8S_SETTLEMENT_50_OF_50_PROTECTION_CLAIM_VALID` | **NO** |
| `AVAILABILITY_DELAY_IS_LOWER_BOUND_ONLY` | **YES** |
| `ACTUAL_FIRST_PROVIDER_AVAILABILITY_KNOWN` | **NO** |
| `CURRENT_2S_OVERLAP_SUFFICIENT` | **NO** |
| `RECOMMENDED_HF_RECOVERY_ARCHITECTURE` | **SETTLED_HORIZON_PLUS_OVERLAP_PLUS_PERIODIC_SWEEP** |
| `RECOMMENDED_POLICY_PARAMETERS` | **REQUIRES_LIVE_AVAILABILITY_VALIDATION** |
| `PROVISIONAL_SETTLEMENT_DELAY_SECONDS` | **8** (provisional) |
| `PROVISIONAL_RECOVERY_OVERLAP_SECONDS` | **6** (provisional) |
| `PARAMETERS_VALIDATED` | **NO** |
| `PRODUCTION_HF_POLICY_PARAMETERS_VALIDATED` | **NO** |
| `PERIODIC_DEEP_RECOVERY_REQUIRED_FOR_ROBUST_EVENTUAL_COMPLETENESS` | **YES** |
| `READY_FOR_RD004_ANALYSIS_MERGE` | **YES** |
| `READY_FOR_PRODUCTION_HF_RECOVERY_PR` | **YES** |
| `RAW_SOURCE_OBSERVATIONS_CHANGED` | **NO** |

---

## B.6 Artefakte

- `rd004-b-hf-recovery-policy-simulation.json` — settlement deferral vs availability separation
- `rd004-b-hf-recovery-policy-design.json` — corrected recommendation + live calibration contract
- `rd004-b-hf-runtime-fix-contract.json` — configurable `HF_SETTLEMENT_DELAY_MS` / `HF_RECOVERY_OVERLAP_MS`

---

# RD004-B.5 — HF Historical Recovery Policy Design (superseded parameter authority)

**Evidence ID:** DI-EV-0035B.5 (historical — parameter claims superseded by B.6)
**Phase:** RD004-B.5

> **B.6 correction:** Claims that "8 s settlement protects 50/50 closed late buckets" and that 8/6 are validated production parameters are **invalid**. Architecture class remains valid; exact seconds require live calibration.

---

## Einfache Zusammenfassung (Deutsch) — B.5 (10 Fragen, historical)

### 1. Was ist jetzt genau das Problem im HF-Capture?

SynqDrive fragt HF-Historical **direkt an der Live-Kante** ab (`QUERY_TO ≈ requestStartedAt`). DIMO-Aggregat-Buckets sind aber oft **später verfügbar** (B.4: 53 exact-origin Aggregate-Bucket-Beobachtungen kamen beim Replay nach). Gleichzeitig rückt das Watermark mit nur **2 s Overlap** vor — **26** geschlossene Late-Buckets waren danach **nicht mehr erreichbar**. Das ist **kein** internes Row-Drop, sondern **Provider-Late-Arrival + Watermark-Recovery-Gap**.

### 2. Kommen DIMO-Daten wirklich ungefähr im 1–2-s-Raster?

**Ja, auf Provider-Ebene plausibel** (RD003 ~2 s; B.4 exact-origin Replay **157** 1-s-Buckets vs. **104** sealed). Die sealed ~10,6 s Median-Cadence ist **Akquisitions-Vollständigkeit**, nicht das physische Provider-Raster.

### 3. Warum landen trotzdem große Lücken in SynqDrive?

Drei Schichten: (1) Abfrage zu nah an der Live-Kante → unsettled/late Buckets, (2) **2 s Overlap** reicht nicht (P50-Lag-Lower-Bound **2,129 s**, P95 **4,114 s**), (3) zero-result Capture-Zyklen sind aus sealed Export **nicht rekonstruierbar** → beobachtete Lücken sind **LOWER_BOUND**.

### 4. Reicht nur mehr Overlap?

**Nein allein.** Counterfactual: Overlap ≥6 s reklassifiziert temporale Recovery (LOWER_BOUND), aber **ohne Settlement** bleibt die Live-Kante unsettled. Overlap-only mit 15 s erzeugt **VERY_HIGH** Duplicate-Druck (~15 s / ~7,8 s Fenster). Settlement + moderates Overlap ist effizienter.

### 5. Hilft es, einige Sekunden hinter Echtzeit zu bleiben?

**Ja — zentral für Horizon-Deferral.** Settlement Delay `safeQueryTo = requestStartedAt - delay` hält die Abfrage aus der unsettled Zone. **B.6 correction:** Bei **8 s** würden alle 50 beobachteten geschlossenen Late-Buckets ausreichend weit von der ursprünglichen Live-Kante verschoben — RD004 beweist **NICHT**, dass sie nach 8 s bereits provider-seitig verfügbar wären.

### 6. Welche Kombination ist am sinnvollsten?

**Empfohlen (Design only):** `SETTLED_HORIZON_PLUS_OVERLAP_PLUS_PERIODIC_SWEEP`
- **Provisional settlement: 8 s** (engineering candidate — **not validated**)
- **Provisional overlap: 6 s** (coverage candidate — **not completeness guarantee**)
- **Periodischer Recovery-Sweep** für Robustheit bei unbekannter First-Availability

### 7. Wie viel zusätzliche Abfragelast?

Median HF-Fenster **~7,8 s**; **6 s Overlap ≈ 77 %** wiederholte Abdeckung pro Zyklus (HIGH pressure). Settlement **8 s** reduziert „neue“ Live-Kante pro Fenster. Sweep-Last **zeitlich verteilt**, idempotent per Fingerprint.

### 8. Verlieren wir Near-Real-Time-Fähigkeit?

**~8 s HF-Historical-Latenz** für settled horizon (provisional) — für Driving Intelligence Episode-Reconstruction **akzeptabel**; LATEST_LIVE bleibt für Echtzeit-Signale.

### 9. Was bedeutet das für Driving Intelligence?

Bis Fix: **Reconstruction-Confidence senken** bei großen HF-Lücken — **keine Interpolation** über 10–105 s Gaps. Erst nach Capture-Fix + frischer Capture: RD004 Speed/Clock/Acceleration erneut validieren.

### 10. Was muss im nächsten Produktions-PR geändert werden?

Siehe `rd004-b-hf-runtime-fix-contract.json`: parametrisierbare Settlement/Overlap, Recovery-Sweep-Scheduler, Observability inkl. `hf_first_availability_delay_ms`. **Nicht in B.6** — separates Implementierungs-PR.

---

## Finale Flags (B.5, superseded)

| Flag | Wert (B.5) | B.6 correction |
|------|------------|----------------|
| `RD004_PHASE` | B.5 | → **B.6** |
| `RECOMMENDED_SETTLEMENT_DELAY_SECONDS` | 8 | → `PROVISIONAL_SETTLEMENT_DELAY_SECONDS` (not validated) |
| `B5_8S_SETTLEMENT_50_OF_50_PROTECTION_CLAIM_VALID` | (implicit yes) | → **NO** |

---

## B.5 Artefakte (regenerated under B.6 semantics)

- `rd004-b-hf-recovery-policy-simulation.json`
- `rd004-b-hf-recovery-policy-design.json`
- `rd004-b-hf-runtime-fix-contract.json`

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
