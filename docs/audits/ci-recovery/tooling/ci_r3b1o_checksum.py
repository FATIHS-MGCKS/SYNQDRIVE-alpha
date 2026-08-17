"""Checksum provenance preflight with corrected post-deploy mutation detection."""
from __future__ import annotations

import re
from typing import Any

from ci_r3b1n2_constants import DEPLOYED_SHA, file_bytes_at, sha256_bytes, sha256_text
from ci_r3b1n2_checksum import semantic_change_kind


def checksum_representations_extended(content: bytes) -> dict[str, str]:
    text = content.decode("utf-8")
    lf = text.replace("\r\n", "\n").replace("\r", "\n")
    crlf = lf.replace("\n", "\r\n")
    reps: dict[str, str] = {
        "raw": sha256_bytes(content),
        "lf": sha256_text(lf),
        "crlf": sha256_text(crlf),
        "lf_no_eof_newline": sha256_text(lf.rstrip("\n")),
        "crlf_no_eof_newline": sha256_text(crlf.rstrip("\r\n")),
    }
    if lf.endswith("\n"):
        reps["mixed_lf_body_final_crlf"] = sha256_text(lf[:-1] + "\r\n")
    if crlf.endswith("\r\n"):
        reps["mixed_crlf_body_final_lf"] = sha256_text(crlf[:-2] + "\n")
    if text.startswith("\ufeff"):
        reps["utf8_bom_raw"] = sha256_bytes(content)
        reps["utf8_bom_lf"] = sha256_text("\ufeff" + lf.lstrip("\ufeff"))
    return reps


def classify_production_match(prod_checksum: str, reps: dict[str, str]) -> tuple[str, list[str]]:
    hits = [k.upper() for k, v in reps.items() if v == prod_checksum]
    if not hits:
        return "MATCHES_NONE", []
    if len(hits) == 1:
        return f"MATCH_{hits[0]}", hits
    return "MATCHES_MULTIPLE_EQUIVALENT", hits


def file_hash_at(ref: str, migration: str) -> dict[str, str | None]:
    content = file_bytes_at(ref, migration)
    if not content:
        return {"raw": None, "lf": None, "crlf": None}
    reps = checksum_representations_extended(content)
    return {
        "raw": reps["raw"],
        "lf": reps["lf"],
        "crlf": reps["crlf"],
        "mixed_lf_body_final_crlf": reps.get("mixed_lf_body_final_crlf"),
    }


def detect_post_deploy_mutation(
    *,
    prod_checksum: str,
    deployed_content: bytes | None,
    recovered_content: bytes | None,
    main_content: bytes | None,
) -> tuple[bool, str | None, dict[str, Any]]:
    detail: dict[str, Any] = {
        "production_matches_deployed_historical": False,
        "production_matches_main_historical": False,
        "deployed_vs_recovered_semantic_kind": None,
        "deployed_file_hash": None,
        "main_file_hash": None,
        "recovered_file_hash": None,
    }
    if not deployed_content or not recovered_content:
        return False, None, detail

    deployed_reps = checksum_representations_extended(deployed_content)
    main_reps = checksum_representations_extended(main_content) if main_content else {}
    recovered_reps = checksum_representations_extended(recovered_content)

    detail["deployed_file_hash"] = deployed_reps["raw"]
    detail["main_file_hash"] = main_reps.get("raw") if main_reps else None
    detail["recovered_file_hash"] = recovered_reps["raw"]

    prod_matches_deployed = prod_checksum in deployed_reps.values()
    prod_matches_main = prod_checksum in main_reps.values() if main_reps else False
    detail["production_matches_deployed_historical"] = prod_matches_deployed
    detail["production_matches_main_historical"] = prod_matches_main

    deployed_lf = deployed_content.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
    recovered_lf = recovered_content.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
    semantic_kind = semantic_change_kind(deployed_lf, recovered_lf)
    detail["deployed_vs_recovered_semantic_kind"] = semantic_kind

    if (prod_matches_deployed or prod_matches_main) and deployed_lf != recovered_lf:
        return True, semantic_kind, detail
    return False, semantic_kind, detail


