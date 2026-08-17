"""Run on production VPS via sudo python3 — read-only E9 time-series viability aggregates only."""
from __future__ import annotations

import json
import os
import re
import subprocess
from collections import defaultdict
from datetime import datetime, timezone
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
        raise RuntimeError(proc.stderr[:800])
    return proc.stdout


session_sql = """
SET default_transaction_read_only = on;
BEGIN;
SET LOCAL transaction_read_only = on;
SELECT 'ro|' || current_setting('transaction_read_only');
SELECT 'org_count|' || (SELECT COUNT(*) FROM organizations)::text;
SELECT 'vehicle_count|' || (SELECT COUNT(*) FROM vehicles)::text;

-- Issued revenue daily buckets (E3 business time: invoice_date preferred)
SELECT 'invoice_count|' || (SELECT COUNT(*) FROM org_invoices WHERE deleted_at IS NULL)::text;
SELECT 'invoice_earliest|' || COALESCE((SELECT MIN(COALESCE(invoice_date, created_at))::text FROM org_invoices WHERE deleted_at IS NULL),'');
SELECT 'invoice_latest|' || COALESCE((SELECT MAX(COALESCE(invoice_date, created_at))::text FROM org_invoices WHERE deleted_at IS NULL),'');
SELECT 'invoice_org_count|' || (SELECT COUNT(DISTINCT organization_id) FROM org_invoices WHERE deleted_at IS NULL)::text;
SELECT 'invoice_currency_count|' || (SELECT COUNT(DISTINCT currency) FROM org_invoices WHERE deleted_at IS NULL AND currency IS NOT NULL)::text;

-- Daily bucket coverage (UTC date truncation for aggregate viability only)
SELECT 'invoice_daily_buckets|' || (
  SELECT COUNT(*) FROM (
    SELECT date_trunc('day', COALESCE(invoice_date, created_at))::date AS d, organization_id
    FROM org_invoices
    WHERE deleted_at IS NULL
    GROUP BY 1, 2
  ) s
)::text;

SELECT 'invoice_daily_bucket_min|' || COALESCE((
  SELECT MIN(cnt)::text FROM (
    SELECT organization_id, COUNT(DISTINCT date_trunc('day', COALESCE(invoice_date, created_at))::date) AS cnt
    FROM org_invoices WHERE deleted_at IS NULL GROUP BY 1
  ) x
),'0');
SELECT 'invoice_daily_bucket_median|' || COALESCE((
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY cnt)::int::text FROM (
    SELECT organization_id, COUNT(DISTINCT date_trunc('day', COALESCE(invoice_date, created_at))::date) AS cnt
    FROM org_invoices WHERE deleted_at IS NULL GROUP BY 1
  ) x
),'0');
SELECT 'invoice_daily_bucket_max|' || COALESCE((
  SELECT MAX(cnt)::text FROM (
    SELECT organization_id, COUNT(DISTINCT date_trunc('day', COALESCE(invoice_date, created_at))::date) AS cnt
    FROM org_invoices WHERE deleted_at IS NULL GROUP BY 1
  ) x
),'0');

-- Booking occupancy viability
SELECT 'booking_count|' || (SELECT COUNT(*) FROM bookings)::text;
SELECT 'booking_earliest|' || COALESCE((SELECT MIN(start_date)::text FROM bookings),'');
SELECT 'booking_latest|' || COALESCE((SELECT MAX(start_date)::text FROM bookings),'');
SELECT 'booking_org_count|' || (SELECT COUNT(DISTINCT organization_id) FROM bookings)::text;
SELECT 'booking_daily_buckets|' || (
  SELECT COUNT(*) FROM (
    SELECT date_trunc('day', start_date)::date AS d, organization_id
    FROM bookings GROUP BY 1, 2
  ) s
)::text;
SELECT 'booking_daily_bucket_min|' || COALESCE((
  SELECT MIN(cnt)::text FROM (
    SELECT organization_id, COUNT(DISTINCT date_trunc('day', start_date)::date) AS cnt
    FROM bookings GROUP BY 1
  ) x
),'0');
SELECT 'booking_daily_bucket_median|' || COALESCE((
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY cnt)::int::text FROM (
    SELECT organization_id, COUNT(DISTINCT date_trunc('day', start_date)::date) AS cnt
    FROM bookings GROUP BY 1
  ) x
),'0');
SELECT 'booking_daily_bucket_max|' || COALESCE((
  SELECT MAX(cnt)::text FROM (
    SELECT organization_id, COUNT(DISTINCT date_trunc('day', start_date)::date) AS cnt
    FROM bookings GROUP BY 1
  ) x
),'0');

-- ServiceCase downtime (E8 sparse)
SELECT 'service_case_count|' || (SELECT COUNT(*) FROM service_cases)::text;

COMMIT;
"""

