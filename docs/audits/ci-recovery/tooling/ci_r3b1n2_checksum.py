"""Checksum representation analysis and provenance closure."""
from __future__ import annotations

import re
import subprocess
from typing import Any

from ci_r3b1n1_provenance import load_frozen_ledger
from ci_r3b1n2_constants import DEPLOYED_SHA, R3B1N_LEDGER, REPO, checksum_representations, file_bytes_at, migration_sql_path, sha256_text


def classify_representation(prod_checksum: str, reps: dict[str, str]) -> str:
    hits = [k.upper() for k, v in reps.items() if v == prod_checksum]
    if not hits:
        return "MATCH_NONE"
    if len(hits) > 1:
        return "MATCH_MULTIPLE_EQUIVALENT"
    return f"MATCH_{hits[0]}"


def semantic_change_kind(old: str, new: str) -> str:
    old_lf = old.replace("\r\n", "\n").replace("\r", "\n")
    new_lf = new.replace("\r\n", "\n").replace("\r", "\n")
    if old_lf == new_lf:
        return "LINE_ENDING_REPRESENTATION_DIFFERENCE"
    if re.sub(r"\s+", " ", old_lf.strip()) == re.sub(r"\s+", " ", new_lf.strip()):
        return "WHITESPACE_ONLY"
    if re.sub(r"--[^\n]*", "", old_lf) == re.sub(r"--[^\n]*", "", new_lf):
        return "COMMENT_ONLY"
    if re.sub(r'"[^"]+"', "ID", old_lf) == re.sub(r'"[^"]+"', "ID", new_lf):
        return "IDENTIFIER_ONLY"
    return "SEMANTIC_SQL_CHANGE"


def build_representation_analysis(ledger_best: dict[str, dict[str, Any]], recovered_sha: str) -> dict[str, Any]:
    confirmations = {"raw": 0, "lf": 0, "crlf": 0}
    samples = []
    for name, row in sorted(ledger_best.items()):
        if not row.get("finished_at") or row.get("rolled_back_at"):
            continue
        content = file_bytes_at(recovered_sha, name)
        if not content:
            continue
        reps = checksum_representations(content)
        cls = classify_representation(row["checksum"], reps)
        if cls == "MATCH_RAW":
            confirmations["raw"] += 1
        elif cls == "MATCH_LF":
            confirmations["lf"] += 1
        elif cls == "MATCH_CRLF":
            confirmations["crlf"] += 1
        if len(samples) < 15:
            samples.append({"migration": name, "classification": cls, "production_checksum_prefix": row["checksum"][:16]})
    dominant = max(confirmations, key=confirmations.get)
    return {
        "schema_version": 1,
        "phase": "CI-R3B1N.2",
        "algorithm": "SHA-256 over migration.sql bytes with historical line-ending representation variants",
        "confirmation_counts": confirmations,
        "dominant_representation": dominant,
        "samples": samples,
        "pass": sum(confirmations.values()) > 0,
    }


def build_checksum_closure(
    *,
    ledger_best: dict[str, dict[str, Any]],
    recovered_inventory: dict[str, str],
    deployed_sha: str,
    main_sha: str,
    recovered_sha: str,
) -> dict[str, Any]:
    migrations = []
    summary = {
        "common_migrations": 0,
        "raw_exact_matches": 0,
        "lf_representation_matches": 0,
        "crlf_representation_matches": 0,
        "line_ending_only_differences": 0,
        "actual_post_deploy_file_mutations": 0,
        "semantic_sql_mutations": 0,
        "identifier_only_mutations": 0,
        "matches_none": 0,
        "unresolved": 0,
    }
    refs = {"deployed": deployed_sha, "main": main_sha, "recovered": recovered_sha}
    for name, row in sorted(ledger_best.items()):
        if not row.get("finished_at") or row.get("rolled_back_at"):
            continue
        repo_sha = recovered_inventory.get(name)
        if not repo_sha or row.get("checksum") == repo_sha:
            continue
        summary["common_migrations"] += 1
        prod = row["checksum"]
        hit_labels = []
        rep_hits = {"raw": False, "lf": False, "crlf": False}
        ref_matches = {}
        for ref_name, ref in refs.items():
            content = file_bytes_at(ref, name)
            if not content:
                ref_matches[ref_name] = None
                continue
            reps = checksum_representations(content)
            ref_matches[ref_name] = reps
            for rep_key, rep_val in reps.items():
                if rep_val == prod:
                    rep_hits[rep_key] = True
                    hit_labels.append(f"MATCHES_{ref_name.upper()}_{rep_key.upper()}")
        if rep_hits["raw"]:
            summary["raw_exact_matches"] += 1
        if rep_hits["lf"]:
            summary["lf_representation_matches"] += 1
        if rep_hits["crlf"]:
            summary["crlf_representation_matches"] += 1

        classification = hit_labels[0] if len(hit_labels) == 1 else ("MATCHES_MULTIPLE_REVISIONS_EQUIVALENT" if hit_labels else "MATCHES_NONE")
        if not hit_labels:
            summary["matches_none"] += 1
            summary["unresolved"] += 1

        post_deploy = False
        semantic_kind = None
        deployed_content = file_bytes_at(deployed_sha, name)
        recovered_content = file_bytes_at(recovered_sha, name)
        if deployed_content and recovered_content:
            deployed_reps = checksum_representations(deployed_content)
            if prod in deployed_reps.values() and recovered_inventory.get(name) != repo_sha:
                post_deploy = True
                summary["actual_post_deploy_file_mutations"] += 1
            semantic_kind = semantic_change_kind(
                deployed_content.decode("utf-8"), recovered_content.decode("utf-8")
            )
            if semantic_kind == "LINE_ENDING_REPRESENTATION_DIFFERENCE":
                summary["line_ending_only_differences"] += 1
            elif semantic_kind == "SEMANTIC_SQL_CHANGE":
                summary["semantic_sql_mutations"] += 1
            elif semantic_kind == "IDENTIFIER_ONLY":
                summary["identifier_only_mutations"] += 1

        migrations.append(
            {
                "migration": name,
                "production_checksum": prod,
                "classification": classification,
                "hit_labels": hit_labels,
                "post_deploy_historical_migration_mutation": post_deploy,
                "semantic_change_kind": semantic_kind,
            }
        )
    return {"schema_version": 1, "phase": "CI-R3B1N.2", "summary": summary, "migrations": migrations}
