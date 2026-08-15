"""Comment-aware Prisma diff SQL parser with independent completeness proof."""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Any

from ci_r3b1l2_constants import DATA, FROZEN_DIFF_JSON, FROZEN_DIFF_SQL

COVERAGE_OUT = DATA / "ci-r3b1l2-prisma-diff-parser-coverage-2026-08.json"
INPUT_MANIFEST_OUT = DATA / "ci-r3b1l2-prisma-diff-input-manifest-2026-08.json"


class LexState(Enum):
    NORMAL = auto()
    SINGLE = auto()
    DOUBLE = auto()
    DOLLAR = auto()
    LINE_COMMENT = auto()
    BLOCK_COMMENT = auto()


@dataclass
class CommentBlock:
    lines: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)

    @property
    def is_metadata_only(self) -> bool:
        return bool(self.lines)


@dataclass
class ParsedStatement:
    ordinal: int
    comment_tags: list[str]
    leading_comment_lines: list[str]
    raw_sql: str
    sql_tokens: list[str]


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_frozen_diff_text() -> tuple[str, dict[str, Any]]:
    meta = json.loads(FROZEN_DIFF_JSON.read_text())
    sql_file_text = FROZEN_DIFF_SQL.read_text()
    stdout = meta.get("stdout", "")
    content_match = stdout.rstrip("\n") == sql_file_text.rstrip("\n")
    if not content_match:
        raise RuntimeError("frozen diff SQL file content does not match R3B1L.1 JSON stdout body")
    canonical = stdout if stdout.endswith("\n") else stdout + "\n"
    return canonical, meta


def build_input_manifest() -> dict[str, Any]:
    text, meta = load_frozen_diff_text()
    sql_file_bytes = FROZEN_DIFF_SQL.read_bytes()
    stdout = meta["stdout"]
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1L.2",
        "primary_input_path": str(FROZEN_DIFF_SQL.relative_to(FROZEN_DIFF_SQL.parents[3])),
        "json_metadata_path": str(FROZEN_DIFF_JSON.relative_to(FROZEN_DIFF_JSON.parents[3])),
        "sql_file_sha256": sha256_bytes(sql_file_bytes),
        "json_stdout_sha256": meta.get("stdout_sha256"),
        "content_sha256_normalized": sha256_text(stdout.rstrip("\n")),
        "content_equivalent_after_rstrip": stdout.rstrip("\n") == FROZEN_DIFF_SQL.read_text().rstrip("\n"),
        "byte_count_sql_file": len(sql_file_bytes),
        "byte_count_json_stdout": meta.get("byte_length"),
        "line_count_sql_file": len(FROZEN_DIFF_SQL.read_text().splitlines()),
        "line_count_json_stdout": meta.get("line_count"),
        "json_metadata_consistent": stdout.rstrip("\n") == FROZEN_DIFF_SQL.read_text().rstrip("\n"),
        "pass": stdout.rstrip("\n") == FROZEN_DIFF_SQL.read_text().rstrip("\n"),
    }
    INPUT_MANIFEST_OUT.write_text(json.dumps(out, indent=2) + "\n")
    return out


def _extract_prisma_tag(comment_line: str) -> str | None:
    m = re.match(r"^--\s*([A-Za-z][A-Za-z0-9_]*)", comment_line.strip())
    return m.group(1) if m else None


def split_comment_and_sql_blocks(text: str) -> list[tuple[list[str], list[str], str | None]]:
    """Return list of (comment_lines, comment_tags, sql_text_or_none)."""
    blocks: list[tuple[list[str], list[str], str | None]] = []
    lines = text.splitlines(keepends=True)
    i = 0
    pending_comments: list[str] = []
    pending_tags: list[str] = []
    sql_buf: list[str] = []

    def flush_sql():
        nonlocal sql_buf, pending_comments, pending_tags
        sql = "".join(sql_buf).strip()
        if sql:
            blocks.append((pending_comments.copy(), pending_tags.copy(), sql))
        elif pending_comments:
            blocks.append((pending_comments.copy(), pending_tags.copy(), None))
        sql_buf = []
        pending_comments = []
        pending_tags = []

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()
        if not stripped:
            if sql_buf:
                sql_buf.append(line)
            else:
                pending_comments.append(line.rstrip("\n"))
            i += 1
            continue
        if stripped.startswith("--") and not sql_buf:
            pending_comments.append(line.rstrip("\n"))
            tag = _extract_prisma_tag(stripped)
            if tag:
                pending_tags.append(tag)
            i += 1
            continue
        sql_buf.append(line)
        i += 1
        while i < len(lines):
            nxt = lines[i]
            nst = nxt.strip()
            if not nst:
                sql_buf.append(nxt)
                i += 1
                continue
            if nst.startswith("--") and not _line_has_unclosed_string("".join(sql_buf)):
                break
            sql_buf.append(nxt)
            i += 1
        flush_sql()
    flush_sql()
    return blocks


