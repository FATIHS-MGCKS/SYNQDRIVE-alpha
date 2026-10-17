#!/usr/bin/env python3
"""Re-OCR stratified frame sample for Phase 3E.9 (DIMO-independent)."""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
OUT = REPO / "architecture/drivingintelligence/evidence/ldi-10d/phase3e9-work"
SPEC = OUT / "FRAME_SAMPLE_SPEC.json"
MOV_DIR = Path(os.environ.get("LDI10D_MOV_DIR", "/tmp/ldi10d-phase3e8-movs"))
CROP = "crop=iw*0.42:ih*0.22:iw*0.56:0"
VIDEO = {
    "62": "TC_00062.MOV",
    "63": "TC_00063.MOV",
    "64": "TC_00064.MOV",
    "65": "TC_00065.MOV",
    "66": "TC_00066.MOV",
    "67": "TC_00067.MOV",
}


def parse_overlay(raw: str):
    flat = raw.replace("\n", " ").replace("|", " ")
    lat = lon = None
    coord = re.search(r"(\+51\.\d{4,6})\s*,\s*(\+9\.\d{4,6})", flat) or re.search(
        r"(\d{5,8})\s*,\s*\+?(9\.\d{4,6})", flat
    )
    if coord:
        a = coord.group(1)
        if a.startswith("+51."):
            lat = float(a)
            lon = float(coord.group(2))
        else:
            lat = float(f"51.{a}") if not a.startswith("51") else float(a)
            lon = float(coord.group(2))
    return lat, lon


def haversine(lat1, lon1, lat2, lon2):
    from math import asin, cos, radians, sin, sqrt

    r = 6371000
    p1, p2 = radians(lat1), radians(lat2)
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(p1) * cos(p2) * sin(dlon / 2) ** 2
    return 2 * r * asin(sqrt(a))


def main() -> int:
    if not SPEC.exists():
        print("missing spec", file=sys.stderr)
        return 1
    spec = json.loads(SPEC.read_text())
    ck = {}
    for line in open(REPO / "architecture/drivingintelligence/evidence/ldi-10d/phase3e8-work/OCR_1HZ_CHECKPOINT.jsonl"):
        r = json.loads(line)
        ck[(r["video_num"], r["second_index"])] = r
    OUT.mkdir(parents=True, exist_ok=True)
    tmp = OUT / "_sample.png"
    results = []
    for item in spec:
        vn = item["videoNum"]
        sec = item["secondIndex"]
        mov = MOV_DIR / VIDEO[vn]
        ref = ck.get((vn, sec), {})
        subprocess.run(
            ["ffmpeg", "-y", "-ss", str(sec), "-i", str(mov), "-frames:v", "1", "-vf", CROP, str(tmp)],
            check=True,
            capture_output=True,
        )
        raw = subprocess.run(["tesseract", str(tmp), "stdout", "-l", "eng", "--psm", "6"], capture_output=True, text=True).stdout or ""
        lat, lon = parse_overlay(raw)
        clat, clon = ref.get("lat"), ref.get("lon")
        delta = None
        within = False
        if clat is not None and clon is not None and lat is not None and lon is not None:
            delta = haversine(clat, clon, lat, lon)
            within = delta <= 25
        results.append(
            {
                "videoNum": vn,
                "secondIndex": sec,
                "ocrClass": item.get("ocrClass", ""),
                "checkpointLat": clat,
                "checkpointLon": clon,
                "resampleLat": lat,
                "resampleLon": lon,
                "haversineDeltaM": delta,
                "coordWithinTolerance": within,
                "frameVerifiedPromoted": False,
            }
        )
    (OUT / "FRAME_SAMPLE_RESULTS.json").write_text(json.dumps(results, indent=2))
    print(json.dumps({"n": len(results), "mismatch": sum(1 for r in results if not r["coordWithinTolerance"])}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
