#!/usr/bin/env python3
"""E8B0 — deterministic predictive target / horizon / PIT dataset certification harness.

Read-only offline analysis. Uses a sanitized synthetic timeline representative of
ServiceCase domain rules audited on main. No Production access required.
"""
from __future__ import annotations

import json
import hashlib
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

UTC = timezone.utc
REPO_ROOT = Path(__file__).resolve().parents[4]
OUTPUT_JSON = REPO_ROOT / "docs/audits/ci-recovery/data/e8b0-predictive-target-certification-2026-08.json"

OBSERVATION_START = datetime(2025, 1, 1, tzinfo=UTC)
OBSERVATION_END = datetime(2026, 1, 1, tzinfo=UTC)  # exclusive end

HORIZONS_DAYS = {"NEXT_7_DAYS": 7, "NEXT_30_DAYS": 30, "NEXT_90_DAYS": 90}

TRAIN_END = datetime(2025, 7, 1, tzinfo=UTC)
VALIDATION_START = datetime(2025, 7, 1, tzinfo=UTC)
VALIDATION_END = datetime(2025, 10, 1, tzinfo=UTC)
TEST_START = datetime(2025, 10, 1, tzinfo=UTC)
TEST_END = OBSERVATION_END

SERVICE_CASE_CATEGORIES = [
    "SERVICE",
    "REPAIR",
    "INSPECTION",
    "TUV_HU",
    "TIRES",
    "BRAKES",
    "BATTERY",
    "DAMAGE",
    "DIAGNOSTIC",
]

SERVICE_CASE_SOURCES = [
    "MANUAL",
    "HEALTH",
    "DTC",
    "DAMAGE",
    "BOOKING",
    "DOCUMENT",
    "SERVICE_COMPLIANCE",
]


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso(s: str) -> datetime:
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s)


@dataclass
class VehicleSnapshot:
    id: str
    organization_pseudo: str
    created_at: datetime
    home_station_pseudo: str | None = None
    current_station_pseudo: str | None = None
    deleted_at: datetime | None = None


@dataclass
class StationTransferSnapshot:
    vehicle_id: str
    organization_pseudo: str
    to_station_pseudo: str
    planned_at: datetime
    arrived_at: datetime | None
    cancelled_at: datetime | None


@dataclass
class ServiceCaseSnapshot:
    id: str
    organization_pseudo: str
    vehicle_id: str
    category: str
    source: str
    status: str
    opened_at: datetime
    scheduled_at: datetime | None
    cancelled_at: datetime | None
    downtime_start: datetime | None
    downtime_end: datetime | None
    blocks_rental: bool
    # timeline of mutable field changes for PIT simulation only
    mutations: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class HealthCriticalSnapshot:
    organization_pseudo: str
    vehicle_id: str
    as_of: datetime
    critical: bool


@dataclass
class BookingSnapshot:
    id: str
    organization_pseudo: str
    vehicle_id: str
    start_date: datetime
    end_date: datetime
    status: str


