#!/usr/bin/env python3
"""Reproducible DS4 vs Tiguan video reference evaluation (frozen snapshots only)."""

from __future__ import annotations

import csv
import hashlib
import json
import math
import statistics
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
REF_1HZ = ROOT / "reference" / "TIGUAN_2026-10-22_1Hz.csv"
REF_WINDOWS = ROOT / "reference" / "TIGUAN_2026-10-22_analysis_windows.csv"
REF_STOPS = ROOT / "reference" / "TIGUAN_2026-10-22_visible_stops.csv"
SNAP = ROOT / "snapshots"
OUT = ROOT / "outputs"
CHARTS = ROOT / "charts"

SHADOW_CSV = SNAP / "di_v0_shadow_intervals.csv"
MOTION_JSON = SNAP / "di_v0_motion_core_shadow_payload.json"
R1_JSON = SNAP / "r1_obd_evidence_snapshot.json"
TRIP_ID = SNAP / "TRIP_IDENTITY.json"

SHADOW_RUN_AT = datetime.fromisoformat("2026-10-22T19:18:57.472+00:00")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def parse_ref_utc(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)


def bucket_key_utc(dt: datetime) -> str:
    dt = dt.astimezone(timezone.utc).replace(microsecond=0)
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def bucket_key_iso_z(dt: datetime) -> str:
    dt = dt.astimezone(timezone.utc).replace(microsecond=0)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_num(s: Optional[str]) -> Optional[float]:
    if s is None or s == "":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def load_shadow() -> Dict[str, dict]:
    by_key: Dict[str, list] = defaultdict(list)
    with SHADOW_CSV.open() as f:
        for row in csv.DictReader(f):
            key = row["reference_time"]
            by_key[key].append(row)
    out: Dict[str, dict] = {}
    for k, rows in by_key.items():
        rows.sort(key=lambda r: r["interval_start"])
        out[k] = rows[0]
        if len(rows) > 1:
            out[k]["_ambiguous_count"] = len(rows)
    return out


def load_motion() -> Tuple[Dict[str, dict], Dict[str, dict], List[dict]]:
    payload = json.loads(MOTION_JSON.read_text())
    speeds = {r["bucketLabelUtc"]: r for r in payload.get("speeds", [])}
    fsm = {r["bucketLabelUtc"]: r for r in payload.get("fsmLabels", [])}
    events = payload.get("events", [])
    return speeds, fsm, events


def load_r1() -> Dict[str, dict]:
    data = json.loads(R1_JSON.read_text())
    out: Dict[str, dict] = {}
    for b in data.get("buckets", []):
        label = b["bucketLabel"]
        sig = {s["signal"]: s for s in b.get("signals", [])}
        out[label] = {
            "speed": sig.get("speed"),
            "rpm": sig.get("powertrainCombustionEngineSpeed"),
            "rowAvailability": b.get("rowAvailability"),
        }
    return out


def speed_metrics(errors: List[float]) -> dict:
    if not errors:
        return {"n": 0}
    abs_e = [abs(e) for e in errors]
    return {
        "n": len(errors),
        "mae": statistics.mean(abs_e),
        "median_abs": statistics.median(abs_e),
        "rmse": math.sqrt(statistics.mean([e * e for e in errors])),
        "bias": statistics.mean(errors),
        "p90_abs": float(np.percentile(abs_e, 90)),
        "p95_abs": float(np.percentile(abs_e, 95)),
        "within_3_kmh": sum(1 for a in abs_e if a <= 3) / len(abs_e),
        "within_5_kmh": sum(1 for a in abs_e if a <= 5) / len(abs_e),
        "within_10_kmh": sum(1 for a in abs_e if a <= 10) / len(abs_e),
    }


def ds4_l3_stationary(motion: str, speed: Optional[float]) -> str:
    if motion == "STATIONARY_SUPPORTED":
        return "still"
    if speed is not None and speed < 3:
        return "still"
    if motion == "MOVING_SPEED_ESTIMATED" and speed is not None and speed >= 3:
        return "moving"
    return "unknown"