proc = subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-At", "-c", session_sql], capture_output=True, text=True, env=env)
if proc.returncode != 0:
    print(json.dumps({"ok": False, "reason": proc.stderr[:800]}))
    raise SystemExit(1)

metrics: dict[str, str] = {}
ro = "off"
for line in proc.stdout.splitlines():
    line = line.strip()
    if not line or "|" not in line:
        continue
    k, v = line.split("|", 1)
    if k == "ro":
        ro = v
    else:
        metrics[k] = v

def parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    if s.endswith("+00"):
        s = s[:-3] + "+00:00"
    return datetime.fromisoformat(s.replace(" ", "T"))


obs_start = None
obs_end = None
for key in ("invoice_earliest", "booking_earliest"):
    dt = parse_dt(metrics.get(key))
    if dt and (obs_start is None or dt < obs_start):
        obs_start = dt
for key in ("invoice_latest", "booking_latest"):
    dt = parse_dt(metrics.get(key))
    if dt and (obs_end is None or dt > obs_end):
        obs_end = dt

org_count = int(metrics.get("org_count", "0") or 0)
invoice_org = int(metrics.get("invoice_org_count", "0") or 0)
booking_org = int(metrics.get("booking_org_count", "0") or 0)
min_hist = int(metrics.get("invoice_daily_bucket_min", "0") or 0)
med_hist = int(metrics.get("invoice_daily_bucket_median", "0") or 0)
max_hist = int(metrics.get("invoice_daily_bucket_max", "0") or 0)
booking_min = int(metrics.get("booking_daily_bucket_min", "0") or 0)
booking_med = int(metrics.get("booking_daily_bucket_median", "0") or 0)
booking_max = int(metrics.get("booking_daily_bucket_max", "0") or 0)

# E9 salvage min-history gates (revenue rule 180d, demand 30d, utilization 14d) — compare bucket counts
REVENUE_MIN_RULE = 180
UTIL_MIN_RULE = 14