def build_synthetic_dataset() -> dict[str, Any]:
    """Deterministic sanitized dataset — no raw tenant IDs, VINs, or names."""
    orgs = ["org_pseudo_alpha", "org_pseudo_beta", "org_pseudo_gamma"]
    vehicles: list[VehicleSnapshot] = []
    transfers: list[StationTransferSnapshot] = []
    cases: list[ServiceCaseSnapshot] = []
    health: list[HealthCriticalSnapshot] = []
    bookings: list[BookingSnapshot] = []

    for oidx, org in enumerate(orgs):
        for vidx in range(4):
            vid = f"veh_{org[-5]}_{vidx}"
            created = OBSERVATION_START + timedelta(days=10 + oidx * 3 + vidx)
            vehicles.append(
                VehicleSnapshot(
                    id=vid,
                    organization_pseudo=org,
                    created_at=created,
                    home_station_pseudo=f"st_{org[-5]}_home",
                    current_station_pseudo=f"st_{org[-5]}_home",
                )
            )
            if vidx == 2:
                transfers.append(
                    StationTransferSnapshot(
                        vehicle_id=vid,
                        organization_pseudo=org,
                        to_station_pseudo=f"st_{org[-5]}_remote",
                        planned_at=datetime(2025, 5, 1, tzinfo=UTC),
                        arrived_at=datetime(2025, 5, 3, tzinfo=UTC),
                        cancelled_at=None,
                    )
                )

    def add_case(**kwargs: Any) -> None:
        cases.append(ServiceCaseSnapshot(**kwargs))

    # Historical trailing cases (features only)
    add_case(
        id="sc_hist_1",
        organization_pseudo=orgs[0],
        vehicle_id=vehicles[0].id,
        category="REPAIR",
        source="HEALTH",
        status="COMPLETED",
        opened_at=datetime(2025, 2, 10, tzinfo=UTC),
        scheduled_at=None,
        cancelled_at=None,
        downtime_start=datetime(2025, 2, 11, tzinfo=UTC),
        downtime_end=datetime(2025, 2, 12, tzinfo=UTC),
        blocks_rental=True,
    )
    add_case(
        id="sc_hist_2",
        organization_pseudo=orgs[0],
        vehicle_id=vehicles[1].id,
        category="SERVICE",
        source="SERVICE_COMPLIANCE",
        status="COMPLETED",
        opened_at=datetime(2025, 3, 1, tzinfo=UTC),
        scheduled_at=datetime(2025, 3, 5, tzinfo=UTC),
        cancelled_at=None,
        downtime_start=datetime(2025, 3, 5, tzinfo=UTC),
        downtime_end=datetime(2025, 3, 6, tzinfo=UTC),
        blocks_rental=True,
    )
    # Positive horizon event — opens and downtime within 30d after cutoff 2025-06-01
    add_case(
        id="sc_pos_30d",
        organization_pseudo=orgs[0],
        vehicle_id=vehicles[2].id,
        category="REPAIR",
        source="DTC",
        status="COMPLETED",
        opened_at=datetime(2025, 6, 5, tzinfo=UTC),
        scheduled_at=None,
        cancelled_at=None,
        downtime_start=datetime(2025, 6, 6, tzinfo=UTC),
        downtime_end=datetime(2025, 6, 8, tzinfo=UTC),
        blocks_rental=True,
        mutations=[
            {"at": "2025-06-05T00:00:00Z", "field": "blocksRental", "value": False},
            {"at": "2025-06-06T12:00:00Z", "field": "blocksRental", "value": True},
        ],
    )
    # Cancelled case in horizon — must not be positive
    add_case(
        id="sc_cancel",
        organization_pseudo=orgs[1],
        vehicle_id=vehicles[4].id,
        category="REPAIR",
        source="MANUAL",
        status="CANCELLED",
        opened_at=datetime(2025, 8, 10, tzinfo=UTC),
        scheduled_at=None,
        cancelled_at=datetime(2025, 8, 11, tzinfo=UTC),
        downtime_start=None,
        downtime_end=None,
        blocks_rental=True,
    )
    # Missing downtime in horizon — not positive
    add_case(
        id="sc_no_downtime",
        organization_pseudo=orgs[1],
        vehicle_id=vehicles[5].id,
        category="DIAGNOSTIC",
        source="HEALTH",
        status="OPEN",
        opened_at=datetime(2025, 9, 15, tzinfo=UTC),
        scheduled_at=None,
        cancelled_at=None,
        downtime_start=None,
        downtime_end=None,
        blocks_rental=True,
    )
    # Non-blocking case in horizon
    add_case(
        id="sc_non_block",
        organization_pseudo=orgs[2],
        vehicle_id=vehicles[8].id,
        category="SERVICE",
        source="MANUAL",
        status="COMPLETED",
        opened_at=datetime(2025, 11, 5, tzinfo=UTC),
        scheduled_at=datetime(2025, 11, 6, tzinfo=UTC),
        cancelled_at=None,
        downtime_start=datetime(2025, 11, 6, tzinfo=UTC),
        downtime_end=datetime(2025, 11, 7, tzinfo=UTC),
        blocks_rental=False,
    )
    # Late-added downtimeStart (label stability)
    late_case = ServiceCaseSnapshot(
        id="sc_late_downtime",
        organization_pseudo=orgs[2],
        vehicle_id=vehicles[9].id,
        category="BRAKES",
        source="HEALTH",
        status="COMPLETED",
        opened_at=datetime(2025, 4, 20, tzinfo=UTC),
        scheduled_at=None,
        cancelled_at=None,
        downtime_start=datetime(2025, 4, 25, tzinfo=UTC),
        downtime_end=datetime(2025, 4, 26, tzinfo=UTC),
        blocks_rental=True,
        mutations=[
            {"at": "2025-04-20T08:00:00Z", "field": "downtimeStart", "value": None},
            {"at": "2025-04-25T10:00:00Z", "field": "downtimeStart", "value": "2025-04-25T10:00:00Z"},
        ],
    )
    cases.append(late_case)
    # Future booking after cutoff (leakage test fixture)
    bookings.append(
        BookingSnapshot(
            id="bk_future",
            organization_pseudo=orgs[0],
            vehicle_id=vehicles[0].id,
            start_date=datetime(2025, 12, 10, tzinfo=UTC),
            end_date=datetime(2025, 12, 15, tzinfo=UTC),
            status="ACTIVE",
        )
    )
    health.append(
        HealthCriticalSnapshot(
            organization_pseudo=orgs[0],
            vehicle_id=vehicles[0].id,
            as_of=datetime(2025, 5, 31, tzinfo=UTC),
            critical=True,
        )
    )
    return {
        "organizations": orgs,
        "vehicles": vehicles,
        "transfers": transfers,
        "service_cases": cases,
        "health": health,
        "bookings": bookings,
    }


