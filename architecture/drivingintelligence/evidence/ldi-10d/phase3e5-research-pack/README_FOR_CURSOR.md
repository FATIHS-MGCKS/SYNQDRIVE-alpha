# LDI-10D Phase 3E.5 — Original MOV independent OCR research (preliminary)

Six original MOV files were accessed from the user’s Google Drive and decoded locally. Video frames were extracted at 1 fps (1,028 frame images). OCR was run on **206 frames at 5-second intervals**, using Tesseract on a cropped upper overlay region. This is NOT full 1-Hz OCR or manually validated ground truth.

## Deliverables
- `iphone_gps_5s_ocr.csv`: raw OCR and conservatively parsed UTC/coordinates/iPhone displayed speed. Every row remains unverified unless separately reviewed.
- `ocr_raw.csv`: exact raw Tesseract outputs.
- `frames_sample/`: 206 source frame crops, for manual inspection.

## Important limitations
- OCR parses can contain digit substitutions, timestamp errors, stale displayed coordinates, and apparent impossible speeds. Do not treat as ground truth before manual review, continuity checks, and visual verification.
- Timestamp assumes CEST (UTC+2) based on video date; verify against original recording metadata.
- Tesla speed was NOT reliably OCR-transcribed from the instrument cluster.
- No DIMO POSITION fixture was supplied in this runtime, so NO direct road matching, GPS spatial error, speed MAE or stop confirmation has been computed here.
- `offset_s` is approximate 1-fps sampled video frame offset; `overlay_utc` is OCR-derived and must be cross-checked.
- Source MOV files are NOT included in ZIP (approximately 766 MB); original links are in user conversation.

## Cursor instructions
1. Import this as NEW forensic evidence, do not overwrite pinned Phase 3E.4 evidence.
2. Validate overlay coordinates and UTC using frame crops and original video references.
3. Join only verified observations to pinned Tesla DIMO POSITION grid by UTC; report residuals and spatial disagreement.
4. Review repeated coordinates vs displayed speed to distinguish stale overlay and GPS freeze.
5. For any claim about road-ID accuracy, obtain independent road labels; iPhone coordinates alone do not prove road identity.
6. Never mutate L3, QC, production or activate Viterbi.
