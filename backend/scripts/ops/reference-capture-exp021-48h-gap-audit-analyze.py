#!/usr/bin/env python3
"""EXP-021 48h multi-trip gap distribution audit — read-only analysis of collected manifests."""
from __future__ import annotations

import json
import math
import os
import re
import statistics
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple

AUDIT_DIR = Path(os.environ.get("EXP021_48H_GAP_AUDIT_DIR", "/tmp/exp021-48h-gap-audit"))
OBSERVER_DIR = Path(
    os.environ.get("EXP021_POST_COMPLETION_OBSERVER_DIR", "/tmp/exp021-post-completion-gap-observer")
)

WOB_LABEL = "WOB L 7503"
KSMS_LABEL = "KS MS 661"

HF_FIELDS = [
    "angularVelocityYaw",
    "chassisAxleRow1WheelLeftSpeed",
    "chassisAxleRow1WheelRightSpeed",
    "obdEngineLoad",
    "obdThrottlePosition",
    "powertrainCombustionEngineMAF",
    "powertrainCombustionEngineSpeed",
    "powertrainCombustionEngineTPS",
    "powertrainCombustionEngineTorque",
    "powertrainCombustionEngineTorquePercent",
    "powertrainTractionBatteryStateOfChargeCurrent",
    "speed",
]

SETTLEMENT_FIELDS = [
    "angularVelocityYaw",
    "chassisAxleRow1WheelLeftSpeed",
    "chassisAxleRow1WheelLeftTirePressure",
    "chassisAxleRow1WheelRightSpeed",
    "chassisAxleRow1WheelRightTirePressure",
    "chassisAxleRow2WheelLeftTirePressure",
    "chassisAxleRow2WheelRightTirePressure",
    "chassisBrakeCircuit1PressurePrimary",
    "chassisBrakeCircuit2PressurePrimary",
    "chassisBrakeIsPedalPressed",
    "chassisBrakePedalPosition",
    "chassisTireSystemIsWarningOn",
    "currentLocationAltitude",
    "currentLocationHeading",
    "exteriorAirTemperature",
    "obdEngineLoad",
    "obdIntakeTemp",
    "obdOilTemperature",
    "obdThrottlePosition",
    "powertrainCombustionEngineECT",
    "powertrainCombustionEngineMAF",
    "powertrainCombustionEngineSpeed",
    "powertrainCombustionEngineTPS",
    "powertrainCombustionEngineTorque",
    "powertrainCombustionEngineTorquePercent",
    "powertrainTractionBatteryCurrentPower",
    "powertrainTractionBatteryStateOfChargeCurrent",
    "powertrainTransmissionActualGear",
    "powertrainTransmissionActualGearRatio",
    "powertrainTransmissionCurrentGear",
    "powertrainTransmissionSelectedGear",
    "powertrainTransmissionTemperature",
    "speed",
]

ALL_STUDY_FIELDS = sorted(set(HF_FIELDS) | set(SETTLEMENT_FIELDS))
PRIMARY_FIELDS = ["speed", "powertrainCombustionEngineSpeed", "angularVelocityYaw", "obdEngineLoad"]

SNAPSHOT_USER_LABELS = ["S0", "S30", "S120", "S300", "S600"]
SNAPSHOT_OFFSETS_MS = [0, 30_000, 120_000, 300_000, 600_000]


def parse_locus(loc: str) -> Tuple[str, int]:
    idx = loc.find("|")
    if idx < 0:
        return "", 0
    field_name = loc[:idx]
    ts = loc[idx + 1 :]
    ms = int(datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() * 1000)
    return field_name, ms


def merge_trip_manifest(chunks: List[dict]) -> List[str]:
    merged: Set[str] = set()
    for ch in chunks:
        for loc in ch.get("mergedManifest") or []:
            merged.add(loc)
    return sorted(merged)


def temporal_ms_list(manifest: Iterable[str]) -> List[int]:
    ts = sorted({parse_locus(loc)[1] for loc in manifest if "|" in loc})
    return ts


def gap_series(ts: List[int]) -> List[int]:
    if len(ts) < 2:
        return []
    return [ts[i] - ts[i - 1] for i in range(1, len(ts))]


