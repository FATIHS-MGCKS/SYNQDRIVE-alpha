"""Truly independent top-level SQL statement counter for CI-R3B1L.2.1.

This module MUST NOT import or call the main Prisma diff parser.
"""
from __future__ import annotations

import ast
import hashlib
import re
from dataclasses import dataclass
from enum import Enum, auto
from pathlib import Path
from typing import Any

FORBIDDEN_IMPORTS = (
    "ci_r3b1l2_prisma_sql_parser",
    "split_sql_statements",
    "split_comment_and_sql_blocks",
    "parse_frozen_diff",
    "count_independent_statements",
)


class ScanState(Enum):
    NORMAL = auto()
    SINGLE = auto()
    DOUBLE = auto()
    DOLLAR = auto()
    LINE_COMMENT = auto()
    BLOCK_COMMENT = auto()


@dataclass(frozen=True)
class StatementInterval:
    start_byte: int
    end_byte: int
    terminator_byte: int | None
    raw_sql: str

    @property
    def normalized(self) -> str:
        return self.raw_sql.strip().rstrip(";").strip()


def assert_implementation_independence() -> dict[str, Any]:
    module_path = Path(__file__)
    source = module_path.read_text()
    tree = ast.parse(source)
    imported: list[str] = []
    call_names: list[str] = []
    forbidden_modules = {"ci_r3b1l2_prisma_sql_parser"}
    forbidden_calls = {"split_sql_statements", "split_comment_and_sql_blocks", "parse_frozen_diff", "count_independent_statements"}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imported.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                imported.append(node.module)
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name):
                call_names.append(node.func.id)
            elif isinstance(node.func, ast.Attribute):
                call_names.append(node.func.attr)
    forbidden_import_hits = [name for name in imported if name in forbidden_modules]
    forbidden_call_hits = [name for name in call_names if name in forbidden_calls]
    return {
        "module": str(module_path.name),
        "imports": imported,
        "forbidden_import_hits": forbidden_import_hits,
        "forbidden_call_hits": forbidden_call_hits,
        "calls_main_parser": bool(forbidden_import_hits or forbidden_call_hits),
        "pass": not forbidden_import_hits and not forbidden_call_hits,
    }


def scan_top_level_statements(text: str) -> list[StatementInterval]:
    """Character scanner: count semicolon terminators only in NORMAL lexical state."""
    statements: list[StatementInterval] = []
    buf: list[str] = []
    stmt_start: int | None = None
    state = ScanState.NORMAL
    dollar_tag = ""
    i = 0
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""

        if state == ScanState.NORMAL:
            if ch.isspace():
                if stmt_start is not None:
                    buf.append(ch)
                i += 1
                continue
            if ch == "-" and nxt == "-":
                state = ScanState.LINE_COMMENT
                i += 2
                continue
            if ch == "/" and nxt == "*":
                state = ScanState.BLOCK_COMMENT
                i += 2
                continue
            if ch == "'":
                if stmt_start is None:
                    stmt_start = i
                buf.append(ch)
                state = ScanState.SINGLE
            elif ch == '"':
                if stmt_start is None:
                    stmt_start = i
                buf.append(ch)
                state = ScanState.DOUBLE
            elif ch == "$":
                m = re.match(r"\$(\w*)\$", text[i:])
                if m:
                    if stmt_start is None:
                        stmt_start = i
                    buf.append(m.group(0))
                    dollar_tag = m.group(1)
                    state = ScanState.DOLLAR
                    i += len(m.group(0)) - 1
                else:
                    if stmt_start is None:
                        stmt_start = i
                    buf.append(ch)
            elif ch == ";":
                raw = "".join(buf).strip()
                if raw and stmt_start is not None:
                    statements.append(
                        StatementInterval(
                            start_byte=stmt_start,
                            end_byte=i,
                            terminator_byte=i,
                            raw_sql=raw,
                        )
                    )
                buf = []
                stmt_start = None
            else:
                if stmt_start is None:
                    stmt_start = i
                buf.append(ch)
        elif state == ScanState.SINGLE:
            buf.append(ch)
            if ch == "'" and nxt == "'":
                buf.append(nxt)
                i += 1
            elif ch == "'":
                state = ScanState.NORMAL
        elif state == ScanState.DOUBLE:
            buf.append(ch)
            if ch == '"':
                state = ScanState.NORMAL
        elif state == ScanState.DOLLAR:
            buf.append(ch)
            if text.startswith(f"${dollar_tag}$", i):
                end = i + len(dollar_tag) + 2
                buf.extend(text[i + 1 : end])
                i = end - 1
                state = ScanState.NORMAL
        elif state == ScanState.LINE_COMMENT:
            if ch == "\n":
                state = ScanState.NORMAL
        elif state == ScanState.BLOCK_COMMENT:
            if ch == "*" and nxt == "/":
                state = ScanState.NORMAL
                i += 1
        i += 1

    tail = "".join(buf).strip()
    if tail and stmt_start is not None:
        statements.append(
            StatementInterval(
                start_byte=stmt_start,
                end_byte=len(text),
                terminator_byte=None,
                raw_sql=tail,
            )
        )
    return statements


