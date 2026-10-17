#!/usr/bin/env python3
"""LDI-10D Phase 3E.8 — 1 Hz overlay OCR with resumable checkpoint (offline)."""
import csv
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
MANIFEST_CSV = REPO / "architecture/drivingintelligence/evidence/ldi-10d/phase3e7-partial-pack/FRAME_1HZ_MANIFEST.csv"
META_JSON = REPO / "architecture/drivingintelligence/evidence/ldi-10d/phase3e7-partial-pack/MANIFEST.json"
MOV_DIR = Path(os.environ.get("LDI10D_MOV_DIR", "/tmp/ldi10d-phase3e8-movs"))
WORK = REPO / "architecture/drivingintelligence/evidence/ldi-10d/phase3e8-work"
CHECKPOINT = WORK / "OCR_1HZ_CHECKPOINT.jsonl"
CROP = "crop=iw*0.42:ih*0.22:iw*0.56:0"

VIDEO_FILE = {
    "62": "TC_00062.MOV",
    "63": "TC_00063.MOV",
    "64": "TC_00064.MOV",
    "65": "TC_00065.MOV",
    "66": "TC_00066.MOV",
    "67": "TC_00067.MOV",
}

LAT_MIN, LAT_MAX = 51.23, 51.36
LON_MIN, LON_MAX = 9.42, 9.52


def parse_overlay(raw: str) -> dict:
    flat = raw.replace("\n", " ").replace("|", " ")
    out = {"uncertain": []}
    dm = re.search(r"(\d{2})\.(\d{4}),?\s*(\d{2}):(\d{2}):(\d{2})", flat)
    if dm:
        out["overlay_local"] = f"20{dm.group(1)}-{dm.group(2)[:2]}-{dm.group(2)[2:4]}T{dm.group(3)}:{dm.group(4)}:{dm.group(5)}+02:00"
    else:
        out["uncertain"].append("timestamp")
    coord = re.search(r"(\+51\.\d{4,6})\s*,\s*(\+9\.\d{4,6})", flat) or re.search(
        r"(\d{5,8})\s*,\s*\+?(9\.\d{4,6})", flat
    )
    lat = lon = None
    if coord:
        a = coord.group(1)
        if a.startswith("+51."):
            lat = float(a)
            lon = float(coord.group(2))
        else:
            lat = float(f"51.{a}") if not a.startswith("51") else float(a)
            lon = float(coord.group(2))
        if lat < LAT_MIN or lat > LAT_MAX:
            out["uncertain"].append("lat_corridor")
        if lon < LON_MIN or lon > LON_MAX:
            out["uncertain"].append("lon_band")
    else:
        out["uncertain"].append("coordinates")
    sm = re.search(r"(\d{1,3}\.?\d*)\s*km/h", flat, re.I)
    out["iphone_speed_kmh"] = float(sm.group(1)) if sm else None
    out["lat"] = lat
    out["lon"] = lon
    return out


def ocr_frame(mov: Path, sec: int) -> str:
    tmp = WORK / "_ocr_tmp.png"
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-ss",
            str(sec),
            "-i",
            str(mov),
            "-frames:v",
            "1",
            "-vf",
            CROP,
            str(tmp),
        ],
        check=True,
        capture_output=True,
    )
    r = subprocess.run(["tesseract", str(tmp), "stdout", "-l", "eng", "--psm", "6"], capture_output=True, text=True)
    return r.stdout or ""


def classify(parsed: dict, raw: str) -> str:
    if not raw.strip():
        return "OCR_FAILED"
    if parsed["lat"] is None or parsed["lon"] is None:
        return "OCR_PARTIAL" if parsed.get("overlay_local") else "OCR_FAILED"
    if parsed["uncertain"]:
        return "OCR_AMBIGUOUS" if len(parsed["uncertain"]) <= 2 else "OCR_PARTIAL"
    if re.search(r"\+51\.\d{4,6}", raw.replace("\n", " ")):
        return "OCR_HIGH_CONFIDENCE"
    return "OCR_PARTIAL"


def load_done() -> set[str]:
    done = set()
    if CHECKPOINT.exists():
        for line in CHECKPOINT.open():
            if line.strip():
                rec = json.loads(line)
                done.add(f"{rec['video_num']}:{rec['second_index']}")
    return done


def main() -> int:
    WORK.mkdir(parents=True, exist_ok=True)
    meta = json.loads(META_JSON.read_text())
    t0 = {v["name"].replace("TC_000", "").replace(".MOV", ""): v["creation_time_utc"] for v in meta["videos"]}
    rows = list(csv.DictReader(MANIFEST_CSV.open()))
    done = load_done()
    total = len(rows)
    processed = 0
    with CHECKPOINT.open("a") as out:
        for row in rows:
            vn = row["file"]
            sec = int(row["second_index"])
            key = f"{vn}:{sec}"
            if key in done:
                continue
            mov = MOV_DIR / VIDEO_FILE[vn]
            if not mov.exists():
                rec = {"video_num": vn, "second_index": sec, "status": "BLOCKED_MOV_MISSING", "ocr_class": "OCR_FAILED"}
                out.write(json.dumps(rec) + "\n")
                out.flush()
                continue
            try:
                raw = ocr_frame(mov, sec)
                parsed = parse_overlay(raw)
                ocr_class = classify(parsed, raw)
            except Exception as e:
                raw = ""
                parsed = {"lat": None, "lon": None, "uncertain": ["exception"]}
                ocr_class = "OCR_FAILED"
                emsg = str(e)
            else:
                emsg = None
            creation = t0.get(vn)
            sync_utc = None
            if creation:
                from datetime import datetime, timezone, timedelta
                base = datetime.fromisoformat(creation.replace("Z", "+00:00"))
                sync_utc = (base + timedelta(seconds=sec)).strftime("%Y-%m-%dT%H:%M:%SZ")
            rec = {
                "video_num": vn,
                "second_index": sec,
                "frame_sha256_expected": row["cropped_frame_sha256"],
                "sync_utc_from_metadata": sync_utc,
                "raw_ocr": raw[:2000],
                "lat": parsed.get("lat"),
                "lon": parsed.get("lon"),
                "overlay_local": parsed.get("overlay_local"),
                "iphone_speed_kmh": parsed.get("iphone_speed_kmh"),
                "ocr_class": ocr_class,
                "uncertain_fields": parsed.get("uncertain", []),
                "error": emsg,
            }
            out.write(json.dumps(rec) + "\n")
            out.flush()
            processed += 1
            if processed % 25 == 0:
                print(f"progress {len(done)+processed}/{total}", flush=True)
    print(f"done batch processed={processed} total_lines={sum(1 for _ in CHECKPOINT.open())}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