def percentile(sorted_vals: List[int], p: float) -> Optional[int]:
    if not sorted_vals:
        return None
    idx = min(len(sorted_vals) - 1, max(0, math.ceil(len(sorted_vals) * p) - 1))
    return sorted_vals[idx]


def bin_gap(ms: int) -> str:
    if ms <= 1000:
        return "<=1s"
    if ms <= 2000:
        return ">1s to 2s"
    if ms <= 3000:
        return ">2s to 3s"
    if ms <= 5000:
        return ">3s to 5s"
    if ms <= 7000:
        return ">5s to 7s"
    if ms <= 10000:
        return ">7s to 10s"
    if ms <= 15000:
        return ">10s to 15s"
    return ">15s"


def trip_position(rel_frac: float) -> str:
    if rel_frac <= 0.1:
        return "START"
    if rel_frac >= 0.9:
        return "END"
    if rel_frac < 0.25:
        return "EARLY"
    if rel_frac > 0.75:
        return "LATE"
    return "MIDDLE"


def trip_phase_bucket(rel_frac: float) -> str:
    if rel_frac < 0.1:
        return "0-10%"
    if rel_frac < 0.25:
        return "10-25%"
    if rel_frac < 0.5:
        return "25-50%"
    if rel_frac < 0.75:
        return "50-75%"
    if rel_frac < 0.9:
        return "75-90%"
    return "90-100%"


def fields_at_timestamp(manifest: List[str]) -> Dict[int, Set[str]]:
    by_ts: Dict[int, Set[str]] = defaultdict(set)
    for loc in manifest:
        f, ms = parse_locus(loc)
        if f:
            by_ts[ms].add(f)
    return by_ts


def field_timestamps(manifest: List[str], field_name: str) -> List[int]:
    return sorted(
        ms for loc in manifest if loc.startswith(field_name + "|") for _, ms in [parse_locus(loc)]
    )


def chunk_boundary_check(chunks: List[dict]) -> Tuple[int, int]:
    """Adjacent 90s windows: duplicate locus identity overlap vs temporal discontinuity at boundary."""
    duplicates = 0
    artificial = 0
    for i in range(len(chunks) - 1):
        a = chunks[i].get("mergedManifest") or []
        b = chunks[i + 1].get("mergedManifest") or []
        if not a or not b:
            continue
        set_a = set(a)
        set_b = set(b)
        overlap = set_a & set_b
        if overlap:
            duplicates += len(overlap)

        ts_a = temporal_ms_list(a)
        ts_b = temporal_ms_list(b)
        if not ts_a or not ts_b:
            continue
        last_ts = ts_a[-1]
        first_ts = ts_b[0]
        # Expected cadence ~1s; >2s between last bucket of N and first of N+1 suggests chunk seam artifact.
        if first_ts > last_ts + 2000:
            artificial += 1
    return duplicates, artificial


def covered_duration_percent(trip_start_ms: int, trip_end_ms: int, ts: List[int]) -> Tuple[float, float]:
    trip_dur = max(1, trip_end_ms - trip_start_ms)
    if len(ts) < 2:
        return 0.0, 100.0
    observed = sum(min(ts[i] - ts[i - 1], 1000) for i in range(1, len(ts)))
    observed += min(1000, trip_end_ms - ts[-1])
    observed += min(1000, ts[0] - trip_start_ms)
    covered = min(100.0, 100.0 * observed / trip_dur)
    return covered, 100.0 - covered


def cluster_dominant_intervals(gaps: List[int], min_count: int = 3) -> List[dict]:
    if not gaps:
        return []
    rounded = Counter(int(round(g / 500) * 500) for g in gaps if g > 2000)
    total = sum(rounded.values())
    clusters = []
    for interval, count in rounded.most_common(8):
        if count < min_count:
            continue
        clusters.append(
            {
                "APPROX_INTERVAL_MS": interval,
                "COUNT": count,
                "PERCENT_OF_GAPS": round(100.0 * count / total, 2) if total else 0,
            }
        )
    return clusters