def ds4_motion_stationary(state: str) -> str:
    if "STOP" in state or "STATIONARY" in state:
        return "still"
    if "MOVING" in state or "CRUISE" in state:
        return "moving"
    return "unknown"


def ref_stationary(speed: Optional[float]) -> str:
    if speed is None:
        return "unknown"
    if speed == 0:
        return "still"
    return "moving"


@dataclass
class RowResult:
    row: dict
    exclusion: str
    ds4_speed: Optional[float]
    ds4_motion_speed: Optional[float]
    ds4_motion_state: str
    r1_speed: Optional[float]
    r1_rpm: Optional[float]


def match_row(
    ref: dict,
    shadow: Dict[str, dict],
    motion_speeds: Dict[str, dict],
    motion_fsm: Dict[str, dict],
    r1: Dict[str, dict],
    shift_s: int,
) -> RowResult:
    t_ref = parse_ref_utc(ref["time_utc_estimated"])
    if shift_s:
        from datetime import timedelta

        t_match = t_ref + timedelta(seconds=shift_s)
    else:
        t_match = t_ref
    sk = bucket_key_utc(t_match)
    ik = bucket_key_iso_z(t_match)

    ref_speed = parse_num(ref.get("speed_display_kmh"))
    exclusion = ""
    sh = shadow.get(sk)
    if sh is None:
        exclusion = "DS4_NO_BUCKET"
    elif sh.get("_ambiguous_count"):
        exclusion = "MATCH_AMBIGUOUS"

    ds4_speed = parse_num(sh["estimated_speed_kmh"]) if sh else None
    if sh and ds4_speed is None and not exclusion:
        exclusion = "DS4_SPEED_NULL"
    if ref_speed is None and not exclusion:
        exclusion = "REF_SPEED_MISSING"

    ms = motion_speeds.get(ik)
    mf = motion_fsm.get(ik)
    ds4_motion_speed = ms["speedKmh"] if ms and ms.get("speedKmh") is not None else None
    ds4_motion_state = mf["state"] if mf else ""

    r1b = r1.get(ik)
    r1_speed = None
    r1_rpm = None
    if r1b:
        sp = r1b.get("speed")
        if sp and sp.get("availability") == "VALUE_PRESENT" and sp.get("value") is not None:
            r1_speed = float(sp["value"])
        rpm = r1b.get("rpm")
        if rpm and rpm.get("availability") == "VALUE_PRESENT" and rpm.get("value") is not None:
            r1_rpm = float(rpm["value"])

    source_age_s = (SHADOW_RUN_AT - t_ref).total_seconds()

    out_row = {
        **ref,
        "match_shift_s": shift_s,
        "match_utc": ik,
        "ref_speed_kmh": ref_speed if ref_speed is not None else "",
        "ds4_l3_speed_kmh": ds4_speed if ds4_speed is not None else "",
        "ds4_l3_motion_state": sh["motion_state"] if sh else "",
        "ds4_l3_speed_evidence_state": sh.get("speed_evidence_state", "") if sh else "",
        "ds4_l3_claim_level": sh.get("claim_level", "") if sh else "",
        "ds4_l3_abstention_reason": sh.get("abstention_reason", "") if sh else "",
        "ds4_motion_speed_kmh": ds4_motion_speed if ds4_motion_speed is not None else "",
        "ds4_motion_fsm_state": ds4_motion_state,
        "r1_obd_speed_kmh": r1_speed if r1_speed is not None else "",
        "r1_obd_rpm": r1_rpm if r1_rpm is not None else "",
        "ref_rpm_estimate": ref.get("rpm_estimate", ""),
        "speed_error_ds4_minus_tacho": (ds4_speed - ref_speed) if ds4_speed is not None and ref_speed is not None else "",
        "comparison_exclusion": exclusion,
        "ds4_availability_class": "RETROSPECTIVE_POST_TRIP",
        "source_age_s": f"{source_age_s:.1f}",
    }
    return RowResult(out_row, exclusion, ds4_speed, ds4_motion_speed, ds4_motion_state, r1_speed, r1_rpm)


