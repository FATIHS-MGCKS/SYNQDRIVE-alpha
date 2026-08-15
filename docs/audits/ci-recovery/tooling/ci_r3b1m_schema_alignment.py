"""Schema alignment contracts, authorized edit, and diff artifacts for CI-R3B1M."""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

from ci_r3b1l2_authority_decisions import parse_prisma_field, prisma_desired_pg_type
from ci_r3b1m_constants import BACKEND, DATA, REPO, SCHEMA_PRISMA, sha256_file, sha256_text

CONTRACTS_OUT = DATA / "ci-r3b1m-schema-alignment-contracts-2026-08.json"
ORIGINAL_MANIFEST_OUT = DATA / "ci-r3b1m-schema-original-manifest-2026-08.json"
AUTHORIZED_DIFF_OUT = DATA / "ci-r3b1m-schema-authorized-diff-2026-08.json"
ALIGNMENT_RESULT_OUT = DATA / "ci-r3b1m-schema-alignment-result-2026-08.json"
POST_DIFF_SQL = DATA / "ci-r3b1m-post-alignment-prisma-diff-2026-08.sql"
POST_DIFF_JSON = DATA / "ci-r3b1m-post-alignment-prisma-diff-2026-08.json"


def freeze_original_schema() -> dict[str, Any]:
    text = SCHEMA_PRISMA.read_text()
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1M",
        "path": str(SCHEMA_PRISMA.relative_to(REPO)),
        "sha256": sha256_file(SCHEMA_PRISMA),
        "byte_count": SCHEMA_PRISMA.stat().st_size,
        "line_count": len(text.splitlines()),
    }
    ORIGINAL_MANIFEST_OUT.write_text(json.dumps(out, indent=2) + "\n")
    return out


def build_alignment_contracts(authority: dict[str, Any]) -> dict[str, Any]:
    drift_ops = [
        d
        for d in authority.get("decisions", [])
        if d.get("decision") == "CURRENT_PRISMA_SCHEMA_DRIFT"
    ]
    contracts: list[dict[str, Any]] = []
    for d in drift_ops:
        prisma = d.get("current_prisma_desired_state") or {}
        accepted = d.get("accepted_canonical_authority") or {}
        model = prisma.get("model")
        field = prisma.get("field")
        if not model or not field:
            continue
        canonical_type = accepted.get("type") or accepted.get("data_type")
        precision = accepted.get("datetime_precision")
        if canonical_type == "timestamp with time zone":
            authorized_native = f"Timestamptz({precision or 6})"
            authorized_declaration = f"DateTime? @map(\"{prisma.get('mapped_column')}\") @db.{authorized_native}"
        else:
            authorized_native = None
            authorized_declaration = None
        contracts.append(
            {
                "contract_id": f"{model}.{field}",
                "prisma_model": model,
                "prisma_field": field,
                "physical_table": d.get("affected_authority_object"),
                "physical_column": accepted.get("column"),
                "current_prisma_declaration": prisma.get("raw_line"),
                "canonical_postgresql_semantics": {
                    "type": canonical_type,
                    "datetime_precision": precision,
                    "nullable": accepted.get("nullable"),
                },
                "authorized_new_prisma_declaration": authorized_declaration,
                "authorized_native_type": authorized_native,
                "authority_sources": d.get("evidence_sources", []),
                "reason": "CURRENT_PRISMA_SCHEMA_DRIFT — align Prisma native type to accepted physical authority",
                "operation_ordinal": d.get("operation_ordinal"),
            }
        )
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1M",
        "contract_count": len(contracts),
        "contracts": contracts,
        "pass": len(contracts) == len(drift_ops) and all(c.get("authorized_new_prisma_declaration") for c in contracts),
    }
    CONTRACTS_OUT.write_text(json.dumps(out, indent=2) + "\n")
    return out


def _replace_field_declaration(text: str, model: str, field: str, new_line_body: str) -> str:
    pattern = rf"(model\s+{model}\s*\{{)(.*?)(^\s*{field}\s+)([^\n]+)$"
    match = re.search(pattern, text, re.S | re.M)
    if not match:
        raise KeyError(f"field {model}.{field} not found for authorized edit")
    old_line = match.group(3) + match.group(4)
    indent = match.group(3)
    replacement = indent + new_line_body
    return text.replace(old_line, replacement, 1)


def apply_authorized_schema_edits(contracts: dict[str, Any]) -> dict[str, Any]:
    text = SCHEMA_PRISMA.read_text()
    changes: list[dict[str, Any]] = []
    for contract in contracts.get("contracts", []):
        model = contract["prisma_model"]
        field = contract["prisma_field"]
        current = parse_prisma_field(model, field)
        native = contract.get("authorized_native_type")
        if not native:
            raise RuntimeError(f"missing authorized native type for {model}.{field}")
        annotation = f"@db.{native}"
        model_m = re.search(rf"model\s+{model}\s*\{{(.*?)\n\}}", text, re.S)
        if not model_m:
            raise KeyError(f"model {model} not found for authorized edit")
        body = model_m.group(1)
        field_m = re.search(rf"(^(\s*{field}\s+)([^\n]+)$)", body, re.M)
        if not field_m:
            raise KeyError(f"field {model}.{field} not found for authorized edit")
        old_line = field_m.group(0)
        indent_and_field = field_m.group(2)
        line_body = field_m.group(3)
        if annotation in line_body:
            new_line = old_line
        else:
            new_line = indent_and_field + line_body.rstrip() + f" {annotation}"
        if new_line == old_line:
            raise RuntimeError(f"authorized edit produced no change for {model}.{field}")
        new_body = body.replace(old_line, new_line, 1)
        text = text[: model_m.start(1)] + new_body + text[model_m.end(1) :]
        changes.append(
            {
                "contract_id": contract["contract_id"],
                "model": model,
                "field": field,
                "original_declaration": current.get("raw_line"),
                "new_declaration": new_line.strip(),
            }
        )
    SCHEMA_PRISMA.write_text(text)
    return {"changes": changes, "change_count": len(changes)}