def classify_cross_signal(missing_field: str, gap_start: int, gap_end: int, by_ts: Dict[int, Set[str]]) -> dict:
    present_fields: Set[str] = set()
    for ms, fields in by_ts.items():
        if gap_start < ms < gap_end:
            present_fields |= fields
    present_fields.discard(missing_field)

    pos = any(
        f in present_fields
        for f in [
            "currentLocationHeading",
            "currentLocationAltitude",
            "angularVelocityYaw",
        ]
    )
    speed_alt = "speed" in present_fields or "chassisAxleRow1WheelLeftSpeed" in present_fields
    rpm = "powertrainCombustionEngineSpeed" in present_fields
    ignition = any(f in present_fields for f in ["obdEngineLoad", "powertrainCombustionEngineTPS"])

    other_useful = sorted(
        f
        for f in present_fields
        if f
        not in {
            missing_field,
            "speed",
            "powertrainCombustionEngineSpeed",
            "obdEngineLoad",
            "currentLocationHeading",
        }
    )

    richness = len(present_fields)
    if richness >= 8:
        cls = "RICH"
    elif richness >= 4:
        cls = "PARTIAL"
    elif richness >= 1:
        cls = "SPARSE"
    else:
        cls = "NONE"

    return {
        "PRIMARY_FIELD_MISSING": missing_field,
        "OTHER_FIELDS_PRESENT": sorted(present_fields),
        "POSITION_DATA_PRESENT": "YES" if pos else "NO",
        "SPEED_ALTERNATIVE_PRESENT": "YES" if speed_alt else "NO",
        "RPM_PRESENT": "YES" if rpm else "NO",
        "IGNITION_PRESENT": "YES" if ignition else "NO",
        "OTHER_USEFUL_FIELDS": other_useful,
        "CROSS_SIGNAL_INFORMATION": cls,
    }


def load_trips(audit_dir: Path) -> List[dict]:
    cohort_path = audit_dir / "cohort-raw.json"
    if cohort_path.exists():
        data = json.loads(cohort_path.read_text())
        return data.get("trips") or []
    trips = []
    for p in sorted(audit_dir.glob("trip-*.json")):
        trips.append(json.loads(p.read_text()))
    return trips