def build_comparison(shift_s: int = 0) -> List[dict]:
    shadow = load_shadow()
    motion_speeds, motion_fsm, _ = load_motion()
    r1 = load_r1()
    with REF_1HZ.open() as f:
        refs = list(csv.DictReader(f))
    return [match_row(r, shadow, motion_speeds, motion_fsm, r1, shift_s).row for r in refs]


def compute_metrics(rows: List[dict]) -> dict:
    n_ref = len(rows)
    ref_speed_present = sum(1 for r in rows if parse_num(r["ref_speed_kmh"]) is not None)
    ds4_present = sum(1 for r in rows if parse_num(r["ds4_l3_speed_kmh"]) is not None)
    paired = [
        r
        for r in rows
        if not r["comparison_exclusion"] and parse_num(r["ref_speed_kmh"]) is not None and parse_num(r["ds4_l3_speed_kmh"]) is not None
    ]
    errors = [parse_num(r["speed_error_ds4_minus_tacho"]) for r in paired]
    errors = [e for e in errors if e is not None]

    still_conf = Counter()
    move_conf = Counter()
    for r in rows:
        rs = parse_num(r["ref_speed_kmh"])
        ref_s = ref_stationary(rs)
        ds4_s = ds4_l3_stationary(r.get("ds4_l3_motion_state", ""), parse_num(r.get("ds4_l3_speed_kmh")))
        if ref_s == "still" and rs is not None:
            still_conf[(ref_s, ds4_s)] += 1
        if ref_s == "moving":
            move_conf[(ref_s, ds4_s)] += 1

    by_clip: Dict[str, List[float]] = defaultdict(list)
    by_band: Dict[str, List[float]] = defaultdict(list)
    for r in paired:
        ref_v = parse_num(r["ref_speed_kmh"])
        err = parse_num(r["speed_error_ds4_minus_tacho"])
        if ref_v is None or err is None:
            continue
        by_clip[r["source_clip"]].append(err)
        if ref_v == 0:
            band = "tacho_0"
        elif ref_v < 30:
            band = "1_29"
        elif ref_v < 60:
            band = "30_59"
        elif ref_v < 100:
            band = "60_99"
        else:
            band = "100_plus"
        by_band[band].append(err)

    worst = sorted(
        paired,
        key=lambda r: abs(parse_num(r["speed_error_ds4_minus_tacho"]) or 0),
        reverse=True,
    )[:15]

    rpm_paired = []
    for r in rows:
        ref_rpm = parse_num(r.get("ref_rpm_estimate"))
        obd = parse_num(r.get("r1_obd_rpm"))
        if ref_rpm is not None and obd is not None and not r["comparison_exclusion"]:
            rpm_paired.append(obd - ref_rpm)

    trimmed = [e for e in errors if abs(e) <= 100]
    return {
        "coverage": {
            "reference_rows": n_ref,
            "reference_speed_readable": ref_speed_present,
            "ds4_l3_speed_numeric": ds4_present,
            "paired_speed_rows": len(paired),
        },
        "speed_ds4_l3_vs_tacho": speed_metrics([e for e in errors if e is not None]),
        "speed_ds4_l3_vs_tacho_trimmed_abs_error_le_100_kmh": speed_metrics(trimmed),
        "segments": {
            "by_clip": {k: speed_metrics(v) for k, v in sorted(by_clip.items())},
            "by_band": {k: speed_metrics(v) for k, v in sorted(by_band.items())},
        },
        "stillstand_l3": {
            "ref_still_rows": {f"{a}|{b}": c for (a, b), c in still_conf.items()},
            "ref_moving_rows": {f"{a}|{b}": c for (a, b), c in move_conf.items()},
        },
        "rpm_r1_vs_ref_estimate": {
            "paired": len(rpm_paired),
            "mae": statistics.mean([abs(x) for x in rpm_paired]) if rpm_paired else None,
            "within_500": sum(1 for x in rpm_paired if abs(x) <= 500) / len(rpm_paired) if rpm_paired else None,
        },
        "worst_abs_errors": [
            {
                "match_utc": w["match_utc"],
                "source_clip": w["source_clip"],
                "video_second": w["video_second"],
                "ref_speed_kmh": w["ref_speed_kmh"],
                "ds4_l3_speed_kmh": w["ds4_l3_speed_kmh"],
                "error": w["speed_error_ds4_minus_tacho"],
                "ds4_l3_motion_state": w["ds4_l3_motion_state"],
                "source_age_s": w["source_age_s"],
            }
            for w in worst
        ],
        "exclusion_counts": dict(Counter(r["comparison_exclusion"] or "OK" for r in rows)),
    }


