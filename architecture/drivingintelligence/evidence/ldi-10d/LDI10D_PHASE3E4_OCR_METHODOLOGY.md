# OCR methodology — Phase 3E.4

1. Crop top-right overlay ROI: `ffmpeg -vf crop=iw*0.42:ih*0.22:iw*0.56:0`.
2. Tesseract `eng` on cropped PNG (no silent digit correction).
3. Heuristic parse (`parseOverlayOcrText`) for CEST timestamp, lat/lon (Kassel corridor `51.x`), altitude, km/h.
4. Uncertain fields recorded in observation `ocrRawSnippet` and `ocrStatus`.
5. One human-verified point from preliminary audit (TC_00062 @ 30s) included separately.

**Limitation:** Frame snapshots ≠ GPS fix cadence; `gpsFixUpdate` remains `UNKNOWN_FRAME_SNAPSHOT`.