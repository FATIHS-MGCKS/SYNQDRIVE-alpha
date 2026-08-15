"""Compare schema.prisma M252 model to canonical physical authority."""
from __future__ import annotations

import re
from typing import Any

from ci_r3b1m_constants import SCHEMA_PRISMA
from ci_r3b1o1_m252_authority import build_m252_physical_authority


def extract_m252_prisma_model() -> dict[str, Any]:
    text = SCHEMA_PRISMA.read_text()
    m = re.search(
        r"model OrganizationRoleAssignmentDriftReconciliationApplication\s*\{(.*?)\n\}",
        text,
        re.S,
    )
    if not m:
        raise RuntimeError("M252 Prisma model not found")
    body = m.group(1)
    table_map = re.search(r'@@map\("([^"]+)"\)', body)
    fields = []
    for fm in re.finditer(r"^  (\w+)\s+([^\n]+)$", body, re.M):
        name, rest = fm.group(1), fm.group(2)
        col_map = re.search(r'@map\("([^"]+)"\)', rest)
        fields.append(
            {
                "field": name,
                "raw": rest.strip(),
                "column_map": col_map.group(1) if col_map else None,
                "is_id": "@id" in rest,
                "is_unique": "@unique" in rest,
            }
        )
    relations = []
    for rm in re.finditer(
        r"(\w+)\s+(\w+)\s+@relation\(fields:\s*\[([^\]]+)\].*?map:\s*\"([^\"]+)\"",
        body,
        re.S,
    ):
        relations.append(
            {
                "field": rm.group(1),
                "target_model": rm.group(2),
                "fields": [x.strip() for x in rm.group(3).split(",")],
                "constraint_map": rm.group(4),
            }
        )
    index_match = re.search(r"@@index\(\[([^\]]+)\]\)", body)
    unique_field = next((f for f in fields if f["is_unique"]), None)
    return {
        "model": "OrganizationRoleAssignmentDriftReconciliationApplication",
        "table_map": table_map.group(1) if table_map else None,
        "fields": fields,
        "relations": relations,
        "index_fields": [x.strip() for x in index_match.group(1).split(",")] if index_match else [],
        "unique_field": unique_field,
    }


def compare_prisma_to_m252_authority() -> dict[str, Any]:
    authority = build_m252_physical_authority()
    prisma = extract_m252_prisma_model()
    approved = authority["approved_identifier_mappings"]
    comparisons = []

    def add(component: str, expected: str | None, actual: str | None, decision: str, classification: str):
        comparisons.append(
            {
                "component": component,
                "expected_physical": expected,
                "prisma_projection": actual,
                "classification": classification,
                "authority_decision": decision,
            }
        )

    table_ok = prisma["table_map"] == authority["table"]
    add(
        "table_map",
        authority["table"],
        prisma["table_map"],
        "NO_CHANGE_REQUIRED" if table_ok else "PRISMA_MAPPING_ALIGNMENT_REQUIRED",
        "MATCH" if table_ok else "PRISMA_MAPPING_DRIFT",
    )

    pk_expected = authority["primary_key"]["name"]
    add(
        "primary_key",
        pk_expected,
        "implicit @id (Prisma-managed PK name)",
        "NO_CHANGE_REQUIRED",
        "NON_SEMANTIC_PRISMA_DIFFERENCE",
    )

    uq_expected = authority["unique_constraints"][0]["name"]
    prisma_uq = f'{authority["table"]}_idempotency_key_key'  # default Prisma naming
    add(
        "idempotency_unique",
        uq_expected,
        prisma["unique_field"]["field"] if prisma["unique_field"] else None,
        "PRISMA_MAPPING_ALIGNMENT_REQUIRED",
        "PRISMA_MAPPING_DRIFT",
    )

    idx_expected = authority["indexes"][0]["name"]
    add(
        "organization_membership_created_index",
        idx_expected,
        str(prisma["index_fields"]),
        "PRISMA_MAPPING_ALIGNMENT_REQUIRED",
        "PRISMA_MAPPING_DRIFT",
    )

    fk_org_expected = approved["organization_role_assignment_drift_reconciliation_applications_organization_id_fkey"]
    fk_mem_expected = approved["organization_role_assignment_drift_reconciliation_applications_membership_id_fkey"]
    org_rel = next((r for r in prisma["relations"] if "organization" in r["field"].lower()), None)
    mem_rel = next((r for r in prisma["relations"] if "membership" in r["field"].lower()), None)
    add(
        "organization_fk_map",
        fk_org_expected,
        org_rel["constraint_map"] if org_rel else None,
        "PRISMA_MAPPING_ALIGNMENT_REQUIRED" if org_rel and org_rel["constraint_map"] != fk_org_expected else "NO_CHANGE_REQUIRED",
        "MATCH" if org_rel and org_rel["constraint_map"] == fk_org_expected else "PRISMA_MAPPING_DRIFT",
    )
    add(
        "membership_fk_map",
        fk_mem_expected,
        mem_rel["constraint_map"] if mem_rel else None,
        "PRISMA_MAPPING_ALIGNMENT_REQUIRED" if mem_rel and mem_rel["constraint_map"] != fk_mem_expected else "NO_CHANGE_REQUIRED",
        "MATCH" if mem_rel and mem_rel["constraint_map"] == fk_mem_expected else "PRISMA_MAPPING_DRIFT",
    )

    drift_count = sum(1 for c in comparisons if c["classification"] == "PRISMA_MAPPING_DRIFT")
    alignment_required = any(c["authority_decision"] == "PRISMA_MAPPING_ALIGNMENT_REQUIRED" for c in comparisons)
    ambiguous = any(c["authority_decision"] == "AUTHORITY_AMBIGUOUS" for c in comparisons)
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.1",
        "prisma_model": prisma,
        "comparisons": comparisons,
        "drift_count": drift_count,
        "source_alignment_required": alignment_required,
        "authority_ambiguous": ambiguous,
        "m252_scope_expected_nonzero": alignment_required,
    }


def build_future_schema_alignment_contract(comparison: dict[str, Any]) -> dict[str, Any]:
    required = [
        c
        for c in comparison["comparisons"]
        if c["authority_decision"] == "PRISMA_MAPPING_ALIGNMENT_REQUIRED"
    ]
    return {
        "schema_version": 1,
        "phase": "CI-R3B1O.1",
        "required_before_production": comparison["source_alignment_required"],
        "changes": [
            {
                "model": "OrganizationRoleAssignmentDriftReconciliationApplication",
                "component": item["component"],
                "current_mapping": item["prisma_projection"],
                "canonical_mapping": item["expected_physical"],
                "required_source_change": f'Align Prisma map/name for {item["component"]} to {item["expected_physical"]}',
            }
            for item in required
        ],
    }