def event_overlap_analysis(rows: List[dict]) -> dict:
    _, _, events = load_motion()
    ref_start = parse_ref_utc(rows[0]["time_utc_estimated"])
    ref_end = parse_ref_utc(rows[-1]["time_utc_estimated"])

    def in_ref_window(label: str) -> bool:
        t = parse_ref_utc(label.replace("Z", "Z"))
        return ref_start <= t <= ref_end

    events_in_window = [e for e in events if in_ref_window(e["startLabel"]) or in_ref_window(e["endLabel"])]

    windows_out = []
    with REF_WINDOWS.open() as f:
        for w in csv.DictReader(f):
            w_start = datetime.fromisoformat(w["start_time_local_estimated"]).astimezone(timezone.utc)
            w_end = datetime.fromisoformat(w["end_time_local_estimated"]).astimezone(timezone.utc)
            overlapping = []
            for e in events_in_window:
                es = parse_ref_utc(e["startLabel"])
                ee = parse_ref_utc(e["endLabel"])
                if es <= w_end and ee >= w_start:
                    overlapping.append(e)
            windows_out.append(
                {
                    "type": w["type"],
                    "clip": w["source_clip"],
                    "start_local": w["start_time_local_estimated"],
                    "end_local": w["end_time_local_estimated"],
                    "start_speed_kmh": w["start_speed_display_kmh"],
                    "end_speed_kmh": w["end_speed_display_kmh"],
                    "ds4_motion_events_overlapping": [
                        {
                            "kind": e["kind"],
                            "startLabel": e["startLabel"],
                            "endLabel": e["endLabel"],
                            "deltaKmh": e["deltaKmh"],
                            "quality": e.get("quality"),
                        }
                        for e in overlapping
                    ],
                }
            )
    return {
        "ds4_motion_events_in_video_utc_window": len(events_in_window),
        "events": events_in_window,
        "reference_windows": windows_out,
    }


def write_charts(rows: List[dict]) -> None:
    CHARTS.mkdir(parents=True, exist_ok=True)
    times = []
    ref_v = []
    ds4_v = []
    for r in rows:
        t = parse_ref_utc(r["time_utc_estimated"])
        times.append(t)
        ref_v.append(parse_num(r["ref_speed_kmh"]))
        ds4_v.append(parse_num(r["ds4_l3_speed_kmh"]))

    fig, ax = plt.subplots(figsize=(14, 5))
    ax.plot(times, ref_v, ".", markersize=2, label="Tacho (ref)", color="#1f77b4")
    ax.plot(times, ds4_v, ".", markersize=2, label="DS4 L3", color="#ff7f0e", alpha=0.8)
    ax.set_ylabel("km/h")
    ax.set_xlabel("UTC")
    ax.set_title("Speed: video tachometer vs DS4 L3 (gaps = no line)")
    ax.legend()
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(CHARTS / "speed_timeseries.png", dpi=150)
    plt.close(fig)

    paired_t = []
    err = []
    for r in rows:
        if r["comparison_exclusion"]:
            continue
        e = parse_num(r["speed_error_ds4_minus_tacho"])
        if e is None:
            continue
        paired_t.append(parse_ref_utc(r["time_utc_estimated"]))
        err.append(e)
    fig, ax = plt.subplots(figsize=(14, 4))
    ax.axhline(0, color="gray", lw=0.5)
    ax.axhline(5, color="red", ls="--", lw=0.5, alpha=0.5)
    ax.axhline(-5, color="red", ls="--", lw=0.5, alpha=0.5)
    ax.plot(paired_t, err, ".", markersize=2)
    ax.set_ylabel("DS4 − Tacho (km/h)")
    ax.set_title("Speed error (paired seconds only)")
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(CHARTS / "speed_error.png", dpi=150)
    plt.close(fig)


