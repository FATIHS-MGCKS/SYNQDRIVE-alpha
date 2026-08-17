"""Complete physical index owner inventory for CI-R3B1M positive ownership."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from ci_r3b1l1_authority import load_production_catalog
from ci_r3b1l1_constants import BOOTSTRAP_TABLES
from ci_r3b1m_constants import DATA, MIG_ROOT, REPO, SCHEMA_PRISMA, pg_trunc_identifier

INVENTORY_OUT = DATA / "ci-r3b1m-index-owner-inventory-2026-08.json"

CREATE_TABLE_RE = re.compile(
    r'CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+"?([^"\s(]+)"?',
    re.I,
)
INDEX_CREATE_RE = re.compile(
    r'CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+"?([^"\s]+)"?\s+ON\s+"?([^"\s(]+)"?',
    re.I,
)
CONSTRAINT_UNIQUE_RE = re.compile(
    r'ADD\s+CONSTRAINT\s+"([^"]+)"\s+UNIQUE',
    re.I | re.S,
)
ALTER_ADD_UNIQUE_RE = re.compile(
    r'ALTER\s+TABLE\s+"([^"]+)"[\s\S]*?ADD\s+CONSTRAINT\s+"([^"]+)"\s+UNIQUE',
    re.I,
)
ALTER_TABLE_RE = re.compile(r'ALTER\s+TABLE\s+"?([^"\s]+)"?', re.I)
ALTER_INDEX_RENAME_RE = re.compile(
    r'ALTER\s+INDEX\s+"([^"]+)"\s+RENAME\s+TO\s+"([^"]+)"',
    re.I,
)
DROP_INDEX_RE = re.compile(r'DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?"([^"]+)"', re.I)


def _schema_prisma_index_maps() -> tuple[dict[str, str], dict[str, str]]:
    text = SCHEMA_PRISMA.read_text()
    unique_to_table: dict[str, str] = {}
    index_to_table: dict[str, str] = {}
    for model_block in re.finditer(r"model\s+\w+\s*\{(.*?)\n\}", text, re.S):
        body = model_block.group(1)
        map_m = re.search(r'@@map\("([^"]+)"\)', body)
        table = map_m.group(1) if map_m else None
        if not table:
            continue
        for uniq in re.finditer(r'@@unique\([^)]*name:\s*"([^"]+)"', body):
            unique_to_table[uniq.group(1)] = table
        for idx in re.finditer(r'@@index\([^)]*map:\s*"([^"]+)"', body):
            index_to_table[idx.group(1)] = table
        for idx in re.finditer(r'@@index\([^)]*name:\s*"([^"]+)"', body):
            index_to_table[idx.group(1)] = table
    return unique_to_table, index_to_table


def _scan_migrations() -> tuple[list[dict[str, Any]], dict[str, str]]:
    records: list[dict[str, Any]] = []
    alias_owner: dict[str, str] = {}

    for path in sorted(MIG_ROOT.glob("*/migration.sql")):
        migration = path.parent.name
        text = path.read_text(errors="replace")
        migration_sha = hashlib.sha256(text.encode("utf-8")).hexdigest()
        current_table: str | None = None
        for line in text.splitlines():
            alt = ALTER_TABLE_RE.search(line)
            if alt:
                current_table = alt.group(1)

        for idx_m in INDEX_CREATE_RE.finditer(text):
            index_name, owner = idx_m.group(1), idx_m.group(2)
            stmt = idx_m.group(0).strip().replace("\n", " ")[:500]
            rec = {
                "index": index_name,
                "schema": "public",
                "owner_table": owner,
                "owner_class": "R3B" if owner in BOOTSTRAP_TABLES else "OUT_OF_SCOPE",
                "proof_type": "MIGRATION_CREATE_INDEX",
                "proof_source": str(path.relative_to(REPO)),
                "proof_sha256": migration_sha,
                "creator_migration": migration,
                "creator_statement": stmt,
            }
            records.append(rec)
            alias_owner[index_name] = owner
            trunc = pg_trunc_identifier(index_name)
            if trunc != index_name:
                alias_owner.setdefault(trunc, owner)
                records.append(
                    {
                        **rec,
                        "index": trunc,
                        "proof_type": "MIGRATION_PG_TRUNCATED_IDENTIFIER",
                        "proof_source": f"{path.relative_to(REPO)}#trunc({index_name})",
                    }
                )

        for table, cname in ALTER_ADD_UNIQUE_RE.findall(text):
            rec = {
                "index": cname,
                "schema": "public",
                "owner_table": table,
                "owner_class": "R3B" if table in BOOTSTRAP_TABLES else "OUT_OF_SCOPE",
                "proof_type": "MIGRATION_UNIQUE_CONSTRAINT",
                "proof_source": str(path.relative_to(REPO)),
                "proof_sha256": migration_sha,
                "creator_migration": migration,
                "creator_statement": f'ALTER TABLE "{table}" ADD CONSTRAINT "{cname}" UNIQUE ...',
            }
            records.append(rec)
            alias_owner[cname] = table
            trunc = pg_trunc_identifier(cname)
            alias_owner.setdefault(trunc, table)
            if trunc != cname:
                records.append({**rec, "index": trunc, "proof_type": "MIGRATION_PG_TRUNCATED_IDENTIFIER"})

        for line in text.splitlines():
            con_m = CONSTRAINT_UNIQUE_RE.search(line)
            if con_m and current_table:
                cname = con_m.group(1)
                if cname in alias_owner:
                    continue
                rec = {
                    "index": cname,
                    "schema": "public",
                    "owner_table": current_table,
                    "owner_class": "R3B" if current_table in BOOTSTRAP_TABLES else "OUT_OF_SCOPE",
                    "proof_type": "MIGRATION_UNIQUE_CONSTRAINT",
                    "proof_source": str(path.relative_to(REPO)),
                    "proof_sha256": migration_sha,
                    "creator_migration": migration,
                    "creator_statement": line.strip()[:500],
                }
                records.append(rec)
                alias_owner[cname] = current_table
                trunc = pg_trunc_identifier(cname)
                if trunc != cname:
                    alias_owner.setdefault(trunc, current_table)

        for ren in ALTER_INDEX_RENAME_RE.finditer(text):
            old_name, new_name = ren.group(1), ren.group(2)
            owner = alias_owner.get(old_name)
            if owner:
                alias_owner[new_name] = owner
                records.append(
                    {
                        "index": new_name,
                        "schema": "public",
                        "owner_table": owner,
                        "owner_class": "R3B" if owner in BOOTSTRAP_TABLES else "OUT_OF_SCOPE",
                        "proof_type": "MIGRATION_INDEX_RENAME",
                        "proof_source": str(path.relative_to(REPO)),
                        "proof_sha256": migration_sha,
                        "creator_migration": migration,
                        "creator_statement": ren.group(0).strip()[:500],
                        "prior_index": old_name,
                    }
                )
                trunc_new = pg_trunc_identifier(new_name)
                if trunc_new != new_name:
                    alias_owner.setdefault(trunc_new, owner)

    return records, alias_owner


def build_index_owner_inventory(catalog: dict[str, Any] | None = None) -> dict[str, Any]:
    catalog = catalog or load_production_catalog()
    migration_records, migration_alias = _scan_migrations()
    schema_unique, schema_index = _schema_prisma_index_maps()

    records: list[dict[str, Any]] = list(migration_records)
    lookup: dict[str, dict[str, Any]] = {}

    def add_lookup(index: str, owner: str, proof_type: str, proof_source: str, owner_class: str | None = None):
        oc = owner_class or ("R3B" if owner in BOOTSTRAP_TABLES else "OUT_OF_SCOPE")
        rec = {
            "index": index,
            "schema": "public",
            "owner_table": owner,
            "owner_class": oc,
            "proof_type": proof_type,
            "proof_source": proof_source,
            "proof_sha256": sha256_file_or_text(proof_source),
        }
        records.append(rec)
        if index not in lookup:
            lookup[index] = rec

    for table_row in catalog["tables"]:
        table = table_row["name"]
        for idx in table_row.get("indexes", []):
            name = idx["index_name"]
            add_lookup(name, table, "R3B_REPLAY_CATALOG", "ci-r3a7-production-catalog-evidence-2026-08.json")

    for name, owner in schema_unique.items():
        add_lookup(name, owner, "PRISMA_UNIQUE_METADATA", str(SCHEMA_PRISMA.relative_to(REPO)))
    for name, owner in schema_index.items():
        add_lookup(name, owner, "PRISMA_INDEX_METADATA", str(SCHEMA_PRISMA.relative_to(REPO)))

    for name, owner in migration_alias.items():
        add_lookup(name, owner, "MIGRATION_ALIAS_LOOKUP", "migration inventory aggregate")

    # dedupe records by index+proof_type
    seen = set()
    unique_records = []
    for rec in records:
        key = (rec["index"], rec.get("proof_type"), rec.get("owner_table"))
        if key in seen:
            continue
        seen.add(key)
        unique_records.append(rec)

    out = {
        "schema_version": 1,
        "phase": "CI-R3B1M",
        "prefix_inference_acceptance": False,
        "record_count": len(unique_records),
        "lookup_count": len(lookup),
        "records": unique_records,
        "lookup": lookup,
    }
    INVENTORY_OUT.write_text(json.dumps(out, indent=2) + "\n")
    return out


def sha256_file_or_text(source: str) -> str:
    path = REPO / source if not source.startswith("ci-r3") else REPO / "docs/audits/ci-recovery" / source.split("#")[0]
    if Path(source).exists():
        return hashlib.sha256(Path(source).read_bytes()).hexdigest()
    p = REPO / source
    if p.exists():
        return hashlib.sha256(p.read_bytes()).hexdigest()
    p2 = REPO / "docs/audits/ci-recovery" / source
    if p2.exists():
        return hashlib.sha256(p2.read_bytes()).hexdigest()
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def resolve_index_from_inventory(index_name: str, inventory: dict[str, Any]) -> tuple[str, str | None, str, str | None]:
    """Return owner_resolution, owner_table, proof_type, diagnostic_hint."""
    lookup = inventory.get("lookup", {})
    rec = lookup.get(index_name)
    if rec:
        owner = rec["owner_table"]
        if rec["owner_class"] == "R3B":
            return "OWNER_R3B", owner, rec["proof_type"], None
        return "OWNER_OUT_OF_SCOPE", owner, rec["proof_type"], None
    return "OWNER_UNKNOWN", None, None, None


def prefix_diagnostic_hint(index_name: str, schema_tables: list[str]) -> str | None:
    for table in schema_tables:
        if index_name == table or index_name.startswith(f"{table}_"):
            return f"diagnostic_prefix_match:{table}"
    return None
