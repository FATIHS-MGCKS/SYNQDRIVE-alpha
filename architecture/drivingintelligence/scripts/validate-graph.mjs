#!/usr/bin/env node
/**
 * Validate Driving Intelligence knowledge graph YAML — docs only.
 * Usage: node architecture/drivingintelligence/scripts/validate-graph.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '../../..');
const require = createRequire(import.meta.url);
const yaml = require(path.join(repo, 'backend/node_modules/js-yaml'));

const graphDir = path.join(repo, 'architecture/drivingintelligence/graph');
const authorityDir = path.join(repo, 'architecture/drivingintelligence');

const errors = [];
function fail(msg) {
  errors.push(msg);
}

function load(name) {
  return yaml.load(fs.readFileSync(path.join(graphDir, name), 'utf8'));
}

function assertNoDuplicateEnumValues(schema, key, label) {
  const values = schema[key] ?? [];
  const seen = new Set();
  for (const v of values) {
    if (seen.has(v)) fail(`Duplicate ${label} value: ${v}`);
    seen.add(v);
  }
}

function collectStableIdsFromMarkdown(dir, pattern) {
  const ids = new Set();
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.name.endsWith('.md')) {
        const text = fs.readFileSync(full, 'utf8');
        for (const m of text.matchAll(pattern)) ids.add(m[0]);
      }
    }
  };
  walk(dir);
  return ids;
}

function parseDecisionStatusesFromMarkdown(filePath) {
  const map = new Map();
  if (!fs.existsSync(filePath)) return map;
  const text = fs.readFileSync(filePath, 'utf8');
  const sectionRe = /## (DI-DEC-[A-Z0-9-]+)[^\n]*\n[\s\S]*?\| \*\*STATUS\*\* \| ([^|]+) \|/g;
  for (const m of text.matchAll(sectionRe)) {
    const id = m[1];
    const status = m[2].trim().replace(/\s*\([^)]*\)\s*/g, '').trim();
    map.set(id, status);
  }
  return map;
}

function parseKnowledgeGraphDecisionTable(filePath) {
  const map = new Map();
  if (!fs.existsSync(filePath)) return map;
  const text = fs.readFileSync(filePath, 'utf8');
  const rowRe = /\| (DI-DEC-[A-Z0-9-]+) \|[^|]+\| ([A-Z_]+(?: \([^)]+\))?) \|/g;
  for (const m of text.matchAll(rowRe)) {
    const id = m[1];
    const status = m[2].trim().replace(/\s*\([^)]*\)\s*/g, '').trim();
    map.set(id, status);
  }
  return map;
}

function parseDecisionRegisterEvidenceFields(filePath) {
  const entries = [];
  if (!fs.existsSync(filePath)) return entries;
  const text = fs.readFileSync(filePath, 'utf8');
  const sectionRe = /## (DI-DEC-[A-Z0-9-]+)[^\n]*\n([\s\S]*?)(?=\n## DI-DEC-|\n*$)/g;
  for (const m of text.matchAll(sectionRe)) {
    const decisionId = m[1];
    const body = m[2];
    const evidenceMatches = [...body.matchAll(/\| \*\*EVIDENCE\*\* \| ([^|]+) \|/g)];
    const evidenceCount = evidenceMatches.length;
    const primaryMatch = evidenceCount === 1 ? evidenceMatches[0] : null;
    entries.push({
      decisionId,
      evidenceCount,
      refs: primaryMatch
        ? [...primaryMatch[1].matchAll(/DI-[A-Z0-9-]+/g)].map((x) => x[0])
        : [],
    });
  }
  return entries;
}

