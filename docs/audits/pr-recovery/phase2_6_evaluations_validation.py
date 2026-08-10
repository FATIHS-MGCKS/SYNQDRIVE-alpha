#!/usr/bin/env python3
"""Pure graph and readiness validation for Phase 2.6 evaluation recovery."""

from __future__ import annotations

from collections import defaultdict, deque
from copy import deepcopy
from typing import Any, Iterable


HARD_TYPES = {
    "HARD_RUNTIME",
    "HARD_SCHEMA",
    "HARD_CONTRACT",
    "HARD_MIGRATION",
    "HARD_SECURITY",
}

KNOWN_TYPES = HARD_TYPES | {
    "SOFT_INTEGRATION",
    "SOFT_UI",
    "TEST_ONLY",
    "OBSERVABILITY_ONLY",
    "DOCUMENTATION_ONLY",
    "HISTORICAL_STACK_INHERITANCE",
    "SUPERSEDED_DEPENDENCY",
    "ALREADY_SATISFIED_BY_MAIN",
}


def _tarjan(nodes: Iterable[str], adjacency: dict[str, set[str]]) -> list[list[str]]:
    index = 0
    indices: dict[str, int] = {}
    lowlinks: dict[str, int] = {}
    stack: list[str] = []
    on_stack: set[str] = set()
    components: list[list[str]] = []

    def visit(node: str) -> None:
        nonlocal index
        indices[node] = index
        lowlinks[node] = index
        index += 1
        stack.append(node)
        on_stack.add(node)
        for successor in sorted(adjacency.get(node, set())):
            if successor not in indices:
                visit(successor)
                lowlinks[node] = min(lowlinks[node], lowlinks[successor])
            elif successor in on_stack:
                lowlinks[node] = min(lowlinks[node], indices[successor])
        if lowlinks[node] == indices[node]:
            component: list[str] = []
            while True:
                member = stack.pop()
                on_stack.remove(member)
                component.append(member)
                if member == node:
                    break
            components.append(sorted(component))

    for node in sorted(nodes):
        if node not in indices:
            visit(node)
    return sorted(components, key=lambda component: component[0])


def analyze_graph(nodes: Iterable[str], edge_pairs: Iterable[tuple[str, str]]) -> dict[str, Any]:
    """Analyze dependency->dependent edges."""

    node_set = set(nodes)
    adjacency: dict[str, set[str]] = {node: set() for node in node_set}
    reverse: dict[str, set[str]] = {node: set() for node in node_set}
    for dependency, dependent in edge_pairs:
        if dependency not in node_set or dependent not in node_set:
            continue
        adjacency[dependency].add(dependent)
        reverse[dependent].add(dependency)

    indegree = {node: len(reverse[node]) for node in node_set}
    outdegree = {node: len(adjacency[node]) for node in node_set}
    queue = deque(sorted(node for node, degree in indegree.items() if degree == 0))
    working = dict(indegree)
    topological_order: list[str] = []
    while queue:
        node = queue.popleft()
        topological_order.append(node)
        for successor in sorted(adjacency[node]):
            working[successor] -= 1
            if working[successor] == 0:
                queue.append(successor)
        queue = deque(sorted(queue))

    components = _tarjan(node_set, adjacency)
    cycles = [
        component
        for component in components
        if len(component) > 1 or component[0] in adjacency[component[0]]
    ]

    def closure(start: str, graph: dict[str, set[str]]) -> list[str]:
        visited: set[str] = set()
        pending = list(graph[start])
        while pending:
            node = pending.pop()
            if node in visited:
                continue
            visited.add(node)
            pending.extend(graph[node] - visited)
        return sorted(visited)

    return {
        "adjacency": {node: sorted(adjacency[node]) for node in sorted(node_set)},
        "reverse_adjacency": {node: sorted(reverse[node]) for node in sorted(node_set)},
        "indegree": {node: indegree[node] for node in sorted(node_set)},
        "outdegree": {node: outdegree[node] for node in sorted(node_set)},
        "roots": sorted(node for node in node_set if indegree[node] == 0),
        "leaves": sorted(node for node in node_set if outdegree[node] == 0),
        "topological_order": topological_order,
        "strongly_connected_components": components,
        "cycles": cycles,
        "transitive_dependencies": {
            node: closure(node, reverse) for node in sorted(node_set)
        },
        "transitive_dependents": {
            node: closure(node, adjacency) for node in sorted(node_set)
        },
    }


