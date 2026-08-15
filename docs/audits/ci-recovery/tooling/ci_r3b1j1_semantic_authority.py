"""Expected semantic authority for migration 252 derived from historical SQL."""
from __future__ import annotations

import re
from typing import Any

from ci_r3b1j1_constants import TABLE_252
from ci_r3b1j_pg_identifier import split_top_level_statements


def build_migration252_semantic_authority(sql: str) -> dict[str, Any]:
    statements = split_top_level_statements(sql)
    table = {"schema": "public", "name": TABLE_252, "columns": []}
    primary_key = None
    unique_indexes: list[dict] = []
    indexes: list[dict] = []
    foreign_keys: list[dict] = []

    for ord_idx, stmt in enumerate(statements, start=1):
        if stmt.upper().startswith("CREATE TABLE"):
            col_re = re.compile(r'"([^"]+)"\s+([^,\n]+?)(?:,|\n|$)', re.I)
            body = stmt.split("(", 1)[1].rsplit(")", 1)[0]
            for line in body.split("\n"):
                line = line.strip().rstrip(",")
                if not line or line.upper().startswith("CONSTRAINT"):
                    pk = re.search(r'CONSTRAINT\s+"([^"]+)"\s+PRIMARY\s+KEY\s*\(([^)]+)\)', line, re.I)
                    if pk:
                        cols = [c.strip().strip('"') for c in pk.group(2).split(",")]
                        primary_key = {
                            "object_id": f"pk:{TABLE_252}",
                            "table": TABLE_252,
                            "columns": cols,
                            "historical_name": pk.group(1),
                            "deferrable": False,
                            "initially_deferred": False,
                        }
                    continue
                m = re.match(r'"([^"]+)"\s+(.+)', line)
                if not m:
                    continue
                col_name, rest = m.group(1), m.group(2).strip()
                nullable = "NOT NULL" not in rest.upper()
                default = None
                dm = re.search(r"DEFAULT\s+(.+)$", rest, re.I)
                if dm:
                    default = dm.group(1).strip()
                typ = rest.split("NOT NULL")[0].split("DEFAULT")[0].strip()
                table["columns"].append(
                    {
                        "name": col_name,
                        "postgres_type": typ,
                        "nullable": nullable,
                        "default": default,
                    }
                )
        elif re.search(r"CREATE\s+UNIQUE\s+INDEX", stmt, re.I):
            im = re.search(
                r'CREATE\s+UNIQUE\s+INDEX\s+"([^"]+)"\s+ON\s+"([^"]+)"\s*\(([^)]+)\)',
                stmt,
                re.I,
            )
            if im:
                cols = [c.strip().strip('"') for c in im.group(3).split(",")]
                unique_indexes.append(
                    {
                        "object_id": f"unique:{TABLE_252}:{'+'.join(cols)}",
                        "table": im.group(2),
                        "columns": cols,
                        "unique": True,
                        "historical_name": im.group(1),
                        "predicate": None,
                    }
                )
        elif re.search(r"CREATE\s+INDEX", stmt, re.I) and "UNIQUE" not in stmt.upper().split("INDEX")[0][-12:]:
            im = re.search(r'CREATE\s+INDEX\s+"([^"]+)"\s+ON\s+"([^"]+)"\s*\(([^)]+)\)', stmt, re.I)
            if im:
                cols = [c.strip().strip('"') for c in im.group(3).split(",")]
                indexes.append(
                    {
                        "object_id": f"index:{TABLE_252}:{'+'.join(cols)}",
                        "table": im.group(2),
                        "columns": cols,
                        "unique": False,
                        "historical_name": im.group(1),
                        "predicate": None,
                    }
                )
        elif "FOREIGN KEY" in stmt.upper():
            fm = re.search(
                r'ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+CONSTRAINT\s+"([^"]+)"\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+"([^"]+)"\s*\(([^)]+)\)\s*(.*)',
                stmt,
                re.I | re.S,
            )
            if fm:
                src_cols = [c.strip().strip('"') for c in fm.group(3).split(",")]
                tgt_cols = [c.strip().strip('"') for c in fm.group(5).split(",")]
                tail = fm.group(6).upper()
                foreign_keys.append(
                    {
                        "object_id": f"fk:{TABLE_252}:{'+'.join(src_cols)}->{fm.group(4)}:{'+'.join(tgt_cols)}",
                        "source_table": fm.group(1),
                        "source_columns": src_cols,
                        "target_table": fm.group(4),
                        "target_columns": tgt_cols,
                        "on_update": "CASCADE" if "ON UPDATE CASCADE" in tail else "NO ACTION",
                        "on_delete": "CASCADE" if "ON DELETE CASCADE" in tail else "NO ACTION",
                        "match_type": "SIMPLE",
                        "historical_name": fm.group(2),
                        "deferrable": False,
                        "initially_deferred": False,
                    }
                )

    return {
        "tables": [table],
        "primary_keys": [primary_key] if primary_key else [],
        "unique_indexes": unique_indexes,
        "indexes": indexes,
        "foreign_keys": foreign_keys,
        "check_constraints": [],
    }