function parseDecisionRegisterSectionIds(filePath) {
  const ids = [];
  if (!fs.existsSync(filePath)) return ids;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const m of text.matchAll(/## (DI-DEC-[A-Z0-9-]+)/g)) ids.push(m[1]);
  return ids;
}

function assertEvidenceReferenceAllowed(ownerLabel, ref, nodeById, evidenceRefTypes) {
  const node = nodeById.get(ref);
  if (!node) {
    fail(`${ownerLabel} references missing node ${ref}`);
    return;
  }
  if (!evidenceRefTypes.includes(node.type)) {
    fail(
      `${ownerLabel} evidence ref ${ref} has invalid type ${node.type}; permitted: ${evidenceRefTypes.join(', ')}`,
    );
  }
  if (!ref.startsWith('DI-EVID-') && !ref.startsWith('DI-TEST-')) {
    fail(`${ownerLabel} evidence ref ${ref} must use DI-EVID-* or DI-TEST-* prefix`);
  }
}

console.log('==> YAML syntax');
const schema = load('schema.yaml');
for (const name of ['nodes.yaml', 'edges.yaml', 'invariants.yaml']) {
  load(name);
  console.log('  OK architecture/drivingintelligence/graph/' + name);
}

for (const [key, label] of [
  ['node_types', 'node_types'],
  ['epistemic_status_values', 'epistemic_status_values'],
  ['decision_status_values', 'decision_status_values'],
  ['relation_types', 'relation_types'],
  ['invariant_kinds', 'invariant_kinds'],
  ['evidence_source_types', 'evidence_source_types'],
]) {
  assertNoDuplicateEnumValues(schema, key, label);
}

const nodes = load('nodes.yaml').nodes ?? [];
const edges = load('edges.yaml').edges ?? [];
const invariants = load('invariants.yaml').invariants ?? [];
const evidenceRefTypes = schema.evidence_reference_permitted_types ?? ['evidence', 'test_evidence'];

const nodeIds = new Set();
const nodeById = new Map();
for (const n of nodes) {
  if (!n?.id) {
    fail('Node missing id');
    continue;
  }
  if (nodeIds.has(n.id)) fail(`Duplicate node id: ${n.id}`);
  nodeIds.add(n.id);
  nodeById.set(n.id, n);

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
    if (!permitted.includes(n.type) && !permitted.includes('hypothesis')) {
      // hypothesis also allowed
    }
    if (n.type !== 'decision' && n.type !== 'hypothesis') {
      fail(`Node ${n.id} (type=${n.type}) must not carry decision_status`);
    }
  }
}

for (const n of nodes) {
  for (const ref of n.evidence ?? []) {
    if (!nodeIds.has(ref)) fail(`Node ${n.id} references missing evidence ${ref}`);
    const refType = nodeById.get(ref)?.type;
    if (!evidenceRefTypes.includes(refType)) {
      fail(
        `Node ${n.id} evidence ref ${ref} has invalid type ${refType}; permitted: ${evidenceRefTypes.join(', ')}`,
      );
    }
  }
}

console.log('==> Node field / prefix / status / evidence-ref checks:', nodes.length, 'nodes');

const edgeIds = new Set();
for (const e of edges) {
  for (const field of schema.edge_fields?.required ?? ['id', 'from', 'relation', 'to']) {
    if (!e[field]) fail(`Edge missing ${field}: ${JSON.stringify(e)}`);
  }
  if (edgeIds.has(e.id)) fail(`Duplicate edge id: ${e.id}`);
  edgeIds.add(e.id);

  if (!schema.relation_types?.includes(e.relation)) {
    fail(`Edge ${e.id} has invalid relation: ${e.relation}`);
  }
  for (const end of ['from', 'to']) {
    if (!nodeIds.has(e[end])) {
      fail(`MISSING ${end}=${e[end]} in edge ${e.id} (${e.from} -${e.relation}-> ${e.to})`);
    }
  }
}
console.log('==> Edge references:', edges.length, 'OK');

const invIds = new Set();
for (const inv of invariants) {
  if (!inv.id) fail('Invariant missing id');
  if (invIds.has(inv.id)) fail(`Duplicate invariant id: ${inv.id}`);
  invIds.add(inv.id);

  if (!inv.id.startsWith('DI-INV-')) fail(`Invariant ${inv.id} must use DI-INV- prefix`);
  if (!schema.invariant_kinds?.includes(inv.kind)) {
    fail(`Invariant ${inv.id} has invalid kind: ${inv.kind}`);
  }
  if (!schema.epistemic_status_values?.includes(inv.epistemic_status)) {
    fail(`Invariant ${inv.id} has invalid epistemic_status: ${inv.epistemic_status}`);
  }
  for (const ref of inv.evidence ?? []) {
    if (!nodeIds.has(ref)) fail(`Invariant ${inv.id} references missing evidence ${ref}`);
    const refType = nodeById.get(ref)?.type;
    if (!evidenceRefTypes.includes(refType)) {
      fail(
        `Invariant ${inv.id} evidence ref ${ref} has invalid type ${refType}; permitted: ${evidenceRefTypes.join(', ')}`,
      );
    }
  }
}
console.log('==> Invariant checks:', invariants.length, 'OK');

