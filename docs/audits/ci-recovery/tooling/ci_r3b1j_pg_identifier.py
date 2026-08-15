"""PostgreSQL identifier normalization, collision detection, and safe name generation."""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import Any


@dataclass
class IdentifierRecord:
    statement_ordinal: int
    object_type: str
    raw_identifier: str
    explicit: bool
    source: str = "migration_sql"

    @property
    def raw_byte_length(self) -> int:
        return len(self.raw_identifier.encode("utf-8"))

    @property
    def raw_char_length(self) -> int:
        return len(self.raw_identifier)

    def normalized(self, max_len: int) -> str:
        return normalize_pg_identifier(self.raw_identifier, max_len)

    @property
    def truncated(self) -> bool:
        return self.raw_byte_length > self._max_len

    _max_len: int = 63

    def to_dict(self, max_len: int) -> dict[str, Any]:
        norm = self.normalized(max_len)
        return {
            "statement_ordinal": self.statement_ordinal,
            "object_type": self.object_type,
            "raw_identifier": self.raw_identifier,
            "raw_byte_length": self.raw_byte_length,
            "raw_char_length": self.raw_char_length,
            "normalized_identifier": norm,
            "normalized_byte_length": len(norm.encode("utf-8")),
            "truncated": self.raw_byte_length > max_len,
            "explicit": self.explicit,
            "source": self.source,
        }


def normalize_pg_identifier(name: str, max_len: int = 63) -> str:
    """PostgreSQL truncates identifiers to max_len bytes (UTF-8)."""
    encoded = name.encode("utf-8")
    if len(encoded) <= max_len:
        return name
    truncated = encoded[:max_len]
    return truncated.decode("utf-8", errors="ignore")


def read_max_identifier_length(cfg, db: str, psql_fn) -> int:
    proc = psql_fn(cfg, db, "SHOW max_identifier_length;", tuples_only=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)
    return int(proc.stdout.strip())


ABBREV_SEGMENTS = {
    "organization": "org",
    "assignment": "asgn",
    "reconciliation": "recon",
    "applications": "apps",
    "idempotency": "idem",
    "membership": "mbr",
}


def _abbreviate_relation(base: str) -> str:
    parts = base.split("_")
    out: list[str] = []
    for part in parts:
        out.append(ABBREV_SEGMENTS.get(part, part))
    return "_".join(out)


def generate_safe_name(components: list[str], suffix: str, max_len: int = 63) -> str:
    """Deterministic safe identifier generator with optional hash suffix."""
    base = "_".join(c for c in components if c)
    candidate = f"{base}_{suffix}" if suffix else base
    if len(candidate.encode("utf-8")) <= max_len:
        return candidate
    abbreviated = _abbreviate_relation(base)
    candidate = f"{abbreviated}_{suffix}" if suffix else abbreviated
    if len(candidate.encode("utf-8")) <= max_len:
        return candidate
    digest = hashlib.sha256(candidate.encode("utf-8")).hexdigest()[:8]
    trimmed = abbreviated
    while len(f"{trimmed}_{suffix}_{digest}".encode("utf-8")) > max_len and len(trimmed) > 8:
        trimmed = trimmed[:-1]
    return f"{trimmed}_{suffix}_{digest}"


CANONICAL_RENAMES: dict[str, str] = {
    "organization_role_assignment_drift_reconciliation_applications_pkey": "org_role_asgn_drift_recon_apps_pkey",
    "organization_role_assignment_drift_reconciliation_applications_idempotency_key_key": "org_role_asgn_drift_recon_apps_idem_key",
    "organization_role_assignment_drift_reconciliation_applications_organization_id_membership_id_created_at_idx": "org_role_asgn_drift_recon_apps_org_mbr_created_idx",
    "organization_role_assignment_drift_reconciliation_applications_organization_id_fkey": "org_role_asgn_drift_recon_apps_org_id_fkey",
    "organization_role_assignment_drift_reconciliation_applications_membership_id_fkey": "org_role_asgn_drift_recon_apps_mbr_id_fkey",
}


def build_collision_groups(records: list[IdentifierRecord], max_len: int) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for rec in records:
        norm = rec.normalized(max_len)
        groups.setdefault(norm, []).append(rec.to_dict(max_len))
    collisions = []
    for norm, members in sorted(groups.items()):
        if len(members) > 1:
            types = {m["object_type"] for m in members}
            collisions.append(
                {
                    "schema": "public",
                    "normalized_identifier": norm,
                    "normalized_byte_length": len(norm.encode("utf-8")),
                    "member_count": len(members),
                    "object_types": sorted(types),
                    "members": members,
                    "incompatible": len(types) > 1 or len(members) > 1,
                }
            )
    return collisions


