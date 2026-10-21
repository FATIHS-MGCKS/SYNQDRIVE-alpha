#!/usr/bin/env node
/**
 * Validate KG-EED knowledge graph YAML — docs only.
 * Usage: node architecture/knowledge-graphs/energy-event-detection/scripts/validate-graph.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '../../../..');
const require = createRequire(import.meta.url);
const yaml = require(path.join(repo, 'backend/node_modules/js-yaml'));

const graphDir = path.join(repo, 'architecture/knowledge-graphs/energy-event-detection/graph');
const kgDir = path.join(repo, 'architecture/knowledge-graphs/energy-event-detection');
const ateKgDir = path.join(repo, 'architecture/knowledge-graphs/automatic-trip-enrichment');

const errors = [];
function fail(msg) {
  errors.push(msg);
}

function load(name) {
  return yaml.load(fs.readFileSync(path.join(graphDir, name), 'utf8'));
}

console.log('==> YAML syntax');
const schema = load('schema.yaml');
for (const name of ['nodes.yaml', 'edges.yaml', 'invariants.yaml']) {
  load(name);
  console.log('  OK architecture/knowledge-graphs/energy-event-detection/graph/' + name);
}

const nodes = load('nodes.yaml').nodes ?? [];
const edges = load('edges.yaml').edges ?? [];
const invariants = load('invariants.yaml').invariants ?? [];

const nodeIds = new Set();
const decisionNodes = [];

for (const n of nodes) {
  if (!n?.id) {
    fail('Node missing id');
    continue;
  }
  if (nodeIds.has(n.id)) fail(`Duplicate node id: ${n.id}`);
  nodeIds.add(n.id);

  for (const field of schema.node_fields?.required ?? []) {
    if (n[field] === undefined || n[field] === null || n[field] === '') {
      fail(`Node ${n.id} missing required field: ${field}`);
    }
  }

  if (!schema.node_types?.includes(n.type)) {
    fail(`Node ${n.id} has invalid type: ${n.type}`);
  }

  const prefix = schema.id_prefixes?.[n.type];
  if (prefix && !n.id.startsWith(prefix)) {
    fail(`Node ${n.id} id prefix does not match type ${n.type} (expected ${prefix})`);
  }

  if (!schema.epistemic_status_values?.includes(n.epistemic_status)) {
    fail(`Node ${n.id} has invalid epistemic_status: ${n.epistemic_status}`);
  }

  if (n.decision_status !== undefined) {
    if (!schema.decision_status_values?.includes(n.decision_status)) {
      fail(`Node ${n.id} has invalid decision_status: ${n.decision_status}`);
    }
    const permitted = schema.decision_status_permitted_types ?? ['decision'];
    if (!permitted.includes(n.type)) {
      fail(`Node ${n.id} (type=${n.type}) must not carry decision_status`);
    }
  }

  if (n.type === 'decision') {
    decisionNodes.push(n);
    if (!n.evidence?.length) {
      fail(`Decision node ${n.id} missing evidence provenance`);
    }
  }

  if (n.type === 'historical_incident') {
    if (!n.evidence?.length) {
      fail(`Historical incident ${n.id} missing evidence provenance`);
    }
  }

  if (n.type === 'evidence') {
    if (!n.source_type) {
      fail(`Evidence node ${n.id} missing required source_type`);
    } else if (!schema.evidence_source_types?.includes(n.source_type)) {
      fail(`Evidence node ${n.id} has invalid source_type: ${n.source_type}`);
    }
    if (!/^EED-EV-\d{4}$/.test(n.id)) {
      fail(`Evidence node ${n.id} has malformed evidence ID`);
    }
    // Architecture docs alone cannot be CONFIRMED runtime facts
    if (
      n.source_type === 'ARCHITECTURE_DOC' &&
      n.epistemic_status === 'CONFIRMED' &&
      !(n.source_paths ?? []).some((p) => /\.(ts|tsx|js|mjs)$/.test(p))
    ) {
      fail(
        `Evidence ${n.id}: ARCHITECTURE_DOC with epistemic_status CONFIRMED — downgrade to INFERRED/HISTORICAL or add code path`,
      );
    }
    if (n.source_type === 'PRODUCTION' && n.epistemic_status === 'CONFIRMED') {
      fail(
        `Evidence ${n.id}: PRODUCTION source_type should use epistemic_status HISTORICAL, not CONFIRMED`,
      );
    }
  }

  if (n.type === 'open_question' && n.epistemic_status === 'CONFIRMED') {
    fail(`Open question ${n.id} marked CONFIRMED — must not be settled fact`);
  }

  if (n.authority_class && !schema.authority_classes?.includes(n.authority_class)) {
    fail(`Node ${n.id} has invalid authority_class: ${n.authority_class}`);
  }
}

for (const n of nodes) {
  for (const ref of n.evidence ?? []) {
    if (!nodeIds.has(ref)) fail(`Node ${n.id} references missing evidence ${ref}`);
  }
}

// PRODUCTION_VALIDATED decisions need production or code/test evidence (not doc-only)
const evidenceById = new Map(nodes.filter((n) => n.type === 'evidence').map((n) => [n.id, n]));
const productionEvidenceTypes = new Set(['PRODUCTION', 'CODE', 'TEST', 'INCIDENT']);
for (const d of decisionNodes) {
  if (d.decision_status === 'PRODUCTION_VALIDATED') {
    const refs = d.evidence ?? [];
    const hasStrong = refs.some((id) => {
      const ev = evidenceById.get(id);
      return ev && productionEvidenceTypes.has(ev.source_type);
    });
    if (!hasStrong) {
      fail(
        `Decision ${d.id} PRODUCTION_VALIDATED without PRODUCTION/CODE/TEST/INCIDENT evidence`,
      );
    }
  }
}

// GRAPH.yaml authority lifecycle gate
const graphManifest = yaml.load(
  fs.readFileSync(path.join(kgDir, 'GRAPH.yaml'), 'utf8'),
);
const lifecycleStates = new Set(schema.authority_lifecycle_states ?? []);

if (!graphManifest.authority_review?.artifact) {
  fail('GRAPH.yaml missing authority_review.artifact gate');
}
const reviewArtifact = path.join(repo, graphManifest.authority_review.artifact);
if (!fs.existsSync(reviewArtifact)) {
  fail(`Missing authority review artifact: ${graphManifest.authority_review.artifact}`);
}

const status = graphManifest.status;
const authorityState = graphManifest.authority_state ?? graphManifest.status;
if (!lifecycleStates.has(status)) {
  fail(`GRAPH.yaml status invalid lifecycle state: ${status}`);
}
if (!lifecycleStates.has(authorityState)) {
  fail(`GRAPH.yaml authority_state invalid lifecycle state: ${authorityState}`);
}
if (status !== authorityState) {
  fail(`GRAPH.yaml status (${status}) must match authority_state (${authorityState})`);
}

// Pre-merge: CANONICAL is forbidden until merged to main
if (status === 'CANONICAL') {
  if (authorityState !== 'CANONICAL') {
    fail('status CANONICAL requires authority_state CANONICAL');
  }
  const mainShaCanon = graphManifest.main_sha_at_canonicalization;
  const shaRegex = /^[0-9a-f]{40}$/;
  if (!mainShaCanon || typeof mainShaCanon !== 'string' || !shaRegex.test(mainShaCanon)) {
    fail('CANONICAL requires main_sha_at_canonicalization to be a 40-char git SHA');
  }
} else if (status === 'APPROVED_FOR_CANONICAL_MERGE') {
  if (!graphManifest.authority_review?.verdict) {
    fail('APPROVED_FOR_CANONICAL_MERGE requires authority_review.verdict');
  }
  if (!graphManifest.authority_closure?.artifact) {
    fail('APPROVED_FOR_CANONICAL_MERGE requires authority_closure.artifact');
  }
  const closureArtifact = path.join(repo, graphManifest.authority_closure.artifact);
  if (!fs.existsSync(closureArtifact)) {
    fail(`Missing authority closure artifact: ${graphManifest.authority_closure.artifact}`);
  }
  const mainShaCanon = graphManifest.main_sha_at_canonicalization;
  if (mainShaCanon !== null && mainShaCanon !== undefined && mainShaCanon !== '') {
    fail(
      'APPROVED_FOR_CANONICAL_MERGE requires main_sha_at_canonicalization: null (set after merge)',
    );
  }
  if (!graphManifest.authority_closure?.post_reconcile_merge_sha) {
    fail('authority_closure.post_reconcile_merge_sha required (stable merge commit, not branch head)');
  }
} else {
  fail(
    `GRAPH.yaml status must be APPROVED_FOR_CANONICAL_MERGE (pre-merge) or CANONICAL (post-merge); got ${status}`,
  );
}
console.log(`==> Authority lifecycle gate: ${status} OK`);

console.log('==> Node checks:', nodes.length, 'nodes');

for (const e of edges) {
  for (const field of schema.edge_fields?.required ?? ['from', 'relation', 'to']) {
    if (!e[field]) fail(`Edge missing ${field}: ${JSON.stringify(e)}`);
  }
  if (!schema.relation_types?.includes(e.relation)) {
    fail(`Edge ${e.from} -${e.relation}-> ${e.to} has invalid relation`);
  }
  for (const end of ['from', 'to']) {
    if (!nodeIds.has(e[end])) {
      fail(`MISSING ${end}=${e[end]} in edge ${e.from} -${e.relation}-> ${e.to}`);
    }
  }
}
console.log('==> Edge references:', edges.length, 'OK');

const invIds = new Set();
const requiredInv = [
  'EED-INV-001',
  'EED-INV-002',
  'EED-INV-003',
  'EED-INV-004',
  'EED-INV-005',
  'EED-INV-006',
  'EED-INV-007',
  'EED-INV-008',
  'EED-INV-009',
  'EED-INV-010',
];

for (const inv of invariants) {
  if (!inv.id) fail('Invariant missing id');
  if (invIds.has(inv.id)) fail(`Duplicate invariant id: ${inv.id}`);
  invIds.add(inv.id);

  if (!schema.invariant_kinds?.includes(inv.kind)) {
    fail(`Invariant ${inv.id} has invalid kind: ${inv.kind}`);
  }
  if (!schema.epistemic_status_values?.includes(inv.epistemic_status)) {
    fail(`Invariant ${inv.id} has invalid epistemic_status: ${inv.epistemic_status}`);
  }
  for (const ref of inv.evidence ?? []) {
    if (!nodeIds.has(ref)) fail(`Invariant ${inv.id} references missing evidence ${ref}`);
  }
}
for (const req of requiredInv) {
  if (!invIds.has(req)) fail(`Missing required invariant: ${req}`);
}
console.log('==> Invariant checks:', invariants.length, 'OK');

// KG-ATE reciprocal external authority
if (!nodeIds.has('EED-EXT-001')) {
  fail('Missing external authority node EED-EXT-001 (KG-ATE)');
}
const ateGraphYaml = path.join(ateKgDir, 'GRAPH.yaml');
if (fs.existsSync(ateGraphYaml)) {
  const ateText = fs.readFileSync(ateGraphYaml, 'utf8');
  if (!ateText.includes('KG-EED') && !fs.existsSync(path.join(ateKgDir, 'graph/nodes.yaml'))) {
    fail('KG-ATE graph not found for boundary check');
  } else {
    const ateNodes = yaml.load(fs.readFileSync(path.join(ateKgDir, 'graph/nodes.yaml'), 'utf8'));
    const ateNodeList = ateNodes.nodes ?? [];
    const ateExtEed = ateNodeList.some((n) => n.id === 'ATE-EXT-006');
    if (!ateExtEed) fail('KG-ATE missing reciprocal ATE-EXT-006 (KG-EED) node');
    else console.log('==> KG-ATE boundary: ATE-EXT-006 present');
  }
} else {
  fail('KG-ATE GRAPH.yaml missing — cannot verify ATE/EED boundary');
}

// Source paths exist (skip directory-only paths ending without file)
const paths = new Set();
for (const n of nodes) for (const p of n.source_paths ?? []) paths.add(p);
for (const inv of invariants) for (const p of inv.source_paths ?? []) paths.add(p);
const missingPaths = [...paths].filter((p) => {
  const full = path.join(repo, p);
  return !fs.existsSync(full);
}).sort();
for (const p of missingPaths) fail(`MISSING source_path: ${p}`);
console.log('==> Source paths:', paths.size, missingPaths.length ? 'FAIL' : 'OK');

// Required graph areas smoke check
const requiredNodePrefixes = [
  'EED-SVC-001',
  'EED-COMP-003',
  'EED-COMP-004',
  'EED-HI-001',
  'EED-DEC-009',
  'EED-UI-001',
  'EED-UI-002',
  'EED-ST-001',
  'EED-FB-001',
];
for (const id of requiredNodePrefixes) {
  if (!nodeIds.has(id)) fail(`Missing required area node: ${id}`);
}
console.log('==> Required graph areas: OK');

if (errors.length) {
  console.error('\n==> VALIDATION FAILED');
  for (const e of errors) console.error('  -', e);
  process.exit(1);
}

const evidenceCount = nodes.filter((n) => n.type === 'evidence').length;
const oqCount = nodes.filter((n) => n.type === 'open_question').length;
const opCount = nodes.length - evidenceCount;

console.log('\n==> VALIDATION PASSED');
console.log(
  `    operational_nodes=${opCount} evidence=${evidenceCount} edges=${edges.length} invariants=${invariants.length} decisions=${decisionNodes.length} open_questions=${oqCount}`,
);
