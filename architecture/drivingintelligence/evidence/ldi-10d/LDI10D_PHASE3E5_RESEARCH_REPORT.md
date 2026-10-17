# LDI-10D Phase 3E.5 — Forschungsbericht (MOV OCR Pack)

## Quelle
- Pack: `architecture/drivingintelligence/evidence/ldi-10d/phase3e5-research-pack` (206 Zeilen @ 5 s, ChatGPT/Tesseract)
- Frame-Crops im Light-ZIP: **NEIN** → Kreuzvalidierung über **Phase 3E.4** Review-Frames (18 Punkte)

## OCR-Validierung
| Metrik | Wert |
| --- | ---: |
| Zeilen gesamt | 206 |
| PARTIAL_REVIEW_REQUIRED | 41 |
| **Verifiziert für Vergleich** | **137** |
| DIMO-Abweisung (>35 m / fehlendes Bucket) | 23 |
| Positions-Sprung-Abweisung | 0 |
| GPS-Freeze-Kandidaten (Koordinate gleich, Speed ändert sich) | 7 |

### Verifikationskriterien (strikt)
1. Kein `PARTIAL_REVIEW_REQUIRED`
2. Explizites `+51…,+9…` in `raw_ocr`
3. Korridor lat und lon-Band
4. DIMO POSITION Haversine ≤ 35 m (Bucket ±2 s)
5. Kein unrealistischer Sprung vs. letzte verifizierte Zeile derselben Aufnahme

## Räumlicher Vergleich (nur verifizierte Punkte)
| Median | 1.60 m |
| P90 | 23.46 m |
| P95 | 31.70 m |
| Robuste Paare (≤500 m) | 137 |

## Road Matching (Phase 3E.3 Kontext, keine Ground Truth)
An verifizierten iPhone-UTC-Zeitstempeln: Baseline-Verteilung {"ASSOCIATED":38,"AMBIGUOUS":79,"UNKNOWN":20} · Viterbi {"ASSOCIATED":44,"AMBIGUOUS":57,"UNKNOWN":36} · Widersprüchliche Labels **22** Buckets.
Trip-weit pinned (1 136 s): Baseline ASSOCIATED **264** · Viterbi **300** — **Verbesserung bewiesen: NEIN**

## Stillstand / Kontext
- **OBSERVED** Standstill: **0**
- **INFERRED_CANDIDATE**: 0 Intervalle (niedrige Overlay-Geschwindigkeit, nicht bestätigt)

## Governance
QC_MUTATIONS=NONE · PRODUCTION_MUTATIONS=NONE · L3 unverändert · Viterbi nicht aktiviert

**STOP: WAIT_OWNER_REVIEW**