def extract_migration252_identifiers(sql: str) -> list[IdentifierRecord]:
    records: list[IdentifierRecord] = []
    statements = split_top_level_statements(sql)
    for idx, stmt in enumerate(statements, start=1):
        upper = stmt.upper()
        if upper.startswith("CREATE TABLE"):
            m = re.search(r'CREATE\s+TABLE\s+"([^"]+)"', stmt, re.I)
            if m:
                records.append(IdentifierRecord(idx, "TABLE", m.group(1), True))
            pk = re.search(r'CONSTRAINT\s+"([^"]+)"\s+PRIMARY\s+KEY', stmt, re.I)
            if pk:
                records.append(IdentifierRecord(idx, "PRIMARY_KEY_CONSTRAINT", pk.group(1), True))
                records.append(
                    IdentifierRecord(idx, "PRIMARY_KEY_INDEX", pk.group(1), False, "implicit_pg_pk_index")
                )
        elif re.search(r"CREATE\s+UNIQUE\s+INDEX", stmt, re.I):
            m = re.search(r'CREATE\s+UNIQUE\s+INDEX\s+"([^"]+)"', stmt, re.I)
            if m:
                records.append(IdentifierRecord(idx, "UNIQUE_INDEX", m.group(1), True))
        elif re.search(r"CREATE\s+INDEX", stmt, re.I):
            m = re.search(r'CREATE\s+INDEX\s+"([^"]+)"', stmt, re.I)
            if m:
                records.append(IdentifierRecord(idx, "INDEX", m.group(1), True))
        elif "ADD CONSTRAINT" in upper and "FOREIGN KEY" in upper:
            m = re.search(r'ADD\s+CONSTRAINT\s+"([^"]+)"', stmt, re.I)
            if m:
                records.append(IdentifierRecord(idx, "FOREIGN_KEY_CONSTRAINT", m.group(1), True))
    return records


def split_top_level_statements(sql: str) -> list[str]:
    """Split SQL into top-level statements respecting quotes and comments."""
    statements: list[str] = []
    buf: list[str] = []
    i = 0
    in_single = False
    in_double = False
    dollar_tag: str | None = None
    n = len(sql)
    while i < n:
        ch = sql[i]
        if dollar_tag is None and not in_single and not in_double:
            if sql.startswith("--", i):
                while i < n and sql[i] != "\n":
                    i += 1
                continue
            if ch == "$":
                m = re.match(r"\$([A-Za-z0-9_]*)\$", sql[i:])
                if m:
                    dollar_tag = m.group(0)
                    buf.append(dollar_tag)
                    i += len(dollar_tag)
                    continue
        if dollar_tag:
            if sql.startswith(dollar_tag, i):
                buf.append(dollar_tag)
                i += len(dollar_tag)
                dollar_tag = None
                continue
            buf.append(ch)
            i += 1
            continue
        if ch == "'" and not in_double:
            in_single = not in_single
            buf.append(ch)
            i += 1
            continue
        if ch == '"' and not in_single:
            in_double = not in_double
            buf.append(ch)
            i += 1
            continue
        if ch == ";" and not in_single and not in_double:
            stmt = "".join(buf).strip()
            if stmt:
                statements.append(stmt)
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        statements.append(tail)
    return statements


def apply_identifier_renames(sql: str, renames: dict[str, str]) -> str:
    out = sql
    for old, new in sorted(renames.items(), key=lambda kv: len(kv[0]), reverse=True):
        out = out.replace(f'"{old}"', f'"{new}"')
    return out


def validate_canonical_names(max_len: int) -> dict[str, Any]:
    post_norm: dict[str, list[str]] = {}
    details = []
    for raw, canonical in CANONICAL_RENAMES.items():
        blen = len(canonical.encode("utf-8"))
        norm = normalize_pg_identifier(canonical, max_len)
        post_norm.setdefault(norm, []).append(canonical)
        details.append(
            {
                "raw_historical_name": raw,
                "canonical_corrected_name": canonical,
                "canonical_byte_length": blen,
                "within_limit": blen <= max_len,
                "normalized_name": norm,
            }
        )
    post_collisions = {k: v for k, v in post_norm.items() if len(v) > 1}
    return {
        "details": details,
        "post_normalization_collisions": len(post_collisions),
        "collision_groups": post_collisions,
        "pass": len(post_collisions) == 0 and all(d["within_limit"] for d in details),
    }