def analyze_observer(vehicle_ids: Set[str], cohort_trip_ids: Optional[Set[str]] = None) -> dict:
    out: dict = {
        "series": [],
        "COMPLETE_OBSERVER_SERIES_WOB": 0,
        "COMPLETE_OBSERVER_SERIES_KSMS": 0,
        "TRIPS_STABLE_AT_S0": 0,
        "TRIPS_STABLE_BY_S30": 0,
        "TRIPS_STABLE_BY_S120": 0,
        "TRIPS_STABLE_BY_S300": 0,
        "TRIPS_STABLE_BY_S600": 0,
        "TRIPS_WITH_LATE_DATA": 0,
    }
    if not OBSERVER_DIR.exists():
        return out

    wob_id = "19fedd4b-c4e8-4de8-a125-dab293326e7e"
    ksms_id = "c10351f8-b6a2-4258-947f-631aeaa6d359"

    for path in sorted(OBSERVER_DIR.glob("trip-*.json")):
        doc = json.loads(path.read_text())
        vid = doc.get("vehicleId")
        trip_id = doc.get("tripId")
        if vid not in vehicle_ids:
            continue
        if cohort_trip_ids is not None and trip_id not in cohort_trip_ids:
            continue
        label = doc.get("vehicleLabel") or ""
        snapshots = doc.get("snapshots") or []
        snap_by_offset = {s.get("snapshotTargetOffsetMs"): s for s in snapshots}

        def snap_metrics(offset_ms: int) -> Tuple[Optional[int], Optional[str]]:
            s = snap_by_offset.get(offset_ms)
            if not s or s.get("status") != "COMPLETE":
                return None, None
            manifests: List[str] = []
            for lane in s.get("lanes") or []:
                manifests.extend(lane.get("bucketLocusManifestJson") or [])
            merged = sorted(set(manifests))
            gaps = gap_series(temporal_ms_list(merged))
            max_gap = max(gaps) if gaps else 0
            locus_count = len(merged)
            return max_gap, str(locus_count)

        row: dict = {
            "VEHICLE": label,
            "TRIP_ID": doc.get("tripId"),
        }
        locus_counts: List[Optional[str]] = []
        max_gaps: List[Optional[int]] = []
        for off in SNAPSHOT_OFFSETS_MS:
            mg, lc = snap_metrics(off)
            max_gaps.append(mg)
            locus_counts.append(lc)

        for i, user_label in enumerate(SNAPSHOT_USER_LABELS):
            row[f"{user_label}_LOCUS"] = locus_counts[i]
            row[f"{user_label}_MAX_GAP_MS"] = max_gaps[i]

        complete_series = all(
            snap_by_offset.get(off, {}).get("status") == "COMPLETE" for off in SNAPSHOT_OFFSETS_MS
        )
        if complete_series:
            if vid == wob_id:
                out["COMPLETE_OBSERVER_SERIES_WOB"] += 1
            if vid == ksms_id:
                out["COMPLETE_OBSERVER_SERIES_KSMS"] += 1

        def stable_from(offset_ms: int) -> bool:
            base = snap_by_offset.get(offset_ms)
            if not base or base.get("status") != "COMPLETE":
                return False
            base_manifest = []
            for lane in base.get("lanes") or []:
                base_manifest.extend(lane.get("bucketLocusManifestJson") or [])
            base_set = set(base_manifest)
            for later_off in SNAPSHOT_OFFSETS_MS:
                if later_off < offset_ms:
                    continue
                later = snap_by_offset.get(later_off)
                if not later or later.get("status") != "COMPLETE":
                    return False
                later_manifest = []
                for lane in later.get("lanes") or []:
                    later_manifest.extend(lane.get("bucketLocusManifestJson") or [])
                if set(later_manifest) != base_set:
                    return False
            return True

        if stable_from(0):
            out["TRIPS_STABLE_AT_S0"] += 1
        if stable_from(30_000):
            out["TRIPS_STABLE_BY_S30"] += 1
        if stable_from(120_000):
            out["TRIPS_STABLE_BY_S120"] += 1
        if stable_from(300_000):
            out["TRIPS_STABLE_BY_S300"] += 1
        if stable_from(600_000):
            out["TRIPS_STABLE_BY_S600"] += 1

        s0_lc = locus_counts[0]
        s600_lc = locus_counts[-1]
        late = (
            s0_lc is not None
            and s600_lc is not None
            and int(s600_lc) > int(s0_lc)
        )
        row["FIRST_STABLE_SNAPSHOT"] = SNAPSHOT_USER_LABELS[0] if stable_from(0) else "UNKNOWN"
        row["LATE_DATA_FOUND"] = "YES" if late else "NO"
        if late:
            out["TRIPS_WITH_LATE_DATA"] += 1
        out["series"].append(row)
    return out


