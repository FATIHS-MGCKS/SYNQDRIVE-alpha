#!/usr/bin/env python3
"""Generate the read-only Phase-2 PR recovery decision artifacts."""

from __future__ import annotations

import csv
import datetime as dt
import hashlib
import json
import re
import subprocess
from collections import Counter, defaultdict, deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "docs/audits/pr-recovery"
PHASE1 = OUT / "open-pr-inventory-2026-08.json"
CURRENT_PAGES = Path("/tmp/phase2-current-pr-pages.json")
SPECIAL_CURRENT = Path("/tmp/phase2-current-special-prs.json")
REPO = "FATIHS-MGCKS/SYNQDRIVE-alpha"
PHASE1_MAIN = "2d721a902feb56101eb9992249f1859ff64024cb"
AUDIT_BRANCH = "audit/repository-pr-recovery-phase2-2026-08"
RUN_AT = "2026-08-10T16:23:35Z"


def run(*args: str, check: bool = True, stdin: str | None = None) -> subprocess.CompletedProcess:
    result = subprocess.run(args, cwd=ROOT, text=True, input=stdin, capture_output=True)
    if check and result.returncode:
        raise RuntimeError(f"{' '.join(args)} failed ({result.returncode}): {result.stderr}")
    return result


def git(*args: str, check: bool = True) -> str:
    return run("git", *args, check=check).stdout.strip()


def parse_concatenated(path: Path) -> list[dict]:
    text = path.read_text()
    decoder, position, values = json.JSONDecoder(), 0, []
    while position < len(text):
        while position < len(text) and text[position].isspace():
            position += 1
        if position < len(text):
            value, position = decoder.raw_decode(text, position)
            values.append(value)
    return values


