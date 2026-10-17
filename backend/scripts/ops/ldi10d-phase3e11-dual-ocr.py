#!/usr/bin/env python3
"""Dual-PSM OCR agreement flags for Phase 3E.11 sample."""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SPEC = REPO / "architecture/drivingintelligence/evidence/ldi-10d/phase3e11-work/OCR_SAMPLE_SPEC.json"
OUT = REPO / "architecture/drivingintelligence/evidence/ldi-10d/phase3e11-work/DUAL_OCR_FLAGS.json"
MOV_DIR = Path(os.environ.get("LDI10D_MOV_DIR", "/tmp/ldi10d-phase3e8-movs"))
CROP = "crop=iw*0.42:ih*0.22:iw*0.56:0"
VIDEO = {"62": "TC_00062.MOV", "63": "TC_00063.MOV", "64": "TC_00064.MOV", "65": "TC_00065.MOV", "66": "TC_00066.MOV", "67": "TC_00067.MOV"}


def parse_coord(raw):
    flat = raw.replace("\n", " ")
    coord = re.search(r"(\+51\.\d{4,6})\s*,\s*(\+9\.\d{4,6})", flat) or re.search(
        r"(\d{5,8})\s*,\s*\+?(9\.\d{4,6})", flat
    )
    if not coord:
        return None, None
    a = coord.group(1)
    if a.startswith("+51."):
        return float(a), float(coord.group(2))
    lat = float(f"51.{a}") if not a.startswith("51") else float(a)
    return lat, float(coord.group(2))


def ocr(mov, sec, psm):
    tmp = OUT.parent / "_d.png"
    subprocess.run(
        ["ffmpeg", "-y", "-ss", str(sec), "-i", str(mov), "-frames:v", "1", "-vf", CROP, str(tmp)],
        check=True,
        capture_output=True,
    )
    raw = subprocess.run(["tesseract", str(tmp), "stdout", "-l", "eng", "--psm", psm], capture_output=True, text=True).stdout or ""
    lat, lon = parse_coord(raw)
    return lat, lon


def main():
    spec = json.loads(SPEC.read_text())
    ck = { (r["video_num"], r["second_index"]): r for r in map(json.loads, open(REPO / "architecture/drivingintelligence/evidence/ldi-10d/phase3e8-work/OCR_1HZ_CHECKPOINT.jsonl")) }
    out = []
    for item in spec:
        vn, sec = item["videoNum"], item["secondIndex"]
        mov = MOV_DIR / VIDEO[vn]
        la6, lo6 = ocr(mov, sec, "6")
        la7, lo7 = ocr(mov, sec, "7")
        agree = la6 == la7 and lo6 == lo7 and la6 is not None
        c = ck.get((vn, sec), {})
        agree_ck = (
            c.get("lat") is not None
            and la6 is not None
            and abs(c["lat"] - la6) < 0.0003
            and abs(c["lon"] - lo6) < 0.0003
        )
        out.append({"videoNum": vn, "secondIndex": sec, "dualPsmAgree": agree, "dualAgreesCheckpoint": agree and agree_ck})
    OUT.write_text(json.dumps(out))
    print(len(out))


if __name__ == "__main__":
    sys.exit(main())
