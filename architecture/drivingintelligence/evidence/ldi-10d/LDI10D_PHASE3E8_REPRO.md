# Phase 3E.8 reproduction

## Prerequisites
- Six MOVs in `LDI10D_MOV_DIR` (default `/tmp/ldi10d-phase3e8-movs`) — download via gdown; do not commit MOVs.
- `ffmpeg`, `tesseract`, Python 3.

## Full 1 Hz OCR (resumable)
```bash
python3 backend/scripts/ops/ldi10d-phase3e8-run-ocr-checkpoint.py
```

Checkpoint: `architecture/drivingintelligence/evidence/ldi-10d/phase3e8-work/OCR_1HZ_CHECKPOINT.jsonl`

## Analysis artifacts
```bash
cd backend && npm run ldi10d:phase3e8-full-video-forensics
cd backend && npx jest ldi10d-phase3e8 --runInBand
```
