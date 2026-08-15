"""Complete M252 physical authority for CI-R3B1O.3."""
from __future__ import annotations

import json
import re
from typing import Any

from ci_r3b1o1_constants import M252, M252_AUTHORITY_MANIFEST, M252_TABLE, MIG_ROOT


def build_m252_complete_physical_authority() -> dict[str, Any]:
    sql = (MIG_ROOT / M252 / "migration.sql").read_text()
    approved = json.loads(M252_AUTHORITY_MANIFEST.read_text())["approved_mappings"]
    columns = []
    create_match = re.search(rf'CREATE TABLE "{re.escape(M252_TABLE)}"\s*\((.*?)\);', sql, re.I | re.S)
    body = create_match.group(1) if create_match else ""
    ordinal = 0
    for m in re.finditer(r'"([^"]+)"\s+([^,\n]+(?:\([^)]*\))?[^,\n]*)', body):
        col = m.group(1)
        if col.endswith("_pkey") or "CONSTRAINT" in col.upper():
            continue
        ordinal += 1
        definition = m.group(2).strip().rstrip(",")
        nullable = "NOT NULL" not in definition.upper()
        default = None
        dm = re.search(r"DEFAULT\s+(.+)$", definition, re.I)
        if dm:
            default = dm.group(1).strip()
            definition = definition[: dm.start()].strip()
        format_type = re.sub(r"\s+", " ", definition.replace("NOT NULL", "").strip())
        columns.append(
            {
                "ordinal": ordinal,
                "name": col,
                "format_type": format_type,
                "nullable": nullable,
                "default": default,
                "identity": False,
                "generated": False,
            }
        )
    pk = approved["organization_role_assignment_drift_reconciliation_applications_pkey"]
    unique = approved["organization_role_assignment_drift_reconciliation_applications_idempotency_key_key"]
    index = approved[
        "organization_role_assignment_drift_reconciliation_applications_organization_id_membership_id_created_at_idx"
    ]
    fk_org = approved["organization_role_assignment_drift_reconciliation_applications_organization_id_fkey"]
    fk_mem = approved["organization_role_assignment_drift_reconciliation_applications_membership_id_fkey"]
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.3",
        "source_migration": M252,
        "table": M252_TABLE,
        "columns": columns,
        "primary_key": {
            "name": pk,
            "columns": ["id"],
            "deferrable": False,
            "initially_deferred": False,
            "validated": True,
        },
        "unique_index": {
            "name": unique,
            "columns": ["idempotency_key"],
            "unique": True,
            "access_method": "btree",
            "predicate": None,
            "include_columns": [],
            "valid": True,
            "ready": True,
        },
        "composite_index": {
            "name": index,
            "columns": ["organization_id", "membership_id", "created_at"],
            "unique": False,
            "access_method": "btree",
            "predicate": None,
            "include_columns": [],
            "valid": True,
            "ready": True,
        },
        "foreign_keys": [
            {
                "name": fk_org,
                "source_table": M252_TABLE,
                "source_columns": ["organization_id"],
                "target_table": "organizations",
                "target_columns": ["id"],
                "match_type": "SIMPLE",
                "on_update": "CASCADE",
                "on_delete": "CASCADE",
                "deferrable": False,
                "initially_deferred": False,
                "validated": True,
            },
            {
                "name": fk_mem,
                "source_table": M252_TABLE,
                "source_columns": ["membership_id"],
                "target_table": "organization_memberships",
                "target_columns": ["id"],
                "match_type": "SIMPLE",
                "on_update": "CASCADE",
                "on_delete": "CASCADE",
                "deferrable": False,
                "initially_deferred": False,
                "validated": True,
            },
        ],
    }
