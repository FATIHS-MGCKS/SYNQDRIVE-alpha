#!/usr/bin/env node
/**
 * Validate Battery V2 knowledge graph YAML — docs only.
 * Usage: node architecture/battery-v2/scripts/validate-graph.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '../../..');
const require = createRequire(import.meta.url);
const yaml = require(path.join(repo, 'backend/node_modules/js-yaml'));

const graphDir = path.join(repo, 'architecture/battery-v2/graph');
const batteryV2Dir = path.join(repo, 'architecture/battery-v2');

const errors = [];
function fail(msg) {
  errors.push(msg);
}

function load(name) {
  return yaml.load(fs.readFileSync(path.join(graphDir, name), 'utf8'));
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

console.log('==> YAML syntax');
const schema = load('schema.yaml');
for (const name of ['nodes.yaml', 'edges.yaml', 'invariants.yaml']) {
  load(name);
  console.log('  OK architecture/battery-v2/graph/' + name);
}

const nodes = load('nodes.yaml').nodes ?? [];
const edges = load('edges.yaml').edges ?? [];
const invariants = load('invariants.yaml').invariants ?? [];

console.log('==> Graph inventory');
console.log(`  nodes: ${nodes.length}`);
console.log(`  edges: ${edges.length}`);
console.log(`  invariants: ${invariants.length}`);

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

  for (const ref of n.evidence ?? []) {
    if (!nodeIds.has(ref) && !nodes.some((x) => x.id === ref)) {
      // defer — second pass after all ids collected
    }
  }
}

// evidence refs second pass
for (const n of nodes) {
  for (const ref of n.evidence ?? []) {
    if (!nodeIds.has(ref)) fail(`Node ${n.id} references missing evidence ${ref}`);
  }
}

console.log('==> Node field / prefix / status checks:', nodes.length, 'nodes');

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
console.log('==> Invariant checks:', invariants.length, 'OK');

const paths = new Set();
for (const n of nodes) for (const p of n.source_paths ?? []) paths.add(p);
for (const inv of invariants) for (const p of inv.source_paths ?? []) paths.add(p);
const missingPaths = [...paths].filter((p) => !fs.existsSync(path.join(repo, p))).sort();
for (const p of missingPaths) fail(`MISSING source_path: ${p}`);
console.log('==> Source paths:', paths.size, missingPaths.length ? 'FAIL' : 'OK');

// Canonical index ID resolution
const gapPattern = /BAT-V2-GAP-[A-Z0-9-]+/g;
const hypPattern = /BAT-V2-HYP-[A-Z0-9-]+/g;
const contraPattern = /BAT-V2-CONTRA-[A-Z0-9-]+/g;

const indexedGaps = collectStableIdsFromMarkdown(batteryV2Dir, gapPattern);
const indexedHyps = collectStableIdsFromMarkdown(batteryV2Dir, hypPattern);
const indexedContras = collectStableIdsFromMarkdown(batteryV2Dir, contraPattern);

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

// CURRENT_STATE declared graph counts (optional consistency check)
const currentStatePath = path.join(batteryV2Dir, 'CURRENT_STATE.md');
if (fs.existsSync(currentStatePath)) {
  const currentStateText = fs.readFileSync(currentStatePath, 'utf8');
  const countMatch = currentStateText.match(
    /\*\*Graph:\*\*\s*(\d+)\s*nodes\s*\/\s*(\d+)\s*edges\s*\/\s*(\d+)\s*invariants/i,
  );
  if (countMatch) {
    const [, declaredNodes, declaredEdges, declaredInvariants] = countMatch;
    let countsOk = true;
    if (Number(declaredNodes) !== nodes.length) {
      fail(
        `CURRENT_STATE.md declares ${declaredNodes} nodes but graph has ${nodes.length}`,
      );
      countsOk = false;
    }
    if (Number(declaredEdges) !== edges.length) {
      fail(
        `CURRENT_STATE.md declares ${declaredEdges} edges but graph has ${edges.length}`,
      );
      countsOk = false;
    }
    if (Number(declaredInvariants) !== invariants.length) {
      fail(
        `CURRENT_STATE.md declares ${declaredInvariants} invariants but graph has ${invariants.length}`,
      );
      countsOk = false;
    }
    if (countsOk) console.log('==> CURRENT_STATE graph counts: OK');
  } else {
    fail(
      'CURRENT_STATE.md missing parseable **Graph:** N nodes / M edges / I invariants line',
    );
    console.log('==> CURRENT_STATE graph counts: MISSING (required)');
  }
}

if (errors.length) {
  console.error('\n==> VALIDATION FAILED');
  for (const e of errors) console.error('  -', e);
  process.exit(1);
}

console.log('==> All validations passed');