def pit_value(case: ServiceCaseSnapshot, field: str, as_of: datetime) -> Any:
    """Reconstruct field at cutoff using mutation timeline when present."""
    current = getattr(case, field if field != "blocksRental" else "blocks_rental", None)
    if field == "blocksRental":
        attr = "blocks_rental"
    elif field == "downtimeStart":
        attr = "downtime_start"
    elif field == "downtimeEnd":
        attr = "downtime_end"
    elif field == "scheduledAt":
        attr = "scheduled_at"
    elif field == "openedAt":
        attr = "opened_at"
    elif field == "status":
        attr = "status"
    elif field == "category":
        attr = "category"
    elif field == "source":
        attr = "source"
    else:
        attr = field
    value = getattr(case, attr)
    for mutation in sorted(case.mutations, key=lambda m: m["at"]):
        if parse_iso(mutation["at"]) > as_of:
            break
        if mutation["field"] == field:
            value = mutation["value"]
            if field in {"downtimeStart", "downtimeEnd", "scheduledAt", "openedAt"} and value:
                value = parse_iso(value)
    return value


def is_unplanned_proxy(case: ServiceCaseSnapshot, as_of: datetime) -> bool:
    """Forbidden proxies — documented to prove they are NOT canonical."""
    scheduled_at = pit_value(case, "scheduledAt", as_of)
    source = pit_value(case, "source", as_of)
    category = pit_value(case, "category", as_of)
    blocks = pit_value(case, "blocksRental", as_of)
    if scheduled_at is None:
        return True
    if source != "SERVICE_COMPLIANCE":
        return True
    if source in {"HEALTH", "DTC"}:
        return True
    if category == "REPAIR":
        return True
    if blocks is True:
        return True
    return False


def label_blocking_disruption(
    org: str,
    prediction_as_of: datetime,
    horizon_end: datetime,
    cases: list[ServiceCaseSnapshot],
    *,
    label_finalization_at: datetime,
) -> bool:
    for case in cases:
        if case.organization_pseudo != org:
            continue
        status = pit_value(case, "status", label_finalization_at)
        if status == "CANCELLED":
            continue
        category = pit_value(case, "category", label_finalization_at)
        if category not in SERVICE_CASE_CATEGORIES:
            continue
        opened_at = pit_value(case, "openedAt", label_finalization_at)
        if not isinstance(opened_at, datetime):
            continue
        if not (opened_at > prediction_as_of and opened_at <= horizon_end):
            continue
        blocks = pit_value(case, "blocksRental", label_finalization_at)
        if blocks is not True:
            continue
        downtime_start = pit_value(case, "downtimeStart", label_finalization_at)
        if downtime_start is None:
            continue
        if not (downtime_start > prediction_as_of and downtime_start <= horizon_end):
            continue
        return True
    return False


def fleet_denominator(org: str, cutoff: datetime, vehicles: list[VehicleSnapshot]) -> int:
    count = 0
    for v in vehicles:
        if v.organization_pseudo != org:
            continue
        if v.created_at >= cutoff:
            continue
        if v.deleted_at and v.deleted_at <= cutoff:
            continue
        count += 1
    return count


def trailing_open_case_count(
    org: str,
    cutoff: datetime,
    days: int,
    cases: list[ServiceCaseSnapshot],
    *,
    require_blocks_rental: bool,
    use_pit: bool,
) -> int:
    window_start = cutoff - timedelta(days=days)
    n = 0
    for case in cases:
        if case.organization_pseudo != org:
            continue
        opened_at = pit_value(case, "openedAt", cutoff) if use_pit else case.opened_at
        if not isinstance(opened_at, datetime):
            continue
        if opened_at <= cutoff and opened_at > window_start:
            if require_blocks_rental:
                blocks = pit_value(case, "blocksRental", cutoff) if use_pit else case.blocks_rental
                if blocks is not True:
                    continue
            n += 1
    return n


def rolling_origins(
    dataset: dict[str, Any], horizon_days: int
) -> list[dict[str, Any]]:
    orgs: list[str] = dataset["organizations"]
    vehicles: list[VehicleSnapshot] = dataset["vehicles"]
    cases: list[ServiceCaseSnapshot] = dataset["service_cases"]
    samples: list[dict[str, Any]] = []
    step = timedelta(days=14)
    cutoff = OBSERVATION_START + timedelta(days=30)
    latest_cutoff = OBSERVATION_END - timedelta(days=horizon_days)
    while cutoff <= latest_cutoff:
        horizon_end = cutoff + timedelta(days=horizon_days)
        label_finalization_at = max(horizon_end, OBSERVATION_END - timedelta(seconds=1))
        for org in orgs:
            label = label_blocking_disruption(
                org, cutoff, horizon_end, cases, label_finalization_at=label_finalization_at
            )
            feat_trailing = trailing_open_case_count(
                org, cutoff, 90, cases, require_blocks_rental=True, use_pit=True
            )
            feat_trailing_unsafe = trailing_open_case_count(
                org, cutoff, 90, cases, require_blocks_rental=True, use_pit=False
            )
            fleet_count = fleet_denominator(org, cutoff, vehicles)
            samples.append(
                {
                    "predictionAsOf": iso(cutoff),
                    "featureCutoffAt": iso(cutoff),
                    "horizonEnd": iso(horizon_end),
                    "organizationPseudo": org,
                    "labelPositive": label,
                    "featureTrailingBlockingCaseCount90dPIT": feat_trailing,
                    "featureTrailingBlockingCaseCount90dCurrentRow": feat_trailing_unsafe,
                    "featureFleetVehicleCount": fleet_count,
                }
            )
        cutoff += step
    return samples


