"""Shared CI-recovery replay evidence helpers (R3B1B/R3B1C)."""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[4]
MIG_ROOT = REPO / "backend/prisma/migrations"
BACKEND = REPO / "backend"
DATA = REPO / "docs/audits/ci-recovery/data"
TOPOLOGY_PATH = DATA / "ci-r3b1a32-final-repair-topology-2026-08.json"
DEFERRED_FK_PATH = DATA / "ci-r3b1a32-deferred-fk-resolution-2026-08.json"
TARGET_SHA = "1c18164be77dead4db2ff500123754e8c924c9094bc09c41f2408dbcd56a4974"

R3B1B_REPAIR_MIGRATIONS = [
    "20260412025000_ci_r3b_historical_predecessor_slot1",
    "20260412610000_ci_r3b_historical_predecessor_slot2",
    "20260413201500_ci_r3b_historical_predecessor_slot3",
    "20260413225000_ci_r3b_historical_predecessor_slot4",
    "20260417170000_ci_r3b_historical_predecessor_slot5",
    "20260421180000_ci_r3b_historical_predecessor_slot6",
]

SPECIAL_MIGRATION = "20260413230000_add_composite_indexes_batch_c"
SPECIAL_MIGRATION_PATH = MIG_ROOT / SPECIAL_MIGRATION / "migration.sql"
# Pinned at CI-R3B1C from pre-implementation migration manifest / Git history — never derive at runtime.
SPECIAL_MIGRATION_EXPECTED_SHA256 = "315ea75619f33af2d3cdd4e61744aa916e461232bcc203738f1eae9c1fae4496"
HARNESS_AUTHORITY_PATH = DATA / "ci-r3b1d-replay-harness-authority-2026-08.json"
SPECIAL_REPLAY_AUTHORITY_PATH = DATA / "ci-r3b1c-special-replay-authority-2026-08.json"

REPLAY_INPUT_MANIFEST_PATHS: list[str] = [
    "backend/prisma/migrations/*/migration.sql",
    "docs/audits/ci-recovery/data/ci-r3b1c-special-replay-authority-2026-08.json",
    "docs/audits/ci-recovery/data/ci-r3b1a32-final-repair-topology-2026-08.json",
    "docs/audits/ci-recovery/data/ci-r3b1a32-deferred-fk-resolution-2026-08.json",
    "docs/audits/ci-recovery/tooling/replay_evidence_lib.py",
    "docs/audits/ci-recovery/tooling/ci_r3b1c_special_composite_index.py",
    "docs/audits/ci-recovery/tooling/ci_r3b1c_full_replay_harness.py",
    "docs/audits/ci-recovery/tooling/ci_r3b1d_build_replay_harness_authority.py",
    "docs/audits/ci-recovery/data/ci-r3b1d-replay-harness-authority-2026-08.json",
]
# Generated outputs listed for provenance but excluded from manifest digest (avoid self-hash loop).
REPLAY_INPUT_MANIFEST_HASH_EXCLUDE: set[str] = {
    "docs/audits/ci-recovery/data/ci-r3b1d-replay-harness-authority-2026-08.json",
}

CREATE_INDEX_RE = re.compile(
    r"CREATE\s+(?P<unique>UNIQUE\s+)?INDEX\s+(?P<concurrently>CONCURRENTLY\s+)?(?P<ifnotexists>IF\s+NOT\s+EXISTS\s+)?"
    r'"(?P<name>[^"]+)"\s+ON\s+"(?P<table>[^"]+)"\s*\((?P<cols>[^)]+)\)',
    re.IGNORECASE | re.DOTALL,
)