def count_top_level_statements(text: str) -> int:
    return len(scan_top_level_statements(text))


def cross_check_with_main_parser(text: str, main_statements: list[str]) -> dict[str, Any]:
    independent = scan_top_level_statements(text)
    indep_by_norm = [s.normalized for s in independent]
    main_by_norm = [s.strip().rstrip(";").strip() for s in main_statements]

    independent_without_main_match = []
    main_without_independent_match = []
    duplicate_interval_matches = 0

    if len(indep_by_norm) != len(main_by_norm):
        pass

    pairs = []
    if indep_by_norm == main_by_norm:
        pairs = list(zip(independent, main_statements, strict=False))
    else:
        used: set[int] = set()
        for idx, main_norm in enumerate(main_by_norm):
            found = None
            for j, indep in enumerate(independent):
                if j in used:
                    continue
                if indep.normalized == main_norm:
                    found = j
                    break
            if found is None:
                main_without_independent_match.append({"main_index": idx, "normalized": main_norm[:120]})
            else:
                if found in used:
                    duplicate_interval_matches += 1
                used.add(found)
                pairs.append((independent[found], main_statements[idx]))
        for j, indep in enumerate(independent):
            if j not in used:
                independent_without_main_match.append(
                    {"independent_index": j, "start_byte": indep.start_byte, "normalized": indep.normalized[:120]}
                )

    return {
        "independent_statements": len(independent),
        "main_parser_statements": len(main_statements),
        "independent_without_main_match": len(independent_without_main_match),
        "main_without_independent_match": len(main_without_independent_match),
        "duplicate_interval_matches": duplicate_interval_matches,
        "independent_without_main_match_samples": independent_without_main_match[:5],
        "main_without_independent_match_samples": main_without_independent_match[:5],
        "statement_intervals": [
            {
                "start_byte": s.start_byte,
                "end_byte": s.end_byte,
                "terminator_byte": s.terminator_byte,
                "normalized_preview": s.normalized[:120],
            }
            for s in independent
        ],
        "pass": (
            len(independent) == len(main_statements)
            and not independent_without_main_match
            and not main_without_independent_match
            and duplicate_interval_matches == 0
            and indep_by_norm == main_by_norm
        ),
    }


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def build_independent_coverage_artifact(text: str, main_statements: list[str], input_sha256: str) -> dict[str, Any]:
    independence = assert_implementation_independence()
    cross = cross_check_with_main_parser(text, main_statements)
    intervals = scan_top_level_statements(text)
    return {
        "schema_version": 1,
        "phase": "CI-R3B1L.2.1",
        "input_sha256": input_sha256,
        "implementation_independence_assertion": independence,
        "independent_count": len(intervals),
        "main_parser_count": len(main_statements),
        "independent_without_main_match": cross["independent_without_main_match"],
        "main_without_independent_match": cross["main_without_independent_match"],
        "duplicate_interval_matches": cross["duplicate_interval_matches"],
        "statement_intervals": cross["statement_intervals"],
        "pass": independence["pass"] and cross["pass"],
    }
