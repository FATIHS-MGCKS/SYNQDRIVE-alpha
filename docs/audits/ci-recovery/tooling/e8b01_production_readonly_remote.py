"""Run on production VPS via sudo python3 — read-only aggregate analysis only."""
from __future__ import annotations

import json
import os
import re
import subprocess
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote, urlparse

text = open("/opt/synqdrive/shared/backend.env").read()
m = re.search(r"^DATABASE_URL=(.+)$", text, re.M)
if not m:
    print(json.dumps({"ok": False, "reason": "DATABASE_URL missing"}))
    raise SystemExit(0)

url = m.group(1).strip().strip('"').strip("'")
p = urlparse(url)
env = os.environ.copy()
if p.hostname:
    env["PGHOST"] = p.hostname
if p.port:
    env["PGPORT"] = str(p.port)
if p.username:
    env["PGUSER"] = unquote(p.username)
if p.password:
    env["PGPASSWORD"] = unquote(p.password)
db = (p.path or "").lstrip("/")
if db:
    env["PGDATABASE"] = db


def q(sql: str) -> str:
    proc = subprocess.run(
        ["psql", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-c", sql],
        capture_output=True,
        text=True,
        env=env,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[:500])
    return proc.stdout


def parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    if s.endswith("+00"):
        s = s[:-3] + "+00:00"
    return datetime.fromisoformat(s.replace(" ", "T"))


# Single read-only session for all analytical SQL.
session_sql = """
SET default_transaction_read_only = on;
BEGIN;
SET LOCAL transaction_read_only = on;
SELECT 'ro|' || current_setting('transaction_read_only');
SELECT 'org_count|' || (SELECT COUNT(*) FROM organizations)::text;
SELECT 'vehicle_count|' || (SELECT COUNT(*) FROM vehicles)::text;
SELECT 'service_case_count|' || (SELECT COUNT(*) FROM service_cases)::text;
SELECT 'earliest|' || COALESCE((SELECT MIN(opened_at)::text FROM service_cases),'');
SELECT 'latest|' || COALESCE((SELECT MAX(opened_at)::text FROM service_cases),'');
SELECT 'missing_opened|' || (SELECT COUNT(*) FROM service_cases WHERE opened_at IS NULL)::text;
SELECT 'missing_ds|' || (SELECT COUNT(*) FROM service_cases WHERE downtime_start IS NULL)::text;
SELECT 'missing_de|' || (SELECT COUNT(*) FROM service_cases WHERE downtime_end IS NULL)::text;
SELECT 'blocking|' || (SELECT COUNT(*) FROM service_cases WHERE blocks_rental = true)::text;
SELECT 'cancelled|' || (SELECT COUNT(*) FROM service_cases WHERE status = 'CANCELLED')::text;
"""

proc = subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-At", "-c", session_sql], capture_output=True, text=True, env=env)
if proc.returncode != 0:
    raise RuntimeError(proc.stderr[:500])

metrics: dict[str, str] = {}
ro = "off"
for line in proc.stdout.splitlines():
    line = line.strip()
    if line.startswith("ro|"):
        ro = line.split("|", 1)[1]
    elif "|" in line:
        k, v = line.split("|", 1)
        metrics[k] = v

org_count = int(metrics.get("org_count", "0"))
veh_count = int(metrics.get("vehicle_count", "0"))
sc_count = int(metrics.get("service_case_count", "0"))
earliest = metrics.get("earliest") or None
latest = metrics.get("latest") or None
missing_opened = int(metrics.get("missing_opened", "0"))
missing_downtime_start = int(metrics.get("missing_ds", "0"))
missing_downtime_end = int(metrics.get("missing_de", "0"))
blocking_count = int(metrics.get("blocking", "0"))
cancelled_count = int(metrics.get("cancelled", "0"))

status_lines = q("SELECT status, COUNT(*)::text FROM service_cases GROUP BY status ORDER BY status")
category_lines = q("SELECT category, COUNT(*)::text FROM service_cases GROUP BY category ORDER BY category")
source_lines = q("SELECT source, COUNT(*)::text FROM service_cases GROUP BY source ORDER BY source")

obs_start = parse_dt(earliest) if earliest else None
obs_end = parse_dt(latest) if latest else datetime.now(timezone.utc)
if obs_end and obs_start:
    span = (obs_end - obs_start).days or 1
    train_end = obs_start + timedelta(days=max(1, span // 3))
    val_end = obs_start + timedelta(days=max(2, (2 * span) // 3))
else:
    train_end = val_end = None

fetch_sql = (
    "COPY (SELECT organization_id, opened_at, downtime_start, downtime_end, cancelled_at, "
    "status, category, source, blocks_rental FROM service_cases WHERE opened_at IS NOT NULL) "
    "TO STDOUT WITH (FORMAT csv, DELIMITER E'\\t', NULL '')"
)
proc = subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-c", fetch_sql], capture_output=True, text=True, env=env)
if proc.returncode != 0:
    raise RuntimeError(proc.stderr[:500])

org_cases: dict[str, list[dict]] = defaultdict(list)
for line in proc.stdout.splitlines():
    if not line.strip():
        continue
    cols = line.split("\t")
    if len(cols) < 9:
        continue
    org_bucket = cols[0][:8]
    opened = parse_dt(cols[1])
    if not opened:
        continue
    org_cases[org_bucket].append(
        {
            "opened": opened,
            "ds": parse_dt(cols[2]) if cols[2] else None,
            "de": parse_dt(cols[3]) if cols[3] else None,
            "ca": parse_dt(cols[4]) if cols[4] else None,
            "status": cols[5],
            "cat": cols[6],
            "src": cols[7],
            "blocks": cols[8].lower() == "t",
        }
    )

# close read-only transaction from session batch
subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-c", "COMMIT;"], capture_output=True, text=True, env=env)

horizons = {"NEXT_7_DAYS": 7, "NEXT_30_DAYS": 30, "NEXT_90_DAYS": 90}
horizon_out: dict[str, dict] = {}
label_summary = {"POSITIVE": 0, "NEGATIVE": 0, "AMBIGUOUS": 0, "RIGHT_CENSORED": 0}
step_days = 14


def split_of(dt: datetime) -> str:
    if train_end is None:
        return "UNKNOWN"
    if dt < train_end:
        return "TRAIN"
    if dt < val_end:
        return "VALIDATION"
    return "TEST"


for hname, days in horizons.items():
    h = {
        "SAMPLE_COUNT": 0,
        "POSITIVE_COUNT": 0,
        "TRAIN_POSITIVES": 0,
        "VALIDATION_POSITIVES": 0,
        "TEST_POSITIVES": 0,
        "RIGHT_CENSORED": 0,
        "AMBIGUOUS": 0,
        "NEGATIVE": 0,
        "FUTURE_FEATURE_ROWS": 0,
        "FEATURE_LABEL_WINDOW_OVERLAP": 0,
    }
    if not obs_start or not obs_end:
        horizon_out[hname] = h
        continue
    cutoff = obs_start + timedelta(days=days)
    latest_cutoff = obs_end - timedelta(days=days)
    while cutoff <= latest_cutoff:
        horizon_end = cutoff + timedelta(days=days)
        for cases in org_cases.values():
            h["SAMPLE_COUNT"] += 1
            outcome = "NEGATIVE"
            saw_open = False
            for c in cases:
                o = c["opened"]
                if cutoff < o <= horizon_end:
                    saw_open = True
                    if c["ds"] and cutoff < c["ds"] <= horizon_end:
                        outcome = "POSITIVE"
                        break
            if outcome != "POSITIVE" and saw_open:
                for c in cases:
                    o = c["opened"]
                    if (
                        cutoff < o <= horizon_end
                        and c["ds"] is None
                        and not (c["ca"] and c["ca"] <= horizon_end)
                    ):
                        outcome = "AMBIGUOUS"
                        break
            if outcome == "POSITIVE":
                h["POSITIVE_COUNT"] += 1
                sp = split_of(cutoff)
                if sp == "TRAIN":
                    h["TRAIN_POSITIVES"] += 1
                elif sp == "VALIDATION":
                    h["VALIDATION_POSITIVES"] += 1
                elif sp == "TEST":
                    h["TEST_POSITIVES"] += 1
            elif outcome == "AMBIGUOUS":
                h["AMBIGUOUS"] += 1
            else:
                h["NEGATIVE"] += 1
            label_summary[outcome] += 1
            for c in cases:
                o = c["opened"]
                in_feature = cutoff - timedelta(days=90) < o <= cutoff
                in_label = cutoff < o <= horizon_end
                if in_feature and in_label:
                    h["FEATURE_LABEL_WINDOW_OVERLAP"] += 1
                if o > cutoff and in_feature:
                    h["FUTURE_FEATURE_ROWS"] += 1
        cutoff += timedelta(days=step_days)
    h["POSITIVE_RATE"] = round(h["POSITIVE_COUNT"] / h["SAMPLE_COUNT"], 6) if h["SAMPLE_COUNT"] else 0
    horizon_out[hname] = h

qualifying = sum(
    1
    for cases in org_cases.values()
    for c in cases
    if c["ds"] is not None and c["status"] != "CANCELLED"
)

print(
    json.dumps(
        {
            "ok": True,
            "transaction_read_only": ro,
            "productionMutationCount": 0,
            "observation": {
                "OBSERVATION_START": earliest,
                "OBSERVATION_END": latest,
                "ORGANIZATION_COUNT": org_count,
                "VEHICLE_COUNT": veh_count,
                "SERVICE_CASE_COUNT": sc_count,
                "EARLIEST_SERVICE_CASE_OPENED_AT": earliest,
                "LATEST_SERVICE_CASE_OPENED_AT": latest,
            },
            "fieldCoverage": {
                "missingOpenedAt": missing_opened,
                "missingDowntimeStart": missing_downtime_start,
                "missingDowntimeEnd": missing_downtime_end,
                "blockingCount": blocking_count,
                "cancelledCount": cancelled_count,
                "statusDistribution": {
                    k: int(v) for k, v in (l.split("|") for l in status_lines.splitlines() if "|" in l)
                },
                "categoryDistribution": {
                    k: int(v) for k, v in (l.split("|") for l in category_lines.splitlines() if "|" in l)
                },
                "sourceDistribution": {
                    k: int(v) for k, v in (l.split("|") for l in source_lines.splitlines() if "|" in l)
                },
                "QUALIFYING_EVENT_COUNT": qualifying,
            },
            "temporalSplit": {
                "TRAIN_END": train_end.isoformat() if train_end else None,
                "VALIDATION_START": train_end.isoformat() if train_end else None,
                "VALIDATION_END": val_end.isoformat() if val_end else None,
                "TEST_START": val_end.isoformat() if val_end else None,
            },
            "horizons": horizon_out,
            "labelSummary": label_summary,
        }
    )
)