TRANSACTION_PATTERNS: list[tuple[str, re.Pattern[str], str]] = [
    ("CREATE UNIQUE INDEX CONCURRENTLY", re.compile(r"\bCREATE\s+UNIQUE\s+INDEX\s+CONCURRENTLY\b", re.I), "SPECIAL_EXECUTION_REQUIRED"),
    ("CREATE INDEX CONCURRENTLY", re.compile(r"\bCREATE\s+INDEX\s+CONCURRENTLY\b", re.I), "SPECIAL_EXECUTION_REQUIRED"),
    ("DROP INDEX CONCURRENTLY", re.compile(r"\bDROP\s+INDEX\s+CONCURRENTLY\b", re.I), "SPECIAL_EXECUTION_REQUIRED"),
    ("REINDEX CONCURRENTLY", re.compile(r"\bREINDEX\b[^;]*\bCONCURRENTLY\b", re.I), "SPECIAL_EXECUTION_REQUIRED"),
    ("REFRESH MATERIALIZED VIEW CONCURRENTLY", re.compile(r"\bREFRESH\s+MATERIALIZED\s+VIEW\s+CONCURRENTLY\b", re.I), "SPECIAL_EXECUTION_REQUIRED"),
    ("VACUUM", re.compile(r"^\s*VACUUM\b", re.I | re.M), "SPECIAL_EXECUTION_REQUIRED"),
    ("CREATE DATABASE", re.compile(r"\bCREATE\s+DATABASE\b", re.I), "SPECIAL_EXECUTION_REQUIRED"),
    ("DROP DATABASE", re.compile(r"\bDROP\s+DATABASE\b", re.I), "SPECIAL_EXECUTION_REQUIRED"),
    ("ALTER SYSTEM", re.compile(r"\bALTER\s+SYSTEM\b", re.I), "SPECIAL_EXECUTION_REQUIRED"),
]


@dataclass
class PgConfig:
    host: str = os.environ.get("R3B_PG_HOST", "127.0.0.1")
    port: str = os.environ.get("R3B_PG_PORT", "5432")
    user: str = os.environ.get("R3B_PG_USER", "synqdrive")
    password: str = os.environ.get("R3B_PG_PASSWORD", "synqdrive")

    def url(self, db: str) -> str:
        return f"postgresql://{self.user}:{self.password}@{self.host}:{self.port}/{db}"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def git_tree_sha(rev: str = "HEAD") -> str:
    return subprocess.check_output(["git", "rev-parse", f"{rev}^{{tree}}"], cwd=REPO, text=True).strip()


def migration_dirs() -> list[str]:
    return sorted(p.name for p in MIG_ROOT.iterdir() if p.is_dir() and not p.name.startswith("."))


def replay_input_manifest_files() -> list[dict[str, str]]:
    files: list[dict[str, str]] = []
    for pattern in REPLAY_INPUT_MANIFEST_PATHS:
        if "*" in pattern:
            for path in sorted(REPO.glob(pattern)):
                if path.is_file():
                    rel = str(path.relative_to(REPO))
                    files.append({"path": rel, "sha256": sha256_file(path)})
        else:
            path = REPO / pattern
            if path.is_file():
                files.append({"path": pattern, "sha256": sha256_file(path)})
    return files


def replay_input_manifest_digest_files() -> list[dict[str, str]]:
    return [f for f in replay_input_manifest_files() if f["path"] not in REPLAY_INPUT_MANIFEST_HASH_EXCLUDE]


def replay_input_manifest_sha256() -> str:
    files = replay_input_manifest_digest_files()
    canonical = "\n".join(f"{f['path']}\0{f['sha256']}" for f in files)
    return sha256_text(canonical)


def replay_provenance(base_commit_sha: str | None = None) -> dict[str, str | bool]:
    commit = base_commit_sha or subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
    dirty = subprocess.check_output(["git", "status", "--porcelain"], cwd=REPO, text=True).strip()
    allowed_dirty_prefixes = ("?? docs/audits/ci-recovery/", " M docs/audits/ci-recovery/", "A  docs/audits/ci-recovery/")
    non_allowed = [
        line
        for line in dirty.splitlines()
        if line.strip() and not any(line.startswith(p) or line.startswith("?? docs/audits/ci-recovery/tooling/__pycache__") for p in allowed_dirty_prefixes)
    ]
    return {
        "BASE_COMMIT_SHA": commit,
        "BASE_GIT_TREE_SHA": git_tree_sha(commit),
        "REPLAY_INPUT_MANIFEST_SHA256": replay_input_manifest_sha256(),
        "working_tree_clean_at_replay_start": len(non_allowed) == 0,
    }


def special_migration_hash_status() -> dict[str, Any]:
    observed = sha256_file(SPECIAL_MIGRATION_PATH)
    return {
        "migration": SPECIAL_MIGRATION,
        "accepted_sha256": SPECIAL_MIGRATION_EXPECTED_SHA256,
        "observed_sha256": observed,
        "match": observed == SPECIAL_MIGRATION_EXPECTED_SHA256,
    }


