#!/usr/bin/env node
/**
 * Validate Tankstellenerkennung knowledge graph YAML — docs only.
 * Usage: node architecture/tankstellenerkennung/scripts/validate-graph.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '../../..');
const require = createRequire(import.meta.url);
const yaml = require(path.join(repo, 'backend/node_modules/js-yaml'));

const graphDir = path.join(repo, 'architecture/tankstellenerkennung/graph');
const authorityDir = path.join(repo, 'architecture/tankstellenerkennung');

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
  const sectionRe = /## (FST-DEC-[A-Z0-9-]+)[^\n]*\n[\s\S]*?\| \*\*STATUS\*\* \| ([^|]+) \|/g;
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
  const rowRe = /\| (FST-DEC-[A-Z0-9-]+) \|[^|]+\| ([A-Z_]+(?: \([^)]+\))?) \|/g;
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
  const sectionRe = /## (FST-DEC-[A-Z0-9-]+)[^\n]*\n([\s\S]*?)(?=\n## FST-DEC-|\n*$)/g;
  for (const m of text.matchAll(sectionRe)) {
    const decisionId = m[1];
    const body = m[2];
    const evidenceMatch = body.match(/\| \*\*EVIDENCE\*\* \| ([^|]+) \|/);
    entries.push({
      decisionId,
      hasEvidenceField: Boolean(evidenceMatch),
      raw: evidenceMatch?.[1] ?? null,
      refs: evidenceMatch ? [...evidenceMatch[1].matchAll(/FST-[A-Z0-9-]+/g)].map((x) => x[0]) : [],
    });
  }
  return entries;
}

function parseDecisionRegisterSectionIds(filePath) {
  const ids = [];
  if (!fs.existsSync(filePath)) return ids;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const m of text.matchAll(/## (FST-DEC-[A-Z0-9-]+)/g)) ids.push(m[1]);
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
  if (!ref.startsWith('FST-EVID-') && !ref.startsWith('FST-TEST-')) {
    fail(`${ownerLabel} evidence ref ${ref} must use FST-EVID-* or FST-TEST-* prefix`);
  }
}

function typeOf(nodeById, id) {
  return nodeById.get(id)?.type;
}

function isType(nodeById, id, types) {
  return types.includes(typeOf(nodeById, id));
}

function validateSemanticEdge(e, nodeById) {
  const { from, relation, to } = e;
  const ft = typeOf(nodeById, from);
  const tt = typeOf(nodeById, to);

  switch (relation) {
    case 'queries':
      if (!isType(nodeById, from, ['query', 'resolver'])) {
        fail(`Edge ${from} -queries-> ${to}: from must be query|resolver (got ${ft})`);
      }
      if (!isType(nodeById, to, ['data'])) {
        fail(`Edge ${from} -queries-> ${to}: to must be data (got ${tt})`);
      }
      break;
    case 'supports':
      if (!isType(nodeById, from, ['evidence', 'test_evidence'])) {
        fail(`Edge ${from} -supports-> ${to}: from must be evidence|test_evidence (got ${ft})`);
      }
      break;
    case 'tested_by':
      if (!isType(nodeById, to, ['test_evidence'])) {
        fail(`Edge ${from} -tested_by-> ${to}: to must be test_evidence (got ${tt})`);
      }
      break;
    case 'gates':
      if (!isType(nodeById, from, ['policy'])) {
        fail(`Edge ${from} -gates-> ${to}: from must be policy (got ${ft})`);
      }
      if (!isType(nodeById, to, ['pipeline', 'orchestrator', 'queue'])) {
        fail(`Edge ${from} -gates-> ${to}: to must be pipeline|orchestrator|queue (got ${tt})`);
      }
      break;
    case 'enqueues':
      if (!isType(nodeById, from, ['pipeline'])) {
        fail(`Edge ${from} -enqueues-> ${to}: from must be pipeline (got ${ft})`);
      }
      if (!isType(nodeById, to, ['queue'])) {
        fail(`Edge ${from} -enqueues-> ${to}: to must be queue (got ${tt})`);
      }
      break;
    case 'consumed_by': {
      const ok =
        (ft === 'queue' && tt === 'worker') ||
        (ft === 'api' && tt === 'consumer') ||
        (ft === 'query' && tt === 'resolver') ||
        (ft === 'dto' && tt === 'api');
      if (!ok) {
        fail(
          `Edge ${from} -consumed_by-> ${to}: allowed patterns queue→worker, api→consumer, query→resolver, dto→api`,
        );
      }
      break;
    }
    case 'persists':
      if (!isType(nodeById, from, ['orchestrator'])) {
        fail(`Edge ${from} -persists-> ${to}: from must be orchestrator (got ${ft})`);
      }
      if (!isType(nodeById, to, ['persist'])) {
        fail(`Edge ${from} -persists-> ${to}: to must be persist (got ${tt})`);
      }
      break;
    case 'uses':
      if (!isType(nodeById, from, ['orchestrator', 'worker', 'pipeline', 'recovery'])) {
        fail(`Edge ${from} -uses-> ${to}: from must be orchestrator|worker|pipeline|recovery (got ${ft})`);
      }
      if (!isType(nodeById, to, ['authority'])) {
        fail(`Edge ${from} -uses-> ${to}: to must be authority (got ${tt})`);
      }
      break;
    case 'invokes':
      if (!isType(nodeById, from, ['orchestrator'])) {
        fail(`Edge ${from} -invokes-> ${to}: from must be orchestrator (got ${ft})`);
      }
      if (!isType(nodeById, to, ['resolver'])) {
        fail(`Edge ${from} -invokes-> ${to}: to must be resolver (got ${tt})`);
      }
      break;
    case 'input_to':
      if (!isType(nodeById, from, ['authority', 'event'])) {
        fail(`Edge ${from} -input_to-> ${to}: from must be authority|event (got ${ft})`);
      }
      if (!isType(nodeById, to, ['resolver', 'orchestrator'])) {
        fail(`Edge ${from} -input_to-> ${to}: to must be resolver|orchestrator (got ${tt})`);
      }
      break;
    case 'returns_to':
      if (!isType(nodeById, from, ['resolver'])) {
        fail(`Edge ${from} -returns_to-> ${to}: from must be resolver (got ${ft})`);
      }
      if (!isType(nodeById, to, ['orchestrator'])) {
        fail(`Edge ${from} -returns_to-> ${to}: to must be orchestrator (got ${tt})`);
      }
      break;
    case 'derives_from':
      if (!isType(nodeById, from, ['authority', 'dto'])) {
        fail(`Edge ${from} -derives_from-> ${to}: from must be authority|dto (got ${ft})`);
      }
      if (!isType(nodeById, to, ['state', 'confidence', 'authority'])) {
        fail(`Edge ${from} -derives_from-> ${to}: to must be state|confidence|authority (got ${tt})`);
      }
      break;
    case 'superseded_by':
      if (!isType(nodeById, from, ['superseded_approach', 'rejected_approach'])) {
        fail(
          `Edge ${from} -superseded_by-> ${to}: from must be superseded_approach|rejected_approach (got ${ft})`,
        );
      }
      if (!isType(nodeById, to, ['decision'])) {
        fail(`Edge ${from} -superseded_by-> ${to}: to must be decision (got ${tt})`);
      }
      break;
    default:
      break;
  }
}

console.log('==> YAML syntax');
const schema = load('schema.yaml');
for (const name of ['nodes.yaml', 'edges.yaml', 'invariants.yaml']) {
  load(name);
  console.log('  OK architecture/tankstellenerkennung/graph/' + name);
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
    if (!permitted.includes(n.type)) {
      fail(`Node ${n.id} (type=${n.type}) must not carry decision_status`);
    }
  }

  if (n.reconstruction_maturity !== undefined) {
    if (!schema.reconstruction_maturity_values?.includes(n.reconstruction_maturity)) {
      fail(`Node ${n.id} has invalid reconstruction_maturity: ${n.reconstruction_maturity}`);
    }
  }

  if (n.type === 'evidence' || n.type === 'test_evidence') {
    if (!n.source_type) {
      fail(`Evidence node ${n.id} missing required source_type`);
    } else if (!schema.evidence_source_types?.includes(n.source_type)) {
      fail(`Evidence node ${n.id} has invalid source_type: ${n.source_type}`);
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
  validateSemanticEdge(e, nodeById);
}
console.log('==> Edge references + semantic checks:', edges.length, 'OK');

const invIds = new Set();
for (const inv of invariants) {
  if (!inv.id) fail('Invariant missing id');
  if (invIds.has(inv.id)) fail(`Duplicate invariant id: ${inv.id}`);
  invIds.add(inv.id);

  if (!inv.id.startsWith('FST-INV-')) fail(`Invariant ${inv.id} must use FST-INV- prefix`);
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

const gapPattern = /FST-GAP-[A-Z0-9-]+/g;
const hypPattern = /FST-HYP-[A-Z0-9-]+/g;
const contraPattern = /FST-CONTRA-[A-Z0-9-]+/g;
const supersededPattern = /FST-SUPERSEDED-[A-Z0-9-]+/g;
const rejectPattern = /FST-REJECT-[A-Z0-9-]+/g;

const indexedGaps = collectStableIdsFromMarkdown(authorityDir, gapPattern);
const indexedHyps = collectStableIdsFromMarkdown(authorityDir, hypPattern);
const indexedContras = collectStableIdsFromMarkdown(authorityDir, contraPattern);
const indexedSuperseded = collectStableIdsFromMarkdown(authorityDir, supersededPattern);
const indexedRejects = collectStableIdsFromMarkdown(authorityDir, rejectPattern);

for (const id of indexedGaps) {
  if (!nodeIds.has(id)) fail(`Indexed GAP ${id} missing from graph nodes`);
}
for (const id of indexedHyps) {
  if (!nodeIds.has(id)) fail(`Indexed HYP ${id} missing from graph nodes`);
}
for (const id of indexedContras) {
  if (!nodeIds.has(id)) fail(`Indexed CONTRA ${id} missing from graph nodes`);
}
for (const id of indexedSuperseded) {
  if (!nodeIds.has(id)) fail(`Indexed SUPERSEDED ${id} missing from graph nodes`);
}
for (const id of indexedRejects) {
  if (!nodeIds.has(id)) fail(`Indexed REJECT ${id} missing from graph nodes`);
}
console.log(
  '==> Canonical index resolution:',
  `GAP=${indexedGaps.size}`,
  `HYP=${indexedHyps.size}`,
  `CONTRA=${indexedContras.size}`,
  `SUPERSEDED=${indexedSuperseded.size}`,
  `REJECT=${indexedRejects.size}`,
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

for (const [id, status] of registerStatuses) {
  const node = nodeById.get(id);
  if (!node) fail(`DECISION_REGISTER.md references ${id} missing from graph nodes`);
  else if (node.decision_status !== status) {
    fail(
      `Decision ${id} status mismatch: nodes.yaml=${node.decision_status} vs DECISION_REGISTER.md=${status}`,
    );
  }
}
console.log('==> Decision status consistency:', registerStatuses.size, 'register entries checked');

const registerEvidence = parseDecisionRegisterEvidenceFields(
  path.join(authorityDir, 'decisions/DECISION_REGISTER.md'),
);
const registerDecisionIds = parseDecisionRegisterSectionIds(
  path.join(authorityDir, 'decisions/DECISION_REGISTER.md'),
);
const graphDecisionIds = nodes.filter((n) => n.type === 'decision').map((n) => n.id).sort();
const registerEvidenceById = new Map(registerEvidence.map((e) => [e.decisionId, e]));

for (const decisionId of registerDecisionIds) {
  const entry = registerEvidenceById.get(decisionId);
  if (!entry) {
    fail(`DECISION_REGISTER ${decisionId} section missing from evidence parser output`);
    continue;
  }
  if (!entry.hasEvidenceField) {
    fail(`DECISION_REGISTER ${decisionId} missing required EVIDENCE field`);
    continue;
  }
  if (entry.refs.length === 0) {
    fail(`DECISION_REGISTER ${decisionId} EVIDENCE field has no FST-* references`);
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
console.log(
  '==> Decision Register EVIDENCE field checks:',
  registerDecisionIds.length,
  'decisions,',
  registerEvidence.filter((e) => e.hasEvidenceField).length,
  'with EVIDENCE',
);

if (errors.length) {
  console.error('\n==> VALIDATION FAILED');
  for (const e of errors) console.error('  -', e);
  process.exit(1);
}

console.log('==> All validations passed');