def write_report(metrics: dict, sensitivity: dict, events: dict) -> None:
    cov = metrics["coverage"]
    sp = metrics["speed_ds4_l3_vs_tacho"]
    sp_t = metrics.get("speed_ds4_l3_vs_tacho_trimmed_abs_error_le_100_kmh", sp)
    paired = cov["paired_speed_rows"]
    n_ref = cov["reference_rows"]
    mae = sp.get("mae")
    mae_t = sp_t.get("mae", mae)
    report = f"""# DS4-Auswertung — VW Tiguan Videoreferenz 2026-10-22

## Wie gut funktioniert DS4 auf dem beobachteten Teil dieser Fahrt?

**Kurzurteil (nur Video-Teilstück 18:38:34–19:03:02 UTC, Tacho-Referenz):** DS4 L3 liefert auf **{paired}/{n_ref}** Referenzsekunden eine numerische Geschwindigkeit. **Median |Fehler| ≈ {sp.get('median_abs', 0):.1f} km/h**; **~{sp.get('within_5_kmh', 0)*100:.0f}%** der Paare liegen innerhalb ±5 km/h. Die **arithmetische MAE ({mae:.1f} km/h)** wird durch wenige GPS-Ausreißer (z. B. ~920 km/h L3 bei Tacho 71 km/h in TC_00081) verzerrt; **MAE ohne |Fehler|>100 km/h: {mae_t:.2f} km/h**. Typische Fahrzeugkinematik ist damit **nützlich**, aber nicht Tacho-genau; Abdeckung unvollständig ({cov['ds4_l3_speed_numeric']}/{n_ref} DS4-Werte), Stillstand/Anfahren mit UNKNOWN/Verzögerung, Ereignisse nur teilweise gegen neun Display-Fenster prüfbar.

Details und Grenzen unten; reproduzierbar via `scripts/run_evaluation.sh`.

## 1. Fahrt- und Datenstand

Siehe `snapshots/TRIP_IDENTITY.json` und `PROVENANCE_MANIFEST.json`. Ein Trip (`98d2a8e0-8b7d-4529-bf76-acee44d61fbe`) deckt die Nutzerfahrt ab; die Videos erfassen ein **Teilfenster**.

## 2. Geschwindigkeit (DS4 L3 vs. Tacho)

| Kennzahl | Wert |
| --- | --- |
| Referenzzeilen | {n_ref} |
| Lesbare Tacho-Werte | {cov['reference_speed_readable']} |
| DS4 L3 numerisch | {cov['ds4_l3_speed_numeric']} |
| Gültige Paare | {paired} |
| MAE | {mae:.3f} km/h |
| Median abs Fehler | {sp.get('median_abs', 0):.3f} km/h |
| RMSE | {sp.get('rmse', 0):.3f} km/h |
| Bias (DS4 − Tacho) | {sp.get('bias', 0):.3f} km/h |
| P90 abs Fehler | {sp.get('p90_abs', 0):.3f} km/h |
| Anteil ±3 km/h | {sp.get('within_3_kmh', 0)*100:.1f}% |
| Anteil ±5 km/h | {sp.get('within_5_kmh', 0)*100:.1f}% |
| Anteil ±10 km/h | {sp.get('within_10_kmh', 0)*100:.1f}% |

Ausschlüsse: `{json.dumps(metrics['exclusion_counts'])}`

## 3. Sensitivität ±2 s (nur Speed-MAE, Referenzzeit verschoben)

"""
    for shift, m in sorted(sensitivity.items(), key=lambda x: int(x[0])):
        sm = m["speed_ds4_l3_vs_tacho"]
        mae_s = sm.get("mae")
        mae_txt = f"{mae_s:.3f}" if isinstance(mae_s, (int, float)) else "n/a"
        report += f"- Versatz **{int(shift):+d} s**: MAE {mae_txt} km/h, Paare {m['coverage']['paired_speed_rows']}\n"

    report += f"""
## 4. Stillstand / Bewegung (L3)

- Referenz still (Tacho 0): `{metrics['stillstand_l3']['ref_still_rows']}`
- Referenz bewegt: `{metrics['stillstand_l3']['ref_moving_rows']}`

## 5. Beschleunigen / Verzögern

- DS4-Motion-Ereignisse im Video-UTC-Fenster: **{events['ds4_motion_events_in_video_utc_window']}**
- Neun Referenzfenster: siehe `outputs/event_window_comparison.json` (Überlappung mit DS4-Motion-Events; **kein** globales Precision/Recall).

## 6. Drehzahl

- R1 vs. Referenz `rpm_estimate`: {metrics['rpm_r1_vs_ref_estimate']['paired']} Paare; MAE {metrics['rpm_r1_vs_ref_estimate']['mae']} U/min (±500 Toleranz: {metrics['rpm_r1_vs_ref_estimate']['within_500']*100 if metrics['rpm_r1_vs_ref_estimate']['within_500'] else 'n/a'} %).

## 7. Stärken, Schwächen, Hypothesen

**Stärken:** Hohe Abdeckung im fahrenden Mittelgeschwindigkeitsbereich; Schätzwerte folgen Tacho-Trends über längere Abschnitte.

**Belegte Schwächen:** Fehlende/abstained L3-Werte zu Trip-Anfang und bei `POSITION_FROZEN` / `ROW_ABSENT`; systematischer Bias und Ausreißer in den schlechtesten 15 Sekunden (siehe `metrics_primary.json`); Motion-FSM/Events nicht 1:1 mit Display-Fenstern.

**Hypothesen (nicht bewiesen):** Restlicher ±1 s Video-Uhrenversatz; Tacho-Quantisierung vs. GPS-L3; RUPTELA-R1-Abtastung vs. 1 Hz Video.

## 8. Reproduktion

```bash
cd research/driving-intelligence/evaluations/2026-10-22-vw-tiguan
./scripts/run_evaluation.sh
```

Regeln: `EVALUATION_RULES.md`. Architektur: `ARCHITECTURE_MAPPING.md`.
"""
    (ROOT / "REPORT.md").write_text(report, encoding="utf-8")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    CHARTS.mkdir(parents=True, exist_ok=True)

    primary = build_comparison(0)
    fieldnames = list(primary[0].keys())
    with (OUT / "comparison_primary.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(primary)

    metrics = compute_metrics(primary)
    (OUT / "metrics_primary.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    sensitivity = {}
    for shift in (-2, -1, 0, 1, 2):
        rows = build_comparison(shift)
        sensitivity[str(shift)] = compute_metrics(rows)
    (OUT / "metrics_sensitivity.json").write_text(json.dumps(sensitivity, indent=2), encoding="utf-8")

    events = event_overlap_analysis(primary)
    (OUT / "event_window_comparison.json").write_text(json.dumps(events, indent=2), encoding="utf-8")

    manifest_inputs = [
        REF_1HZ,
        ROOT / "reference" / "manifest.json",
        SHADOW_CSV,
        MOTION_JSON,
        R1_JSON,
        SNAP / "di_v0_s4_evidence_container.bin",
        TRIP_ID,
    ]
    prov = {
        "schema": "SYNQDRIVE_VIDEO_EVAL_PROVENANCE_V1",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "evaluation_rules_sha256": sha256_file(ROOT / "EVALUATION_RULES.md"),
        "trip_identity": json.loads(TRIP_ID.read_text()),
        "file_hashes": {str(p.relative_to(ROOT)): sha256_file(p) for p in manifest_inputs if p.exists()},
        "matching": {"primary_shift_s": 0, "sensitivity_shifts_s": [-2, -1, 0, 1, 2]},
        "repository_note": "Evaluation uses frozen snapshots only; no production DB at reproduce time.",
    }
    (ROOT / "PROVENANCE_MANIFEST.json").write_text(json.dumps(prov, indent=2), encoding="utf-8")

    write_charts(primary)
    write_report(metrics, sensitivity, events)
    print("Wrote outputs to", OUT)
    print("Paired", metrics["coverage"]["paired_speed_rows"], "MAE", metrics["speed_ds4_l3_vs_tacho"].get("mae"))


if __name__ == "__main__":
    main()

