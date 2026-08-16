"""Preflight-specific Prisma diff attribution for CI-R3B1P.

Post-reconciliation twin audits require raw R3B_SCOPE=0 and M252_SCOPE=0 because
no scoped reconciliation work should remain in the final diff.

Pre-execution production preflight differs: the live production-vs-schema diff
naturally includes PRE_EXISTING drift and AUTHORIZED_STRATEGY tail targets
(for example M252 CREATE operations while the table is absent pre-tail).

Gate-safe scope counts therefore exclude operations already classified as:
- PRE_EXISTING_PRODUCTION_DRIFT
- AUTHORIZED_STRATEGY_DELTA
"""
from __future__ import annotations

from typing import Any

from ci_r3b1o3_diff_attribution import classify_final_diff

SAFE_PREFLIGHT_CLASSIFICATIONS = frozenset(
    {
        "PRE_EXISTING_PRODUCTION_DRIFT",
        "AUTHORIZED_STRATEGY_DELTA",
    }
)


def _gate_scope_count(operations: list[dict[str, Any]], scope: str) -> int:
    return sum(
        1
        for op in operations
        if op.get("scope") == scope and op.get("classification") not in SAFE_PREFLIGHT_CLASSIFICATIONS
    )


def _scope_total(operations: list[dict[str, Any]], scope: str) -> int:
    return sum(1 for op in operations if op.get("scope") == scope)


def classify_preflight_production_diff(
    production_script: str,
    *,
    golden_twin_script: str,
    golden_baseline_script: str,
    schema_dump=None,
) -> dict[str, Any]:
    base = classify_final_diff(
        production_script,
        golden_twin_script=golden_twin_script,
        golden_baseline_script=golden_baseline_script,
        schema_dump=schema_dump,
    )
    operations = base["operations"]

    r3b_gate = _gate_scope_count(operations, "R3B")
    m252_gate = _gate_scope_count(operations, "M252")
    unknown_gate = base.get("UNKNOWN_SCOPE", 0)
    new_drift = base.get("NEW_STRATEGY_DRIFT", 0)
    unattributed = base.get("UNATTRIBUTED", 0)

    return {
        **base,
        "phase": "CI-R3B1P",
        "classification_mode": "PRE_EXECUTION_PRODUCTION_PREFLIGHT",
        "R3B_SCOPE_TOTAL": _scope_total(operations, "R3B"),
        "M252_SCOPE_TOTAL": _scope_total(operations, "M252"),
        "R3B_SCOPE": r3b_gate,
        "M252_SCOPE": m252_gate,
        "R3B_SCOPE_AUTHORIZED": _scope_total(operations, "R3B") - r3b_gate,
        "M252_SCOPE_AUTHORIZED": _scope_total(operations, "M252") - m252_gate,
        "pass": (
            r3b_gate == 0
            and m252_gate == 0
            and unknown_gate == 0
            and new_drift == 0
            and unattributed == 0
        ),
    }
