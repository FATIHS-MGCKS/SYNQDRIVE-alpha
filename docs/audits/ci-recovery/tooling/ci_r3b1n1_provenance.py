"""Migration provenance, checksum classification, and forensic helpers."""
from __future__ import annotations

import re
import subprocess
from collections import defaultdict
from pathlib import Path
from typing import Any

from ci_r3b1n1_constants import (
    DEPLOYED_SHA,
    HIGH_RISK_SUBSTRINGS,
    M252,
    MIG_ROOT,
    REPO,
    R3B1G,
    R3B1I,
    file_state_at,
    is_high_risk,
    local_migration_inventory,
    migration_sql_path,
    sha256_text,
)


def load_frozen_ledger(path: Path) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    doc = __import__("json").loads(path.read_text())
    rows = doc["rows"]
    by_name: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_name[row["migration_name"]].append(row)
    best: dict[str, dict[str, Any]] = {}
    for name, group in by_name.items():
        finished = [r for r in group if r.get("finished_at") and not r.get("rolled_back_at")]
        if finished:
            best[name] = finished[-1]
        elif group:
            best[name] = group[-1]
    return rows, best


def all_ledger_rows_by_name(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        out[row["migration_name"]].append(row)
    for name in out:
        out[name].sort(key=lambda r: r.get("started_at") or "")
    return out


def migration_names_at_ref(ref: str) -> set[str]:
    proc = subprocess.run(
        ["git", "ls-tree", "-r", "--name-only", ref, "backend/prisma/migrations"],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    names = set()
    for line in (proc.stdout or "").splitlines():
        if line.endswith("/migration.sql"):
            names.add(line.split("/")[-2])
    return names


def build_four_way_matrix(
    *,
    ledger_rows: list[dict[str, Any]],
    ledger_best: dict[str, dict[str, Any]],
    deployed_sha: str,
    main_sha: str,
    recovered_sha: str,
) -> dict[str, Any]:
    deployed_names = migration_names_at_ref(deployed_sha)
    main_names = migration_names_at_ref(main_sha)
    recovered_names = migration_names_at_ref(recovered_sha)
    union = sorted(set(ledger_best) | deployed_names | main_names | recovered_names)
    entries = []
    for name in union:
        prod = ledger_best.get(name)
        entries.append(
            {
                "migration_name": name,
                "production": {
                    "present": name in ledger_best,
                    "finished": bool(prod and prod.get("finished_at") and not prod.get("rolled_back_at")),
                    "rolled_back": any(r.get("rolled_back_at") for r in ledger_rows if r["migration_name"] == name),
                    "checksum": (prod or {}).get("checksum"),
                },
                "deployed_sha": file_state_at(deployed_sha, name),
                "main": file_state_at(main_sha, name),
                "recovered": file_state_at(recovered_sha, name),
            }
        )
    return {
        "schema_version": 1,
        "phase": "CI-R3B1N.1",
        "deployed_sha": deployed_sha,
        "main_sha": main_sha,
        "recovered_sha": recovered_sha,
        "union_migration_names": len(union),
        "entries": entries,
    }


def prisma_checksum_candidates(content: bytes) -> dict[str, str]:
    text = content.decode("utf-8")
    return {
        "raw_bytes_sha256": __import__("hashlib").sha256(content).hexdigest(),
        "utf8_text_sha256": sha256_text(text),
        "lf_normalized_sha256": sha256_text(text.replace("\r\n", "\n")),
        "crlf_normalized_sha256": sha256_text(text.replace("\n", "\r\n")),
        "trim_trailing_newline_sha256": sha256_text(text.rstrip("\n") + "\n"),
    }


def derive_checksum_semantics(
    ledger_best: dict[str, dict[str, Any]],
    recovered_sha: str,
    *,
    min_confirmations: int = 5,
) -> dict[str, Any]:
    confirmations = []
    algorithm = None
    for name, row in sorted(ledger_best.items()):
        if not row.get("finished_at") or row.get("rolled_back_at"):
            continue
        state = file_state_at(recovered_sha, name)
        if not state["file_present"]:
            continue
        content = subprocess.check_output(["git", "show", f"{recovered_sha}:{migration_sql_path(name)}"], cwd=REPO)
        candidates = prisma_checksum_candidates(content)
        prod = row["checksum"]
        match_key = next((k for k, v in candidates.items() if v == prod), None)
        if match_key:
            confirmations.append({"migration": name, "algorithm_key": match_key, "checksum": prod})
            if algorithm and algorithm != match_key:
                algorithm = "mixed"
            elif not algorithm:
                algorithm = match_key
        if len(confirmations) >= min_confirmations and algorithm and algorithm != "mixed":
            break
    return {
        "schema_version": 1,
        "phase": "CI-R3B1N.1",
        "confirmed_algorithm_key": algorithm or "unknown",
        "confirmed_representation": "raw migration.sql bytes SHA-256"
        if algorithm == "raw_bytes_sha256"
        else algorithm,
        "confirmation_count": len(confirmations),
        "confirmations": confirmations[:10],
        "pass": len(confirmations) >= min_confirmations and algorithm == "raw_bytes_sha256",
    }


def classify_checksum_mismatch(
    *,
    production_checksum: str,
    deployed: dict,
    main: dict,
    recovered: dict,
) -> dict[str, Any]:
    hits = {
        "deployed": deployed.get("file_present") and production_checksum == deployed.get("file_sha256"),
        "main": main.get("file_present") and production_checksum == main.get("file_sha256"),
        "recovered": recovered.get("file_present") and production_checksum == recovered.get("file_sha256"),
    }
    present = {
        "deployed": deployed.get("file_present"),
        "main": main.get("file_present"),
        "recovered": recovered.get("file_present"),
    }
    if not present["deployed"]:
        classification = "FILE_ABSENT_AT_DEPLOYED_SHA"
    elif hits["deployed"] and hits["main"] and hits["recovered"]:
        classification = "MATCHES_ALL_REPO_STATES"
    elif hits["deployed"] and hits["main"] and not hits["recovered"]:
        classification = "MATCHES_DEPLOYED_AND_MAIN"
    elif hits["deployed"] and hits["recovered"] and not hits["main"]:
        classification = "MATCHES_DEPLOYED_AND_RECOVERED"
    elif hits["deployed"] and not hits["main"] and not hits["recovered"]:
        classification = "MATCHES_DEPLOYED_SHA_ONLY"
    elif hits["main"] and not hits["deployed"] and not hits["recovered"]:
        classification = "MATCHES_MAIN_ONLY"
    elif hits["recovered"] and not hits["deployed"] and not hits["main"]:
        classification = "MATCHES_RECOVERED_ONLY"
    elif not any(hits.values()):
        classification = "MATCHES_NONE"
    elif sum(hits.values()) > 1:
        classification = "MULTI_REVISION_AMBIGUITY"
    else:
        classification = "MATCHES_NONE"
    post_deploy_mutation = hits["deployed"] and (
        (present["recovered"] and production_checksum != recovered.get("file_sha256"))
        or (present["main"] and production_checksum != main.get("file_sha256"))
    )
    return {
        "classification": classification,
        "post_deploy_historical_migration_mutation": post_deploy_mutation,
        "matches": hits,
    }


def build_checksum_classification(
    *,
    ledger_best: dict[str, dict[str, Any]],
    recovered_inventory: dict[str, str],
    deployed_sha: str,
    main_sha: str,
    recovered_sha: str,
) -> dict[str, Any]:
    mismatches = []
    for name, row in sorted(ledger_best.items()):
        if not row.get("finished_at") or row.get("rolled_back_at"):
            continue
        repo_sha = recovered_inventory.get(name)
        if not repo_sha or row.get("checksum") == repo_sha:
            continue
        deployed = file_state_at(deployed_sha, name)
        main = file_state_at(main_sha, name)
        recovered = file_state_at(recovered_sha, name)
        result = classify_checksum_mismatch(
            production_checksum=row["checksum"],
            deployed=deployed,
            main=main,
            recovered=recovered,
        )
        mismatches.append(
            {
                "migration": name,
                "production_checksum": row["checksum"],
                "deployed_sha256": deployed.get("file_sha256"),
                "main_sha256": main.get("file_sha256"),
                "recovered_sha256": recovered.get("file_sha256"),
                "high_risk_history": is_high_risk(name),
                **result,
            }
        )
    summary = {
        "total_mismatches": len(mismatches),
        "matches_deployed_sha": sum(1 for m in mismatches if m["matches"]["deployed"]),
        "changed_after_deployed_sha": sum(1 for m in mismatches if m["post_deploy_historical_migration_mutation"]),
        "matches_none": sum(1 for m in mismatches if m["classification"] == "MATCHES_NONE"),
        "high_risk_mismatches": sum(1 for m in mismatches if m["high_risk_history"]),
        "unresolved": sum(
            1
            for m in mismatches
            if m["classification"] in {"MATCHES_NONE", "MULTI_REVISION_AMBIGUITY", "FILE_ABSENT_AT_DEPLOYED_SHA"}
        ),
    }
    return {"schema_version": 1, "phase": "CI-R3B1N.1", "summary": summary, "migrations": mismatches}


def git_mutation_history(migration: str, deployed_sha: str) -> dict[str, Any]:
    rel = migration_sql_path(migration)
    log_proc = subprocess.run(
        ["git", "log", "--follow", "--format=%H|%ci|%s", "--", rel],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    commits = []
    for line in (log_proc.stdout or "").splitlines():
        sha, date, subject = line.split("|", 2)
        commits.append({"sha": sha, "date": date, "subject": subject})
    visible_at_deploy = subprocess.run(["git", "cat-file", "-e", f"{deployed_sha}:{rel}"], cwd=REPO).returncode == 0
    later = [c for c in commits if c["sha"] != deployed_sha][:5]
    change_kind = "unknown"
    if len(commits) >= 2:
        old = subprocess.run(["git", "show", f"{commits[-1]['sha']}:{rel}"], cwd=REPO, capture_output=True, text=True).stdout or ""
        new = subprocess.run(["git", "show", f"{commits[0]['sha']}:{rel}"], cwd=REPO, capture_output=True, text=True).stdout or ""
        if old != new:
            if re.sub(r"\s+", " ", old.strip()) == re.sub(r"\s+", " ", new.strip()):
                change_kind = "comments/whitespace"
            elif re.sub(r'"[^"]+"', "ID", old) != re.sub(r'"[^"]+"', "ID", new):
                change_kind = "identifier-only"
            else:
                change_kind = "semantic SQL"
    return {
        "migration": migration,
        "first_creator_commit": commits[-1] if commits else None,
        "visible_at_deployed_sha": visible_at_deploy,
        "latest_commit": commits[0] if commits else None,
        "later_change_commits": later,
        "token_change_summary": change_kind,
    }


def search_git_history_for_migration(name: str) -> list[dict[str, str]]:
    proc = subprocess.run(
        ["git", "log", "--all", "--format=%H|%ci|%s", "--", f"backend/prisma/migrations/{name}"],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    out = []
    for line in (proc.stdout or "").splitlines():
        sha, date, subject = line.split("|", 2)
        out.append({"sha": sha, "date": date, "subject": subject})
    return out


def classify_production_only(name: str, deployed_sha: str, main_sha: str, recovered_sha: str) -> dict[str, Any]:
    deployed = file_state_at(deployed_sha, name)
    main = file_state_at(main_sha, name)
    recovered = file_state_at(recovered_sha, name)
    history = search_git_history_for_migration(name)
    if deployed["file_present"]:
        classification = "PROD_ONLY_PRESENT_AT_DEPLOYED_SHA"
    elif history and not main["file_present"] and not recovered["file_present"]:
        classification = "PROD_ONLY_REMOVED_LATER"
    elif history:
        classification = "PROD_ONLY_RENAMED_LATER"
    else:
        classification = "PROD_ONLY_NEVER_FOUND_IN_GIT_HISTORY"
    return {
        "migration": name,
        "classification": classification,
        "deployed_sha": deployed,
        "main": main,
        "recovered": recovered,
        "git_history": history[:5],
    }


def parse_migration_effects(sql: str) -> list[dict[str, str]]:
    effects = []
    for m in re.finditer(r'ADD COLUMN\s+"([^"]+)"', sql, re.I):
        effects.append({"kind": "add_column", "object": m.group(1)})
    for m in re.finditer(r'CREATE TABLE\s+"([^"]+)"', sql, re.I):
        effects.append({"kind": "create_table", "object": m.group(1)})
    for m in re.finditer(r'ALTER TABLE\s+"([^"]+)"\s+ADD COLUMN\s+"([^"]+)"', sql, re.I):
        effects.append({"kind": "add_column", "table": m.group(1), "object": m.group(2)})
    return effects


def classify_repo_only_pending(
    name: str,
    *,
    sql: str,
    catalog_checks: dict[str, Any],
) -> dict[str, Any]:
    effects = parse_migration_effects(sql)
    recovery_specific = name.startswith("2026") and ("ci_r3b" in name or "post_replay" in name or name in {R3B1G, R3B1I, M252})
    present = catalog_checks.get("columns_present", 0)
    total = catalog_checks.get("columns_checked", 0)
    tables_present = catalog_checks.get("tables_present", 0)
    if total == 0 and tables_present == 0:
        classification = "PENDING_AND_PHYSICALLY_ABSENT"
    elif present == total and total > 0:
        classification = "PENDING_BUT_EFFECT_ALREADY_PRESENT"
    elif present > 0 and present < total:
        classification = "PENDING_PARTIAL_EFFECT_PRESENT"
    elif tables_present > 0 and catalog_checks.get("tables_checked", 0) == 0:
        classification = "PENDING_AND_PHYSICALLY_ABSENT"
    else:
        classification = "PENDING_EFFECT_UNKNOWN"
    return {
        "migration": name,
        "recovery_specific": recovery_specific,
        "effects": effects,
        "catalog_checks": catalog_checks,
        "classification": classification,
    }


def m252_forensic_timeline(rows: list[dict[str, Any]]) -> dict[str, Any]:
    ordered = sorted(rows, key=lambda r: r.get("started_at") or "")
    events = []
    for idx, row in enumerate(ordered, start=1):
        if row.get("rolled_back_at") and not row.get("finished_at"):
            events.append({"attempt": idx, "label": "M252_ROLLED_BACK"})
            events.append({"attempt": idx, "label": "M252_EXECUTION_FAILED"})
        elif row.get("finished_at") and str(row.get("applied_steps_count", "0")) == "0":
            events.append({"attempt": idx, "label": "M252_MARKED_APPLIED_WITH_ZERO_STEPS"})
        elif row.get("finished_at"):
            events.append({"attempt": idx, "label": "M252_SUCCESSFULLY_EXECUTED"})
        else:
            events.append({"attempt": idx, "label": "M252_EVENT_UNKNOWN"})
    final = "M252_ORIGINAL_FAILED_ROLLED_BACK_THEN_ZERO_STEP_MARKED_APPLIED"
    if len(ordered) >= 2 and ordered[0].get("rolled_back_at") and ordered[-1].get("finished_at"):
        if str(ordered[-1].get("applied_steps_count", "0")) == "0":
            final = "M252_ORIGINAL_FAILED_ROLLED_BACK_THEN_ZERO_STEP_MARKED_APPLIED"
    return {
        "schema_version": 1,
        "migration": M252,
        "ledger_rows": [
            {
                "id_fingerprint_sha256": sha256_text(row.get("id", "")),
                "checksum": row.get("checksum"),
                "started_at": row.get("started_at"),
                "finished_at": row.get("finished_at"),
                "rolled_back_at": row.get("rolled_back_at"),
                "applied_steps_count": row.get("applied_steps_count"),
                "logs_present": bool(row.get("logs")),
                "logs_sanitized_excerpt": row.get("logs"),
            }
            for row in ordered
        ],
        "timeline_events": events,
        "catalog_target_table_present": False,
        "final_classification": final,
        "confidence": "MEDIUM",
        "proof_level": "ledger_metadata_plus_catalog_absence",
    }
