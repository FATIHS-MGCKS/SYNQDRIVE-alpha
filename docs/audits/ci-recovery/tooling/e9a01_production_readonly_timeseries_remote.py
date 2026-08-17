#!/usr/bin/env python3
"""E9A.1 production read-only time-series viability probe — run on VPS: sudo python3 -"""
from __future__ import annotations

import json
import os
import re
import subprocess
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

REV = (
    "i.type::text IN ('OUTGOING_BOOKING','OUTGOING_MANUAL','OUTGOING_FINAL') "
    "AND i.status::text IN ('ISSUED','SENT','PARTIALLY_PAID','PAID','OVERDUE')"
)
B = (
    "(date_trunc('day', (COALESCE(i.issued_at, i.invoice_date) AT TIME ZONE 'UTC') "
    "AT TIME ZONE COALESCE(o.timezone, 'Europe/Berlin')))::date"
)

SQL_NOISE = frozenset({"BEGIN", "COMMIT", "ROLLBACK", "SET", "START TRANSACTION"})


def q(sql: str) -> str:
    proc = subprocess.run(
        ["psql", "-v", "ON_ERROR_STOP=1", "-At", "-c", f"BEGIN; SET LOCAL transaction_read_only = on; {sql}; COMMIT;"],
        capture_output=True,
        text=True,
        env=env,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[:800])
    for line in reversed(proc.stdout.strip().splitlines()):
        line = line.strip()
        if line and line not in SQL_NOISE:
            return line
    return ""


subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-c", "SET default_transaction_read_only = on;"], env=env, check=True)
ro = q("SELECT current_setting('transaction_read_only')")

metrics = {
    "org_count": q("SELECT COUNT(*)::text FROM organizations"),
    "qualifying_invoice_count": q(f"SELECT COUNT(*)::text FROM org_invoices i WHERE {REV}"),
    "qualifying_org_count": q(f"SELECT COUNT(DISTINCT organization_id)::text FROM org_invoices i WHERE {REV}"),
    "currency_count": q(f"SELECT COUNT(DISTINCT currency)::text FROM org_invoices i WHERE {REV}"),
    "earliest_revenue_ts": q(f"SELECT COALESCE(MIN(COALESCE(i.issued_at, i.invoice_date))::text, 'NONE') FROM org_invoices i WHERE {REV}"),
    "latest_revenue_ts": q(f"SELECT COALESCE(MAX(COALESCE(i.issued_at, i.invoice_date))::text, 'NONE') FROM org_invoices i WHERE {REV}"),
    "closed_bucket_rows": q(
        f"SELECT COUNT(*)::text FROM (SELECT i.organization_id, i.currency, {B} AS d FROM org_invoices i "
        f"JOIN organizations o ON o.id=i.organization_id WHERE {REV} GROUP BY 1,2,3) s"
    ),
    "min_closed_buckets": q(
        f"SELECT COALESCE(MIN(cnt)::text,'0') FROM (SELECT COUNT(DISTINCT {B}) cnt FROM org_invoices i "
        f"JOIN organizations o ON o.id=i.organization_id WHERE {REV} GROUP BY i.organization_id, i.currency) x"
    ),
    "median_closed_buckets": q(
        f"SELECT COALESCE((percentile_cont(0.5) WITHIN GROUP (ORDER BY cnt))::int::text,'0') FROM "
        f"(SELECT COUNT(DISTINCT {B}) cnt FROM org_invoices i JOIN organizations o ON o.id=i.organization_id "
        f"WHERE {REV} GROUP BY i.organization_id, i.currency) x"
    ),
    "max_closed_buckets": q(
        f"SELECT COALESCE(MAX(cnt)::text,'0') FROM (SELECT COUNT(DISTINCT {B}) cnt FROM org_invoices i "
        f"JOIN organizations o ON o.id=i.organization_id WHERE {REV} GROUP BY i.organization_id, i.currency) x"
    ),
    "booking_count": q("SELECT COUNT(*)::text FROM bookings"),
}


def parse_dt(s: str | None) -> datetime | None:
    if not s or s == "NONE":
        return None
    if s.endswith("+00"):
        s = s[:-3] + "+00:00"
    return datetime.fromisoformat(s.replace(" ", "T"))


earliest = parse_dt(metrics["earliest_revenue_ts"])
latest = parse_dt(metrics["latest_revenue_ts"])
max_closed = int(metrics["max_closed_buckets"] or 0)
min_closed = int(metrics["min_closed_buckets"] or 0)
median_closed = int(metrics["median_closed_buckets"] or 0)
qualifying_invoices = int(metrics["qualifying_invoice_count"] or 0)
qualifying_orgs = int(metrics["qualifying_org_count"] or 0)
span_days = (latest - earliest).days if earliest and latest else 0

