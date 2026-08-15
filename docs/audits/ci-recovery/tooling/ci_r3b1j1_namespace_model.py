"""Namespace-aware PostgreSQL identifier model for CI-R3B1J.1."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from ci_r3b1j_pg_identifier import normalize_pg_identifier, split_top_level_statements


class PostgresNamespaceClass(str, Enum):
    RELATION_NAMESPACE = "RELATION_NAMESPACE"
    CONSTRAINT_NAMESPACE = "CONSTRAINT_NAMESPACE"
    OTHER = "OTHER"


@dataclass
class NamespaceIdentifier:
    raw_identifier: str
    normalized_identifier: str
    schema: str
    postgres_namespace_class: PostgresNamespaceClass
    logical_object_type: str
    migration: str
    statement_ordinal: int
    parent_relation: str | None = None
    backing_relation_identifier: str | None = None
    explicit_or_implicit: str = "explicit"
    max_identifier_length: int = 63

    @property
    def collision_key(self) -> tuple:
        if self.postgres_namespace_class == PostgresNamespaceClass.RELATION_NAMESPACE:
            return (self.schema, self.postgres_namespace_class.value, self.normalized_identifier)
        if self.postgres_namespace_class == PostgresNamespaceClass.CONSTRAINT_NAMESPACE:
            return (self.schema, self.postgres_namespace_class.value, self.parent_relation or "", self.normalized_identifier)
        return (self.schema, self.postgres_namespace_class.value, self.normalized_identifier)

    def to_dict(self) -> dict[str, Any]:
        return {
            "raw_identifier": self.raw_identifier,
            "normalized_identifier": self.normalized_identifier,
            "raw_byte_length": len(self.raw_identifier.encode("utf-8")),
            "schema": self.schema,
            "postgres_namespace_class": self.postgres_namespace_class.value,
            "logical_object_type": self.logical_object_type,
            "parent_relation": self.parent_relation,
            "backing_relation_identifier": self.backing_relation_identifier,
            "statement_ordinal": self.statement_ordinal,
            "migration": self.migration,
            "explicit_or_implicit": self.explicit_or_implicit,
            "collision_key": list(self.collision_key),
        }


def extract_namespace_identifiers(migration: str, sql: str, max_len: int = 63, schema: str = "public") -> list[NamespaceIdentifier]:
    out: list[NamespaceIdentifier] = []
    for ord_idx, stmt in enumerate(split_top_level_statements(sql), start=1):
        upper = stmt.upper()
        if upper.startswith("CREATE TABLE"):
            tm = re.search(r'CREATE\s+TABLE\s+"([^"]+)"', stmt, re.I)
            table = tm.group(1) if tm else None
            if table:
                out.append(
                    NamespaceIdentifier(
                        table,
                        normalize_pg_identifier(table, max_len),
                        schema,
                        PostgresNamespaceClass.RELATION_NAMESPACE,
                        "TABLE",
                        migration,
                        ord_idx,
                        parent_relation=None,
                    )
                )
            pk = re.search(r'CONSTRAINT\s+"([^"]+)"\s+PRIMARY\s+KEY', stmt, re.I)
            if pk and table:
                pk_name = pk.group(1)
                norm = normalize_pg_identifier(pk_name, max_len)
                out.append(
                    NamespaceIdentifier(
                        pk_name,
                        normalize_pg_identifier(pk_name, max_len),
                        schema,
                        PostgresNamespaceClass.CONSTRAINT_NAMESPACE,
                        "PRIMARY_KEY_CONSTRAINT",
                        migration,
                        ord_idx,
                        parent_relation=table,
                    )
                )
                out.append(
                    NamespaceIdentifier(
                        pk_name,
                        norm,
                        schema,
                        PostgresNamespaceClass.RELATION_NAMESPACE,
                        "PRIMARY_KEY_INDEX",
                        migration,
                        ord_idx,
                        parent_relation=table,
                        backing_relation_identifier=norm,
                        explicit_or_implicit="implicit",
                    )
                )
        elif re.search(r"CREATE\s+UNIQUE\s+INDEX", stmt, re.I):
            im = re.search(r'CREATE\s+UNIQUE\s+INDEX\s+"([^"]+)"\s+ON\s+"([^"]+)"', stmt, re.I)
            if im:
                out.append(
                    NamespaceIdentifier(
                        im.group(1),
                        normalize_pg_identifier(im.group(1), max_len),
                        schema,
                        PostgresNamespaceClass.RELATION_NAMESPACE,
                        "UNIQUE_INDEX",
                        migration,
                        ord_idx,
                        parent_relation=im.group(2),
                    )
                )
        elif re.search(r"CREATE\s+INDEX", stmt, re.I) and "UNIQUE" not in upper.split("INDEX")[0][-10:]:
            im = re.search(r'CREATE\s+INDEX\s+"([^"]+)"\s+ON\s+"([^"]+)"', stmt, re.I)
            if im:
                out.append(
                    NamespaceIdentifier(
                        im.group(1),
                        normalize_pg_identifier(im.group(1), max_len),
                        schema,
                        PostgresNamespaceClass.RELATION_NAMESPACE,
                        "INDEX",
                        migration,
                        ord_idx,
                        parent_relation=im.group(2),
                    )
                )
        elif "ADD CONSTRAINT" in upper and "FOREIGN KEY" in upper:
            cm = re.search(
                r'ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+CONSTRAINT\s+"([^"]+)"\s+FOREIGN\s+KEY',
                stmt,
                re.I,
            )
            if cm:
                out.append(
                    NamespaceIdentifier(
                        cm.group(2),
                        normalize_pg_identifier(cm.group(2), max_len),
                        schema,
                        PostgresNamespaceClass.CONSTRAINT_NAMESPACE,
                        "FOREIGN_KEY_CONSTRAINT",
                        migration,
                        ord_idx,
                        parent_relation=cm.group(1),
                    )
                )
        elif "ADD CONSTRAINT" in upper and "UNIQUE" in upper:
            cm = re.search(
                r'ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+CONSTRAINT\s+"([^"]+)"\s+UNIQUE',
                stmt,
                re.I,
            )
            if cm:
                cname = cm.group(2)
                norm = normalize_pg_identifier(cname, max_len)
                out.append(
                    NamespaceIdentifier(
                        cname,
                        norm,
                        schema,
                        PostgresNamespaceClass.CONSTRAINT_NAMESPACE,
                        "UNIQUE_CONSTRAINT",
                        migration,
                        ord_idx,
                        parent_relation=cm.group(1),
                    )
                )
                out.append(
                    NamespaceIdentifier(
                        cname,
                        norm,
                        schema,
                        PostgresNamespaceClass.RELATION_NAMESPACE,
                        "UNIQUE_CONSTRAINT_INDEX",
                        migration,
                        ord_idx,
                        parent_relation=cm.group(1),
                        backing_relation_identifier=norm,
                        explicit_or_implicit="implicit",
                    )
                )
    return out


def build_namespace_collision_groups(identifiers: list[NamespaceIdentifier]) -> list[dict[str, Any]]:
    buckets: dict[tuple, list[NamespaceIdentifier]] = {}
    for ident in identifiers:
        buckets.setdefault(ident.collision_key, []).append(ident)
    groups = []
    for key, members in sorted(buckets.items(), key=lambda kv: str(kv[0])):
        if len(members) < 2:
            continue
        raw_names = {m.raw_identifier for m in members}
        if len(raw_names) < 2 and len({m.logical_object_type for m in members}) < 2:
            continue
        real = _is_real_collision(members)
        groups.append(
            {
                "schema": key[0],
                "postgres_namespace_class": key[1],
                "parent_relation": key[2] if len(key) > 3 else None,
                "normalized_identifier": key[-1],
                "member_count": len(members),
                "members": [m.to_dict() for m in members],
                "real_collision": real,
                "proof_source": "namespace_key_collision" if real else "distinct_object_types_same_key",
            }
        )
    return groups


def _is_real_collision(members: list[NamespaceIdentifier]) -> bool:
    ns = members[0].postgres_namespace_class
    if ns == PostgresNamespaceClass.RELATION_NAMESPACE:
        types = {m.logical_object_type for m in members}
        if len(types) >= 2:
            return True
        if len({m.raw_identifier for m in members}) >= 2:
            return True
    if ns == PostgresNamespaceClass.CONSTRAINT_NAMESPACE:
        return len({m.raw_identifier for m in members}) >= 2
    return False


def real_collision_groups(groups: list[dict]) -> list[dict]:
    return [g for g in groups if g.get("real_collision")]


def sweep_migrations_namespace_aware(start_migration: str, migration_dirs: list[str], mig_root, max_len: int = 63) -> dict:
    start_idx = migration_dirs.index(start_migration)
    scanned = migration_dirs[start_idx:]
    all_ids: list[NamespaceIdentifier] = []
    per_migration = []
    relation_state: set[tuple] = set()
    constraint_state: dict[tuple, set[str]] = {}

    for mig in scanned:
        path = mig_root / mig / "migration.sql"
        sql = path.read_text()
        ids = extract_namespace_identifiers(mig, sql, max_len)
        all_ids.extend(ids)
        local_groups = build_namespace_collision_groups(ids)
        for ident in ids:
            if ident.postgres_namespace_class == PostgresNamespaceClass.RELATION_NAMESPACE:
                relation_state.add((ident.schema, ident.normalized_identifier))
            elif ident.postgres_namespace_class == PostgresNamespaceClass.CONSTRAINT_NAMESPACE and ident.parent_relation:
                key = (ident.schema, ident.parent_relation)
                constraint_state.setdefault(key, set()).add(ident.normalized_identifier)
        per_migration.append(
            {
                "migration": mig,
                "identifiers_scanned": len(ids),
                "overlength_identifiers": sum(1 for i in ids if len(i.raw_identifier.encode("utf-8")) > max_len),
                "local_real_collision_groups": len(real_collision_groups(local_groups)),
            }
        )

    global_relation: dict[tuple, list[NamespaceIdentifier]] = {}
    for ident in all_ids:
        if ident.postgres_namespace_class == PostgresNamespaceClass.RELATION_NAMESPACE:
            global_relation.setdefault(ident.collision_key, []).append(ident)

    cross_groups = []
    for key, members in global_relation.items():
        if len(members) < 2:
            continue
        if len({m.raw_identifier for m in members}) < 2:
            continue
        cross_groups.append(
            {
                "schema": key[0],
                "postgres_namespace_class": key[1],
                "normalized_identifier": key[2],
                "members": [m.to_dict() for m in members],
                "real_collision": True,
                "cross_migration": len({m.migration for m in members}) > 1,
            }
        )

    return {
        "migrations_scanned": len(scanned),
        "identifiers_scanned": len(all_ids),
        "overlength_identifiers": sum(1 for i in all_ids if len(i.raw_identifier.encode("utf-8")) > max_len),
        "per_migration": per_migration,
        "cross_migration_relation_groups": cross_groups,
    }