def slug(value: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return value[:70] or "general"


def md(value: object) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")


def csv_list(values: list | set) -> str:
    return json.dumps(sorted(values), ensure_ascii=False, separators=(",", ":"))


def is_doc(path: str) -> bool:
    lower = path.lower()
    return (
        lower.startswith(("docs/", "architecture/", ".cursor/rules/"))
        or lower.endswith((".md", ".mdx", ".rst", ".adoc"))
        or lower.rsplit("/", 1)[-1] in {"agents.md", "readme.md", "changelog.md"}
        or lower in {
            "frontend/src/master/components/changesview.tsx",
            "frontend/src/master/components/architekturview.tsx",
        }
    )


MODULE_RULES: list[tuple[str, str]] = [
    ("evaluations", r"evaluat|financial-insight|analytics|metric-registry|receivable|cashflow|forecast|feature-store|data-quality|lineage"),
    ("vehicle-detail", r"vehicle[-_]?detail|vehicle[-_]?overview|vehicle-operational"),
    ("fleet", r"(^|[/_.-])fleet([/_.-]|$)"),
    ("trips", r"(^|[/_.-])trips?([/_.-]|$)|driving[-_](analysis|intelligence)|waypoint|segment-candidate"),
    ("health", r"health|battery|brake|tire|tyre|oil[-_]?change|dtc|error[-_]?code|vehicle-warning"),
    ("connectivity", r"connectivity|telemetry|high[-_]?mobility|(^|/)dimo(/|[-_.])|vehicle[-_]?signal"),
    ("bookings", r"bookings?|reservation|pickup[-_]?gate|handover"),
    ("customers", r"customers?|customer[-_]?verification|prospects?"),
    ("documents", r"documents?|document[-_]?extraction|document[-_]?intake|ocr"),
    ("notifications", r"notification|outbound[-_]?email|resend|email[-_]?delivery"),
    ("workflow-automation", r"workflow|task[-_]?automation|(^|[/_.-])tasks?([/_.-]|$)|outbox"),
    ("operator-app", r"operator[-_]?app|(^|[/_.-])operator([/_.-]|$)"),
    ("billing-subscriptions", r"billing|subscription|entitlement|pricing|products?"),
    ("stripe-payments", r"stripe|payments?|deposit"),
    ("voice-ai", r"voice[-_]?|twilio|elevenlabs|pstn"),
    ("whatsapp-communications", r"whatsapp"),
    ("integrations", r"integrations?|webhook|didit"),
    ("roles-access", r"(^|[/_.-])iam([/_.-]|$)|roles?|access[-_]?control|(^|[/_.-])auth([/_.-]|$)|mfa|users?|session"),
    ("legal-compliance", r"legal|compliance|gdpr|retention|rental[-_]?rules|fines?|insurances?"),
    ("master-admin", r"master[-_]?admin|platform[-_]?admin|control[-_]?plane"),
    ("observability", r"observability|prometheus|alertmanager|metrics?|tracing|monitoring"),
    ("infrastructure", r"(^|/)\.github/|(^|/)\.cursor/|docker|compose|infrastructure|(^|/)infra/|scripts/ops|deploy|backup|package-lock|prisma/migrations|clickhouse|redis"),
    ("administration", r"administration|organizations?|stations?|vendors?|support|business[-_]?audit"),
]
MODULE_RX = [(name, re.compile(pattern, re.I)) for name, pattern in MODULE_RULES]


def file_modules(path: str) -> list[str]:
    if is_doc(path):
        return ["documentation"]
    matches = [name for name, regex in MODULE_RX if regex.search(path)]
    if not matches:
        if path.startswith(("backend/src/shared/", "frontend/src/components/", "frontend/src/lib/")):
            return ["cross-cutting-platform"]
        return ["unknown"]
    product = [name for name in matches if name not in {"infrastructure", "observability", "documentation"}]
    if len(set(product)) > 1:
        return sorted(set(product))
    return sorted(set(matches))


EVALUATION_CAPABILITIES: list[tuple[str, str]] = [
    ("Metric Registry", r"metric.registry|metric-definition|metricregistry"),
    ("Calculation Versioning", r"calculation.version|formula.version|versioned.calculation"),
    ("Timezone / Period Model", r"timezone|time.zone|period.model|reporting.period"),
    ("Metric Response Contract", r"metric.response|metric.contract|metric.dto"),
    ("Money Domain", r"money.domain|money.value|minor.unit|decimal.money"),
    ("Receivables", r"receivable|accounts.receivable|outstanding"),
    ("Revenue / Cashflow", r"revenue|cash.?flow"),
    ("Multi-Currency", r"multi.?currency|exchange.rate|currency"),
    ("Analytics Summary", r"analytics.summary|summary.service|summary.dto"),
    ("Grouped Insights", r"grouped.insight|insight.group"),
    ("Filter Architecture", r"filter.architecture|analytics.filter|evaluation.filter"),
    ("Tenant Isolation", r"tenant.isolation|org.scope|organization.id|tenant.id"),
    ("Analytics Contracts", r"analytics.contract|evaluation.contract"),
    ("Cost Model", r"cost.model|cost.breakdown|total.cost"),
    ("Utilization", r"utilization|utilisation"),
    ("Strength Detection", r"strength.detection|strengths?"),
    ("Weakness Detection", r"weakness.detection|weaknesses?"),
    ("Driver / Influence Analysis", r"driver.analysis|influence|factor.analysis"),
    ("Data Quality", r"data.quality|quality.score"),
    ("Freshness / Lineage", r"freshness|lineage|provenance"),
    ("Metric State UX", r"metric.state|metricstatus|metric-status"),
    ("Data Quality Panel", r"data.quality.panel|qualitypanel"),
    ("Information Architecture", r"information.architecture|evaluations?.page|evaluations?.tsx"),
    ("Executive KPI Strip", r"executive.kpi|kpistrip|kpi-strip"),
    ("Strength / Weakness Cockpit", r"strength.*weakness|weakness.*strength|cockpit"),
    ("Risk / Cost Visualizations", r"risk.visual|cost.visual|riskchart|costchart"),
    ("Mobile Readiness", r"mobile|responsive|breakpoint"),
    ("Accessibility / i18n", r"accessibility|a11y|i18n|translation"),
    ("Recommendation Domain", r"recommendation.domain|recommendation.model"),
    ("Action Center", r"action.center|actioncenter"),
    ("Action Integrations", r"action.integration|workflow.action|create.task"),
    ("Impact Measurement", r"impact.measure|recommendation.impact"),
    ("Predictive Analytics Architecture", r"predictive.analytics|forecast.architecture"),
    ("Feature Store", r"feature.store|featurestore"),
    ("Demand / Revenue / Utilization Forecast", r"demand.forecast|revenue.forecast|utilization.forecast"),
    ("Maintenance / Failure Forecast", r"maintenance.forecast|failure.forecast|predictive.maintenance"),
    ("Backtesting / Drift", r"backtest|drift"),
    ("Forecast UX", r"forecast.*(tsx|component|view)|forecast.ux"),
    ("GDPR", r"gdpr|data.protection|privacy"),
    ("Roles / Permissions", r"permission|rbac|role.guard|role.access"),
    ("Audit Logging", r"audit.log|audit.event|activity.log"),
]
EVAL_RX = [(name, re.compile(pattern, re.I | re.S)) for name, pattern in EVALUATION_CAPABILITIES]
EVAL_ORDER = [name for name, _ in EVALUATION_CAPABILITIES]
EVAL_EXACT_SPECS = [
    ("Metric Registry", "850b20bc632e", "MAIN_BASELINE"),
    ("Calculation Versioning", "312ee93f5315", "MAIN_BASELINE"),
    ("Timezone / Period Model", "f23e6bdab173", "RECOVER"),
    ("Unified KPI Contract", "59cbd9f1f8f2", "RECOVER"),
    ("Money Domain", "077ba5060251", "RECOVER"),
    ("Money Migration", "de17de779d1c", "RECOVER"),
    ("Receivables", "d966961c2dc9", "RECOVER"),
    ("Revenue / Cashflow / Result", "e340795d2f22", "RECOVER"),
    ("Multi-Currency", "efb3abc5feda", "RECOVER"),
    ("Finance Test Suite", "7ab6d01dac0c", "RECOVER"),
    ("Summary / Detail Separation", "515cd44e5b4b", "RECOVER"),
    ("Grouping / Entity References", "da79b28aa4ad", "RECOVER"),
    ("Analytics Summary", "e65b88dbefb3", "RECOVER"),
    ("Filter Architecture", "642a210403b6", "RECOVER"),
    ("Tenant Isolation", "1724bd92bf8e", "RECOVER"),
    ("Analytics Contracts", "26e4532201c9", "RECOVER"),
    ("Cost Model", "d96ba7a8c637", "RECOVER"),
    ("Utilization", "46f533afc431", "RECOVER"),
    ("Strength Detection", "f5cfe0c5cda1", "RECOVER"),
    ("Weakness Detection", "32714750f7f1", "RECOVER"),
    ("Driver / Influence Analysis", "56b9efe22b05", "RECOVER"),
    ("Data Quality", "2c32183956d3", "RECOVER"),
    ("Freshness / Lineage", "5de5e0295658", "RECOVER"),
    ("Metric State UX", "c82e44936217", "RECOVER"),
    ("Data Quality Panel", "ff34b66f0074", "RECOVER"),
    ("Information Architecture", "14072b3141bb", "RECOVER"),
    ("Executive KPI Strip", "2759f2235310", "RECOVER"),
    ("Strength / Weakness Cockpit", "cb2ced964d28", "RECOVER"),
    ("Risk / Cost / Failure Visuals", "7f6dde4c8c50", "RECOVER"),
    ("Mobile Readiness", "304a6ed19da1", "RECOVER"),
    ("Accessibility / i18n", "ddad560687ad", "RECOVER"),
    ("Recommendation Domain", "9eae4b1246fc", "RECOVER"),
    ("Action Center", "364bd93733e3", "RECOVER"),
    ("Action Integrations", "8829b6a56a06", "RECOVER"),
    ("Impact Measurement", "038223bc18dc", "RECOVER"),
    ("Predictive Analytics Architecture", "f988c3664bbe", "RECOVER"),
    ("Feature Store", "9cb26ece2b38", "RECOVER"),
    ("Demand / Revenue / Utilization Forecast", "96edda271330", "RECOVER"),
    ("Maintenance / Failure Forecast", "8488537978d8", "RECOVER"),
    ("Backtesting / Drift", "e3c8966a51c0", "RECOVER"),
    ("Forecast UX", "46b905ad6a44", "RECOVER"),
    ("GDPR", "c8714b1f9e97", "RECOVER"),
    ("Roles / Permissions", "549c0e237d86", "RECOVER"),
    ("Audit Logging", "d10d072efce6", "RECOVER"),
]
EVAL_RECOVERY_ORDER = [name for name, _, _ in EVAL_EXACT_SPECS]
EVAL_CANONICAL_PRS = {
    "Metric Registry": 752, "Calculation Versioning": 752, "Timezone / Period Model": 754,
    "Unified KPI Contract": 755, "Money Domain": 756, "Money Migration": 756,
    "Receivables": 757, "Revenue / Cashflow / Result": 760, "Multi-Currency": 762,
    "Finance Test Suite": 765, "Summary / Detail Separation": 767,
    "Grouping / Entity References": 770, "Analytics Summary": 773, "Filter Architecture": 774,
    "Tenant Isolation": 776, "Analytics Contracts": 778, "Cost Model": 780,
    "Utilization": 782, "Strength Detection": 783, "Weakness Detection": 784,
    "Driver / Influence Analysis": 786, "Data Quality": 788, "Freshness / Lineage": 790,
    "Metric State UX": 792, "Data Quality Panel": 793, "Information Architecture": 794,
    "Executive KPI Strip": 795, "Strength / Weakness Cockpit": 796,
    "Risk / Cost / Failure Visuals": 798, "Mobile Readiness": 801,
    "Accessibility / i18n": 803, "Recommendation Domain": 804, "Action Center": 806,
    "Action Integrations": 807, "Impact Measurement": 808,
    "Predictive Analytics Architecture": 809, "Feature Store": 810,
    "Demand / Revenue / Utilization Forecast": 811, "Maintenance / Failure Forecast": 812,
    "Backtesting / Drift": 813, "Forecast UX": 814, "GDPR": 815,
    "Roles / Permissions": 816, "Audit Logging": 817,
}
EVAL_CHAINS = [
    ["Timezone / Period Model", "Unified KPI Contract", "Money Domain", "Money Migration", "Receivables", "Revenue / Cashflow / Result", "Multi-Currency", "Finance Test Suite"],
    ["Summary / Detail Separation", "Grouping / Entity References", "Analytics Summary", "Filter Architecture", "Tenant Isolation", "Analytics Contracts", "Cost Model", "Utilization", "Strength Detection", "Driver / Influence Analysis", "Data Quality", "Freshness / Lineage"],
    ["Summary / Detail Separation", "Grouping / Entity References", "Analytics Summary", "Filter Architecture", "Tenant Isolation", "Analytics Contracts", "Cost Model", "Utilization", "Weakness Detection", "Driver / Influence Analysis", "Data Quality", "Freshness / Lineage"],
    ["Metric State UX", "Data Quality Panel", "Information Architecture", "Executive KPI Strip", "Strength / Weakness Cockpit", "Risk / Cost / Failure Visuals", "Mobile Readiness", "Accessibility / i18n"],
    ["Recommendation Domain", "Action Center", "Action Integrations", "Impact Measurement"],
    ["Predictive Analytics Architecture", "Feature Store", "Demand / Revenue / Utilization Forecast", "Maintenance / Failure Forecast", "Backtesting / Drift", "Forecast UX"],
    ["GDPR", "Roles / Permissions", "Audit Logging"],
]


def capabilities(module: str, paths: list[str], subject: str, patch_text: str) -> list[str]:
    evidence_text = "\n".join(paths) + "\n" + subject + "\n" + patch_text[:200_000]
    if module == "evaluations":
        matches = [name for name, regex in EVAL_RX if regex.search(evidence_text)]
        return matches or ["Evaluations Core"]
    patterns = [
        ("Tenant and access controls", r"tenant|organization|permission|role|guard|auth"),
        ("Database and data model", r"prisma|migration|schema\.prisma|repository"),
        ("Runtime jobs and queues", r"worker|queue|job|cron|bullmq|outbox"),
        ("API and domain contracts", r"controller|dto|contract|openapi|api\.ts"),
        ("Operational UI", r"\.tsx$|components?/|pages?/|view"),
        ("Observability and operations", r"metric|observability|runbook|alert|logging"),
        ("Testing and validation", r"\.test\.|\.spec\.|testing/|e2e"),
        ("Documentation and decisions", r"architecture/|docs/|\.md$"),
    ]
    joined = "\n".join(paths)
    for name, pattern in patterns:
        if re.search(pattern, joined, re.I | re.M):
            return [name]
    parts = []
    for path in paths:
        match = re.search(r"(?:modules|rental|master)/([^/]+)", path)
        if match:
            parts.append(match.group(1).replace("-", " ").title())
    return [Counter(parts).most_common(1)[0][0] if parts else f"{module.replace('-', ' ').title()} Core"]


def capability(module: str, paths: list[str], subject: str, patch_text: str) -> str:
    return capabilities(module, paths, subject, patch_text)[0]


phase1 = json.loads(PHASE1.read_text())
phase1_prs = phase1["pull_requests"]
by_pr = {pr["pr_number"]: pr for pr in phase1_prs}
current_rows = []
for page in parse_concatenated(CURRENT_PAGES):
    current_rows += page["data"]["repository"]["pullRequests"]["nodes"]
current = {pr["number"]: pr for pr in current_rows}
special_current = {pr["number"]: pr for pr in json.loads(SPECIAL_CURRENT.read_text())}
current_main = git("rev-parse", "origin/main")
if current_main != PHASE1_MAIN:
    main_delta = git("rev-list", "--left-right", "--count", f"{PHASE1_MAIN}...{current_main}")
else:
    main_delta = "0\t0"
if len(phase1_prs) != 625 or len(set(by_pr) & set(current)) != 625:
    raise RuntimeError("Phase-1 corpus is not fully present in the current open-PR snapshot")
changed_heads = [number for number in by_pr if by_pr[number]["head_sha"] != current[number]["headRefOid"]]
changed_bases = [number for number in by_pr if by_pr[number]["base_sha"] != current[number]["baseRefOid"]]
if changed_heads or changed_bases:
    raise RuntimeError(f"PR refs changed and require recollection: heads={changed_heads}, bases={changed_bases}")

main_commits = set(git("rev-list", "origin/main").splitlines())
main_paths = set(git("ls-tree", "-r", "--name-only", "origin/main").splitlines())

# Build current-main patch-id mapping once. Patch identity remains separate from reachability.
log_process = subprocess.Popen(
    ["git", "log", "--no-merges", "--pretty=format:%H", "--patch", "origin/main"],
    cwd=ROOT,
    text=True,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
)
patch_process = subprocess.Popen(
    ["git", "patch-id", "--stable"],
    cwd=ROOT,
    text=True,
    stdin=log_process.stdout,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
)
log_process.stdout.close()
patch_output, patch_error = patch_process.communicate()
log_error = log_process.stderr.read()
if patch_process.returncode or log_process.wait():
    raise RuntimeError(f"main patch-id index failed: {patch_error} {log_error}")
main_patch_map = defaultdict(list)
for line in patch_output.splitlines():
    fields = line.split()
    if len(fields) == 2:
        main_patch_map[fields[0]].append(fields[1])

source_prs_by_commit: dict[str, set[int]] = defaultdict(set)
for pr in phase1_prs:
    for sha in pr["commit_shas"]:
        source_prs_by_commit[sha].add(pr["pr_number"])
all_shas = sorted(source_prs_by_commit)
main_blob_cache: dict[str, set[str]] = {}


def normalized_added_lines(patch: str) -> list[tuple[str, str]]:
    current_path = ""
    values = []
    for line in patch.splitlines():
        if line.startswith("+++ b/"):
            current_path = line[6:]
        elif line.startswith("+") and not line.startswith("+++") and current_path:
            value = re.sub(r"\s+", "", line[1:])
            if len(value) >= 8 and not value.startswith(("//", "/*", "*", "#")):
                values.append((current_path, value))
    return values


catalog = {}
for index, sha in enumerate(all_shas, 1):
    raw = git("show", "-s", "--format=%H%x00%P%x00%aI%x00%s", sha)
    _, parents_raw, authored_at, subject = raw.split("\x00", 3)
    parents = parents_raw.split()
    parent = parents[0] if parents else f"{sha}^{{tree}}"
    diff = git("diff", "--find-renames", "--unified=0", parent, sha)
    status_lines = git("diff", "--name-status", "--find-renames", parent, sha).splitlines()
    changed_files = []
    for line in status_lines:
        fields = line.split("\t")
        if not fields:
            continue
        status = fields[0]
        path = fields[-1]
        changed_files.append({"status": status, "path": path, "previous_path": fields[-2] if status.startswith("R") and len(fields) > 2 else None})
    paths = [item["path"] for item in changed_files]
    patch_id_result = run("git", "patch-id", "--stable", stdin=git("show", "--pretty=format:%H", "--patch", sha), check=False)
    patch_id = patch_id_result.stdout.split()[0] if patch_id_result.stdout.split() else None
    added = normalized_added_lines(diff)
    represented = 0
    for path, value in added:
        if path not in main_blob_cache:
            blob = git("show", f"origin/main:{path}", check=False)
            main_blob_cache[path] = {re.sub(r"\s+", "", line) for line in blob.splitlines()} if blob else set()
        represented += value in main_blob_cache[path]
    coverage = represented / len(added) if added else None
    modules_for_files = defaultdict(list)
    for path in paths:
        for module in file_modules(path):
            modules_for_files[module].append(path)
    lower = (subject + "\n" + "\n".join(paths) + "\n" + diff[:200_000]).lower()
    path_subject = (subject + "\n" + "\n".join(paths)).lower()
    explicit_experiment = bool(re.search(r"\b(spike|prototype|do[- ]not[- ]merge|debug[- ]only|temporary[- ]debug)\b", path_subject))
    mock_or_debug_only = bool(paths) and all(
        re.search(r"(^|/)(mocks?|fixtures?|debug|experiments?)(/|$)", path, re.I)
        for path in paths
    )
    flags = {
        "migration": any("prisma/migrations" in path or path.endswith("schema.prisma") for path in paths),
        "security": bool(re.search(r"permission|rbac|auth|mfa|secret|token|guard|tenant.isolation", lower)),
        "privacy": bool(re.search(r"gdpr|privacy|personal.data|retention|pii", lower)),
        "finance": bool(re.search(r"money|revenue|cashflow|receivable|billing|stripe|payment|invoice|currency", lower)),
        "worker": bool(re.search(r"worker|queue|job|cron|bullmq|outbox", lower)),
        "infra": any(module == "infrastructure" for module in modules_for_files),
        "experimental": explicit_experiment or mock_or_debug_only,
        "tests_only": bool(paths) and all(re.search(r"\.(test|spec)\.|/test(s|ing)?/|/e2e/", path) for path in paths),
        "docs_only": bool(paths) and all(is_doc(path) for path in paths),
    }
    catalog[sha] = {
        "sha": sha,
        "parents": parents,
        "authored_at": authored_at,
        "subject": subject,
        "changed_files": changed_files,
        "paths": paths,
        "modules_for_files": dict(modules_for_files),
        "patch_id": patch_id,
        "reachable_from_main": sha in main_commits,
        "patch_equivalent_main_commits": sorted(main_patch_map.get(patch_id, [])) if patch_id else [],
        "added_line_presence_in_main": round(coverage, 4) if coverage is not None else None,
        "added_line_evidence_count": len(added),
        "flags": flags,
        "source_prs": sorted(source_prs_by_commit[sha]),
    }
    if index % 100 == 0:
        print(f"catalogued {index}/{len(all_shas)} commits", flush=True)

# Final verification of the exact Phase-1 union of reachability/equivalence/empty candidates.
verification_candidates = [
    pr for pr in phase1_prs
    if pr["preliminary_classification"] in {"ALREADY_IN_MAIN", "EMPTY_DIFF"}
    or pr["patch_equivalent_in_main"] is True
    or pr["all_commits_in_main"]
]
verification_rows = []
safe_rows = []
for pr in verification_candidates:
    direct = [sha for sha in pr["commit_shas"] if sha in main_commits]
    non_main = [sha for sha in pr["commit_shas"] if sha not in main_commits]
    equivalents = {sha: catalog[sha]["patch_equivalent_main_commits"] for sha in non_main}
    unique = [sha for sha in non_main if not equivalents[sha]]
    diff_lines = git("diff", "--name-status", "-M", f"origin/main...{pr['head_sha']}").splitlines()
    tree_lines = git("diff", "--name-status", "-M", "origin/main", pr["head_sha"]).splitlines()
    if len(direct) == len(pr["commit_shas"]):
        classification, confidence = "SAFE_TO_CLOSE_ALREADY_IN_MAIN", "HIGH"
    elif non_main and not unique:
        classification, confidence = "SAFE_TO_CLOSE_PATCH_EQUIVALENT", "HIGH"
    elif unique:
        classification, confidence = "NOT_SAFE_TO_CLOSE_UNIQUE_DELTA_FOUND", "HIGH"
    else:
        classification, confidence = "NEEDS_MANUAL_REVIEW", "LOW"
    evidence = [
        f"{len(direct)}/{len(pr['commit_shas'])} API-listed commits reachable from current origin/main",
        f"{len(non_main) - len(unique)}/{len(non_main)} non-reachable commits have exact stable patch-id matches",
        f"origin/main...head paths={len(diff_lines)}; two-tree paths={len(tree_lines)}",
        f"current head/base unchanged from Phase 1: {pr['head_sha']} / {pr['base_sha']}",
    ]
    row = {
        "pr_number": pr["pr_number"],
        "url": pr["url"],
        "classification": classification,
        "reason": evidence[0] if classification.endswith("ALREADY_IN_MAIN") else evidence[1],
        "direct_main_commit_shas": direct,
        "non_main_commit_shas": non_main,
        "patch_equivalent_main_commits": equivalents,
        "unique_commit_shas": unique,
        "diff_summary": {
            "three_dot_path_count": len(diff_lines),
            "three_dot_paths_sample": diff_lines[:50],
            "three_dot_paths_sha256": hashlib.sha256("\n".join(diff_lines).encode()).hexdigest(),
            "two_tree_path_count": len(tree_lines),
            "two_tree_paths_sample": tree_lines[:50],
            "two_tree_paths_sha256": hashlib.sha256("\n".join(tree_lines).encode()).hexdigest(),
        },
        "replacement_commit_or_pr": sorted(set(direct + [item for values in equivalents.values() for item in values])),
        "confidence": confidence,
        "evidence": evidence,
    }
    verification_rows.append(row)
    if classification.startswith("SAFE_TO_CLOSE"):
        safe_rows.append(row)

# Create capability-level changesets from every unique non-main commit in the 439 protected PRs.
active_prs = [pr for pr in phase1_prs if pr["preliminary_classification"] != "ALREADY_IN_MAIN"]
active_shas = sorted({sha for pr in active_prs for sha in pr["non_main_commit_shas"]})
contributions = defaultdict(lambda: {"commits": set(), "files": set(), "file_commits": defaultdict(set)})
for sha in active_shas:
    commit = catalog[sha]
    module_paths = commit["modules_for_files"] or {"unknown": commit["paths"]}
    for module, paths in module_paths.items():
        patch_text = git("show", "--format=", "--unified=0", sha)
        for cap in capabilities(module, paths, commit["subject"], patch_text):
            key = (module, cap)
            contributions[key]["commits"].add(sha)
            contributions[key]["files"].update(paths)
            for path in paths:
                contributions[key]["file_commits"][path].add(sha)

changesets = []
for (module, cap), contribution in sorted(contributions.items()):
    shas = sorted(contribution["commits"], key=lambda sha: (catalog[sha]["authored_at"], sha))
    files = sorted(contribution["files"])
    source_prs = sorted({pr for sha in shas for pr in catalog[sha]["source_prs"] if pr in by_pr})
    contribution_text = (
        module + "\n" + cap + "\n" + "\n".join(files) + "\n"
        + "\n".join(catalog[sha]["subject"] for sha in shas)
    ).lower()
    flags = {
        "migration": any("prisma/migrations" in path or path.endswith("schema.prisma") for path in files),
        "security": module == "roles-access" or bool(re.search(r"permission|rbac|(^|[/_.-])auth([/_.-]|$)|mfa|secret|token|guard|tenant.isolation", contribution_text)),
        "tenant": bool(re.search(r"tenant|organization|org.scope|orgid|organizationid", contribution_text)),
        "privacy": module == "legal-compliance" or bool(re.search(r"gdpr|privacy|personal.data|retention|pii", contribution_text)),
        "finance": module in {"billing-subscriptions", "stripe-payments"} or bool(re.search(r"money domain|receivables|revenue / cashflow|multi-currency|cost model", contribution_text)),
        "worker": bool(re.search(r"worker|queue|job|cron|bullmq|outbox", contribution_text)),
        "infra": module == "infrastructure",
        "experimental": bool(shas) and all(catalog[sha]["flags"]["experimental"] for sha in shas),
        "tests_only": bool(files) and all(re.search(r"\.(test|spec)\.|/test(s|ing)?/|/e2e/", path) for path in files),
        "docs_only": module == "documentation" or (bool(files) and all(is_doc(path) for path in files)),
    }
    conflict_sources = [pr for pr in source_prs if by_pr[pr]["merge_conflict_status"] == "CONFLICTING"]
    missing_files = [path for path in files if path not in main_paths]
    coverages = [
        catalog[sha]["added_line_presence_in_main"]
        for sha in shas
        if catalog[sha]["added_line_presence_in_main"] is not None and catalog[sha]["added_line_evidence_count"] >= 5
    ]
    semantic_coverage = sum(coverages) / len(coverages) if coverages else None
    if flags["docs_only"] or module == "documentation":
        classification = "DOCS_ONLY"
        relevance = "Documentation evidence; validity requires architecture-owner review."
    elif flags["experimental"]:
        classification = "EXPERIMENTAL_DO_NOT_MERGE"
        relevance = "Experimental/debug/placeholder indicators occur in actual patch content or paths."
    elif semantic_coverage is not None and semantic_coverage >= 0.9 and not missing_files:
        classification = "SUPERSEDED_BY_MAIN"
        relevance = "Most non-trivial added lines already occur in current main; semantic equivalence remains medium-confidence."
    elif module == "connectivity":
        classification = "UNKNOWN"
        relevance = "DIMO MCP live discovery failed; canonical integration compatibility cannot be verified."
    elif conflict_sources and (flags["security"] or flags["migration"] or len({file_module for path in files for file_module in file_modules(path)}) > 1):
        classification = "CONFLICTING_NEEDS_DESIGN_REVIEW"
        relevance = "Unique patches overlap current main and touch architecture-sensitive surfaces."
    elif flags["migration"] or flags["security"] or flags["tenant"] or flags["privacy"] or flags["finance"] or flags["worker"] or flags["infra"] or missing_files or conflict_sources:
        classification = "REQUIRED_BUT_NEEDS_PORT"
        relevance = "Unique capability evidence remains, but direct integration is unsafe on current architecture."
    else:
        classification = "REQUIRED_CURRENT"
        relevance = "Unique patch content remains and affected current-main paths still exist."
    cross_cutting = module == "cross-cutting-platform"
    if (flags["finance"] and (flags["migration"] or flags["security"] or flags["tenant"])) or ((flags["security"] or flags["tenant"]) and flags["migration"]):
        risk = "CRITICAL"
    elif any((flags["migration"], flags["security"], flags["tenant"], flags["privacy"], flags["finance"], flags["worker"], flags["infra"], cross_cutting)) or len(conflict_sources) > 0:
        risk = "HIGH"
    elif module == "documentation" or flags["tests_only"]:
        risk = "LOW"
    else:
        risk = "MEDIUM"
    tests = []
    if any(path.startswith("backend/") for path in files):
        tests.append("backend unit/integration tests for the owning module")
    if any(path.startswith("frontend/") for path in files):
        tests.append("frontend unit/component tests and focused UI regression")
    if flags["migration"]:
        tests += ["Prisma migration deploy/rollback rehearsal", "tenant-scoped data integrity checks"]
    if flags["finance"]:
        tests += ["money precision/currency/rounding regression", "financial reconciliation fixtures"]
    if flags["security"] or flags["tenant"]:
        tests += ["cross-tenant negative tests", "RBAC/authz regression"]
    if flags["worker"]:
        tests += ["queue retry/idempotency/dead-letter tests"]
    if module == "connectivity":
        tests += ["DIMO request/response and vehicle-access verification via MCP"]
    if not tests:
        tests.append("targeted unit and integration tests")
    rollback = (
        "Restore pre-migration backup and deploy prior release; use forward corrective migration if schema applied."
        if flags["migration"]
        else "Revert the isolated recovery commit(s) and redeploy the prior release."
    )
    change_id = f"cs-{slug(module)}-{slug(cap)}"
    evidence = [
        f"{len(shas)} unique non-main commits from {len(source_prs)} open PRs",
        f"{len(files)} actual changed paths; {len(missing_files)} absent from current main",
        f"source conflict PRs={conflict_sources}",
        f"non-trivial added-line presence in current main={semantic_coverage:.3f}" if semantic_coverage is not None else "added-line semantic coverage unavailable/insufficient",
        "classification uses commit patches and paths; PR titles are not inputs",
    ]
    changesets.append({
        "changeset_id": change_id,
        "module": module,
        "capability": cap,
        "source_prs": source_prs,
        "source_commits": shas,
        "commit_contributions": [
            {"commit": sha, "paths": sorted(path for path in files if sha in contribution["file_commits"][path])}
            for sha in shas
        ],
        "affected_files_count": len(files),
        "affected_files": files,
        "purpose": f"Recover the coherent {cap} capability for the {module} domain without inherited stack history.",
        "dependencies": [],
        "dependency_capabilities": [],
        "canonical_domain_owner": module,
        "migration_required": flags["migration"],
        "backend_dependency": any(path.startswith("backend/") for path in files),
        "frontend_dependency": any(path.startswith("frontend/") for path in files),
        "worker_dependency": flags["worker"],
        "infra_dependency": flags["infra"],
        "security_impact": "SENSITIVE" if flags["security"] else "NONE_IDENTIFIED",
        "tenant_isolation_impact": "SENSITIVE" if flags["tenant"] else "NONE_IDENTIFIED",
        "finance_impact": "SENSITIVE" if flags["finance"] else "NONE_IDENTIFIED",
        "privacy_impact": "SENSITIVE" if flags["privacy"] else "NONE_IDENTIFIED",
        "data_migration_impact": "REQUIRED" if flags["migration"] else "NONE_IDENTIFIED",
        "expected_conflicts": sorted(set(conflict_sources)),
        "current_relevance": relevance,
        "classification": classification,
        "recommended_action": "Reimplement on current main" if classification in {"REQUIRED_BUT_NEEDS_PORT", "CONFLICTING_NEEDS_DESIGN_REVIEW", "UNKNOWN"} else "Port isolated commits after review",
        "risk_level": risk,
        "required_tests": sorted(set(tests)),
        "required_manual_review": ["domain owner", "security owner" if flags["security"] or flags["tenant"] else "module owner"],
        "required_staging_validation": "Required" if risk in {"HIGH", "CRITICAL"} or classification.startswith("REQUIRED") else "Recommended",
        "required_vps_validation": "Required after staging" if risk in {"HIGH", "CRITICAL"} else "Standard release smoke",
        "rollback_strategy": rollback,
        "can_be_cherry_picked": len(shas) == 1 and not any((flags["migration"], flags["security"], flags["tenant"], flags["worker"], flags["infra"])) and not conflict_sources,
        "should_be_reimplemented": classification in {"REQUIRED_BUT_NEEDS_PORT", "CONFLICTING_NEEDS_DESIGN_REVIEW", "UNKNOWN"},
        "should_be_ported_commit_by_commit": len(shas) > 1,
        "recommended_integration_method": "reimplement" if classification in {"REQUIRED_BUT_NEEDS_PORT", "CONFLICTING_NEEDS_DESIGN_REVIEW", "UNKNOWN"} else ("isolated cherry-pick after verification" if len(shas) == 1 else "port commit-by-commit"),
        "confidence": "LOW" if classification == "UNKNOWN" else ("MEDIUM" if classification in {"SUPERSEDED_BY_MAIN", "CONFLICTING_NEEDS_DESIGN_REVIEW"} else "HIGH"),
        "evidence": evidence,
        "semantic_added_line_coverage": round(semantic_coverage, 4) if semantic_coverage is not None else None,
        "missing_current_main_paths": missing_files,
    })

# Replace heuristic evaluation buckets with manually verified one-commit capability units.
# Any residual evaluation commit is kept explicitly UNKNOWN rather than misattributed.
generic_eval_items = [item for item in changesets if item["module"] == "evaluations"]
generic_eval_shas = {sha for item in generic_eval_items for sha in item["source_commits"]}
changesets = [item for item in changesets if item["module"] != "evaluations"]
exact_eval_shas = set()
evaluation_baselines = []
for capability_name, short_sha, disposition in EVAL_EXACT_SPECS:
    matches = [sha for sha in catalog if sha.startswith(short_sha)]
    if len(matches) != 1:
        raise RuntimeError(f"evaluation capability commit resolution failed: {capability_name} {short_sha} -> {matches}")
    sha = matches[0]
    commit = catalog[sha]
    canonical_source_pr = EVAL_CANONICAL_PRS[capability_name]
    if disposition == "MAIN_BASELINE":
        if sha not in main_commits:
            raise RuntimeError(f"expected evaluations baseline is not reachable from main: {sha}")
        evaluation_baselines.append({
            "capability": capability_name,
            "source_pr": canonical_source_pr,
            "commit": sha,
            "status": "EXACTLY_IN_MAIN",
        })
        continue
    exact_eval_shas.add(sha)
    files = sorted(commit["paths"])
    migration = commit["flags"]["migration"]
    security = capability_name in {"Tenant Isolation", "GDPR", "Roles / Permissions", "Audit Logging"}
    tenant = capability_name == "Tenant Isolation"
    privacy = capability_name == "GDPR"
    finance = capability_name in {
        "Timezone / Period Model", "Unified KPI Contract", "Money Domain", "Money Migration",
        "Receivables", "Revenue / Cashflow / Result", "Multi-Currency", "Finance Test Suite",
        "Cost Model",
    }
    frontend = any(path.startswith("frontend/") for path in files)
    backend = any(path.startswith("backend/") for path in files)
    worker = commit["flags"]["worker"]
    merge_join = capability_name == "Action Center"
    missing = [path for path in files if path not in main_paths]
    risk = "CRITICAL" if migration or (finance and (security or tenant)) else ("HIGH" if finance or security or tenant or privacy or backend or worker else "MEDIUM")
    tests = []
    if backend:
        tests.append("backend evaluations contract/domain/integration tests")
    if frontend:
        tests.append("frontend evaluations component and accessibility regression")
    if finance:
        tests.append("money precision, period, currency, receivable and financial reconciliation fixtures")
    if tenant or security:
        tests.append("cross-tenant negative and RBAC tests")
    if privacy:
        tests.append("GDPR purpose, retention and audit evidence review")
    if migration:
        tests.append("Prisma migration and rollback rehearsal")
    changesets.append({
        "changeset_id": f"cs-evaluations-{slug(capability_name)}",
        "module": "evaluations",
        "capability": capability_name,
        "source_prs": [canonical_source_pr],
        "containing_prs": commit["source_prs"],
        "source_commits": [sha],
        "commit_contributions": [{"commit": sha, "paths": files}],
        "affected_files_count": len(files),
        "affected_files": files,
        "purpose": f"Recover the manually verified {capability_name} evaluations capability.",
        "dependencies": [],
        "dependency_capabilities": [],
        "canonical_domain_owner": "evaluations",
        "migration_required": migration,
        "backend_dependency": backend,
        "frontend_dependency": frontend,
        "worker_dependency": worker,
        "infra_dependency": False,
        "security_impact": "SENSITIVE" if security else "NONE_IDENTIFIED",
        "tenant_isolation_impact": "SENSITIVE" if tenant else "NONE_IDENTIFIED",
        "finance_impact": "SENSITIVE" if finance else "NONE_IDENTIFIED",
        "privacy_impact": "SENSITIVE" if privacy else "NONE_IDENTIFIED",
        "data_migration_impact": "REQUIRED" if migration else "NONE_IDENTIFIED",
        "expected_conflicts": [canonical_source_pr] if by_pr[canonical_source_pr]["merge_conflict_status"] == "CONFLICTING" else [],
        "current_relevance": "Unique commit-level capability; exact patch is absent from current main.",
        "classification": "REQUIRED_BUT_NEEDS_PORT",
        "recommended_action": "Port the isolated capability onto current main in the verified dependency order.",
        "risk_level": risk,
        "required_tests": sorted(set(tests or ["targeted evaluations unit and integration tests"])),
        "required_manual_review": ["evaluations domain owner", "security/privacy owner" if security or privacy or tenant else "module owner"],
        "required_staging_validation": "Required" if risk in {"HIGH", "CRITICAL"} else "Recommended",
        "required_vps_validation": "Required after staging" if risk in {"HIGH", "CRITICAL"} else "Standard release smoke",
        "rollback_strategy": "Restore pre-migration backup and prior release; otherwise revert the isolated recovery commit." if migration else "Revert the isolated recovery commit and redeploy the prior release.",
        "can_be_cherry_picked": False,
        "should_be_reimplemented": migration or security or tenant or privacy or worker or merge_join,
        "should_be_ported_commit_by_commit": True,
        "recommended_integration_method": "reconstruct merge join after Recommendation Domain and UI parent" if merge_join else ("reimplement on current contracts" if migration or security or tenant or privacy or worker else "port isolated commit after conflict review"),
        "confidence": "HIGH",
        "evidence": [
            f"manually verified canonical source PR #{canonical_source_pr} and commit {sha}",
            "git cherry reports a unique patch against current origin/main",
            f"{len(files)} actual commit paths; {len(missing)} absent from current main",
            "cumulative descendant PRs are excluded from source attribution",
            "merge join must be reconstructed after both parents; do not ordinary-cherry-pick" if merge_join else "single canonical capability commit",
        ],
        "semantic_added_line_coverage": commit["added_line_presence_in_main"],
        "missing_current_main_paths": missing,
    })

residual_eval_shas = sorted(generic_eval_shas - exact_eval_shas - {item["commit"] for item in evaluation_baselines})
if residual_eval_shas:
    residual_files = sorted({path for sha in residual_eval_shas for path in catalog[sha]["paths"]})
    residual_prs = sorted({pr for sha in residual_eval_shas for pr in catalog[sha]["source_prs"]})
    changesets.append({
        "changeset_id": "cs-evaluations-unresolved-residual",
        "module": "evaluations",
        "capability": "Unresolved residual evaluation artifacts",
        "source_prs": residual_prs,
        "source_commits": residual_eval_shas,
        "commit_contributions": [{"commit": sha, "paths": catalog[sha]["paths"]} for sha in residual_eval_shas],
        "affected_files_count": len(residual_files),
        "affected_files": residual_files,
        "purpose": "Protect unmatched evaluation-related commits from accidental loss without assigning unsupported capability semantics.",
        "dependencies": [],
        "dependency_capabilities": [],
        "canonical_domain_owner": "evaluations",
        "migration_required": any(catalog[sha]["flags"]["migration"] for sha in residual_eval_shas),
        "backend_dependency": any(path.startswith("backend/") for path in residual_files),
        "frontend_dependency": any(path.startswith("frontend/") for path in residual_files),
        "worker_dependency": any(catalog[sha]["flags"]["worker"] for sha in residual_eval_shas),
        "infra_dependency": False,
        "security_impact": "UNKNOWN",
        "tenant_isolation_impact": "UNKNOWN",
        "finance_impact": "UNKNOWN",
        "privacy_impact": "UNKNOWN",
        "data_migration_impact": "REQUIRED" if any(catalog[sha]["flags"]["migration"] for sha in residual_eval_shas) else "UNKNOWN",
        "expected_conflicts": sorted(pr for pr in residual_prs if pr in by_pr and by_pr[pr]["merge_conflict_status"] == "CONFLICTING"),
        "current_relevance": "Manual commit-level attribution required; not safe to close or integrate.",
        "classification": "UNKNOWN",
        "recommended_action": "Manual review; split bookkeeping/docs artifacts from substantive code before Phase 3.",
        "risk_level": "HIGH",
        "required_tests": ["tests determined after manual domain attribution"],
        "required_manual_review": ["evaluations domain owner", "repository architecture owner"],
        "required_staging_validation": "Required",
        "required_vps_validation": "Required after staging",
        "rollback_strategy": "Do not integrate until split; revert any isolated port.",
        "can_be_cherry_picked": False,
        "should_be_reimplemented": True,
        "should_be_ported_commit_by_commit": True,
        "recommended_integration_method": "manual attribution and reimplementation",
        "confidence": "LOW",
        "evidence": [
            f"{len(residual_eval_shas)} commits were over-included by heuristic capability matching",
            "commits remain explicitly covered so no unique patch is lost",
        ],
        "semantic_added_line_coverage": None,
        "missing_current_main_paths": [path for path in residual_files if path not in main_paths],
    })

changeset_by_key = {(item["module"], item["capability"]): item for item in changesets}
changeset_by_id = {item["changeset_id"]: item for item in changesets}

# Dependency graph: explicit capability order plus conservative cross-module foundations.
edges = []
eval_sets = [item for item in changesets if item["module"] == "evaluations"]
eval_position = {name: index for index, name in enumerate(EVAL_RECOVERY_ORDER)}
eval_sets.sort(key=lambda item: eval_position.get(item["capability"], 10_000))
for chain_index, chain in enumerate(EVAL_CHAINS, 1):
    chain_sets = [changeset_by_key[("evaluations", name)] for name in chain if ("evaluations", name) in changeset_by_key]
    for previous, current_set in zip(chain_sets, chain_sets[1:]):
        edges.append({
            "from": previous["changeset_id"],
            "to": current_set["changeset_id"],
            "type": "hard dependency",
            "reason": f"manually verified evaluations chain {chain_index}",
        })
foundations = {
    "roles-access": "hard dependency",
    "infrastructure": "cross-module dependency",
    "observability": "soft dependency",
}
for item in changesets:
    if item["module"] in {"roles-access", "infrastructure", "observability", "documentation"}:
        continue
    for foundation_module, edge_type in foundations.items():
        candidates = [candidate for candidate in changesets if candidate["module"] == foundation_module]
        if not candidates:
            continue
        if foundation_module == "roles-access" and item["security_impact"] != "SENSITIVE":
            continue
        if foundation_module == "infrastructure" and not (item["worker_dependency"] or item["infra_dependency"]):
            continue
        if foundation_module == "observability" and item["risk_level"] not in {"HIGH", "CRITICAL"}:
            continue
        source = candidates[0]
        edges.append({"from": source["changeset_id"], "to": item["changeset_id"], "type": edge_type, "reason": f"{foundation_module} foundation"})
for edge in edges:
    if edge["to"] in changeset_by_id:
        changeset_by_id[edge["to"]]["dependencies"].append(edge["from"])
        changeset_by_id[edge["to"]]["dependency_capabilities"].append(changeset_by_id[edge["from"]]["capability"])
for item in changesets:
    item["dependencies"] = sorted(set(item["dependencies"]))
    item["dependency_capabilities"] = sorted(set(item["dependency_capabilities"]))

# Stack-tip reconstruction uses the complete branch history, not the cumulative tip diff as a feature.
tip_prs = [pr for pr in phase1_prs if pr["preliminary_classification"] == "CUMULATIVE_STACK_TIP"]
stack_nodes = {pr["pr_number"] for pr in phase1_prs if "STACKED" in pr["classification_tags"]}
adjacency = defaultdict(set)
for pr in phase1_prs:
    for ancestor in pr["ancestor_prs"]:
        if ancestor in stack_nodes and pr["pr_number"] in stack_nodes:
            adjacency[ancestor].add(pr["pr_number"])
            adjacency[pr["pr_number"]].add(ancestor)
components, component_by_pr, seen = [], {}, set()
for start in sorted(stack_nodes):
    if start in seen:
        continue
    queue, component = deque([start]), []
    seen.add(start)
    while queue:
        node = queue.popleft()
        component.append(node)
        for peer in adjacency[node]:
            if peer not in seen:
                seen.add(peer)
                queue.append(peer)
    component = sorted(component)
    component_id = f"stack-{len(components)+1:03d}"
    components.append({"component_id": component_id, "prs": component})
    for number in component:
        component_by_pr[number] = component_id

stack_results = []
for tip in tip_prs:
    history = git("rev-list", "--reverse", f"{tip['merge_base_main']}..{tip['head_sha']}").splitlines()
    unique = [sha for sha in history if sha not in main_commits and not catalog.get(sha, {}).get("patch_equivalent_main_commits")]
    equivalent = [sha for sha in history if sha not in main_commits and catalog.get(sha, {}).get("patch_equivalent_main_commits")]
    direct_main = [sha for sha in history if sha in main_commits]
    tip_own_modules = Counter(
        module
        for sha in tip["non_main_commit_shas"]
        for module in catalog.get(sha, {}).get("modules_for_files", {})
        if module != "documentation"
    )
    focus_modules = {module for module, _ in tip_own_modules.most_common(2)}
    likely = [
        sha for sha in unique
        if set(catalog.get(sha, {}).get("modules_for_files", {})) & focus_modules
        or tip["pr_number"] in catalog.get(sha, {}).get("source_prs", [])
    ]
    foreign = [sha for sha in unique if sha not in likely]
    documentation_commits = [sha for sha in history if catalog.get(sha, {}).get("flags", {}).get("docs_only")]
    conflicting_commits = [
        sha for sha in unique
        if any(by_pr[number]["merge_conflict_status"] == "CONFLICTING" for number in catalog.get(sha, {}).get("source_prs", []) if number in by_pr)
    ]
    obsolete = [sha for sha in unique if catalog.get(sha, {}).get("flags", {}).get("experimental")]
    stack_results.append({
        "stack_tip_pr": tip["pr_number"],
        "stack_component": component_by_pr.get(tip["pr_number"]),
        "ancestor_prs": tip["ancestor_prs"],
        "direct_parent_prs": tip["stack_parent_prs"],
        "contained_commit_order": history,
        "directly_in_main_commits": direct_main,
        "unique_not_in_main_commits": unique,
        "patch_equivalent_commits": equivalent,
        "inherited_foreign_module_commits": foreign,
        "likely_feature_commits": likely,
        "conflicting_commits": conflicting_commits,
        "obsolete_commits": obsolete,
        "documentation_commits": documentation_commits,
        "focus_modules": sorted(focus_modules),
        "confidence": "MEDIUM" if foreign else "HIGH",
        "evidence": [
            f"history reconstructed commit-by-commit from merge-base {tip['merge_base_main']}",
            f"unique={len(unique)}, patch-equivalent={len(equivalent)}, directly-reachable={len(direct_main)}",
            f"feature/foreign split uses actual per-commit changed modules; focus={sorted(focus_modules)}",
        ],
    })
stack_tip_commit_memberships = sum(len(tip["commit_shas"]) for tip in tip_prs)
stack_tip_distinct_commits = len({sha for tip in tip_prs for sha in tip["commit_shas"]})

# Standalone conflict and documentation analyses.
conflict_prs = [pr for pr in phase1_prs if pr["preliminary_classification"] == "CONFLICTING"]
conflict_results = []
for pr in conflict_prs:
    unique = [sha for sha in pr["non_main_commit_shas"] if not catalog[sha]["patch_equivalent_main_commits"]]
    overlap = sorted(
        set(item["path"] for item in pr["changed_files"])
        & set(git("diff", "--name-only", pr["merge_base_main"], "origin/main").splitlines())
    )
    flags = {name: any(catalog[sha]["flags"][name] for sha in unique) for name in next(iter(catalog.values()))["flags"]} if unique else {}
    caps = sorted({
        cap
        for sha in unique
        for module, paths in catalog[sha]["modules_for_files"].items()
        for cap in capabilities(module, paths, catalog[sha]["subject"], "")
    })
    if not unique:
        classification = "SUPERSEDED"
    elif flags.get("security"):
        classification = "SECURITY_REVIEW_REQUIRED"
    elif flags.get("docs_only"):
        classification = "DOCS_ONLY"
    elif flags.get("experimental"):
        classification = "OBSOLETE"
    elif len(overlap) > 20 or flags.get("migration"):
        classification = "DESIGN_REVIEW_REQUIRED"
    else:
        classification = "PORT_REQUIRED"
    current_special = special_current[pr["pr_number"]]
    conflict_results.append({
        "pr_number": pr["pr_number"],
        "purpose": ", ".join(caps) or "Unresolved capability",
        "unique_patches": unique,
        "current_mergeability": current_special["mergeable"],
        "current_merge_state_status": current_special["mergeStateStatus"],
        "conflict_cause_paths": overlap,
        "current_architecture_evidence": [path for path in overlap if path in main_paths],
        "superseded_evidence": [],
        "classification": classification,
        "manual_port_plan": "Rebuild only the listed unique commits on current main; do not merge the historical branch.",
        "confidence": "HIGH" if classification in {"PORT_REQUIRED", "SECURITY_REVIEW_REQUIRED"} else "MEDIUM",
        "evidence": [
            f"{len(unique)} exact unique non-main commits",
            f"{len(overlap)} PR paths also changed on main since merge-base",
            f"current GitHub mergeability={current_special['mergeable']}/{current_special['mergeStateStatus']}",
        ],
    })

docs_prs = [pr for pr in phase1_prs if pr["preliminary_classification"] == "DOCS_ONLY"]
docs_results = []
for pr in docs_prs:
    paths = [item["path"] for item in pr["changed_files"]]
    existing = [path for path in paths if path in main_paths]
    missing = [path for path in paths if path not in main_paths]
    coverage = [catalog[sha]["added_line_presence_in_main"] for sha in pr["non_main_commit_shas"] if catalog[sha]["added_line_presence_in_main"] is not None]
    mean_coverage = sum(coverage) / len(coverage) if coverage else 0
    if mean_coverage >= 0.9 and not missing:
        classification = "ALREADY_REPRESENTED"
    elif any(path.startswith("architecture/") for path in paths):
        classification = "ARCHIVE_ONLY"
    elif missing:
        classification = "KEEP_AND_PORT"
    else:
        classification = "SUPERSEDED"
    docs_results.append({
        "pr_number": pr["pr_number"],
        "paths": paths,
        "paths_present_in_main": existing,
        "paths_missing_from_main": missing,
        "classification": classification,
        "confidence": "MEDIUM",
        "evidence": [
            f"{len(existing)}/{len(paths)} documentation paths exist in current main",
            f"added-line presence in current main={mean_coverage:.3f}",
            "document validity requires comparison to current implementation and ADRs",
        ],
    })

# Manual current-symbol/architecture review overrides heuristic conflict/docs labels.
conflict_overrides = {
    19: ("SAFE_TO_IGNORE", "Container DNS settings do not apply to the current host-PM2 production runtime."),
    22: ("PORT_REQUIRED", "Current Financial Insights still duplicates InvoiceLite/casts; port only typed API consolidation."),
    23: ("SUPERSEDED", "Current FinancialInsightsView passes stationId and current cockpit filters by station."),
    24: ("PORT_REQUIRED", "Current code retains legacy cent/euro threshold and incomplete declared-category handling."),
    25: ("SUPERSEDED", "Current ActionQueue excludes finance tabs/items and tests assert that behavior."),
    31: ("DESIGN_REVIEW_REQUIRED", "POI enrichment is absent, but historical read-path writes/external calls/cache are architecturally unsafe."),
    66: ("DESIGN_REVIEW_REQUIRED", "Current durable DIMO webhook/runtime logic supersedes most code; only verified parser/logging hunks may remain."),
    83: ("SUPERSEDED", "Current main contains the ClickHouse runtime ADR, URL ping and production boundary guidance."),
    84: ("SECURITY_REVIEW_REQUIRED", "Current fail-closed metrics guard exists; constant-time comparison/IP allowlist need selective security review."),
    85: ("SUPERSEDED", "Current main contains ClickHouse diagnostics service, endpoint, registry, types, tests and UI."),
    86: ("PORT_REQUIRED", "Current HF mirror has guards/idempotency but lacks the low-cardinality skip metric."),
    87: ("SUPERSEDED", "Current producer registry/diagnostics are broader and include later audit corrections."),
    88: ("DESIGN_REVIEW_REQUIRED", "Signal expansion requires DIMO schema/unit/privacy verification and cannot replace current query wholesale."),
    109: ("SUPERSEDED", "Current main contains the expanded tenant-safe outbound email, provider, webhook, document and UI flows."),
    118: ("DOCS_ONLY", "Current Resend guidance already contains the production setup and webhook/DNS checklist."),
    121: ("SUPERSEDED", "Current main contains DNS sync scripts, mail identity policy and expanded documentation."),
    173: ("SUPERSEDED", "Current AppThemeProvider/toggle/bootstrap and tests implement the intended theme behavior."),
    194: ("DOCS_ONLY", "Historical Stripe baseline is materially obsolete and retained only as dated evidence."),
    230: ("DESIGN_REVIEW_REQUIRED", "Capability is absent, but historical schedulers bypass current Task Domain and need atomic claims/pagination redesign."),
}
for result in conflict_results:
    classification, reason = conflict_overrides[result["pr_number"]]
    result["classification"] = classification
    result["semantic_override_reason"] = reason
    result["evidence"].append("manual current-symbol/architecture review: " + reason)
    result["confidence"] = "MEDIUM" if result["pr_number"] in {66, 86, 88} else "HIGH"
    result["manual_port_plan"] = (
        "No port; retain as historical evidence."
        if classification in {"SUPERSEDED", "SAFE_TO_IGNORE", "DOCS_ONLY"}
        else "Reconstruct only the stated remaining capability on current main; do not merge the historical branch."
    )

docs_overrides = {
    233: ("ALREADY_REPRESENTED", "The same current-main Task Domain V2 document evolved with implemented activation/completion behavior."),
    234: ("ALREADY_REPRESENTED", "The same task-management audit path exists and includes later Task Domain findings."),
    235: ("ARCHIVE_ONLY", "The missing invoice audit describes findings now contradicted by current document/email/permission/test implementations."),
}
for result in docs_results:
    classification, reason = docs_overrides[result["pr_number"]]
    result["classification"] = classification
    result["confidence"] = "HIGH"
    result["semantic_override_reason"] = reason
    result["evidence"].append("manual current-document/implementation review: " + reason)

# Evaluation capability matrix uses manually verified canonical commits.
evaluation_matrix = []
for name, short_sha, disposition in EVAL_EXACT_SPECS:
    sha = next(sha for sha in catalog if sha.startswith(short_sha))
    commit = catalog[sha]
    canonical_source = EVAL_CANONICAL_PRS[name]
    related_changesets = [item for item in changesets if item["module"] == "evaluations" and item["capability"] == name]
    status = "EXACTLY_IN_MAIN" if disposition == "MAIN_BASELINE" else "UNIQUE_REQUIRES_RECOVERY"
    evaluation_matrix.append({
        "capability": name,
        "status": status,
        "source_prs": [canonical_source],
        "containing_prs": commit["source_prs"],
        "source_commits": [sha],
        "active_unique_commits": [] if disposition == "MAIN_BASELINE" else [sha],
        "main_represented_commits": [sha] if disposition == "MAIN_BASELINE" else [],
        "affected_files": commit["paths"],
        "changesets": [item["changeset_id"] for item in related_changesets],
        "required": disposition != "MAIN_BASELINE",
        "confidence": "HIGH",
        "evidence": [
            f"canonical source PR #{canonical_source}, commit {sha}",
            "direct reachability verified" if disposition == "MAIN_BASELINE" else "git cherry reports unique patch; no patch-equivalent main commit",
        ],
    })

# Protection lists ensure every one of the 439 active historical PRs remains explicitly non-closeable.
pr_changesets = defaultdict(set)
for item in changesets:
    for number in item["source_prs"]:
        pr_changesets[number].add(item["changeset_id"])
protection = {
    "UNIQUE_CHANGESETS": sorted(number for number in {pr for item in changesets for pr in item["source_prs"]}),
    "NEEDS_PORT": sorted({pr for item in changesets if item["classification"] in {"REQUIRED_BUT_NEEDS_PORT", "CONFLICTING_NEEDS_DESIGN_REVIEW", "UNKNOWN"} for pr in item["source_prs"]}),
    "NEEDS_MANUAL_REVIEW": sorted({result["pr_number"] for result in conflict_results + docs_results}),
    "CONFLICTING": sorted(pr["pr_number"] for pr in phase1_prs if pr["merge_conflict_status"] == "CONFLICTING" and pr["preliminary_classification"] != "ALREADY_IN_MAIN"),
    "SECURITY_SENSITIVE": sorted({pr for item in changesets if item["security_impact"] == "SENSITIVE" for pr in item["source_prs"]}),
    "MIGRATION_SENSITIVE": sorted({pr for item in changesets if item["migration_required"] for pr in item["source_prs"]}),
    "UNKNOWN": sorted({pr for item in changesets if item["classification"] == "UNKNOWN" for pr in item["source_prs"]}),
    "DO_NOT_CLOSE_PHASE1_PRS": sorted(pr["pr_number"] for pr in active_prs),
    "AUDIT_EVIDENCE_EXCLUDED_FROM_RECOVERY": [1014],
}

package_modules = [
    "evaluations", "vehicle-detail", "fleet", "trips", "health", "connectivity", "bookings",
    "customers", "documents", "notifications", "workflow-automation", "operator-app",
    "billing-subscriptions", "stripe-payments", "voice-ai", "whatsapp-communications",
    "integrations", "administration", "roles-access", "legal-compliance", "master-admin",
    "infrastructure", "observability", "cross-cutting-platform", "documentation", "unknown",
]
packages = []
for module in package_modules:
    module_sets = [item for item in changesets if item["module"] == module]
    packages.append({
        "module": module,
        "planned_branch": f"integration/{module}-recovery-2026-08",
        "changesets": [item["changeset_id"] for item in module_sets],
        "status": "PLANNED" if module_sets else "NO_UNIQUE_CHANGESET_IDENTIFIED",
        "highest_risk": (
            "CRITICAL" if any(item["risk_level"] == "CRITICAL" for item in module_sets)
            else "HIGH" if any(item["risk_level"] == "HIGH" for item in module_sets)
            else "MEDIUM" if module_sets else "NONE"
        ),
    })

waves = []
unassigned_wave_ids = {item["changeset_id"] for item in changesets}
wave_specs = [
    ("Wave 0", "Evidence normalization and unresolved artifact disposition", lambda item: item["classification"] in {"UNKNOWN", "DOCS_ONLY", "SUPERSEDED_BY_MAIN", "OBSOLETE", "EXPERIMENTAL_DO_NOT_MERGE"}),
    ("Wave 1", "Security and data boundaries", lambda item: item["security_impact"] == "SENSITIVE" or item["tenant_isolation_impact"] == "SENSITIVE" or item["privacy_impact"] == "SENSITIVE"),
    ("Wave 2", "Persistence, migration, outbox and worker foundations", lambda item: item["migration_required"] or item["worker_dependency"] or item["infra_dependency"]),
    ("Wave 3", "Canonical providers and state owners", lambda item: item["module"] in {"connectivity", "health", "documents", "notifications", "administration", "voice-ai", "integrations"}),
    ("Wave 4", "Transactional domains and actions", lambda item: item["module"] in {"bookings", "customers", "workflow-automation", "operator-app", "billing-subscriptions", "stripe-payments", "legal-compliance", "whatsapp-communications"}),
    ("Wave 5", "Read models, analysis and domain consumers", lambda item: item["module"] in {"evaluations", "vehicle-detail", "fleet", "trips", "master-admin", "observability"}),
    ("Wave 6", "UI rollout, acceptance and remaining package work", lambda item: True),
]
for name, purpose, predicate in wave_specs:
    selected_sets = [
        item for item in changesets
        if item["changeset_id"] in unassigned_wave_ids and predicate(item)
    ]
    for item in selected_sets:
        unassigned_wave_ids.remove(item["changeset_id"])
    selected_modules = sorted({item["module"] for item in selected_sets})
    selected_packages = sorted({
        package["planned_branch"]
        for package in packages
        if package["module"] in selected_modules and package["changesets"]
    })
    waves.append({
        "wave": name,
        "purpose": purpose,
        "modules": selected_modules,
        "packages": selected_packages,
        "changesets": [item["changeset_id"] for item in selected_sets],
        "dependencies": ["previous waves"],
        "risk": "CRITICAL" if any(item["risk_level"] == "CRITICAL" for item in selected_sets) else ("HIGH" if any(item["risk_level"] == "HIGH" for item in selected_sets) else ("MEDIUM" if selected_sets else "NONE")),
        "test_gates": sorted({test for item in selected_sets for test in item["required_tests"]}),
        "vps_gate": "Only after staging acceptance; health, migration, queue, and provider smoke checks as applicable.",
        "expected_conflict_areas": sorted({path for item in selected_sets if item["expected_conflicts"] for path in item["affected_files"]})[:100],
    })
if unassigned_wave_ids:
    raise RuntimeError(f"recovery wave assignment incomplete: {sorted(unassigned_wave_ids)}")

generated_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
summary = {
    "phase1_main_sha": PHASE1_MAIN,
    "current_main_sha": current_main,
    "main_delta_left_right": main_delta,
    "generated_at": generated_at,
    "current_open_prs": len(current_rows),
    "current_open_drafts": sum(pr["isDraft"] for pr in current_rows),
    "phase1_prs_revalidated": len(by_pr),
    "changed_heads": changed_heads,
    "changed_bases": changed_bases,
    "safe_to_close_already_in_main": sum(row["classification"] == "SAFE_TO_CLOSE_ALREADY_IN_MAIN" for row in verification_rows),
    "safe_to_close_patch_equivalent": sum(row["classification"] == "SAFE_TO_CLOSE_PATCH_EQUIVALENT" for row in verification_rows),
    "phase1_classifications_corrected": sum(not row["classification"].startswith("SAFE_TO_CLOSE") for row in verification_rows),
    "stack_tips_analyzed": len(stack_results),
    "stack_tip_commit_memberships": stack_tip_commit_memberships,
    "stack_tip_distinct_commits": stack_tip_distinct_commits,
    "unique_non_main_commits": len(active_shas),
    "unique_changesets": len(changesets),
    "changeset_classifications": dict(sorted(Counter(item["classification"] for item in changesets).items())),
    "planned_recovery_modules": sum(package["status"] == "PLANNED" for package in packages),
    "planned_recovery_waves": len(waves),
    "high_risk_changesets": sum(item["risk_level"] == "HIGH" for item in changesets),
    "critical_risk_changesets": sum(item["risk_level"] == "CRITICAL" for item in changesets),
    "tenant_sensitive_changesets": sum(item["tenant_isolation_impact"] == "SENSITIVE" for item in changesets),
    "finance_sensitive_changesets": sum(item["finance_impact"] == "SENSITIVE" for item in changesets),
    "safe_to_close_candidates": len(safe_rows),
    "do_not_close_phase1_prs": len(protection["DO_NOT_CLOSE_PHASE1_PRS"]),
    "standalone_conflicting_analyzed": len(conflict_results),
    "docs_only_analyzed": len(docs_results),
    "dimo_mcp_status": "error/unavailable",
}

payload = {
    "schema_version": "2.0.0",
    "repository": REPO,
    "audit_branch": AUDIT_BRANCH,
    "summary": summary,
    "methodology": {
        "titles_used_for_classification": False,
        "current_main_unchanged": current_main == PHASE1_MAIN,
        "current_original_heads_unchanged": not changed_heads,
        "current_original_bases_unchanged": not changed_bases,
        "patch_method": "stable git patch-id indexed over current origin/main",
        "semantic_method": "non-trivial added-line presence in the same current-main path; never sufficient alone for HIGH-confidence closing",
        "stack_method": "commit-by-commit rev-list from each tip merge-base plus exact open-head ancestry",
        "limitations": [
            "GitHub data is non-transactional across API calls.",
            "DIMO MCP live tool discovery failed; connectivity classifications are UNKNOWN until canonical integration verification.",
            "Semantic supersession is medium-confidence unless exact reachability or patch identity proves it.",
            "No conflict was resolved and no production branch was created.",
        ],
    },
    "changesets": changesets,
    "dependency_edges": edges,
    "packages": packages,
    "waves": waves,
    "safe_to_close_prs": [row["pr_number"] for row in safe_rows],
    "verification_results": verification_rows,
    "stack_tip_results": stack_results,
    "conflicting_pr_results": conflict_results,
    "docs_only_results": docs_results,
    "evaluations_capabilities": evaluation_matrix,
    "protection_lists": protection,
}
(OUT / "phase2-unique-changesets-2026-08.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")

safe_columns = ["pr", "classification", "reason", "evidence", "replacement_commit_or_pr", "confidence"]
with (OUT / "phase2-safe-to-close-candidates-2026-08.csv").open("w", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=safe_columns, lineterminator="\n")
    writer.writeheader()
    for row in safe_rows:
        writer.writerow({
            "pr": row["pr_number"],
            "classification": row["classification"],
            "reason": row["reason"],
            "evidence": " | ".join(row["evidence"]),
            "replacement_commit_or_pr": csv_list(row["replacement_commit_or_pr"]),
            "confidence": row["confidence"],
        })

changeset_columns = [
    "changeset_id", "module", "capability", "source_prs", "source_commits", "affected_files_count",
    "affected_files", "current_relevance", "classification", "dependencies", "risk_level",
    "migration_required", "security_sensitive", "privacy_sensitive", "frontend_change",
    "tenant_sensitive", "finance_sensitive", "backend_change", "worker_change", "infra_change", "conflict_expected",
    "recommended_integration_method", "required_tests", "required_staging_validation",
    "required_vps_validation", "confidence", "evidence",
]
with (OUT / "phase2-unique-changesets-2026-08.csv").open("w", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=changeset_columns, lineterminator="\n")
    writer.writeheader()
    for item in changesets:
        writer.writerow({
            "changeset_id": item["changeset_id"],
            "module": item["module"],
            "capability": item["capability"],
            "source_prs": csv_list(item["source_prs"]),
            "source_commits": csv_list(item["source_commits"]),
            "affected_files_count": item["affected_files_count"],
            "affected_files": csv_list(item["affected_files"]),
            "current_relevance": item["current_relevance"],
            "classification": item["classification"],
            "dependencies": csv_list(item["dependencies"]),
            "risk_level": item["risk_level"],
            "migration_required": str(item["migration_required"]).lower(),
            "security_sensitive": str(item["security_impact"] == "SENSITIVE").lower(),
            "privacy_sensitive": str(item["privacy_impact"] == "SENSITIVE").lower(),
            "tenant_sensitive": str(item["tenant_isolation_impact"] == "SENSITIVE").lower(),
            "finance_sensitive": str(item["finance_impact"] == "SENSITIVE").lower(),
            "frontend_change": str(item["frontend_dependency"]).lower(),
            "backend_change": str(item["backend_dependency"]).lower(),
            "worker_change": str(item["worker_dependency"]).lower(),
            "infra_change": str(item["infra_dependency"]).lower(),
            "conflict_expected": csv_list(item["expected_conflicts"]),
            "recommended_integration_method": item["recommended_integration_method"],
            "required_tests": csv_list(item["required_tests"]),
            "required_staging_validation": item["required_staging_validation"],
            "required_vps_validation": item["required_vps_validation"],
            "confidence": item["confidence"],
            "evidence": " | ".join(item["evidence"]),
        })

verification_md = [
    "# Phase 2 — Already-in-main Final Verification", "",
    f"Current `origin/main`: `{current_main}`; Phase-1 main: `{PHASE1_MAIN}`; delta left/right: `{main_delta}`.", "",
    f"- Verification union: {len(verification_rows)}",
    f"- `SAFE_TO_CLOSE_ALREADY_IN_MAIN`: {summary['safe_to_close_already_in_main']}",
    f"- `SAFE_TO_CLOSE_PATCH_EQUIVALENT`: {summary['safe_to_close_patch_equivalent']}",
    f"- Corrected to not-safe/manual: {summary['phase1_classifications_corrected']}", "",
    "Exact reachability and stable patch identity are separate evidence. Semantic line coverage never creates a HIGH-confidence closing candidate.", "",
    "| PR | Final classification | Direct commits | Patch-equivalent commits | Unique commits | Main diff paths | Confidence | Evidence |",
    "|---:|---|---:|---:|---:|---:|---|---|",
]
for row in verification_rows:
    verification_md.append(
        f"| [#{row['pr_number']}](https://github.com/{REPO}/pull/{row['pr_number']}) | `{row['classification']}` | "
        f"{len(row['direct_main_commit_shas'])} | {sum(bool(v) for v in row['patch_equivalent_main_commits'].values())} | "
        f"{len(row['unique_commit_shas'])} | {row['diff_summary']['three_dot_path_count']} | `{row['confidence']}` | "
        f"{md(' ; '.join(row['evidence']))} |"
    )
(OUT / "phase2-already-in-main-verification-2026-08.md").write_text("\n".join(verification_md) + "\n")

stack_md = [
    "# Phase 2 — Stack-tip Commit/Patch Analysis", "",
    "Each tip is reconstructed commit-by-commit. The cumulative tip-to-main diff is not treated as one feature.", "",
    f"- Primary cumulative tips analyzed: {len(stack_results)}",
    f"- Tip commit memberships: {stack_tip_commit_memberships}",
    f"- Distinct tip commits: {stack_tip_distinct_commits}",
    f"- Stack components: {len(components)}", "",
    "## Interpretation guardrails", "",
    "- Connected components are ancestry facts, not recovery packages; the giant component is historical branch reuse.",
    "- PRs #312, #367 and #687 are fan-out checkpoints into unrelated modules, not shared capability dependencies.",
    "- `ChangesView.tsx`, `ArchitekturView.tsx`, audit documents and release notes are provenance, not package identity.",
    "- Large tips such as #549, #581, #623 and #838 require introduced-vs-inherited delta extraction; never merge/cherry-pick the whole tip.", "",
]
for result in stack_results:
    stack_md += [
        f"## PR #{result['stack_tip_pr']} — {result['stack_component']}", "",
        f"- Ancestor PRs: {', '.join('#'+str(v) for v in result['ancestor_prs']) or 'none'}",
        f"- Direct parents: {', '.join('#'+str(v) for v in result['direct_parent_prs']) or 'none'}",
        f"- Focus modules: {', '.join(result['focus_modules']) or 'unknown'}",
        f"- Commit order ({len(result['contained_commit_order'])}): " + (", ".join(f"`{sha}`" for sha in result["contained_commit_order"]) or "none"),
        f"- Unique not in main ({len(result['unique_not_in_main_commits'])}): " + (", ".join(f"`{sha}`" for sha in result["unique_not_in_main_commits"]) or "none"),
        f"- Patch-equivalent ({len(result['patch_equivalent_commits'])}): " + (", ".join(f"`{sha}`" for sha in result["patch_equivalent_commits"]) or "none"),
        f"- Inherited foreign-module ({len(result['inherited_foreign_module_commits'])}): " + (", ".join(f"`{sha}`" for sha in result["inherited_foreign_module_commits"]) or "none"),
        f"- Likely feature ({len(result['likely_feature_commits'])}): " + (", ".join(f"`{sha}`" for sha in result["likely_feature_commits"]) or "none"),
        f"- Conflicting ({len(result['conflicting_commits'])}): " + (", ".join(f"`{sha}`" for sha in result["conflicting_commits"]) or "none"),
        f"- Obsolete/experimental ({len(result['obsolete_commits'])}): " + (", ".join(f"`{sha}`" for sha in result["obsolete_commits"]) or "none"),
        f"- Documentation ({len(result['documentation_commits'])}): " + (", ".join(f"`{sha}`" for sha in result["documentation_commits"]) or "none"), "",
    ]
(OUT / "phase2-stack-tip-analysis-2026-08.md").write_text("\n".join(stack_md) + "\n")

dependency_md = [
    "# Phase 2 — Capability Dependency Graph", "",
    "Edge types are explicit; PR ancestry is not used as a capability dependency.", "",
    "| From | To | Type | Reason |", "|---|---|---|---|",
]
for edge in edges:
    dependency_md.append(f"| `{edge['from']}` | `{edge['to']}` | `{edge['type']}` | {md(edge['reason'])} |")
dependency_md += ["", "## Change-set nodes", "", "| Change-set | Module | Capability | Dependencies |", "|---|---|---|---|"]
for item in changesets:
    dependency_md.append(f"| `{item['changeset_id']}` | `{item['module']}` | {md(item['capability'])} | {', '.join('`'+v+'`' for v in item['dependencies']) or '—'} |")
(OUT / "phase2-capability-dependency-graph-2026-08.md").write_text("\n".join(dependency_md) + "\n")

module_md = [
    "# Phase 2 — Module Recovery Plan", "",
    "These integration branch names are plans only; no recovery branch was created.", "",
    "| Module | Planned branch | Change-sets | Highest risk | Status |", "|---|---|---:|---|---|",
]
for package in packages:
    module_md.append(f"| `{package['module']}` | `{package['planned_branch']}` | {len(package['changesets'])} | `{package['highest_risk']}` | `{package['status']}` |")
module_md += [
    "", "## Capability package boundaries", "",
    "Historical stack components are not package boundaries. Phase 3 should preserve these capability slices inside the module branches:",
    "",
    "1. Dashboard/UI cleanup; 2. TOTP/IAM; 3. ClickHouse trip evidence; 4. Invoice payment command; 5. Generated-document lifecycle;",
    "6. Fleet operational cache/read models; 7. Battery Health V2; 8. Driving Intelligence V2/canonical trip enrichment;",
    "9. Document Intake V2 and confirmation/apply safety; 10. Stations V2/state/transfers; 11. Voice AI/Twilio;",
    "12. Fleet connectivity/DIMO triggers; 13. Fleet service/health-task matching; 14. IAM role versions;",
    "15. Legal documents/deposits/rental rules; 16. Booking remediation/finance; 17. Data Authorization;",
    "18. Vehicle Detail aggregation; 19. Evaluations; 20. Workflow Automation; 21. Fleet Chat; 22. Vehicle warnings;",
    "23. Operator App; 24. Notifications; 25. Master Admin/billing/tenant safety/backup/observability.",
    "",
    "Provider/consumer relationships are explicit dependencies; shared audit/changelog files do not create a cross-cutting package.",
    "", "## Package contents", "",
]
for package in packages:
    module_md += [f"### {package['module']}", "", ", ".join(f"`{value}`" for value in package["changesets"]) or "No unique change-set identified.", ""]
(OUT / "phase2-module-recovery-plan-2026-08.md").write_text("\n".join(module_md) + "\n")

conflict_md = [
    "# Phase 2 — Standalone Conflicting PR Analysis", "",
    f"Analyzed: {len(conflict_results)}. No conflict was resolved.", "",
    "| PR | Purpose | Unique commits | Current mergeability | Conflict paths | Classification | Confidence | Evidence |",
    "|---:|---|---:|---|---:|---|---|---|",
]
for item in conflict_results:
    conflict_md.append(
        f"| [#{item['pr_number']}](https://github.com/{REPO}/pull/{item['pr_number']}) | {md(item['purpose'])} | "
        f"{len(item['unique_patches'])} | `{item['current_mergeability']}/{item['current_merge_state_status']}` | "
        f"{len(item['conflict_cause_paths'])} | `{item['classification']}` | `{item['confidence']}` | {md(' ; '.join(item['evidence']))} |"
    )
conflict_md += ["", "## Port evidence", ""]
for item in conflict_results:
    conflict_md += [
        f"### PR #{item['pr_number']}", "",
        f"- Unique commits: {', '.join('`'+sha+'`' for sha in item['unique_patches']) or 'none'}",
        f"- Conflict paths: {', '.join('`'+path+'`' for path in item['conflict_cause_paths']) or 'none'}",
        f"- Plan: {item['manual_port_plan']}", "",
    ]
(OUT / "phase2-conflicting-pr-analysis-2026-08.md").write_text("\n".join(conflict_md) + "\n")

docs_md = [
    "# Phase 2 — Docs-only PR Analysis", "",
    "| PR | Paths | Present | Missing | Classification | Confidence | Evidence |", "|---:|---:|---:|---:|---|---|---|",
]
for item in docs_results:
    docs_md.append(
        f"| [#{item['pr_number']}](https://github.com/{REPO}/pull/{item['pr_number']}) | {len(item['paths'])} | "
        f"{len(item['paths_present_in_main'])} | {len(item['paths_missing_from_main'])} | `{item['classification']}` | "
        f"`{item['confidence']}` | {md(' ; '.join(item['evidence']))} |"
    )
docs_md += ["", "## Paths", ""]
for item in docs_results:
    docs_md += [f"### PR #{item['pr_number']}", "", *[f"- `{path}`" for path in item["paths"]], ""]
(OUT / "phase2-docs-only-analysis-2026-08.md").write_text("\n".join(docs_md) + "\n")

evaluation_sets = [item for item in changesets if item["module"] == "evaluations"]
evaluation_sets.sort(key=lambda item: eval_position.get(item["capability"], 10_000))
eval_md = [
    "# Phase 2 — Evaluations Recovery Plan", "",
    "Capabilities use manually verified canonical PR/commit sources. Cumulative descendant PRs are recorded only as containment evidence, never as capability sources.", "",
    "## Current-main baseline to preserve", "",
    "- PR #752 / `850b20bc632e…`: Metric Registry — exactly reachable from main.",
    "- PR #752 / `312ee93f5315…`: Calculation Versioning — exactly reachable from main.",
    "- PR #818: current evaluation E2E/visual/accessibility fixtures.",
    "- PR #819: current evaluation observability.",
    "- PRs #820–#821: verification/readiness evidence.",
    "- Observability is a preservation/test gate, not an unimplemented dependency.", "",
    "## Capability reconstruction", "",
    "| Order | Capability | Status | Source PRs | Source commits | Files | Recovery change-set | Confidence |",
    "|---:|---|---|---|---:|---:|---|---|",
]
for index, item in enumerate(evaluation_matrix, 1):
    eval_md.append(
        f"| {index} | {md(item['capability'])} | `{item['status']}` | "
        f"{', '.join('#'+str(value) for value in item['source_prs']) or '—'} | {len(item['source_commits'])} | "
        f"{len(item['affected_files'])} | {', '.join('`'+value+'`' for value in item['changesets']) or '—'} | `{item['confidence']}` |"
    )
eval_md += ["", "## Exact recovery sequence", ""]
for index, item in enumerate(evaluation_sets, 1):
    eval_md += [
        f"{index}. `{item['changeset_id']}` — {item['capability']}",
        f"   - Source PRs: {', '.join('#'+str(value) for value in item['source_prs'])}",
        f"   - Source commits: {', '.join('`'+value+'`' for value in item['source_commits'])}",
        f"   - Classification/risk: `{item['classification']}` / `{item['risk_level']}`",
        f"   - Dependencies: {', '.join('`'+value+'`' for value in item['dependencies']) or 'none'}",
        f"   - Tests: {'; '.join(item['required_tests'])}",
    ]
eval_md += [
    "", "## Required integration gates", "",
    "1. Domain contracts and calculation/money correctness.",
    "2. Backend aggregations, data quality, lineage, tenant authorization.",
    "3. UI architecture and components.",
    "4. Recommendations/actions.",
    "5. Forecast infrastructure before forecast UI.",
    "6. Compliance, audit, tests, and observability before production.",
]
(OUT / "phase2-evaluations-recovery-plan-2026-08.md").write_text("\n".join(eval_md) + "\n")

waves_md = ["# Phase 2 — Recovery Waves", ""]
for wave in waves:
    waves_md += [
        f"## {wave['wave']} — {wave['purpose']}", "",
        f"- Modules: {', '.join('`'+value+'`' for value in wave['modules']) or 'none'}",
        f"- Planned packages: {', '.join('`'+value+'`' for value in wave['packages']) or 'none'}",
        f"- Risk: `{wave['risk']}`",
        f"- Dependencies: {', '.join(wave['dependencies'])}",
        f"- Test gates: {'; '.join(wave['test_gates']) or 'none'}",
        f"- VPS gate: {wave['vps_gate']}",
        f"- Expected conflict paths: {', '.join('`'+path+'`' for path in wave['expected_conflict_areas']) or 'none'}", "",
    ]
(OUT / "phase2-recovery-waves-2026-08.md").write_text("\n".join(waves_md) + "\n")

not_safe_md = [
    "# Phase 2 — Explicitly Not Safe to Close", "",
    f"The protected historical set contains {len(protection['DO_NOT_CLOSE_PHASE1_PRS'])} Phase-1 PRs. PR #1014 is separate audit evidence and excluded from recovery.", "",
]
for name, values in protection.items():
    not_safe_md += [f"## {name}", "", ", ".join(f"#{value}" for value in values) or "None.", ""]
(OUT / "phase2-not-safe-to-close-2026-08.md").write_text("\n".join(not_safe_md) + "\n")

executive = [
    "# Phase 2 — Executive Summary", "",
    f"Generated `{generated_at}` against current `origin/main` `{current_main}`.", "",
    "## Counts", "",
    "| Metric | Count |", "|---|---:|",
]
for key, value in summary.items():
    if isinstance(value, (int, float)):
        executive.append(f"| `{key}` | {value} |")
executive += ["", "## Change-set classifications", "", "| Classification | Count |", "|---|---:|"]
for key, value in summary["changeset_classifications"].items():
    executive.append(f"| `{key}` | {value} |")
executive += [
    "", "## Decision boundary", "",
    "- Only exact current-main reachability or stable patch identity creates HIGH-confidence closing candidates.",
    "- All 439 remaining historical PRs are explicitly protected from closure in Phase 2.",
    "- Capability changesets, not historical PR branches, are the Phase-3 integration unit.",
    "- Connectivity/DIMO packages remain `UNKNOWN` until the DIMO MCP server is available.",
    "", "## Phase 3 recommendation", "",
    "Create only the planned package branches, beginning with Wave 0 and the evaluations dependency sequence. Reimplement HIGH/CRITICAL or conflict-sensitive changesets on current main; use isolated cherry-picks only where the changeset explicitly permits it. Require staging gates before any VPS validation.",
    "", "## Errors and limits", "",
    "- One oversized current-snapshot GraphQL request returned HTTP 502; the lightweight seven-page fallback succeeded.",
    "- GitHub permission metadata remained non-authoritative (`viewerPermission=null`); authenticated reads and Git fetch worked.",
    "- DIMO MCP live tool discovery failed, so no DIMO integration claim is treated as verified.",
]
(OUT / "phase2-executive-summary-2026-08.md").write_text("\n".join(executive) + "\n")

# Keep generated Markdown deterministic and compatible with git diff --check.
for markdown_path in OUT.glob("phase2-*.md"):
    markdown_path.write_text(markdown_path.read_text().rstrip() + "\n")

print(json.dumps(summary, indent=2))