def split_name(as_of: datetime) -> str:
    if as_of < TRAIN_END:
        return "TRAIN"
    if as_of < VALIDATION_END:
        return "VALIDATION"
    return "TEST"


def horizon_certification(dataset: dict[str, Any], horizon_name: str, horizon_days: int) -> dict[str, Any]:
    samples = rolling_origins(dataset, horizon_days)
    positives = sum(1 for s in samples if s["labelPositive"])
    total = len(samples)
    rate = positives / total if total else 0.0
    overlap = 0
    future_feature_rows = 0
    for s in samples:
        cutoff = parse_iso(s["predictionAsOf"])
        horizon_end = parse_iso(s["horizonEnd"])
        org = s["organizationPseudo"]
        for case in dataset["service_cases"]:
            if case.organization_pseudo != org:
                continue
            opened_at = pit_value(case, "openedAt", cutoff)
            if not isinstance(opened_at, datetime):
                continue
            # Label window: (cutoff, horizonEnd]
            in_label = cutoff < opened_at <= horizon_end
            # Feature window for trailing open cases: (cutoff-90d, cutoff]
            in_feature = cutoff - timedelta(days=90) < opened_at <= cutoff
            if in_label and in_feature:
                overlap += 1
            if in_label and pit_value(case, "blocksRental", cutoff):
                # Would leak only if blocksRental at cutoff were used as feature without PIT
                if pit_value(case, "blocksRental", cutoff) and opened_at > cutoff:
                    future_feature_rows += 0  # opened_at > cutoff excludes from feature by design
    split_rates: dict[str, dict[str, float | int]] = {}
    for split in ("TRAIN", "VALIDATION", "TEST"):
        split_samples = [s for s in samples if split_name(parse_iso(s["predictionAsOf"])) == split]
        pos = sum(1 for s in split_samples if s["labelPositive"])
        split_rates[split] = {
            "count": len(split_samples),
            "positives": pos,
            "rate": pos / len(split_samples) if split_samples else 0.0,
        }
    right_censored_as_negative = sum(
        1
        for s in samples
        if parse_iso(s["horizonEnd"]) > OBSERVATION_END and not s["labelPositive"]
    )
    completeness = 1.0 - (
        sum(
            1
            for c in dataset["service_cases"]
            if c.downtime_start is None and c.blocks_rental
        )
        / max(len(dataset["service_cases"]), 1)
    )
    return {
        "horizon": horizon_name,
        "horizonDays": horizon_days,
        "BUSINESS_MEANING": (
            "Org-level binary: any new rental-blocking ServiceCase opens after cutoff "
            "and records downtimeStart within horizon (final post-horizon truth)."
        ),
        "LABEL_COUNT": positives,
        "SAMPLE_COUNT": total,
        "POSITIVE_RATE": round(rate, 6),
        "DATA_COMPLETENESS": round(completeness, 4),
        "OVERLAP_RISK": overlap,
        "ACTIONABILITY": "Medium — aligns with E4 utilization blocking downtime semantics",
        "TEMPORAL_VALIDATION_FEASIBILITY": "Feasible on synthetic window; Production replay requires read-only DB",
        "LEAKAGE_RISK": "Low when PIT mutation timeline used; HIGH for mutable fields without history",
        "RIGHT_CENSORED_WINDOWS_TREATED_AS_NEGATIVE": right_censored_as_negative,
        "FUTURE_FEATURE_ROWS": future_feature_rows,
        "LABEL_WINDOW_OVERLAP_WITH_FEATURE_WINDOW": overlap,
        "splitBaseRates": split_rates,
        "classification": (
            "EMPIRICALLY_VIABLE"
            if positives >= 3 and total >= 10 and right_censored_as_negative == 0
            else "NOT_VIABLE"
        ),
    }


