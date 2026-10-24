#!/usr/bin/env node
/**
 * Validate Tires Health knowledge graph YAML — docs only.
 * Usage: node architecture/tires/scripts/validate-graph.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '../../..');
const require = createRequire(import.meta.url);
const yaml = require(path.join(repo, 'backend/node_modules/js-yaml'));

const authorityDir = path.join(repo, 'architecture/tires');
const graphDir = path.join(authorityDir, 'graph');
const PREFIX = 'TIRE-';

const errors = [];
const fail = (msg) => errors.push(msg);
const load = (name) => yaml.load(fs.readFileSync(path.join(graphDir, name), 'utf8'));

const MANDATORY_FILES = [
  'README.md',
  'AUDIT_MANIFEST.md',
  'CURRENT_STATE.md',
  'AGENT_CONTRACT.md',
  'KNOWLEDGE_GRAPH.md',
  'graph/schema.yaml',
  'graph/nodes.yaml',
  'graph/edges.yaml',
  'graph/invariants.yaml',
  'decisions/DECISION_REGISTER.md',
  'evidence/EVIDENCE_INDEX.md',
  'evidence/PRODUCTION_BASELINE.md',
  'contradictions/KNOWLEDGE_GAPS.md',
  'contradictions/OPEN_CONTRADICTIONS.md',
  'research/CHANGE_LEDGER.md',
  'research/FAILED_APPROACHES.md',
  'research/OPEN_HYPOTHESES.md',
  'research/OPEN_QUESTIONS.md',
  'scripts/validate-graph.mjs',
  'scripts/validate-graph.sh',
];

console.log('==> Mandatory authority files (MODULE_AUTHORITY_STANDARD.md)');
for (const rel of MANDATORY_FILES) {
  if (!fs.existsSync(path.join(authorityDir, rel))) fail(`Missing mandatory file: architecture/tires/${rel}`);
}

console.log('==> YAML syntax');
const schema = load('schema.yaml');
for (const name of ['nodes.yaml', 'edges.yaml', 'invariants.yaml']) {
  load(name);
  console.log('  OK architecture/tires/graph/' + name);
}

for (const key of [
  'node_types',
  'epistemic_status_values',
  'decision_status_values',
  'relation_types',
  'invariant_kinds',
  'evidence_source_types',
]) {
  const seen = new Set();
  for (const v of schema[key] ?? []) {
    if (seen.has(v)) fail(`Duplicate ${key} value: ${v}`);
    seen.add(v);
  }
}

const nodes = load('nodes.yaml').nodes ?? [];
const edges = load('edges.yaml').edges ?? [];
const invariants = load('invariants.yaml').invariants ?? [];
const evidenceRefTypes = schema.evidence_reference_permitted_types ?? ['evidence', 'test_evidence'];

const nodeById = new Map();
for (const n of nodes) {
  if (!n?.id) {
    fail('Node missing id');
    continue;
  }
  if (nodeById.has(n.id)) fail(`Duplicate node id: ${n.id}`);
  nodeById.set(n.id, n);
  if (!n.id.startsWith(PREFIX)) fail(`Node ${n.id} must use ${PREFIX} prefix`);

  for (const field of schema.node_fields?.required ?? []) {
    if (n[field] === undefined || n[field] === null || n[field] === '') {
      fail(`Node ${n.id} missing required field: ${field}`);
    }
  }
  if (!schema.node_types?.includes(n.type)) fail(`Node ${n.id} has invalid type: ${n.type}`);
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
    if (!(schema.decision_status_permitted_types ?? ['decision']).includes(n.type)) {
      fail(`Node ${n.id} (type=${n.type}) must not carry decision_status`);
    }
  }
  if (n.type === 'decision' && !n.decision_status) fail(`Decision ${n.id} missing decision_status`);
  if (n.reconstruction_maturity !== undefined && !schema.reconstruction_maturity_values?.includes(n.reconstruction_maturity)) {
    fail(`Node ${n.id} has invalid reconstruction_maturity: ${n.reconstruction_maturity}`);
  }
  if (n.type === 'evidence' || n.type === 'test_evidence') {
    if (!n.source_type) fail(`Evidence node ${n.id} missing required source_type`);
    else if (!schema.evidence_source_types?.includes(n.source_type)) {
      fail(`Evidence node ${n.id} has invalid source_type: ${n.source_type}`);
    }
  }
}

function checkEvidenceRefs(ownerLabel, refs) {
  for (const ref of refs ?? []) {
    const node = nodeById.get(ref);
    if (!node) {
      fail(`${ownerLabel} references missing evidence ${ref}`);
      continue;
    }
    if (!evidenceRefTypes.includes(node.type)) {
      fail(`${ownerLabel} evidence ref ${ref} has invalid type ${node.type}; permitted: ${evidenceRefTypes.join(', ')}`);
    }
  }
}
for (const n of nodes) checkEvidenceRefs(`Node ${n.id}`, n.evidence);
console.log('==> Node field / prefix / status / evidence-ref checks:', nodes.length, 'nodes');

for (const e of edges) {
  for (const field of schema.edge_fields?.required ?? ['from', 'relation', 'to']) {
    if (!e[field]) fail(`Edge missing ${field}: ${JSON.stringify(e)}`);
  }
  if (!schema.relation_types?.includes(e.relation)) fail(`Edge ${e.from} -${e.relation}-> ${e.to} has invalid relation`);
  for (const end of ['from', 'to']) {
    if (!nodeById.has(e[end])) fail(`MISSING ${end}=${e[end]} in edge ${e.from} -${e.relation}-> ${e.to}`);
  }
  const ft = nodeById.get(e.from)?.type;
  const tt = nodeById.get(e.to)?.type;
  if (e.relation === 'supports' && !['evidence', 'test_evidence'].includes(ft)) {
    fail(`Edge ${e.from} -supports-> ${e.to}: from must be evidence|test_evidence (got ${ft})`);
  }
  if (e.relation === 'tested_by' && tt !== 'test_evidence') {
    fail(`Edge ${e.from} -tested_by-> ${e.to}: to must be test_evidence (got ${tt})`);
  }
  if (e.relation === 'rejected_in_favour_of' && (ft !== 'rejected_approach' || tt !== 'decision')) {
    fail(`Edge ${e.from} -rejected_in_favour_of-> ${e.to}: rejected_approach → decision required`);
  }
  if (e.relation === 'must_not_influence' && ft !== 'decision') {
    fail(`Edge ${e.from} -must_not_influence-> ${e.to}: from must be decision (got ${ft})`);
  }
  if (e.relation === 'contradicts' && ft !== 'contradiction') {
    fail(`Edge ${e.from} -contradicts-> ${e.to}: from must be contradiction (got ${ft})`);
  }
}
console.log('==> Edge references + semantic checks:', edges.length, 'edges');

const invIds = new Set();
for (const inv of invariants) {
  if (!inv.id) {
    fail('Invariant missing id');
    continue;
  }
  if (invIds.has(inv.id)) fail(`Duplicate invariant id: ${inv.id}`);
  invIds.add(inv.id);
  if (!inv.id.startsWith('TIRE-INV-')) fail(`Invariant ${inv.id} must use TIRE-INV- prefix`);
  if (!schema.invariant_kinds?.includes(inv.kind)) fail(`Invariant ${inv.id} has invalid kind: ${inv.kind}`);
  if (!schema.epistemic_status_values?.includes(inv.epistemic_status)) {
    fail(`Invariant ${inv.id} has invalid epistemic_status: ${inv.epistemic_status}`);
  }
  if (!inv.statement) fail(`Invariant ${inv.id} missing statement`);
  if (inv.kind === 'CONFIRMED_INVARIANT' && inv.epistemic_status !== 'CONFIRMED') {
    fail(`Invariant ${inv.id}: CONFIRMED_INVARIANT requires epistemic_status CONFIRMED`);
  }
  checkEvidenceRefs(`Invariant ${inv.id}`, inv.evidence);
}
console.log('==> Invariant checks:', invariants.length, 'invariants');

const paths = new Set();
for (const n of nodes) for (const p of n.source_paths ?? []) paths.add(p);
for (const inv of invariants) for (const p of inv.source_paths ?? []) paths.add(p);
const missingPaths = [...paths].filter((p) => !fs.existsSync(path.join(repo, p))).sort();
for (const p of missingPaths) fail(`MISSING source_path: ${p}`);
console.log('==> Source paths:', paths.size, missingPaths.length ? 'FAIL' : 'OK');

function collectIdsFromMarkdown(dir, pattern) {
  const ids = new Set();
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.name.endsWith('.md')) {
        for (const m of fs.readFileSync(full, 'utf8').matchAll(pattern)) ids.add(m[0].replace(/-+$/, ''));
      }
    }
  };
  walk(dir);
  return ids;
}
const referencedIds = collectIdsFromMarkdown(authorityDir, /TIRE-(?:GAP|HYP|CONTRA|FAIL|REJECT|SUPERSEDED|DEC|INV|EVID|TEST)-[A-Z0-9-]+/g);
for (const id of referencedIds) {
  if (id.startsWith('TIRE-INV-')) {
    if (!invIds.has(id)) fail(`Markdown references ${id} missing from graph/invariants.yaml`);
  } else if (!nodeById.has(id)) {
    fail(`Markdown references ${id} missing from graph/nodes.yaml`);
  }
}
console.log('==> Markdown stable-ID resolution:', referencedIds.size, 'ids referenced');

function parseRegisterStatuses(filePath) {
  const map = new Map();
  if (!fs.existsSync(filePath)) return map;
  const text = fs.readFileSync(filePath, 'utf8');
  const sectionRe = /## (TIRE-(?:DEC|REJECT)-[A-Z0-9-]+)[^\n]*\n[\s\S]*?\| \*\*STATUS\*\* \| ([^|]+) \|/g;
  for (const m of text.matchAll(sectionRe)) map.set(m[1], m[2].trim().replace(/\s*\([^)]*\)\s*/g, '').trim());
  return map;
}
const registerPath = path.join(authorityDir, 'decisions/DECISION_REGISTER.md');
const registerStatuses = parseRegisterStatuses(registerPath);
for (const n of nodes) {
  if (!n.decision_status) continue;
  const reg = registerStatuses.get(n.id);
  if (!reg) fail(`Decision/rejected node ${n.id} missing from DECISION_REGISTER.md`);
  else if (reg !== n.decision_status) {
    fail(`Decision ${n.id} status mismatch: nodes.yaml=${n.decision_status} vs DECISION_REGISTER.md=${reg}`);
  }
}
for (const [id, status] of registerStatuses) {
  const node = nodeById.get(id);
  if (!node) fail(`DECISION_REGISTER.md references ${id} missing from graph nodes`);
  else if (node.decision_status !== status) {
    fail(`Decision ${id} status mismatch: nodes.yaml=${node.decision_status} vs DECISION_REGISTER.md=${status}`);
  }
}
const registerText = fs.existsSync(registerPath) ? fs.readFileSync(registerPath, 'utf8') : '';
for (const m of registerText.matchAll(/## (TIRE-(?:DEC|REJECT)-[A-Z0-9-]+)[^\n]*\n([\s\S]*?)(?=\n## TIRE-|\n*$)/g)) {
  const evidenceFields = [...m[2].matchAll(/\| \*\*EVIDENCE\*\* \| ([^|]+) \|/g)];
  if (evidenceFields.length !== 1) {
    fail(`DECISION_REGISTER ${m[1]} must have exactly one EVIDENCE field (found ${evidenceFields.length})`);
    continue;
  }
  const refs = [...evidenceFields[0][1].matchAll(/TIRE-(?:EVID|TEST)-[A-Z0-9-]+/g)].map((x) => x[0]);
  if (refs.length === 0) fail(`DECISION_REGISTER ${m[1]} EVIDENCE field has no TIRE-EVID-*/TIRE-TEST-* references`);
  checkEvidenceRefs(`DECISION_REGISTER ${m[1]} EVIDENCE`, refs);
}
console.log('==> Decision register consistency:', registerStatuses.size, 'register entries checked');

if (errors.length) {
  console.error('\n==> VALIDATION FAILED');
  for (const e of errors) console.error('  -', e);
  process.exit(1);
}
console.log('==> All validations passed');