def build_checksum_preflight(
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
        "match_raw": 0,
        "match_lf": 0,
        "match_crlf": 0,
        "match_mixed_eol": 0,
        "line_ending_representation_differences": 0,
        "comment_only_changes": 0,
        "whitespace_only_changes": 0,
        "identifier_only_history_mutations": 0,
        "semantic_sql_history_mutations": 0,
        "post_deploy_historical_migration_mutations": 0,
        "matches_none": 0,
        "unresolved": 0,
    }
    refs = {"deployed": deployed_sha, "main": main_sha, "recovered": recovered_sha}

    for name, row in sorted(ledger_best.items()):
        if not row.get("finished_at") or row.get("rolled_back_at"):
            continue
        repo_sha = recovered_inventory.get(name)
        prod = row["checksum"]
        if not repo_sha or prod == repo_sha:
            continue
        summary["common_migrations"] += 1

        hit_labels: list[str] = []
        rep_hits = {"raw": False, "lf": False, "crlf": False, "mixed_eol": False}
        ref_matches: dict[str, Any] = {}
        for ref_name, ref in refs.items():
            content = file_bytes_at(ref, name)
            if not content:
                ref_matches[ref_name] = None
                continue
            reps = checksum_representations_extended(content)
            ref_matches[ref_name] = {k: v for k, v in reps.items()}
            for rep_key, rep_val in reps.items():
                if rep_val == prod:
                    label = f"MATCHES_{ref_name.upper()}_{rep_key.upper()}"
                    hit_labels.append(label)
                    if rep_key == "raw":
                        rep_hits["raw"] = True
                    elif rep_key in {"lf", "lf_no_eof_newline"}:
                        rep_hits["lf"] = True
                    elif rep_key in {"crlf", "crlf_no_eof_newline"}:
                        rep_hits["crlf"] = True
                    elif rep_key.startswith("mixed_"):
                        rep_hits["mixed_eol"] = True

        if rep_hits["raw"]:
            summary["match_raw"] += 1
        if rep_hits["lf"]:
            summary["match_lf"] += 1
        if rep_hits["crlf"]:
            summary["match_crlf"] += 1
        if rep_hits["mixed_eol"]:
            summary["match_mixed_eol"] += 1

        classification = (
            hit_labels[0]
            if len(hit_labels) == 1
            else ("MATCHES_MULTIPLE_EQUIVALENT" if hit_labels else "MATCHES_NONE")
        )
        if not hit_labels:
            summary["matches_none"] += 1
            summary["unresolved"] += 1

        deployed_content = file_bytes_at(deployed_sha, name)
        recovered_content = file_bytes_at(recovered_sha, name)
        main_content = file_bytes_at(main_sha, name)
        post_deploy, semantic_kind, mutation_detail = detect_post_deploy_mutation(
            prod_checksum=prod,
            deployed_content=deployed_content,
            recovered_content=recovered_content,
            main_content=main_content,
        )
        if post_deploy:
            summary["post_deploy_historical_migration_mutations"] += 1
            if semantic_kind == "LINE_ENDING_REPRESENTATION_DIFFERENCE":
                summary["line_ending_representation_differences"] += 1
            elif semantic_kind == "COMMENT_ONLY":
                summary["comment_only_changes"] += 1
            elif semantic_kind == "WHITESPACE_ONLY":
                summary["whitespace_only_changes"] += 1
            elif semantic_kind == "IDENTIFIER_ONLY":
                summary["identifier_only_history_mutations"] += 1
            elif semantic_kind == "SEMANTIC_SQL_CHANGE":
                summary["semantic_sql_history_mutations"] += 1

        migrations.append(
            {
                "migration": name,
                "production_checksum": prod,
                "recovered_checksum": repo_sha,
                "classification": classification,
                "hit_labels": hit_labels,
                "post_deploy_historical_migration_mutation": post_deploy,
                "semantic_change_kind": semantic_kind,
                "deployed_file_hash": mutation_detail.get("deployed_file_hash"),
                "main_file_hash": mutation_detail.get("main_file_hash"),
                "recovered_file_hash": mutation_detail.get("recovered_file_hash"),
                "production_matches_deployed_historical": mutation_detail.get("production_matches_deployed_historical"),
            }
        )

    return {
        "schema_version": 1,
        "phase": "CI-R3B1O",
        "refs": refs,
        "summary": summary,
        "migrations": migrations,
        "pass": summary["matches_none"] == 0 and summary["unresolved"] == 0,
    }