def main() -> int:
    audit_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else AUDIT_DIR
    trips_raw = load_trips(audit_dir)

    total_wob = sum(1 for t in trips_raw if t.get("vehicle") == WOB_LABEL)
    total_ksms = sum(1 for t in trips_raw if t.get("vehicle") == KSMS_LABEL)
    valid = [t for t in trips_raw if not t.get("excluded")]
    valid_wob = [t for t in valid if t.get("vehicle") == WOB_LABEL]
    valid_ksms = [t for t in valid if t.get("vehicle") == KSMS_LABEL]

    short_count = sum(1 for t in valid if t.get("durationClass") == "SHORT_LT_3MIN")
    gte3_count = len(valid) - short_count

    chunk_dup_total = 0
    chunk_art_total = 0

    all_gaps_by_vehicle: Dict[str, List[int]] = {WOB_LABEL: [], KSMS_LABEL: [], "ALL": []}
    bin_counts: Dict[str, Counter] = {
        WOB_LABEL: Counter(),
        KSMS_LABEL: Counter(),
        "ALL": Counter(),
    }
    phase_counts: Dict[str, Counter] = {WOB_LABEL: Counter(), KSMS_LABEL: Counter()}

    per_trip_reports: List[dict] = []
    gap_manifests: List[dict] = []
    per_field: Dict[str, dict] = {f: defaultdict(list) for f in ALL_STUDY_FIELDS}

    cross_counts = Counter()

    for trip in valid:
        vehicle = trip["vehicle"]
        trip_id = trip["tripId"]
        start_ms = int(datetime.fromisoformat(trip["startTime"].replace("Z", "+00:00")).timestamp() * 1000)
        end_ms = int(datetime.fromisoformat(trip["endTime"].replace("Z", "+00:00")).timestamp() * 1000)
        duration_sec = trip["durationSec"]
        chunks = trip.get("chunks") or []
        manifest = merge_trip_manifest(chunks)
        ts = temporal_ms_list(manifest)
        gaps = gap_series(ts)
        sorted_gaps = sorted(gaps)
        by_ts = fields_at_timestamp(manifest)

        dup, art = chunk_boundary_check(chunks)
        chunk_dup_total += dup
        chunk_art_total += art

        total_gap_ms = sum(g for g in gaps if g > 2000)
        covered, unobs = covered_duration_percent(start_ms, end_ms, ts)

        report = {
            "VEHICLE": vehicle,
            "TRIP_ID": trip_id,
            "START_TIME": trip["startTime"],
            "END_TIME": trip["endTime"],
            "DURATION_SEC": duration_sec,
            "DURATION_CLASS": trip.get("durationClass"),
            "CHUNK_COUNT": trip.get("chunkCount"),
            "TOTAL_BUCKET_LOCI": len(set(manifest)),
            "TOTAL_TEMPORAL_BUCKETS": len(ts),
            "FIRST_PROVIDER_TS": datetime.fromtimestamp(ts[0] / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")
            if ts
            else None,
            "LAST_PROVIDER_TS": datetime.fromtimestamp(ts[-1] / 1000, tz=timezone.utc).isoformat().replace("+00:00", "Z")
            if ts
            else None,
            "OVERALL_MEDIAN_GAP_MS": percentile(sorted_gaps, 0.5),
            "OVERALL_P95_GAP_MS": percentile(sorted_gaps, 0.95),
            "OVERALL_MAX_GAP_MS": sorted_gaps[-1] if sorted_gaps else None,
            "GAPS_GT_2S": sum(1 for g in gaps if g > 2000),
            "GAPS_GT_5S": sum(1 for g in gaps if g > 5000),
            "GAPS_GT_10S": sum(1 for g in gaps if g > 10000),
            "TOTAL_GAP_DURATION_MS": total_gap_ms,
            "COVERED_DURATION_PERCENT": round(covered, 2),
            "UNOBSERVED_DURATION_PERCENT": round(unobs, 2),
        }
        per_trip_reports.append(report)

        for g in gaps:
            all_gaps_by_vehicle[vehicle].append(g)
            all_gaps_by_vehicle["ALL"].append(g)
            b = bin_gap(g)
            bin_counts[vehicle][b] += 1
            bin_counts["ALL"][b] += 1

        trip_dur_ms = max(1, end_ms - start_ms)
        for i, g in enumerate(gaps):
            if g <= 2000:
                continue
            gap_start = ts[i]
            gap_end = ts[i + 1]
            rel_start = (gap_start - start_ms) / 1000.0
            rel_end = (gap_end - start_ms) / 1000.0
            rel_mid = ((gap_start + gap_end) / 2 - start_ms) / trip_dur_ms
            phase = trip_phase_bucket(rel_mid)
            phase_counts[vehicle][phase] += 1

            missing_fields = set()
            for f in ALL_STUDY_FIELDS:
                fts = field_timestamps(manifest, f)
                if not any(gap_start < t < gap_end for t in fts):
                    missing_fields.add(f)
            present_in_gap = set()
            for ms, fields in by_ts.items():
                if gap_start < ms < gap_end:
                    present_in_gap |= fields

            gap_manifests.append(
                {
                    "VEHICLE": vehicle,
                    "TRIP_ID": trip_id,
                    "GAP_START": datetime.fromtimestamp(gap_start / 1000, tz=timezone.utc)
                    .isoformat()
                    .replace("+00:00", "Z"),
                    "GAP_END": datetime.fromtimestamp(gap_end / 1000, tz=timezone.utc)
                    .isoformat()
                    .replace("+00:00", "Z"),
                    "GAP_DURATION_MS": g,
                    "TRIP_RELATIVE_START_SEC": round(rel_start, 2),
                    "TRIP_RELATIVE_END_SEC": round(rel_end, 2),
                    "TRIP_POSITION": trip_position(rel_mid),
                    "AFFECTED_FIELDS": sorted(missing_fields),
                    "FIELDS_PRESENT_DURING_GAP": sorted(present_in_gap),
                }
            )

        for f in ALL_STUDY_FIELDS:
            fgaps = gap_series(field_timestamps(manifest, f))
            per_field[f][vehicle].extend(fgaps)

    # Per-field summary
    field_rows = []
    for f in ALL_STUDY_FIELDS:
        wob_g = sorted(per_field[f][WOB_LABEL])
        ks_g = sorted(per_field[f][KSMS_LABEL])
        wob_gt2 = sum(1 for g in wob_g if g > 2000)
        ks_gt2 = sum(1 for g in ks_g if g > 2000)
        if len(wob_g) < 5 and len(ks_g) < 5:
            pattern = "INSUFFICIENT_DATA"
        elif wob_gt2 > ks_gt2 * 1.25 + 2:
            pattern = "WOB_MORE_GAPPY"
        elif ks_gt2 > wob_gt2 * 1.25 + 2:
            pattern = "KSMS_MORE_GAPPY"
        else:
            pattern = "SIMILAR_BETWEEN_VEHICLES"
        field_rows.append(
            {
                "FIELD": f,
                "WOB_PRESENT_LOCUS_COUNT": sum(1 for loc in []),  # filled below
                "KSMS_PRESENT_LOCUS_COUNT": 0,
                "WOB_GAP_COUNT_GT_2S": wob_gt2,
                "KSMS_GAP_COUNT_GT_2S": ks_gt2,
                "WOB_MEDIAN_GAP_MS": percentile(wob_g, 0.5),
                "KSMS_MEDIAN_GAP_MS": percentile(ks_g, 0.5),
                "WOB_P95_GAP_MS": percentile(wob_g, 0.95),
                "KSMS_P95_GAP_MS": percentile(ks_g, 0.95),
                "WOB_MAX_GAP_MS": wob_g[-1] if wob_g else None,
                "KSMS_MAX_GAP_MS": ks_g[-1] if ks_g else None,
                "FIELD_GAP_PATTERN": pattern,
            }
        )

    # Locus counts per field per vehicle from valid trips
    locus_counts: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for trip in valid:
        manifest = merge_trip_manifest(trip.get("chunks") or [])
        for loc in manifest:
            field_name, _ = parse_locus(loc)
            if field_name:
                locus_counts[field_name][trip["vehicle"]] += 1
    for row in field_rows:
        row["WOB_PRESENT_LOCUS_COUNT"] = locus_counts[row["FIELD"]][WOB_LABEL]
        row["KSMS_PRESENT_LOCUS_COUNT"] = locus_counts[row["FIELD"]][KSMS_LABEL]

    def vehicle_agg(label: str, subset: List[dict]) -> dict:
        gaps = all_gaps_by_vehicle[label]
        sg = sorted(gaps)
        total_dur = sum(t["durationSec"] for t in subset)
        total_loci = sum(r["TOTAL_BUCKET_LOCI"] for r in per_trip_reports if r["VEHICLE"] == label)
        trips_reports = [r for r in per_trip_reports if r["VEHICLE"] == label]
        return {
            "valid_trips": len(subset),
            "total_duration_sec": total_dur,
            "total_loci": total_loci,
            "median_gap": percentile(sg, 0.5),
            "p95_gap": percentile(sg, 0.95),
            "max_gap": sg[-1] if sg else None,
            "gaps_gt_2s": sum(1 for g in gaps if g > 2000),
            "gaps_gt_5s": sum(1 for g in gaps if g > 5000),
            "gaps_gt_10s": sum(1 for g in gaps if g > 10000),
            "gap_duration_pct": round(
                100.0 * sum(g for g in gaps if g > 2000) / max(1, total_dur * 1000),
                3,
            ),
        }

    wob_agg = vehicle_agg(WOB_LABEL, valid_wob)
    ksms_agg = vehicle_agg(KSMS_LABEL, valid_ksms)

    all_gaps = sorted(all_gaps_by_vehicle["ALL"])
    dominant = cluster_dominant_intervals([g for g in all_gaps if g > 2000])

    # Cross-signal for primary field gaps >2s
    for trip in valid:
        manifest = merge_trip_manifest(trip.get("chunks") or [])
        by_ts = fields_at_timestamp(manifest)
        for pf in PRIMARY_FIELDS:
            fts = field_timestamps(manifest, pf)
            for i in range(len(fts) - 1):
                g = fts[i + 1] - fts[i]
                if g <= 2000:
                    continue
                info = classify_cross_signal(pf, fts[i], fts[i + 1], by_ts)
                cross_counts[info["CROSS_SIGNAL_INFORMATION"]] += 1

    cohort_ids = {t["tripId"] for t in valid}
    observer = analyze_observer(
        {"19fedd4b-c4e8-4de8-a125-dab293326e7e", "c10351f8-b6a2-4258-947f-631aeaa6d359"},
        cohort_trip_ids=cohort_ids,
    )

    exclusions = [t for t in trips_raw if t.get("excluded")]

    result = {
        "cohort": {
            "TOTAL_WOB_TRIPS": total_wob,
            "VALID_WOB_TRIPS": len(valid_wob),
            "TOTAL_KSMS_TRIPS": total_ksms,
            "VALID_KSMS_TRIPS": len(valid_ksms),
            "TOTAL_VALID_TRIPS": len(valid),
            "SHORT_LT_3MIN_COUNT": short_count,
            "GTE_3MIN_COUNT": gte3_count,
            "exclusions": exclusions,
        },
        "chunk_boundaries": {
            "CHUNK_BOUNDARY_DUPLICATES": chunk_dup_total,
            "CHUNK_BOUNDARY_ARTIFICIAL_GAPS": chunk_art_total,
        },
        "per_trip": per_trip_reports,
        "gap_manifest_gt_2s": gap_manifests,
        "per_field": field_rows,
        "gap_distribution": {
            label: dict(bin_counts[label]) for label in [WOB_LABEL, KSMS_LABEL, "ALL"]
        },
        "gap_percentiles": {
            label: {
                "P50_GAP_MS": percentile(sorted(all_gaps_by_vehicle[label]), 0.5),
                "P75_GAP_MS": percentile(sorted(all_gaps_by_vehicle[label]), 0.75),
                "P90_GAP_MS": percentile(sorted(all_gaps_by_vehicle[label]), 0.9),
                "P95_GAP_MS": percentile(sorted(all_gaps_by_vehicle[label]), 0.95),
                "P99_GAP_MS": percentile(sorted(all_gaps_by_vehicle[label]), 0.99),
                "MAX_GAP_MS": sorted(all_gaps_by_vehicle[label])[-1]
                if all_gaps_by_vehicle[label]
                else None,
            }
            for label in [WOB_LABEL, KSMS_LABEL, "ALL"]
        },
        "dominant_gap_intervals": dominant,
        "gap_location_by_phase": {
            WOB_LABEL: dict(phase_counts[WOB_LABEL]),
            KSMS_LABEL: dict(phase_counts[KSMS_LABEL]),
        },
        "vehicle_comparison": {"WOB": wob_agg, "KSMS": ksms_agg},
        "observer": observer,
        "cross_signal": dict(cross_counts),
        "VIDEO_TARGET_GAP_CLASSES": [],
    }

    # Video target classes (descriptive)
    vclasses = []
    if bin_counts["ALL"].get(">2s to 3s", 0) > 5:
        vclasses.append("frequent_2_3s_temporal_gaps")
    for d in dominant:
        if 6500 <= d["APPROX_INTERVAL_MS"] <= 7500:
            vclasses.append("recurring_approx_7s_gaps")
    if sum(1 for g in all_gaps if g > 10000) > 0:
        vclasses.append("rare_gt_10s_gaps")
    wob_only = [r for r in field_rows if r["FIELD_GAP_PATTERN"] == "WOB_MORE_GAPPY"]
    if wob_only:
        vclasses.append("signal_specific_wob_skew:" + ",".join(r["FIELD"] for r in wob_only[:3]))
    result["VIDEO_TARGET_GAP_CLASSES"] = vclasses

    out_path = audit_dir / "audit-report.json"
    out_path.write_text(json.dumps(result, indent=2))
    print(json.dumps(result["cohort"], indent=2))
    print("CHUNK_BOUNDARY_DUPLICATES=", chunk_dup_total)
    print("CHUNK_BOUNDARY_ARTIFICIAL_GAPS=", chunk_art_total)
    print("REPORT=", out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