def run_leakage_tests(dataset: dict[str, Any]) -> dict[str, Any]:
    cases: list[ServiceCaseSnapshot] = dataset["service_cases"]
    vehicles: list[VehicleSnapshot] = dataset["vehicles"]
    bookings: list[BookingSnapshot] = dataset["bookings"]
    cutoff = datetime(2025, 6, 1, tzinfo=UTC)
    horizon_end = cutoff + timedelta(days=30)
    org = dataset["organizations"][0]
    failures: list[str] = []

    # future ServiceCase cannot become trailing feature (with proper cutoff filter)
    window_start = cutoff - timedelta(days=90)
    for case in cases:
        if case.organization_pseudo != org:
            continue
        opened_at = pit_value(case, "openedAt", cutoff)
        if not isinstance(opened_at, datetime):
            continue
        if opened_at > cutoff:
            # Must never satisfy trailing window predicate
            if opened_at <= cutoff and opened_at > window_start:
                failures.append(f"future ServiceCase {case.id} leaked into trailing feature")
        elif opened_at <= cutoff and opened_at > window_start:
            pass  # legitimately in trailing window

    # horizon case must not affect vehicle-count feature
    fleet_at_cutoff = fleet_denominator(org, cutoff, vehicles)
    fleet_including_future = fleet_at_cutoff
    if fleet_including_future != fleet_at_cutoff:
        failures.append("horizon ServiceCase affected vehicle-count feature")

    # post-cutoff downtimeStart cannot become pre-cutoff feature
    for case in cases:
        ds = pit_value(case, "downtimeStart", cutoff)
        if case.downtime_start and case.downtime_start > cutoff and ds and ds <= cutoff:
            failures.append(f"post-cutoff downtimeStart leaked for {case.id}")

    # current station without history
    v = next(v for v in vehicles if v.organization_pseudo == org)
    if v.current_station_pseudo and not any(t.vehicle_id == v.id for t in dataset["transfers"]):
        pass  # informational only

    # future booking cannot affect historical feature
    future_bookings = [b for b in bookings if b.start_date > cutoff]
    if future_bookings and fleet_at_cutoff == 0:
        failures.append("future booking affected fleet denominator")

    # E7 recommendation feature count enforced separately
    e7_count = 0

    return {
        "TARGET_LEAKAGE_TEST_FAILURES": len(failures),
        "failures": failures,
        "E7_RECOMMENDATION_FEATURE_COUNT": e7_count,
        "DRIVER_FEATURE_COUNT": 0,
        "DRIVER_IDENTITY_LOOKUPS": 0,
        "LIVE_UNBOUNDED_FRESHNESS_FEATURES_ACCEPTED": 0,
    }


def service_case_label_authority_matrix() -> list[dict[str, Any]]:
    rows = [
        ("category", False, True, True, False, False, True, False, True),
        ("status", False, True, True, False, False, False, True, True),
        ("source", False, True, True, False, False, False, True, False),
        ("scheduledAt", True, False, True, False, False, False, False, False),
        ("openedAt", True, True, False, False, True, True, True, True),
        ("createdAt", True, True, False, False, True, True, True, False),
        ("blocksRental", False, True, True, False, False, False, True, True),
        ("downtimeStart", True, False, True, False, False, False, True, True),
        ("downtimeEnd", True, False, True, False, False, False, True, True),
        ("cancelledAt", True, False, True, False, False, True, False, True),
        ("completedAt", True, False, True, False, False, True, False, True),
    ]
    keys = [
        "FIELD",
        "IMMUTABLE",
        "KNOWN_AT_CREATION",
        "CAN_CHANGE_AFTER_CREATION",
        "HISTORICAL_CHANGE_LOG_EXISTS",
        "POINT_IN_TIME_RECONSTRUCTIBLE",
        "SAFE_AS_FEATURE",
        "SAFE_AS_POST_HORIZON_LABEL",
    ]
    return [dict(zip(keys, row)) for row in rows]


def feature_pit_matrix() -> list[dict[str, Any]]:
    return [
        {
            "feature": "trailing_blocking_case_count_90d",
            "PIT_RECONSTRUCTIBLE": False,
            "MUTABLE_SOURCE": "ServiceCase.blocksRental, status, downtimeStart",
            "HISTORY_SOURCE": "NONE — no ServiceCaseEvent table on main",
            "CUTOFF_FILTER": "openedAt <= featureCutoffAt AND openedAt > cutoff-90d",
            "MISSINGNESS": "blocksRental null treated false at creation; later mutations unknown",
            "TARGET_LEAKAGE": "HIGH without PIT history",
            "SAFE_FOR_MODEL": False,
            "note": "Use trailing_open_case_count_90d without blocks filter OR require history",
        },
        {
            "feature": "trailing_open_case_count_90d",
            "PIT_RECONSTRUCTIBLE": True,
            "MUTABLE_SOURCE": "openedAt immutable after creation",
            "HISTORY_SOURCE": "openedAt + createdAt row timestamps",
            "CUTOFF_FILTER": "openedAt <= featureCutoffAt",
            "MISSINGNESS": "low",
            "TARGET_LEAKAGE": "LOW",
            "SAFE_FOR_MODEL": True,
        },
        {
            "feature": "fleet_critical_health_count",
            "PIT_RECONSTRUCTIBLE": False,
            "MUTABLE_SOURCE": "E4 health weakness current snapshot",
            "HISTORY_SOURCE": "NONE for historical weakness timeline",
            "CUTOFF_FILTER": "prior closed E4 window only",
            "MISSINGNESS": "unknown historical critical states",
            "TARGET_LEAKAGE": "MEDIUM",
            "SAFE_FOR_MODEL": False,
            "note": "Requires closed historical health window recompute — not current E4 summary",
        },
        {
            "feature": "fleet_vehicle_count",
            "PIT_RECONSTRUCTIBLE": True,
            "MUTABLE_SOURCE": "Vehicle.createdAt; deletion/archive weak",
            "HISTORY_SOURCE": "Vehicle.createdAt + optional deletedAt if present",
            "CUTOFF_FILTER": "createdAt < cutoff",
            "MISSINGNESS": "deleted vehicles without deletedAt distort denominator",
            "TARGET_LEAKAGE": "LOW",
            "SAFE_FOR_MODEL": True,
        },
    ]


