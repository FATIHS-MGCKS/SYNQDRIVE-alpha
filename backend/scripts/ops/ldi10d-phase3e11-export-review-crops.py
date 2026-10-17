#!/usr/bin/env python3
"""Export numbered overlay review crops for Phase 3E.11 (human review pack)."""
import json
import os
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SPEC = REPO / "architecture/drivingintelligence/evidence/ldi-10d/phase3e11-work/OCR_SAMPLE_SPEC.json"
OUT_DIR = REPO / "architecture/drivingintelligence/evidence/ldi-10d/phase3e11-review-crops"
MANIFEST = OUT_DIR / "MANIFEST.json"
MOV_DIR = Path(os.environ.get("LDI10D_MOV_DIR", "/tmp/ldi10d-phase3e8-movs"))
CROP = "crop=iw*0.42:ih*0.22:iw*0.56:0"
VIDEO = {"62": "TC_00062.MOV", "63": "TC_00063.MOV", "64": "TC_00064.MOV", "65": "TC_00065.MOV", "66": "TC_00066.MOV", "67": "TC_00067.MOV"}


def main() -> int:
    if not SPEC.exists():
        print("missing spec", file=sys.stderr)
        return 1
    spec = json.loads(SPEC.read_text())
    ck = {}
    for line in open(REPO / "architecture/drivingintelligence/evidence/ldi-10d/phase3e8-work/OCR_1HZ_CHECKPOINT.jsonl"):
        r = json.loads(line)
        ck[(r["video_num"], r["second_index"])] = r
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = []
    for idx, item in enumerate(spec, start=1):
        vn, sec = item["videoNum"], item["secondIndex"]
        mov = MOV_DIR / VIDEO[vn]
        out_png = OUT_DIR / f"FR_{idx:04d}_v{vn}_t{sec:03d}.png"
        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(sec), "-i", str(mov), "-frames:v", "1", "-vf", CROP, str(out_png)],
            check=True,
            capture_output=True,
        )
        ref = ck.get((vn, sec), {})
        manifest.append(
            {
                "reviewId": f"FR_{idx:04d}",
                "videoNum": vn,
                "secondIndex": sec,
                "stratum": item.get("stratum"),
                "cropPath": str(out_png.relative_to(REPO)),
                "expectedFromCheckpoint": {
                    "lat": ref.get("lat"),
                    "lon": ref.get("lon"),
                    "iphone_speed_kmh": ref.get("iphone_speed_kmh"),
                    "overlay_local": ref.get("overlay_local"),
                    "ocr_class": ref.get("ocr_class"),
                },
                "humanReviewStatus": "HUMAN_REVIEW_REQUIRED",
            }
        )
    MANIFEST.write_text(json.dumps({"count": len(manifest), "items": manifest}, indent=2))
    print(json.dumps({"exported": len(manifest), "dir": str(OUT_DIR)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