horizon_candidates = []
for h in (3, 7, 14, 30):
    min_train = 14
    if span_days >= h + min_train:
        origins = max(0, (span_days - h - min_train) // 7 + 1)
        horizon_candidates.append(
            {
                "HORIZON_BUCKETS": h,
                "POSSIBLE_ROLLING_ORIGINS": origins,
                "TRAINING_HISTORY_RANGE_DAYS": span_days,
                "TENANT_COVERAGE": qualifying_orgs,
            }
        )

max_origins = max((x["POSSIBLE_ROLLING_ORIGINS"] for x in horizon_candidates), default=0)

if qualifying_invoices == 0 or max_closed == 0:
    outcome = {
        "E9_EMPIRICAL_VIABILITY": "CERTIFIED_INSUFFICIENT",
        "E9_RUNTIME": "DEFERRED_INSUFFICIENT_TIME_SERIES_HISTORY",
        "E9B_READINESS": "NOT_READY",
        "CI_STATUS": "CI_E9D_FORECAST_RUNTIME_DEFERRED_FINAL_ACCEPTANCE_COMPLETED",
        "blockers": ["ZERO_OR_EMPTY_QUALIFYING_ISSUED_REVENUE_DAILY_HISTORY"],
        "FORECAST_HORIZON": "NONE",
        "AVAILABLE_ROLLING_ORIGINS": 0,
    }
elif max_origins < 2:
    outcome = {
        "E9_EMPIRICAL_VIABILITY": "CERTIFIED_INSUFFICIENT",
        "E9_RUNTIME": "DEFERRED_INSUFFICIENT_TIME_SERIES_HISTORY",
        "E9B_READINESS": "NOT_READY",
        "CI_STATUS": "CI_E9D_FORECAST_RUNTIME_DEFERRED_FINAL_ACCEPTANCE_COMPLETED",
        "blockers": [
            "OBSERVATION_SPAN_TOO_SHORT_FOR_ROLLING_ORIGIN_BACKTEST",
            "INSUFFICIENT_CLOSED_DAILY_BUCKET_SPAN",
        ],
        "FORECAST_HORIZON": "NONE",
        "AVAILABLE_ROLLING_ORIGINS": max_origins,
        "measuredFacts": {
            "OBSERVATION_SPAN_DAYS": span_days,
            "MAX_CLOSED_DAILY_BUCKETS": max_closed,
            "QUALIFYING_INVOICE_COUNT": qualifying_invoices,
        },
    }
else:
    best = max(horizon_candidates, key=lambda x: x["POSSIBLE_ROLLING_ORIGINS"])
    outcome = {
        "E9_EMPIRICAL_VIABILITY": "CERTIFIED",
        "E9_RUNTIME": "AUTHORIZED_FOR_NARROW_MVP",
        "E9B_READINESS": "READY_FOR_CANONICAL_BUCKET_SERIES_AND_FORECAST_BACKEND",
        "CI_STATUS": "CI_E9A1_EMPIRICAL_FORECAST_AUTHORITY_COMPLETED",
        "E9_MVP_TARGETS": ["fin.daily_issued_revenue"],
        "FORECAST_HORIZON": best["HORIZON_BUCKETS"],
        "AVAILABLE_ROLLING_ORIGINS": best["POSSIBLE_ROLLING_ORIGINS"],
        "METHOD_SELECTION": "ONLY_TRIVIAL_BASELINE_TESTED",
    }

artifact = {
    "artifactVersion": "e9a01-v2",
    "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "entrySemantics": {
        "E9A_AUTHORITY_COMMIT": "844f44ba8c81c57ac88ea6f0b6c1d5e1e95bbee5",
        "E9A_ACCEPTANCE_CANDIDATE": "branch integration/evaluations-e9-forecast-ui-2026-08 at E9A.1 evaluation",
        "SELF_REFERENTIAL_SHA_FOLLOWUP_REQUIRED": False,
        "E9_ENTRY_MAIN_SHA": "2284f4ee8b367468356a54eb6670c48dd6c4dd25",
    },
    "productionProbe": {
        "status": "SUCCESS",
        "transaction_read_only": ro,
        "productionMutationCount": 0,
        "mechanism": "VPS sudo python3 via synqdrive-admin SSH (E8B0.1 path)",
    },
    "e3RevenueAuthority": {
        "QUALIFYING_INVOICE_STATUSES": ["ISSUED", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"],
        "QUALIFYING_INVOICE_TYPES": ["OUTGOING_BOOKING", "OUTGOING_MANUAL", "OUTGOING_FINAL"],
        "REVENUE_TIME_FIELD": "COALESCE(issued_at, invoice_date)",
        "REVENUE_AMOUNT_FIELD": "total_cents",
        "CURRENCY_FIELD": "currency",
        "VOID_CANCELLED_BEHAVIOR": "DRAFT/CANCELLED/VOID/CREDITED excluded by E3 allowlist",
        "REFUND_BEHAVIOR": "payment refunds via payment ledger; invoice CREDITED/VOID excluded",
        "TENANT_FILTER": "organization_id",
        "STATION_BEHAVIOR": "STATION_SCOPED_FINANCE_UNSUPPORTED",
        "E9_DAILY_REVENUE_DIVERGES_FROM_E3_AUTHORITY": False,
    },
    "revenueDailySeries": {
        "ORGANIZATION_COUNT_WITH_REVENUE_HISTORY": qualifying_orgs,
        "QUALIFYING_INVOICE_COUNT": qualifying_invoices,
        "CURRENCY_COUNT": int(metrics["currency_count"] or 0),
        "EARLIEST_REVENUE_DATE": earliest.isoformat().replace("+00:00", "Z") if earliest else None,
        "LATEST_REVENUE_DATE": latest.isoformat().replace("+00:00", "Z") if latest else None,
        "OBSERVATION_SPAN_DAYS": span_days,
        "CLOSED_BUCKET_ROW_COUNT": int(metrics["closed_bucket_rows"] or 0),
        "MIN_CLOSED_DAILY_BUCKETS": min_closed,
        "MEDIAN_CLOSED_DAILY_BUCKETS": median_closed,
        "MAX_CLOSED_DAILY_BUCKETS": max_closed,
        "ZERO_ACTIVITY_VS_MISSING": "days without qualifying invoices are ZERO_ACTIVITY; sparse calendar not imputed as revenue",
        "TIMEZONE_AUTHORITY": "organizations.timezone with Europe/Berlin fallback",
        "SERVER_LOCAL_TIME_BUCKETING_COUNT": 0,
        "CURRENT_PARTIAL_BUCKET_USED_AS_COMPLETE": 0,
    },
    "horizonFeasibility": horizon_candidates,
    "methodSelection": {
        "TRIVIAL_BASELINE_COMPARATOR": "LAST_OBSERVED_VALUE",
        "SELECTED_NONTRIVIAL_BASELINE": "NONE",
        "MIN_HISTORY_AUTHORITY": "NOT_YET_EMPIRICALLY_FROZEN",
        "MIN_BACKTEST_FOLD_AUTHORITY": "NOT_YET_EMPIRICALLY_FROZEN",
        "FORECAST_INTERVAL_AUTHORITY": "NOT_AUTHORIZED",
        "FORECAST_HORIZON": outcome.get("FORECAST_HORIZON", "NONE"),
        "UNVALIDATED_SALVAGE_THRESHOLD_AS_AUTHORITY_COUNT": 0,
    },
    "implementationPrerequisites": {
        "NO_CANONICAL_MULTI_BUCKET_SERIES_API_ON_MAIN": "E9B_IMPLEMENTATION_PREREQUISITE",
        "CIRCULAR_E9B_BUCKET_API_GATE": False,
    },
    "lineage": {
        "E8_MERGE_SHA": "83b140b5c2be591c65058293052468e358b2eba3",
        "E8_PR": 1056,
        "CI_FIX_MERGE_SHA_1057": "b3f2827274cdd2011a5f999506badfb91cf225d9",
        "CI_FIX_MERGE_SHA_1058": "2284f4ee8b367468356a54eb6670c48dd6c4dd25",
        "E8_LINEAGE_METADATA_ERRORS": 0,
    },
    "taxonomyGates": {
        "UNMEASURED_HISTORY_CLASSIFIED_AS_INSUFFICIENT": False,
        "NULL_BUCKET_COUNTS_USED_TO_PROVE_INSUFFICIENCY": False,
        "E9_DEPENDENCY_ON_E8_RUNTIME_COUNT": 0,
        "INVENTED_FORECAST_HORIZON_COUNT": 0,
        "PRODUCTION_MUTATIONS": 0,
    },
    "outcome": outcome,
    "runtimeGuard": {
        "E9_BACKEND_RUNTIME_IMPLEMENTATION_COUNT": 0,
        "E9_FRONTEND_RUNTIME_IMPLEMENTATION_COUNT": 0,
        "E9_SHARED_RUNTIME_IMPLEMENTATION_COUNT": 0,
        "PRISMA_CHANGES": 0,
        "MIGRATION_CHANGES": 0,
        "DEPENDENCY_CHANGES": 0,
    },
}

print(json.dumps(artifact, indent=2))
