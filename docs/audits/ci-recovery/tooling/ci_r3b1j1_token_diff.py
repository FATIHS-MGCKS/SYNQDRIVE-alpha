"""SQL identifier token diff for CI-R3B1J.1."""
from __future__ import annotations

import re
from typing import Any

from ci_r3b1j1_constants import load_approved_name_pairs
from ci_r3b1j_pg_identifier import apply_identifier_renames, split_top_level_statements


IDENT_RE = re.compile(r'"([^"]+)"')


def tokenize_identifiers(sql: str) -> list[dict[str, Any]]:
    statements = split_top_level_statements(sql)
    tokens: list[dict] = []
    for ord_idx, stmt in enumerate(statements, start=1):
        for match in IDENT_RE.finditer(stmt):
            tokens.append(
                {
                    "statement_ordinal": ord_idx,
                    "token_type": "QUOTED_IDENTIFIER",
                    "value": match.group(1),
                    "span": match.span(),
                }
            )
    return tokens


def compare_identifier_token_diff(original_sql: str, corrected_sql: str, renames: dict[str, str] | None = None) -> dict[str, Any]:
    approved_pairs = {e["raw_historical_name"]: e["canonical_corrected_name"] for e in load_approved_name_pairs()}
    renames = renames or approved_pairs
    expected_corrected = apply_identifier_renames(original_sql, renames)

    orig_stmts = split_top_level_statements(original_sql)
    corr_stmts = split_top_level_statements(corrected_sql)
    changed_tokens: list[dict] = []
    unapproved = 0

    if len(orig_stmts) != len(corr_stmts):
        return {"pass": False, "reason": "statement_count_mismatch", "unapproved_token_changes": 1}

    for ord_idx, (orig, corr) in enumerate(zip(orig_stmts, corr_stmts), start=1):
        if re.sub(r'"[^"]+"', "", orig) != re.sub(r'"[^"]+"', "", corr):
            return {"pass": False, "reason": "non_identifier_tokens_changed", "statement_ordinal": ord_idx, "unapproved_token_changes": 1}
        orig_ids = IDENT_RE.findall(orig)
        corr_ids = IDENT_RE.findall(corr)
        if len(orig_ids) != len(corr_ids):
            return {"pass": False, "reason": "identifier_count_mismatch", "statement_ordinal": ord_idx, "unapproved_token_changes": 1}
        for o, c in zip(orig_ids, corr_ids):
            if o == c:
                continue
            mapping_id = approved_pairs.get(o)
            if mapping_id and mapping_id == c:
                changed_tokens.append(
                    {
                        "statement_ordinal": ord_idx,
                        "token_type": "QUOTED_IDENTIFIER",
                        "original": o,
                        "corrected": c,
                        "approved_mapping_id": o,
                    }
                )
            else:
                unapproved += 1
                changed_tokens.append(
                    {
                        "statement_ordinal": ord_idx,
                        "token_type": "QUOTED_IDENTIFIER",
                        "original": o,
                        "corrected": c,
                        "approved_mapping_id": None,
                    }
                )

    if corrected_sql.strip() != expected_corrected.strip():
        # corrected candidate must match approved rename mapping exactly
        unapproved += 1

    return {
        "changed_tokens": changed_tokens,
        "approved_mappings_used": len([t for t in changed_tokens if t.get("approved_mapping_id")]),
        "unapproved_token_changes": unapproved,
        "pass": unapproved == 0,
    }