result = {
    "artifactVersion": "e9a01-v1",
    "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "productionReadOnly": {
        "used": True,
        "transaction_read_only": ro,
        "productionMutationCount": 0,
    },
    "platformCounts": {
        "ORGANIZATION_COUNT": org_count,
        "VEHICLE_COUNT": int(metrics.get("vehicle_count", "0") or 0),
        "SERVICE_CASE_COUNT": int(metrics.get("service_case_count", "0") or 0),
    },
    "candidates": {
        "DAILY_ISSUED_REVENUE": {
            "OBSERVATION_START": obs_start.isoformat().replace("+00:00", "Z") if obs_start else None,
            "OBSERVATION_END": obs_end.isoformat().replace("+00:00", "Z") if obs_end else None,
            "INVOICE_COUNT": int(metrics.get("invoice_count", "0") or 0),
            "BUCKET_COUNT": int(metrics.get("invoice_daily_buckets", "0") or 0),
            "TENANT_COUNT": invoice_org,
            "MIN_TENANT_HISTORY": min_hist,
            "MEDIAN_TENANT_HISTORY": med_hist,
            "MAX_TENANT_HISTORY": max_hist,
            "CURRENCY_COUNT": int(metrics.get("invoice_currency_count", "0") or 0),
            "RULE_MIN_HISTORY_DAYS": REVENUE_MIN_RULE,
            "MEETS_RULE_MIN_HISTORY": max_hist >= REVENUE_MIN_RULE,
            "MEETS_ANY_ORG_RULE_MIN": min_hist >= REVENUE_MIN_RULE if invoice_org else False,
        },
        "DAILY_FLEET_UTILIZATION": {
            "BOOKING_COUNT": int(metrics.get("booking_count", "0") or 0),
            "BUCKET_COUNT": int(metrics.get("booking_daily_buckets", "0") or 0),
            "TENANT_COUNT": booking_org,
            "MIN_TENANT_HISTORY": booking_min,
            "MEDIAN_TENANT_HISTORY": booking_med,
            "MAX_TENANT_HISTORY": booking_max,
            "RULE_MIN_HISTORY_DAYS": UTIL_MIN_RULE,
            "MEETS_RULE_MIN_HISTORY": max_hist >= UTIL_MIN_RULE if booking_org else False,
            "MEETS_ANY_ORG_UTIL_MIN": booking_max >= UTIL_MIN_RULE if booking_org else False,
        },
    },
    "outcome": {},
}

# Viability decision
revenue_viable = (
    invoice_org > 0
    and int(metrics.get("invoice_count", "0") or 0) > 0
    and max_hist >= REVENUE_MIN_RULE
)
util_viable = booking_org > 0 and booking_max >= UTIL_MIN_RULE and int(metrics.get("booking_count", "0") or 0) >= 10

if revenue_viable:
    result["outcome"]["E9_INITIAL_FORECAST_TARGET"] = "fin.daily_issued_revenue (ORGANIZATION_ONLY, per-currency)"
    result["outcome"]["E9_MVP_SCOPE"] = "NARROW_SINGLE_FORECAST_FAMILY"
    result["outcome"]["E9B_READINESS"] = "READY_FOR_NARROW_CANONICAL_FORECAST_BACKEND"
    result["outcome"]["CI_STATUS"] = "CI_E9A_NARROW_FORECAST_AUTHORITY_COMPLETED"
elif util_viable and not revenue_viable:
    result["outcome"]["E9_INITIAL_FORECAST_TARGET"] = "ops.fleet_utilization_pct (ORGANIZATION_ONLY, daily)"
    result["outcome"]["E9_MVP_SCOPE"] = "NARROW_SINGLE_FORECAST_FAMILY"
    result["outcome"]["E9B_READINESS"] = "READY_FOR_NARROW_CANONICAL_FORECAST_BACKEND"
    result["outcome"]["CI_STATUS"] = "CI_E9A_NARROW_FORECAST_AUTHORITY_COMPLETED"
else:
    result["outcome"]["E9_INITIAL_FORECAST_TARGET"] = "NO_E9_FORECAST_TARGET_CURRENTLY_DEFENSIBLE"
    result["outcome"]["E9_MVP_SCOPE"] = "DEFERRED"
    result["outcome"]["E9B_READINESS"] = "NOT_READY"
    result["outcome"]["CI_STATUS"] = "CI_E9A_FORECAST_AUTHORITY_COMPLETE_RUNTIME_DEFERRED"
    result["outcome"]["blockers"] = []
    if max_hist < REVENUE_MIN_RULE:
        result["outcome"]["blockers"].append("INSUFFICIENT_DAILY_INVOICE_HISTORY_FOR_REVENUE_BASELINE")
    if booking_max < UTIL_MIN_RULE:
        result["outcome"]["blockers"].append("INSUFFICIENT_DAILY_BOOKING_HISTORY_FOR_UTILIZATION_BASELINE")
    if org_count <= 1 and invoice_org <= 1:
        result["outcome"]["blockers"].append("SPARSE_TENANT_COVERAGE")

print(json.dumps(result, indent=2))