def build_authorized_diff_artifact(original_manifest: dict[str, Any], contracts: dict[str, Any], applied: dict[str, Any]) -> dict[str, Any]:
    current_text = SCHEMA_PRISMA.read_text()
    unauthorized = []
    git_diff = subprocess.run(
        ["git", "diff", "--", "backend/prisma/schema.prisma"],
        cwd=REPO,
        capture_output=True,
        text=True,
    ).stdout
    authorized_ids = {c["contract_id"] for c in contracts.get("contracts", [])}
    for change in applied.get("changes", []):
        if change["contract_id"] not in authorized_ids:
            unauthorized.append(change)
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1M",
        "original_sha256": original_manifest.get("sha256"),
        "current_sha256": sha256_file(SCHEMA_PRISMA),
        "authorized_changes": applied.get("changes", []),
        "authorized_change_count": applied.get("change_count", 0),
        "unauthorized_schema_changes": len(unauthorized),
        "unauthorized_details": unauthorized,
        "raw_git_diff": git_diff,
        "pass": len(unauthorized) == 0 and applied.get("change_count", 0) == len(contracts.get("contracts", [])),
    }
    AUTHORIZED_DIFF_OUT.write_text(json.dumps(out, indent=2) + "\n")
    return out


def run_prisma_validate_generate() -> dict[str, Any]:
    results = {}
    for label, cmd in [
        ("prisma_validate", ["npx", "prisma", "validate"]),
        ("prisma_generate", ["npx", "prisma", "generate"]),
    ]:
        proc = subprocess.run(cmd, cwd=BACKEND, capture_output=True, text=True)
        results[label] = {
            "exit_code": proc.returncode,
            "pass": proc.returncode == 0,
            "stderr": proc.stderr,
            "stdout": proc.stdout,
        }
    return results


def run_prisma_diff_against_db(db_name: str, sql_out: Path, json_out: Path) -> dict[str, Any]:
    port = os.environ.get("R3B_PG_PORT", "5432")
    env = os.environ.copy()
    env["DATABASE_URL"] = f"postgresql://synqdrive:synqdrive@127.0.0.1:{port}/{db_name}"
    proc = subprocess.run(
        [
            "npx",
            "prisma",
            "migrate",
            "diff",
            "--from-url",
            env["DATABASE_URL"],
            "--to-schema-datamodel",
            "prisma/schema.prisma",
            "--script",
        ],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        env=env,
    )
    stdout = proc.stdout or ""
    stderr = proc.stderr or ""
    script = stdout.strip()
    sql_out.write_text(script + ("\n" if script else ""))
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1M",
        "database": db_name,
        "command": "npx prisma migrate diff --from-url <db> --to-schema-datamodel prisma/schema.prisma --script",
        "exit_code": proc.returncode,
        "command_success": proc.returncode == 0,
        "stdout": stdout,
        "stderr": stderr,
        "stdout_sha256": sha256_text(stdout),
        "byte_length": len(stdout.encode("utf-8")),
        "line_count": len(script.splitlines()) if script else 0,
        "diff_empty": not script or "empty migration" in script.lower(),
    }
    json_out.write_text(json.dumps(out, indent=2) + "\n")
    return out


def record_alignment_result(
    original_manifest: dict[str, Any],
    contracts: dict[str, Any],
    applied: dict[str, Any],
    authorized_diff: dict[str, Any],
    prisma_checks: dict[str, Any],
) -> dict[str, Any]:
    out = {
        "schema_version": 1,
        "phase": "CI-R3B1M",
        "original_schema_sha256": original_manifest.get("sha256"),
        "current_schema_sha256": sha256_file(SCHEMA_PRISMA),
        "authorized_contract_count": contracts.get("contract_count", 0),
        "applied_change_count": applied.get("change_count", 0),
        "unauthorized_schema_changes": authorized_diff.get("unauthorized_schema_changes", 0),
        "prisma_validate": prisma_checks.get("prisma_validate", {}),
        "prisma_generate": prisma_checks.get("prisma_generate", {}),
        "pass": (
            authorized_diff.get("pass")
            and prisma_checks.get("prisma_validate", {}).get("pass")
            and prisma_checks.get("prisma_generate", {}).get("pass")
        ),
    }
    ALIGNMENT_RESULT_OUT.write_text(json.dumps(out, indent=2) + "\n")
    return out