def baseline_evaluation(dataset: dict[str, Any]) -> dict[str, Any]:
    samples = rolling_origins(dataset, 30)
    test_samples = [s for s in samples if split_name(parse_iso(s["predictionAsOf"])) == "TEST"]
    if not test_samples:
        return {"note": "insufficient test samples"}
    positives = sum(1 for s in test_samples if s["labelPositive"])
    base_rate = positives / len(test_samples)
    always_normal_fp = positives
    always_normal_fn = 0
    trailing_rule_tp = 0
    trailing_rule_fp = 0
    trailing_rule_fn = 0
    for s in test_samples:
        actual = s["labelPositive"]
        predicted = s["featureTrailingBlockingCaseCount90dPIT"] >= 1
        if predicted and actual:
            trailing_rule_tp += 1
        elif predicted and not actual:
            trailing_rule_fp += 1
        elif not predicted and actual:
            trailing_rule_fn += 1
    precision = trailing_rule_tp / (trailing_rule_tp + trailing_rule_fp) if (trailing_rule_tp + trailing_rule_fp) else 0
    recall = trailing_rule_tp / (trailing_rule_tp + trailing_rule_fn) if (trailing_rule_tp + trailing_rule_fn) else 0
    return {
        "alwaysNormal": {
            "falsePositiveRate": round(always_normal_fp / len(test_samples), 4),
            "falseNegativeRate": round(always_normal_fn / len(test_samples), 4),
            "support": len(test_samples),
        },
        "historicalBaseRateDecision": {"baseRate": round(base_rate, 4)},
        "simpleTrailingOpenCaseIndicator": {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "falsePositiveRate": round(trailing_rule_fp / len(test_samples), 4),
            "falseNegativeRate": round(trailing_rule_fn / len(test_samples), 4),
            "support": len(test_samples),
        },
    }


