# LDI10D Phase 3E.6 – full-video research handoff (INCOMPLETE)

Scope: six MOV sources TC_00062..TC_00067, total ~1028 seconds. Previously extracted 1028 1-fps overlay image crops, but only 206 frames have completed OCR at 5-second cadence. An attempted 1-Hz OCR run exceeded execution time and produced no complete output; do not claim full-video OCR completed.

Available: iphone_gps_5s_ocr.csv and ocr_raw.csv (206 rows); raw source MOVs are available in user's Google Drive. This handoff contains a ready-to-run full OCR script; requires `frames/` with extracted images and Tesseract. The images are NOT included due to Cursor's 2MB attachment limit.

Phase 3E.5 owner-provided findings: 137 comparison-qualified iPhone/DIMO pairs; median 1.595m, P95 31.703m; 7 frozen-coordinate candidates; 0 confirmed stops; road identity accuracy NOT_ASSESSABLE. Important: DIMO distance <=35m was used in qualification, hence these residuals are selection-biased and not independent GPS accuracy proof.

Required next steps: (1) complete 1-Hz OCR on all 1028 image crops, (2) visually verify high-risk timestamps and coordinate strings, (3) compare iPhone display-speed vs GPS-derived displacement without assuming they are synchronized, (4) align to DIMO POSITION UTC, quantify both unfiltered and filtered residuals, (5) classify stops as OBSERVED, INFERRED_CANDIDATE or UNKNOWN and never assert standstill from frozen coordinates alone, (6) audit 22 road-label disagreement buckets against independent manually verified road identity where possible. No production/QC/L3/Viterbi mutations or deployment.

No assertion of improvement or verified stop is warranted yet.