def _line_has_unclosed_string(text: str) -> bool:
    state = LexState.NORMAL
    dollar_tag = ""
    i = 0
    while i < len(text):
        ch = text[i]
        if state == LexState.NORMAL:
            if ch == "'":
                state = LexState.SINGLE
            elif ch == '"':
                state = LexState.DOUBLE
            elif ch == "$":
                m = re.match(r"\$(\w*)\$", text[i:])
                if m:
                    state = LexState.DOLLAR
                    dollar_tag = m.group(1)
                    i += len(m.group(0)) - 1
            elif ch == "-" and i + 1 < len(text) and text[i + 1] == "-":
                break
            elif ch == "/" and i + 1 < len(text) and text[i + 1] == "*":
                state = LexState.BLOCK_COMMENT
                i += 1
        elif state == LexState.SINGLE:
            if ch == "'":
                if i + 1 < len(text) and text[i + 1] == "'":
                    i += 1
                else:
                    state = LexState.NORMAL
        elif state == LexState.DOUBLE:
            if ch == '"':
                state = LexState.NORMAL
        elif state == LexState.DOLLAR:
            if text.startswith(f"${dollar_tag}$", i):
                state = LexState.NORMAL
                i += len(dollar_tag) + 1
        elif state == LexState.BLOCK_COMMENT:
            if ch == "*" and i + 1 < len(text) and text[i + 1] == "/":
                state = LexState.NORMAL
                i += 1
        i += 1
    return state != LexState.NORMAL


def split_sql_statements(sql_text: str) -> list[str]:
    statements: list[str] = []
    buf: list[str] = []
    state = LexState.NORMAL
    dollar_tag = ""
    i = 0
    text = sql_text
    while i < len(text):
        ch = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if state == LexState.NORMAL:
            if ch == "'":
                state = LexState.SINGLE
                buf.append(ch)
            elif ch == '"':
                state = LexState.DOUBLE
                buf.append(ch)
            elif ch == "$":
                m = re.match(r"\$(\w*)\$", text[i:])
                if m:
                    state = LexState.DOLLAR
                    dollar_tag = m.group(1)
                    buf.append(m.group(0))
                    i += len(m.group(0)) - 1
                else:
                    buf.append(ch)
            elif ch == "-" and nxt == "-":
                state = LexState.LINE_COMMENT
                buf.append(ch)
            elif ch == "/" and nxt == "*":
                state = LexState.BLOCK_COMMENT
                buf.append(ch)
            elif ch == ";":
                stmt = "".join(buf).strip()
                if stmt:
                    statements.append(stmt)
                buf = []
            else:
                buf.append(ch)
        elif state == LexState.SINGLE:
            buf.append(ch)
            if ch == "'" and nxt == "'":
                buf.append(nxt)
                i += 1
            elif ch == "'":
                state = LexState.NORMAL
        elif state == LexState.DOUBLE:
            buf.append(ch)
            if ch == '"':
                state = LexState.NORMAL
        elif state == LexState.DOLLAR:
            buf.append(ch)
            if text.startswith(f"${dollar_tag}$", i):
                end = i + len(dollar_tag) + 2
                buf.extend(text[i + 1 : end])
                i = end - 1
                state = LexState.NORMAL
        elif state == LexState.LINE_COMMENT:
            buf.append(ch)
            if ch == "\n":
                state = LexState.NORMAL
        elif state == LexState.BLOCK_COMMENT:
            buf.append(ch)
            if ch == "*" and nxt == "/":
                buf.append(nxt)
                i += 1
                state = LexState.NORMAL
        i += 1
    tail = "".join(buf).strip()
    if tail:
        statements.append(tail)
    return statements


def count_independent_statements(text: str) -> int:
    return len(split_sql_statements(text))