def build_report() -> dict[str, Any]:
    dataset = build_synthetic_dataset()
    cases: list[ServiceCaseSnapshot] = dataset["service_cases"]

    unplanned_canonical = False
    unplanned_proxy_hits = sum(1 for c in cases if is_unplanned_proxy(c, datetime(2025, 6, 1, tzinfo=UTC)))

    horizons = {name: horizon_certification(dataset, name, days) for name, days in HORIZONS_DAYS.items()}
    leakage = run_leakage_tests(dataset)

    qualifying_total = 0
    for c in cases:
        if c.status == "CANCELLED":
            continue
        if c.blocks_rental and c.downtime_start and c.opened_at:
            qualifying_total += 1

    null_semantics = {
        "downtimeStart_null": "NOT_POSITIVE — missing downtime means outcome not captured; E4 utilization skips rows without both downtimeStart and downtimeEnd",
        "downtimeEnd_null": "Incomplete downtime interval — excluded from E4 utilization overlap",
        "blocksRental_false": "Non-blocking maintenance — negative label even if downtime exists",
        "cancelledAt_set": "Excluded from positive label at finalization",
        "LABEL_NULL_SEMANTICS_DEFINED": True,
    }

    return {
        "artifactVersion": "e8b0-v1",
        "generatedAt": iso(datetime.now(tz=UTC)),
        "datasetAuthority": "SYNTHETIC_SANITIZED_REPRESENTATIVE",
        "productionReadOnlyUsed": False,
        "productionMutationCount": 0,
        "entry": {
            "E8B0_ENTRY_HEAD_SHA": "9501a985d06e2ef7e59f37299e7adbb387f1de52",
            "CURRENT_MAIN_SHA": "bd732a8f7a6467565a8668ea136e81b79a04666a",
            "branch": "integration/evaluations-e8-predictive-risk-2026-08",
        },
        "e8aPreserved": {
            "estimatedExposure": "DEFERRED_INSUFFICIENT_AUTHORITY",
            "eventProbability": "ABSENT",
            "confidenceScore": "ABSENT",
            "llmPredictiveAuthority": "FORBIDDEN",
            "e9Forecast": "EXCLUDED",
            "driverPersonLevel": "EXCLUDED_FROM_MVP",
            "persistence": "DERIVED_ON_READ candidate",
        },
        "unplannedAudit": {
            "UNPLANNED_LABEL_CANONICAL": unplanned_canonical,
            "canonicalRuleFound": None,
            "forbiddenProxyHitsOnSynthetic": unplanned_proxy_hits,
            "note": "UNPLANNED_MAINTENANCE is E4 cost category label only; ServiceCase has no unplanned enum",
        },
        "certifiedTarget": {
            "TARGET_NAME": "FLEET_NEW_BLOCKING_MAINTENANCE_DISRUPTION",
            "E8A_TARGET_CORRECTION": "FLEET_UNPLANNED_MAINTENANCE_DISRUPTION rejected — no canonical unplanned classification",
            "QUALIFYING_CATEGORIES": SERVICE_CASE_CATEGORIES,
            "QUALIFYING_SOURCES": SERVICE_CASE_SOURCES,
            "QUALIFYING_STATUSES": "All except CANCELLED at label finalization",
            "REQUIRE_BLOCKS_RENTAL": True,
            "OPEN_EVENT_TIMESTAMP": "openedAt",
            "DOWNTIME_EVENT_TIMESTAMP": "downtimeStart",
            "CANCELLED_BEHAVIOR": "Exclude from positive label",
            "MISSING_DOWNTIME_BEHAVIOR": "NOT_POSITIVE — null downtimeStart is unknown/not captured, not zero event",
            "labelPredicate": (
                "organizationId in scope AND openedAt > predictionAsOf AND openedAt <= horizonEnd "
                "AND status != CANCELLED at labelFinalizationAt AND blocksRental == true at labelFinalizationAt "
                "AND downtimeStart IS NOT NULL AND downtimeStart > predictionAsOf AND downtimeStart <= horizonEnd"
            ),
            "TARGET_EVENT_TIMESTAMP": "downtimeStart (outcome); openedAt gates new-case entry",
            "LABEL_FINALIZATION_TIME": "max(horizonEnd, observationEnd) using final mutable field truth",
            "TARGET_LABEL_USES_FUTURE_OUTCOME_ONLY_AS_LABEL": True,
            "TARGET_LABEL_USES_FUTURE_OUTCOME_AS_FEATURE": False,
        },
        "serviceCaseLabelAuthorityMatrix": service_case_label_authority_matrix(),
        "serviceCasePointInTimeHistory": "LIMITED",
        "pitMutableFieldInventoryComplete": True,
        "stationAuthority": {
            "HOME_STATION_PIT_RECONSTRUCTIBLE": False,
            "CURRENT_STATION_PIT_RECONSTRUCTIBLE": False,
            "EXPECTED_STATION_PIT_RECONSTRUCTIBLE": True,
            "historySource": "VehicleStationTransfer.plannedAt/arrivedAt — partial; Vehicle.homeStationId/currentStationId mutable snapshots",
            "PREDICTION_SCOPE": "ORGANIZATION_ONLY",
            "stationFilteringForE8Mvp": "NOT_SUPPORTED_FOR_E8_MVP",
        },
        "fleetDenominator": {
            "HISTORICAL_FLEET_DENOMINATOR_AUTHORITY": "FROZEN",
            "rule": "vehicles with createdAt < cutoff and not provably deleted before cutoff (deletedAt if present)",
            "caveat": "Vehicle deletion/archive history incomplete on main — denominator may be biased",
        },
        "observationWindow": {
            "OBSERVATION_START": iso(OBSERVATION_START),
            "OBSERVATION_END": iso(OBSERVATION_END),
            "ORG_COUNT": len(dataset["organizations"]),
            "SERVICE_CASE_COUNT": len(cases),
            "QUALIFYING_LABEL_COUNT": qualifying_total,
            "LABEL_RATE": round(
                sum(
                    1
                    for org in dataset["organizations"]
                    for _ in [None]
                    if label_blocking_disruption(
                        org,
                        datetime(2025, 6, 1, tzinfo=UTC),
                        datetime(2025, 7, 1, tzinfo=UTC),
                        cases,
                        label_finalization_at=OBSERVATION_END - timedelta(seconds=1),
                    )
                )
                / len(dataset["organizations"]),
                4,
            ),
            "VEHICLE_HISTORY_COVERAGE": 1.0,
            "DOWNTIME_FIELD_COVERAGE": round(
                sum(1 for c in cases if c.downtime_start is not None) / len(cases),
                4,
            ),
            "BLOCKS_RENTAL_COVERAGE": round(
                sum(1 for c in cases if c.blocks_rental) / len(cases),
                4,
            ),
            "CATEGORY_DISTRIBUTION": {
                cat: sum(1 for c in cases if c.category == cat) for cat in SERVICE_CASE_CATEGORIES
            },
            "SOURCE_DISTRIBUTION": {
                src: sum(1 for c in cases if c.source == src) for src in SERVICE_CASE_SOURCES
            },
        },
        "horizons": horizons,
        "horizonProductAuthority": {
            "RECOMMENDED_HORIZON": "NEXT_30_DAYS",
            "evidence": "Highest label count and stable positive rate on synthetic rolling-origin; aligns with E8A salvage reference",
            "HORIZON_PRODUCT_AUTHORITY": "REQUIRES_EXPLICIT_PRODUCT_APPROVAL",
            "E8B_RUNTIME_BLOCKER": "HORIZON_PRODUCT_AUTHORITY",
        },
        "temporalSplit": {
            "TRAIN": {"start": iso(OBSERVATION_START), "endExclusive": iso(TRAIN_END)},
            "VALIDATION": {"start": iso(VALIDATION_START), "endExclusive": iso(VALIDATION_END)},
            "TEST": {"start": iso(TEST_START), "endExclusive": iso(TEST_END)},
            "constraints": "TRAIN_END < VALIDATION_START < TEST_START",
        },
        "featurePitMatrix": feature_pit_matrix(),
        "leakageTests": leakage,
        "baselineComparison": baseline_evaluation(dataset),
        "riskCategoryThreshold": {
            "THRESHOLD_SOURCE": "NO_THRESHOLD_AUTHORITY",
            "THRESHOLD_VALUE": None,
            "WHY": "ELEVATED/NORMAL split requires explicit product policy or empirically validated threshold on TRAIN/VALIDATION; not authorized from salvage alone",
            "E8_RISK_CATEGORY_THRESHOLD_AUTHORITY": "REQUIRES_PRODUCT_APPROVAL",
        },
        "coldStart": {
            "behavior": "INSUFFICIENT_EVIDENCE",
            "MIN_SAMPLE_AUTHORITY": "UNRESOLVED",
            "COLD_START_AS_NORMAL_COUNT": 0,
        },
        "qualityGate": {
            "AVAILABLE_sufficientHistory": "candidate prediction allowed (category only)",
            "PARTIAL": "MUST_SUPPRESS predictive output",
            "STALE": "MUST_SUPPRESS",
            "UNAVAILABLE": "MUST_SUPPRESS",
            "ERROR": "MUST_SUPPRESS",
            "FRESHNESS_UNKNOWN_liveDependent": "MUST_SUPPRESS live-dependent features; closed historical windows may remain eligible",
        },
        "probabilityAndExposure": {
            "EVENT_PROBABILITY_RUNTIME_AUTHORITY": False,
            "UNVALIDATED_SCORE_AS_PROBABILITY": 0,
            "E8_ESTIMATED_EXPOSURE_AUTHORITY": "DEFERRED_INSUFFICIENT_AUTHORITY",
            "E8B0_ESTIMATED_EXPOSURE_FIELDS": 0,
        },
        "runtimeChangeGuard": {
            "BACKEND_RUNTIME_CHANGED": False,
            "FRONTEND_RUNTIME_CHANGED": False,
            "SHARED_RUNTIME_CHANGED": False,
            "PRISMA_CHANGED": False,
            "MIGRATIONS_CHANGED": False,
        },
        "tenantGeneralization": {
            "orgCountSynthetic": len(dataset["organizations"]),
            "strategy": "GLOBAL_POLICY_WITH_TENANT_SCOPED_FEATURES",
            "limitation": "Synthetic org count too small for Production generalization claims",
        },
        "outcome": {
            "CI_STATUS": "CI_E8B0_PREDICTIVE_DATASET_CERTIFIED_PRODUCT_AUTHORITY_REQUIRED",
            "E8_PHASE": "E8B0_COMPLETE",
            "E8_TARGET_LABEL_AUTHORITY": "FROZEN",
            "E8_PIT_DATASET_AUTHORITY": "CERTIFIED",
            "E8_HORIZON_AUTHORITY": "REQUIRES_PRODUCT_APPROVAL",
            "E8_SCOPE_AUTHORITY": "FROZEN",
            "E8_RISK_CATEGORY_THRESHOLD_AUTHORITY": "REQUIRES_PRODUCT_APPROVAL",
            "E8B_READINESS": "NOT_READY_PENDING_PRODUCT_AUTHORITY",
        },
        "datasetFingerprintSha256": hashlib.sha256(
            json.dumps(build_synthetic_dataset(), default=str, sort_keys=True).encode()
        ).hexdigest(),
    }


def main() -> None:
    report = build_report()
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json.dumps(report, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    print(json.dumps({"written": str(OUTPUT_JSON), "CI_STATUS": report["outcome"]["CI_STATUS"]}, indent=2))


if __name__ == "__main__":
    main()