def active_edges(model: dict[str, Any]) -> list[dict[str, Any]]:
    return [edge for edge in model["dependency_edges"] if edge.get("active", False)]


def validate_model(model: dict[str, Any]) -> list[dict[str, str]]:
    errors: list[dict[str, str]] = []

    def error(code: str, detail: str) -> None:
        errors.append({"code": code, "detail": detail})

    if model.get("source_state", {}).get("main_changed_since_phase2_5"):
        error(
            "MAIN_CHANGED_REVALIDATION_REQUIRED",
            "All 44 change-sets must be revalidated before readiness can be issued.",
        )

    changesets = model["changesets"]
    packages = model["packages"]
    changeset_ids = [item["changeset_id"] for item in changesets]
    if len(changeset_ids) != len(set(changeset_ids)):
        error("DUPLICATE_CHANGESET_ID", "Change-set IDs are not unique.")
    changeset_by_id = {item["changeset_id"]: item for item in changesets}
    package_by_id = {item["package_id"]: item for item in packages}
    if len(package_by_id) != len(packages):
        error("DUPLICATE_PACKAGE_ID", "Package IDs are not unique.")
    declared_orders = [item.get("topological_order") for item in packages]
    if len(declared_orders) != len(set(declared_orders)):
        error("DUPLICATE_PACKAGE_ORDER", str(declared_orders))

    memberships: dict[str, list[str]] = defaultdict(list)
    for package in packages:
        if not package.get("changesets"):
            error("EMPTY_PACKAGE", package["package_id"])
        for changeset_id in package.get("changesets", []):
            memberships[changeset_id].append(package["package_id"])
    for changeset in changesets:
        changeset_id = changeset["changeset_id"]
        allowed_unassigned = changeset.get("status") in {"ALREADY_IN_MAIN", "DROPPED"}
        if not memberships.get(changeset_id) and not allowed_unassigned:
            error("MISSING_PACKAGE", f"{changeset_id} has no package.")
        if len(memberships.get(changeset_id, [])) > 1:
            error(
                "DUPLICATE_PACKAGE_ASSIGNMENT",
                f"{changeset_id} belongs to {memberships[changeset_id]}.",
            )
        declared_package = changeset.get("package_id")
        if memberships.get(changeset_id) and declared_package not in memberships[changeset_id]:
            error(
                "PACKAGE_MEMBERSHIP_MISMATCH",
                f"{changeset_id} declares {declared_package} but package lists differ.",
            )
    unknown_package_members = sorted(set(memberships) - set(changeset_by_id))
    for changeset_id in unknown_package_members:
        error("UNKNOWN_PACKAGE_MEMBER", changeset_id)

    prerequisite_ids = {
        prerequisite["changeset_id"]
        for prerequisite in model.get("platform_prerequisites", [])
    }
    prerequisite_fields = {
        "changeset_id",
        "package_id",
        "scope",
        "files",
        "module_owner",
        "rationale",
        "already_in_main",
        "risk",
        "test_gate",
        "integration_order",
    }
    for prerequisite in model.get("platform_prerequisites", []):
        missing = sorted(
            field for field in prerequisite_fields if not prerequisite.get(field)
            and field != "already_in_main"
        )
        if missing:
            error(
                "INCOMPLETE_PLATFORM_PREREQUISITE",
                f"{prerequisite.get('changeset_id')}: {missing}",
            )
    package_orders = {
        package["package_id"]: package.get("topological_order")
        for package in packages
    }
    graph_pairs: list[tuple[str, str]] = []
    package_pairs: set[tuple[str, str]] = set()
    for edge in active_edges(model):
        dependency = edge["dependency_changeset"]
        dependent = edge["dependent_changeset"]
        dependency_type = edge["dependency_type"]
        if dependency_type not in KNOWN_TYPES:
            error("UNKNOWN_DEPENDENCY_TYPE", f"{dependency}->{dependent}: {dependency_type}")
        dependency_known = dependency in changeset_by_id or dependency in prerequisite_ids
        if not dependency_known:
            error("UNKNOWN_DEPENDENCY", f"{dependency}->{dependent}")
            if dependency_type in HARD_TYPES:
                error(
                    "UNKNOWN_CROSS_MODULE_HARD_DEPENDENCY",
                    f"{dependency}->{dependent} lacks PLATFORM_PREREQUISITE.",
                )
        if dependent not in changeset_by_id:
            error("UNKNOWN_DEPENDENT", dependent)
            continue
        if dependency in changeset_by_id:
            graph_pairs.append((dependency, dependent))
            dependency_status = changeset_by_id[dependency].get("status")
            if dependency_type in HARD_TYPES and dependency_status in {
                "SUPERSEDED",
                "OBSOLETE",
                "ALREADY_IN_MAIN",
            }:
                error(
                    "HARD_DEPENDENCY_ON_INACTIVE_CHANGESET",
                    f"{dependency}->{dependent} targets {dependency_status}.",
                )
            source_package = changeset_by_id[dependency].get("package_id")
            target_package = changeset_by_id[dependent].get("package_id")
        else:
            source_package = next(
                (
                    prerequisite.get("package_id")
                    for prerequisite in model.get("platform_prerequisites", [])
                    if prerequisite["changeset_id"] == dependency
                ),
                None,
            )
            target_package = changeset_by_id[dependent].get("package_id")
        if source_package and target_package and source_package != target_package:
            package_pairs.add((source_package, target_package))
            source_order = package_orders.get(source_package)
            target_order = package_orders.get(target_package)
            if (
                dependency_type in HARD_TYPES
                and source_order is not None
                and target_order is not None
                and source_order >= target_order
            ):
                error(
                    "INVALID_PACKAGE_ORDER",
                    f"{dependency} ({source_package}) -> {dependent} ({target_package}).",
                )

    changeset_graph = analyze_graph(changeset_ids, graph_pairs)
    if changeset_graph["cycles"]:
        error("CHANGESET_DAG_CYCLE", str(changeset_graph["cycles"]))
    package_graph = analyze_graph(package_by_id, package_pairs)
    if package_graph["cycles"]:
        error("PACKAGE_DAG_CYCLE", str(package_graph["cycles"]))
    declared_topology = [
        package["package_id"]
        for package in sorted(
            packages, key=lambda package: package.get("topological_order", 0)
        )
    ]
    if package_graph["topological_order"] != declared_topology:
        error(
            "PACKAGE_TOPOLOGICAL_ORDER_MISMATCH",
            f"derived={package_graph['topological_order']} declared={declared_topology}",
        )

    for package in packages:
        if not package.get("entry_gate"):
            error("MISSING_ENTRY_GATE", package["package_id"])
        if not package.get("exit_gate"):
            error("MISSING_EXIT_GATE", package["package_id"])
        if package.get("risk") in {"HIGH", "CRITICAL"}:
            if not package.get("required_tests"):
                error("MISSING_REQUIRED_TESTS", package["package_id"])
            if not package.get("rollback_strategy"):
                error("MISSING_ROLLBACK", package["package_id"])
        if package.get("security_sensitive") and not package.get("security_gate"):
            error("MISSING_SECURITY_GATE", package["package_id"])
        if package.get("privacy_sensitive") and not package.get("privacy_gate"):
            error("MISSING_PRIVACY_GATE", package["package_id"])

    for changeset in changesets:
        if changeset.get("risk") in {"HIGH", "CRITICAL"}:
            if not changeset.get("tests"):
                error("MISSING_CHANGESET_TESTS", changeset["changeset_id"])
            if not changeset.get("rollback"):
                error("MISSING_CHANGESET_ROLLBACK", changeset["changeset_id"])
        if changeset.get("predictive"):
            package = package_by_id.get(changeset.get("package_id"), {})
            if "off" not in package.get("feature_flag", "").lower():
                error("PREDICTIVE_FLAG_NOT_OFF", changeset["changeset_id"])

    tenant_id = model["readiness_rules"]["tenant_foundation_changeset"]
    hard_graph = analyze_graph(
        changeset_ids,
        [
            (edge["dependency_changeset"], edge["dependent_changeset"])
            for edge in active_edges(model)
            if edge["dependency_type"] in HARD_TYPES
            and edge["dependency_changeset"] in changeset_by_id
        ],
    )
    tenant_package = changeset_by_id[tenant_id]["package_id"]
    for changeset_id in model["readiness_rules"]["protected_api_changesets"]:
        changeset_package = changeset_by_id[changeset_id]["package_id"]
        if (
            changeset_package not in package_orders
            or tenant_package not in package_orders
        ):
            continue
        if package_orders[changeset_package] < package_orders[tenant_package]:
            error("PROTECTED_API_BEFORE_TENANT_FOUNDATION", changeset_id)
        if changeset_package != tenant_package and tenant_id not in hard_graph[
            "transitive_dependencies"
        ][changeset_id]:
            error("PROTECTED_API_MISSING_TENANT_DEPENDENCY", changeset_id)

    for action_changeset in model["readiness_rules"]["material_action_changesets"]:
        ancestors = set(hard_graph["transitive_dependencies"][action_changeset])
        for required in model["readiness_rules"]["material_action_required_ancestors"]:
            if (
                required not in ancestors
                and changeset_by_id[required].get("package_id")
                != changeset_by_id[action_changeset].get("package_id")
            ):
                error(
                    "UNSAFE_MATERIAL_ACTION_ORDER",
                    f"{action_changeset} lacks {required}.",
                )
        action_package = package_by_id.get(
            changeset_by_id[action_changeset].get("package_id"), {}
        )
        action_gate_text = " ".join(
            [
                action_package.get("feature_flag", ""),
                action_package.get("exit_gate", ""),
                " ".join(action_package.get("required_tests", [])),
            ]
        ).lower()
        for required_text in ["off", "confirmation", "idempotency", "audit"]:
            if required_text not in action_gate_text:
                error(
                    "INCOMPLETE_MATERIAL_ACTION_GATE",
                    f"{action_changeset} lacks {required_text}.",
                )

    full_graph = analyze_graph(
        changeset_ids,
        [
            (edge["dependency_changeset"], edge["dependent_changeset"])
            for edge in active_edges(model)
            if edge["dependency_changeset"] in changeset_by_id
        ],
    )
    for chain_name, chain in model["readiness_rules"]["required_chains"].items():
        for dependency, dependent in zip(chain, chain[1:]):
            if dependency not in full_graph["transitive_dependencies"][dependent]:
                error(
                    "BROKEN_REQUIRED_CHAIN",
                    f"{chain_name}: {dependency}->{dependent}",
                )

    for changeset in changesets:
        changeset_id = changeset["changeset_id"]
        for gate in changeset.get("minimum_backend_gate", []):
            if gate not in full_graph["transitive_dependencies"][changeset_id]:
                error(
                    "MISSING_UI_BACKEND_GATE_EDGE",
                    f"{gate}->{changeset_id}",
                )

    return sorted(errors, key=lambda item: (item["code"], item["detail"]))


def with_recomputed_graphs(model: dict[str, Any]) -> dict[str, Any]:
    """Return a copy with source-derived graph analysis attached."""

    result = deepcopy(model)
    changeset_ids = {item["changeset_id"] for item in result["changesets"]}
    pairs = [
        (edge["dependency_changeset"], edge["dependent_changeset"])
        for edge in active_edges(result)
        if edge["dependency_changeset"] in changeset_ids
        and edge["dependent_changeset"] in changeset_ids
    ]
    result["changeset_graph"] = analyze_graph(changeset_ids, pairs)
    package_pairs = {
        (
            next(
                item["package_id"]
                for item in result["changesets"]
                if item["changeset_id"] == dependency
            ),
            next(
                item["package_id"]
                for item in result["changesets"]
                if item["changeset_id"] == dependent
            ),
        )
        for dependency, dependent in pairs
    }
    package_pairs = {pair for pair in package_pairs if pair[0] != pair[1]}
    result["package_graph"] = analyze_graph(
        [package["package_id"] for package in result["packages"]],
        package_pairs,
    )
    return result
