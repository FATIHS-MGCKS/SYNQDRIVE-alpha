"""Frozen read-only Production verification harness for R3B1Q.3 idempotency completion.

Wraps the already-correct catalog fingerprint implementation from ci_r3b1n2_catalog_fingerprint.py.
Do not duplicate ad-hoc fingerprint SQL here.
"""
from __future__ import annotations

import re
from typing import Any, Callable

from ci_r3b1n2_catalog_fingerprint import build_catalog_fingerprint
from ci_r3b1n2_constants import sha256_text
from ci_r3b1n1_production_access import export_prisma_ledger, ledger_summary_fingerprint

# Regression fixture: the exact alias defect that aborted R3B1Q Step 6 in the ephemeral wrapper.
BROKEN_CATALOG_FINGERPRINT_SQL = """
SELECT md5(string_agg(c.relname||':'||pg_get_indexdef(i.indexrelid), E'\\n' ORDER BY c.relname))
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'i';
""".strip()

READ_ONLY_FORBIDDEN_PATTERNS = (
    r"\bINSERT\b",
    r"\bUPDATE\b",
    r"\bDELETE\b",
    r"\bALTER\b",
    r"\bCREATE\b",
    r"\bDROP\b",
    r"\bTRUNCATE\b",
    r"\bGRANT\b",
    r"\bREVOKE\b",
    r"prisma\s+migrate\s+deploy",
    r"prisma\s+migrate\s+resolve",
)


def audit_read_only_sql(source: str, *, label: str) -> dict[str, Any]:
    """Static audit: prove helper SQL text has no mutating statements outside comments/strings."""
    violations: list[str] = []
    for line_no, raw in enumerate(source.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("--"):
            continue
        for pattern in READ_ONLY_FORBIDDEN_PATTERNS:
            if re.search(pattern, line, flags=re.I):
                violations.append(f"{label}:{line_no}:{pattern}")
    return {
        "label": label,
        "pass": len(violations) == 0,
        "violations": violations,
    }


def audit_verification_harness_read_only() -> dict[str, Any]:
    import inspect

    modules = [
        ("ci_r3b1q3_verification_harness.build_production_verification_snapshot", inspect.getsource(build_production_verification_snapshot)),
        ("ci_r3b1n2_catalog_fingerprint.build_catalog_fingerprint", inspect.getsource(build_catalog_fingerprint)),
    ]
    audits = [audit_read_only_sql(src, label=name) for name, src in modules]
    return {
        "VERIFICATION_TOOLING_READ_ONLY": all(a["pass"] for a in audits),
        "audits": audits,
    }


def build_production_verification_snapshot(*, run_sql: Callable[[str], str]) -> dict[str, Any]:
    """Deterministic read-only Production catalog + ledger fingerprint snapshot."""
    ledger_rows = export_prisma_ledger(include_logs=False)
    catalog = build_catalog_fingerprint(run_sql)
    return {
        "ledger_fingerprint_sha256": ledger_summary_fingerprint(ledger_rows),
        "ledger_row_count": len(ledger_rows),
        "catalog_fingerprint_sha256": catalog["fingerprint_sha256"],
        "catalog_object_counts": catalog["object_counts"],
    }


def broken_indexrelid_alias_present(sql: str) -> bool:
    return "pg_get_indexdef(i.indexrelid)" in sql and "pg_index" not in sql


def correct_indexrelid_alias_present(sql: str) -> bool:
    return "pg_get_indexdef(ix.indexrelid" in sql


def fingerprint_regression_status() -> dict[str, Any]:
    import inspect

    catalog_src = inspect.getsource(build_catalog_fingerprint)
    return {
        "BROKEN_I_INDEXRELID_REGRESSION_TEST": broken_indexrelid_alias_present(BROKEN_CATALOG_FINGERPRINT_SQL),
        "CORRECT_IX_INDEXRELID_TEST": correct_indexrelid_alias_present(catalog_src),
        "broken_fixture_sha256": sha256_text(BROKEN_CATALOG_FINGERPRINT_SQL),
        "canonical_helper": "ci_r3b1n2_catalog_fingerprint.build_catalog_fingerprint",
    }
