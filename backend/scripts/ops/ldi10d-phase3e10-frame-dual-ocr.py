#!/usr/bin/env python3
"""Phase 3E.10 — dual-PSM frame OCR vs checkpoint (not visual ground truth)."""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
SPEC = REPO / "architecture/drivingintelligence/evidence/ldi-10d/phase3e10-work/FRAME_AUDIT_SPEC.json"
OUT = REPO / "architecture/drivingintelligence/evidence/ldi-10d/phase3e10-work/FRAME_DUAL_OCR.json"
MOV_DIR = Path(os.environ.get("LDI10D_MOV_DIR", "/tmp/ldi10d-phase3e8-movs"))
CROP = "crop=iw*0.42:ih*0.22:iw*0.56:0"
VIDEO = {"62": "TC_00062.MOV", "63": "TC_00063.MOV", "64": "TC_00064.MOV", "65": "TC_00065.MOV", "66": "TC_00066.MOV", "67": "TC_00067.MOV"}


def parse_fields(raw: str):
    flat = raw.replace("\n", " ")
    out = {"lat": None, "lon": None, "speed": None, "timestamp": None}
    dm = re.search(r"(\d{2})\.(\d{4}),?\s*(\d{2}):(\d{2}):(\d{2})", flat)
    if dm:
        out["timestamp"] = f"20{dm.group(1)}-{dm.group(2)[:2]}-{dm.group(2)[2:4]}T{dm.group(3)}:{dm.group(4)}:{dm.group(5)}"
    coord = re.search(r"(\+51\.\d{4,6})\s*,\s*(\+9\.\d{4,6})", flat) or re.search(
        r"(\d{5,8})\s*,\s*\+?(9\.\d{4,6})", flat
    )
    if coord:
        a = coord.group(1)
        if a.startswith("+51."):
            out["lat"] = float(a)
            out["lon"] = float(coord.group(2))
        else:
            out["lat"] = float(f"51.{a}") if not a.startswith("51") else float(a)
            out["lon"] = float(coord.group(2))
    sm = re.search(r"(\d{1,3}\.?\d*)\s*km/h", flat, re.I)
    if sm:
        out["speed"] = float(sm.group(1))
    return out


def ocr_png(path: Path, psm: str) -> str:
    return subprocess.run(
        ["tesseract", str(path), "stdout", "-l", "eng", f"--psm", psm],
        capture_output=True,
        text=True,
    ).stdout or ""


def field_errors(ck, parsed):
    errs = []
    if ck.get("lat") is not None and parsed["lat"] is not None and abs(ck["lat"] - parsed["lat"]) > 0.0003:
        errs.append("latitude")
    if ck.get("lon") is not None and parsed["lon"] is not None and abs(ck["lon"] - parsed["lon"]) > 0.0003:
        errs.append("longitude")
    if ck.get("iphone_speed_kmh") is not None and parsed["speed"] is not None and abs(ck["iphone_speed_kmh"] - parsed["speed"]) > 1.5:
        errs.append("speed")
    return errs


def main() -> int:
    if not SPEC.exists():
        print("missing spec", file=sys.stderr)
        return 1
    spec = json.loads(SPEC.read_text())
    ck_rows = {}
    for line in open(REPO / "architecture/drivingintelligence/evidence/ldi-10d/phase3e8-work/OCR_1HZ_CHECKPOINT.jsonl"):
        r = json.loads(line)
        ck_rows[(r["video_num"], r["second_index"])] = r
    tmp = OUT.parent / "_dual.png"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    results = []
    for item in spec:
        vn, sec, stratum = item["videoNum"], item["secondIndex"], item["stratum"]
        mov = MOV_DIR / VIDEO[vn]
        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(sec), "-i", str(mov), "-frames:v", "1", "-vf", CROP, str(tmp)],
            check=True,
            capture_output=True,
        )
        r6 = ocr_png(tmp, "6")
        r7 = ocr_png(tmp, "7")
        p6, p7 = parse_fields(r6), parse_fields(r7)
        ck = ck_rows.get((vn, sec), {})
        dual_agree = (
            p6["lat"] == p7["lat"]
            and p6["lon"] == p7["lon"]
            and (p6["speed"] is None or p7["speed"] is None or abs(p6["speed"] - p7["speed"]) <= 1)
        )
        errs6 = field_errors(ck, p6)
        errs7 = field_errors(ck, p7)
        results.append(
            {
                "videoNum": vn,
                "secondIndex": sec,
                "stratum": stratum,
                "checkpointOcrClass": ck.get("ocr_class"),
                "dualPsmAgree": dual_agree,
                "fieldErrorsPsm6": errs6,
                "fieldErrorsPsm7": errs7,
                "independentVisualReview": False,
                "reviewStatus": "REVIEW_REQUIRED",
            }
        )
    OUT.write_text(json.dumps(results, indent=2))
    print(json.dumps({"n": len(results)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