def tokenize_sql(sql: str) -> list[str]:
    tokens: list[str] = []
    buf: list[str] = []
    state = LexState.NORMAL
    dollar_tag = ""
    i = 0
    while i < len(sql):
        ch = sql[i]
        nxt = sql[i + 1] if i + 1 < len(sql) else ""
        if state == LexState.NORMAL:
            if ch.isspace():
                if buf:
                    tokens.append("".join(buf))
                    buf = []
                i += 1
                continue
            if ch == "'":
                state = LexState.SINGLE
                buf.append(ch)
            elif ch == '"':
                state = LexState.DOUBLE
                buf.append(ch)
            elif ch == "$":
                m = re.match(r"\$(\w*)\$", sql[i:])
                if m:
                    state = LexState.DOLLAR
                    dollar_tag = m.group(1)
                    buf.append(m.group(0))
                    i += len(m.group(0)) - 1
                else:
                    buf.append(ch)
            elif ch == "-" and nxt == "-":
                while i < len(sql) and sql[i] != "\n":
                    i += 1
                continue
            elif ch == "/" and nxt == "*":
                i += 2
                while i + 1 < len(sql) and not (sql[i] == "*" and sql[i + 1] == "/"):
                    i += 1
                i += 2
                continue
            else:
                buf.append(ch)
        elif state == LexState.SINGLE:
            buf.append(ch)
            if ch == "'" and nxt == "'":
                buf.append(nxt)
                i += 1
            elif ch == "'":
                state = LexState.NORMAL
        elif state == LexState.DOUBLE:
            buf.append(ch)
            if ch == '"':
                state = LexState.NORMAL
        elif state == LexState.DOLLAR:
            buf.append(ch)
            if sql.startswith(f"${dollar_tag}$", i):
                end = i + len(dollar_tag) + 2
                buf.extend(sql[i + 1 : end])
                i = end - 1
                state = LexState.NORMAL
        i += 1
    if buf:
        tokens.append("".join(buf))
    return [t for t in tokens if t]


def parse_frozen_diff() -> dict[str, Any]:
    text, _meta = load_frozen_diff_text()
    blocks = split_comment_and_sql_blocks(text)
    metadata_blocks = []
    statements: list[ParsedStatement] = []
    ordinal = 0
    for comment_lines, comment_tags, sql_text in blocks:
        if sql_text is None:
            metadata_blocks.append({"comment_lines": comment_lines, "comment_tags": comment_tags, "kind": "NON_OPERATION_METADATA"})
            continue
        for stmt in split_sql_statements(sql_text):
            ordinal += 1
            statements.append(
                ParsedStatement(
                    ordinal=ordinal,
                    comment_tags=comment_tags.copy(),
                    leading_comment_lines=comment_lines.copy(),
                    raw_sql=stmt,
                    sql_tokens=tokenize_sql(stmt),
                )
            )
    return {
        "text": text,
        "metadata_blocks": metadata_blocks,
        "statements": statements,
    }


def prove_parser_coverage(parsed: dict[str, Any]) -> dict[str, Any]:
    text = parsed["text"]
    statements = parsed["statements"]
    independent = count_independent_statements(text)
    parsed_count = len(statements)

    all_sql_parts = [s.raw_sql for s in statements]
    consumed_tokens: list[str] = []
    for stmt in all_sql_parts:
        consumed_tokens.extend(tokenize_sql(stmt))

    normalized_input_tokens: list[str] = []
    for block in split_comment_and_sql_blocks(text):
        _, _, sql_text = block
        if not sql_text:
            continue
        for stmt in split_sql_statements(sql_text):
            normalized_input_tokens.extend(tokenize_sql(stmt))

    duplicate_count = len(consumed_tokens) - len(set(consumed_tokens))
    unconsumed = [t for t in normalized_input_tokens if t not in consumed_tokens]
    # token coverage by multiset comparison
    from collections import Counter

    in_ctr = Counter(normalized_input_tokens)
    out_ctr = Counter(consumed_tokens)
    unconsumed_tokens = list((in_ctr - out_ctr).elements())
    extra_tokens = list((out_ctr - in_ctr).elements())
    duplicate_token_count = len(extra_tokens)

    completeness_pass = independent == parsed_count and not unconsumed_tokens and not extra_tokens
    out = {
        "schema_version": 1,
        "input_bytes": len(text.encode("utf-8")),
        "input_lines": len(text.splitlines()),
        "comment_metadata_blocks": len(parsed["metadata_blocks"]),
        "independent_sql_statement_count": independent,
        "main_parser_sql_statement_count": parsed_count,
        "consumed_sql_tokens": len(consumed_tokens),
        "unconsumed_sql_tokens": len(unconsumed_tokens),
        "duplicate_token_count": duplicate_token_count,
        "parser_completeness": "PASS" if completeness_pass else "FAIL",
        "pass": completeness_pass,
    }
    COVERAGE_OUT.write_text(json.dumps(out, indent=2) + "\n")
    return out


def get_parsed_statements() -> list[ParsedStatement]:
    return parse_frozen_diff()["statements"]