def psql(cfg: PgConfig, db: str, sql: str, *, file: Path | None = None, tuples_only: bool = False) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["PGPASSWORD"] = cfg.password
    cmd = ["psql", "-h", cfg.host, "-p", cfg.port, "-U", cfg.user, "-d", db, "-v", "ON_ERROR_STOP=1"]
    if tuples_only:
        cmd += ["-t", "-A"]
    if file:
        cmd += ["-f", str(file)]
    else:
        cmd += ["-c", sql]
    return subprocess.run(cmd, capture_output=True, text=True, env=env)


def recreate_db(cfg: PgConfig, name: str) -> None:
    psql(cfg, "postgres", f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='{name}' AND pid <> pg_backend_pid();")
    drop = psql(cfg, "postgres", f"DROP DATABASE IF EXISTS {name};")
    if drop.returncode != 0:
        raise RuntimeError(drop.stderr or drop.stdout)
    create = psql(cfg, "postgres", f"CREATE DATABASE {name};")
    if create.returncode != 0:
        raise RuntimeError(create.stderr or create.stdout)


def table_exists(cfg: PgConfig, db: str, name: str) -> bool:
    proc = psql(
        cfg,
        db,
        "SELECT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
        f"WHERE n.nspname='public' AND c.relname='{name}' AND c.relkind='r');",
        tuples_only=True,
    )
    return proc.returncode == 0 and proc.stdout.strip() == "t"


def enum_exists(cfg: PgConfig, db: str, name: str) -> bool:
    proc = psql(
        cfg,
        db,
        "SELECT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace "
        f"WHERE n.nspname='public' AND t.typname='{name}' AND t.typtype='e');",
        tuples_only=True,
    )
    return proc.returncode == 0 and proc.stdout.strip() == "t"


def sequence_exists(cfg: PgConfig, db: str, name: str) -> bool:
    proc = psql(cfg, db, f"SELECT to_regclass('public.\"{name}\"') IS NOT NULL;", tuples_only=True)
    return proc.returncode == 0 and proc.stdout.strip() == "t"


def enum_labels(cfg: PgConfig, db: str, enum_name: str) -> list[str]:
    proc = psql(
        cfg,
        db,
        "SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid "
        f"WHERE t.typname='{enum_name}' ORDER BY e.enumsortorder;",
        tuples_only=True,
    )
    if proc.returncode != 0:
        return []
    return [line.strip() for line in proc.stdout.splitlines() if line.strip()]


def object_runtime_status(cfg: PgConfig, db: str, name: str, kind: str, reached: bool) -> str:
    if not reached:
        return "NOT_REACHED"
    if kind == "table":
        return "PASS" if table_exists(cfg, db, name) else "FAIL"
    if kind == "enum":
        return "PASS" if enum_exists(cfg, db, name) else "FAIL"
    if kind == "sequence":
        return "PASS" if sequence_exists(cfg, db, name) else "FAIL"
    return "NOT_APPLICABLE"


def load_topology() -> dict[str, Any]:
    return json.loads(TOPOLOGY_PATH.read_text())


def slot_created_objects(slot: int) -> list[dict[str, str]]:
    topology = load_topology()
    for s in topology["slots"]:
        if s["slot"] == slot:
            out = []
            for action in s.get("actions", []):
                act = action.get("action")
                if act in {"CREATE TYPE", "CREATE TABLE", "CREATE SEQUENCE"}:
                    out.append(
                        {
                            "name": action["object"],
                            "kind": {"CREATE TYPE": "enum", "CREATE TABLE": "table", "CREATE SEQUENCE": "sequence"}[act],
                        }
                    )
            return out
    raise KeyError(f"slot {slot}")


def deferred_constraints_by_slot() -> dict[int, list[str]]:
    artifact = json.loads(DEFERRED_FK_PATH.read_text())
    by_slot: dict[int, list[str]] = {}
    for rec in artifact.get("records", []):
        slot = rec.get("resolution_slot")
        if slot is None:
            continue
        action = rec.get("resolution_action") or ""
        m = re.search(r'ADD CONSTRAINT "([^"]+)"', action)
        name = m.group(1) if m else action
        cols = rec.get("local_columns") or []
        ref = rec.get("referenced_relation")
        detail = f"{rec.get('source_relation')}.{'.'.join(cols)} -> {ref}.id" if ref else name
        by_slot.setdefault(int(slot), []).append(detail)
    return by_slot


def parse_create_index_statements(sql_text: str) -> list[dict[str, Any]]:
    statements: list[dict[str, Any]] = []
    order = 0
    for m in CREATE_INDEX_RE.finditer(sql_text):
        order += 1
        cols = [c.strip().strip('"') for c in m.group("cols").split(",")]
        statements.append(
            {
                "statement_order": order,
                "index_name": m.group("name"),
                "relation": m.group("table"),
                "columns": cols,
                "unique": bool(m.group("unique")),
                "concurrently": bool(m.group("concurrently")),
                "if_not_exists": bool(m.group("ifnotexists")),
                "predicate": None,
                "operator_class": None,
                "statement_excerpt": re.sub(r"\s+", " ", m.group(0)).strip()[:240],
            }
        )
    return statements


def parse_ts_script_statements(ts_path: Path) -> list[str]:
    text = ts_path.read_text()
    return re.findall(r"`(CREATE INDEX CONCURRENTLY IF NOT EXISTS[^`]+)`", text)


def normalize_index_sql(stmt: str) -> str:
    return re.sub(r"\s+", " ", stmt.strip()).upper()


def compare_migration_to_script(migration_sql: str, script_path: Path) -> dict[str, Any]:
    from_migration = [re.sub(r"\s+", " ", m.group(0)).strip() for m in CREATE_INDEX_RE.finditer(migration_sql)]
    from_script = parse_ts_script_statements(script_path)
    norm_m = [normalize_index_sql(s) for s in from_migration]
    norm_s = [normalize_index_sql(s) for s in from_script]
    missing_in_script = [s for s in norm_m if s not in norm_s]
    unexpected_in_script = [s for s in norm_s if s not in norm_m]
    return {
        "migration_statement_count": len(from_migration),
        "script_statement_count": len(from_script),
        "missing_in_script": missing_in_script,
        "unexpected_in_script": unexpected_in_script,
        "semantic_equivalent": not missing_in_script and not unexpected_in_script,
    }


def audit_transaction_sensitive_migrations() -> dict[str, Any]:
    records: list[dict[str, Any]] = []
    special_migrations: set[str] = set()
    for mig in migration_dirs():
        path = MIG_ROOT / mig / "migration.sql"
        sql = path.read_text()
        lines = sql.splitlines()
        stmt_order = 0
        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("--"):
                continue
        # statement-level scan on whole file chunks separated by semicolon
        chunks = [c.strip() for c in re.split(r";\s*(?:\n|$)", sql) if c.strip() and not c.strip().startswith("--")]
        for chunk in chunks:
            if chunk.lstrip().startswith("--"):
                continue
            stmt_order += 1
            excerpt = re.sub(r"\s+", " ", chunk.split("\n", 1)[0])[:200]
            matched = False
            for label, pattern, default_class in TRANSACTION_PATTERNS:
                if pattern.search(chunk):
                    matched = True
                    classification = default_class
                    known_executor = "ci_r3b1c_special_composite_index" if mig == SPECIAL_MIGRATION else None
                    if classification == "SPECIAL_EXECUTION_REQUIRED":
                        special_migrations.add(mig)
                    records.append(
                        {
                            "migration": mig,
                            "statement_order": stmt_order,
                            "statement_type": label,
                            "statement_excerpt": excerpt,
                            "transaction_sensitive": True,
                            "known_special_executor": known_executor,
                            "replay_risk": "Prisma migrate deploy wraps migration in transaction",
                            "classification": classification,
                            "evidence": [f"{path.relative_to(REPO)}:statement:{stmt_order}"],
                        }
                    )
                    break
            if not matched and re.search(r"\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b", chunk, re.I):
                records.append(
                    {
                        "migration": mig,
                        "statement_order": stmt_order,
                        "statement_type": "TRANSACTION_CONTROL",
                        "statement_excerpt": excerpt,
                        "transaction_sensitive": True,
                        "known_special_executor": None,
                        "replay_risk": "Explicit transaction control in migration SQL",
                        "classification": "SAFE",
                        "evidence": [f"{path.relative_to(REPO)}:statement:{stmt_order}"],
                    }
                )
    unresolved = [r for r in records if r["classification"] == "UNRESOLVED"]
    return {
        "migrations_scanned": len(migration_dirs()),
        "transaction_sensitive_statements": len(records),
        "special_execution_required_migrations": sorted(special_migrations),
        "records": records,
        "unresolved_count": len(unresolved),
    }


def classify_failure(first_failed: str | None, output: str) -> str:
    if not first_failed:
        return "NONE"
    sqlstate_m = re.search(r"Database error code:\s*(\w+)", output)
    sqlstate = sqlstate_m.group(1) if sqlstate_m else None
    if sqlstate == "25001" and "CONCURRENTLY" in output:
        if first_failed == SPECIAL_MIGRATION:
            return "SPECIAL_EXECUTION_REQUIRED"
        return "TRANSACTION_INCOMPATIBLE_SQL"
    if first_failed in R3B1B_REPAIR_MIGRATIONS:
        return "R3B1B_REPAIR_MIGRATION_DEFECT"
    return "UNRELATED_HISTORICAL_DEFECT"


def extract_failing_statement(output: str, migration_name: str | None = None) -> dict[str, Any]:
    """Best-effort extraction of failing SQL statement metadata from replay/deploy output."""
    lines = output.splitlines()
    failing_line: int | None = None
    failing_sql: str | None = None
    statement_ordinal: int | None = None

    err_idx = next((i for i, line in enumerate(lines) if "ERROR:" in line), None)
    if err_idx is not None:
        for i in range(err_idx - 1, max(-1, err_idx - 12), -1):
            line = lines[i].strip()
            if not line or line.startswith("Migration name:"):
                continue
            if re.search(r"\b(SELECT|INSERT|UPDATE|DELETE|ALTER|CREATE)\b", line, re.I):
                failing_sql = line
                failing_line = i + 1
                break

    if migration_name and failing_sql is None:
        mig_path = MIG_ROOT / migration_name / "migration.sql"
        if mig_path.is_file():
            err_m = re.search(r"ERROR:\s*(.+)", output)
            err_text = err_m.group(1).strip().lower() if err_m else ""
            col_m = re.search(r'column\s+([a-z0-9_."]+)\s+does not exist', err_text, re.I)
            if col_m:
                needle = col_m.group(1).replace('"', "").split(".")[-1]
                for ord_i, stmt in enumerate(
                    [s.strip() for s in re.split(r";\s*(?:\n|$)", mig_path.read_text()) if s.strip()],
                    1,
                ):
                    if needle in stmt and re.search(rf'"{re.escape(needle)}"|\b{re.escape(needle)}\b', stmt, re.I):
                        failing_sql = " ".join(stmt.split())[:500]
                        statement_ordinal = ord_i
                        break

    return {
        "failing_statement_line": failing_line,
        "failing_sql_statement": failing_sql,
        "failing_statement_ordinal": statement_ordinal,
    }


def parse_deploy_output(output: str) -> dict[str, Any]:
    applied = re.findall(r"Applying migration `([^`]+)`", output)
    fail_m = re.search(r"Migration name:\s*(\S+)", output)
    sqlstate_m = re.search(r"Database error code:\s*(\w+)", output)
    err_m = re.search(r"ERROR:\s*(.+)", output)
    count_m = re.search(r"(\d+) migrations found", output)
    first_failed = fail_m.group(1) if fail_m else None
    stmt_meta = extract_failing_statement(output, first_failed)
    return {
        "migrations_found": int(count_m.group(1)) if count_m else None,
        "applied_in_output": applied,
        "first_failed_migration": first_failed,
        "failure_ordinal": migration_ordinal(first_failed) if first_failed else None,
        "sqlstate": sqlstate_m.group(1) if sqlstate_m else None,
        "error_message": err_m.group(1).strip() if err_m else None,
        "last_applied_migration": applied[-1] if applied else None,
        "failure_classification": classify_failure(first_failed, output),
        **stmt_meta,
    }


def migration_ordinal(name: str) -> int | None:
    dirs = migration_dirs()
    return dirs.index(name) + 1 if name in dirs else None