const paths = new Set();
for (const n of nodes) for (const p of n.source_paths ?? []) paths.add(p);
for (const inv of invariants) for (const p of inv.source_paths ?? []) paths.add(p);
const missingPaths = [...paths].filter((p) => !fs.existsSync(path.join(repo, p))).sort();
for (const p of missingPaths) fail(`MISSING source_path: ${p}`);
console.log('==> Source paths:', paths.size, missingPaths.length ? 'FAIL' : 'OK');

const gapPattern = /DI-GAP-[A-Z0-9-]+/g;
const hypPattern = /DI-HYP-[A-Z0-9-]+/g;
const contraPattern = /DI-CONTRA-[A-Z0-9-]+/g;

const indexedGaps = collectStableIdsFromMarkdown(authorityDir, gapPattern);
const indexedHyps = collectStableIdsFromMarkdown(authorityDir, hypPattern);
const indexedContras = collectStableIdsFromMarkdown(authorityDir, contraPattern);

for (const id of indexedGaps) {
  if (!nodeIds.has(id)) fail(`Indexed GAP ${id} missing from graph nodes`);
}
for (const id of indexedHyps) {
  if (!nodeIds.has(id)) fail(`Indexed HYP ${id} missing from graph nodes`);
}
for (const id of indexedContras) {
  if (!nodeIds.has(id)) fail(`Indexed CONTRA ${id} missing from graph nodes`);
}
console.log(
  '==> Canonical index resolution:',
  `GAP=${indexedGaps.size}`,
  `HYP=${indexedHyps.size}`,
  `CONTRA=${indexedContras.size}`,
);

const registerStatuses = parseDecisionStatusesFromMarkdown(
  path.join(authorityDir, 'decisions/DECISION_REGISTER.md'),
);
const kgStatuses = parseKnowledgeGraphDecisionTable(
  path.join(authorityDir, 'KNOWLEDGE_GRAPH.md'),
);

for (const n of nodes) {
  if (n.type !== 'decision' || !n.decision_status) continue;
  const reg = registerStatuses.get(n.id);
  if (reg && reg !== n.decision_status) {
    fail(
      `Decision ${n.id} status mismatch: nodes.yaml=${n.decision_status} vs DECISION_REGISTER.md=${reg}`,
    );
  }
  const kg = kgStatuses.get(n.id);
  if (kg && kg !== n.decision_status) {
    fail(`Decision ${n.id} status mismatch: nodes.yaml=${n.decision_status} vs KNOWLEDGE_GRAPH.md=${kg}`);
  }
}

const registerDecisionIds = parseDecisionRegisterSectionIds(
  path.join(authorityDir, 'decisions/DECISION_REGISTER.md'),
);
const graphDecisionIds = nodes.filter((n) => n.type === 'decision').map((n) => n.id).sort();
const registerEvidence = parseDecisionRegisterEvidenceFields(
  path.join(authorityDir, 'decisions/DECISION_REGISTER.md'),
);
const registerEvidenceById = new Map(registerEvidence.map((e) => [e.decisionId, e]));

for (const decisionId of registerDecisionIds) {
  const entry = registerEvidenceById.get(decisionId);
  if (!entry) {
    fail(`DECISION_REGISTER ${decisionId} section missing from evidence parser output`);
    continue;
  }
  if (entry.evidenceCount === 0) {
    fail(`DECISION_REGISTER ${decisionId} missing required EVIDENCE field`);
    continue;
  }
  if (entry.evidenceCount > 1) {
    fail(`DECISION_REGISTER ${decisionId} has ${entry.evidenceCount} EVIDENCE fields; exactly one required`);
    continue;
  }
  for (const ref of entry.refs) {
    assertEvidenceReferenceAllowed(
      `DECISION_REGISTER ${decisionId} EVIDENCE`,
      ref,
      nodeById,
      evidenceRefTypes,
    );
  }
}

if (registerDecisionIds.length !== graphDecisionIds.length) {
  fail(
    `DECISION_REGISTER decision count (${registerDecisionIds.length}) != graph decision nodes (${graphDecisionIds.length})`,
  );
}
for (const id of graphDecisionIds) {
  if (!registerDecisionIds.includes(id)) {
    fail(`Graph decision ${id} missing from DECISION_REGISTER.md`);
  }
}
console.log('==> Decision register consistency:', registerDecisionIds.length, 'decisions');

if (errors.length) {
  console.error('\n==> VALIDATION FAILED');
  for (const e of errors) console.error('  -', e);
  process.exit(1);
}

console.log('==> All validations passed');
