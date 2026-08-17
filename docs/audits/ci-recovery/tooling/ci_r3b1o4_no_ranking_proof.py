"""Static proof that catalog authority selection contains no ranking/scoring."""
from __future__ import annotations

import re
from pathlib import Path

TOOLING = Path(__file__).resolve().parent
AUTHORITY_ENGINE = TOOLING / "ci_r3b1o4_catalog_authority.py"

FORBIDDEN_PATTERNS: list[tuple[str, str]] = [
    (r"\bscore\b", "score"),
    (r"\branking\b", "ranking"),
    (r"\brank\b", "rank"),
    (r"best_candidate", "best_candidate"),
    (r"preferred_candidate", "preferred_candidate"),
    (r"top_score", "top_score"),
    (r"M252\s+priority", "M252 priority"),
    (r"EXACT\s+priority", "EXACT priority"),
    (r"_candidate_rank", "_candidate_rank"),
    (r"M252\s+bonus", "M252 bonus"),
    (r"EXACT\s+bonus", "EXACT bonus"),
]


def build_no_ranking_proof() -> dict:
    text = AUTHORITY_ENGINE.read_text()
    hits: list[dict] = []
    for pattern, label in FORBIDDEN_PATTERNS:
        for match in re.finditer(pattern, text, re.I):
            line_no = text[: match.start()].count("\n") + 1
            line = text.splitlines()[line_no - 1].strip()
            if "sort" in line.lower() and "deterministic" in line.lower():
                continue
            hits.append({"pattern": label, "line": line_no, "snippet": line[:160]})
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.4-ambiguity-corrective",
        "authority_engine": AUTHORITY_ENGINE.name,
        "forbidden_patterns_checked": [label for _, label in FORBIDDEN_PATTERNS],
        "violations": hits,
        "violation_count": len(hits),
        "pass": len(hits) == 0,
    }
