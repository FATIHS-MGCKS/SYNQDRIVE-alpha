#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '../../..');
const require = createRequire(import.meta.url);
const yaml = require(path.join(repo, 'backend/node_modules/js-yaml'));

const graphDir = path.join(repo, 'architecture/users-and-invites/graph');
const errors = [];
const fail = (m) => errors.push(m);

function load(name) {
  return yaml.load(fs.readFileSync(path.join(graphDir, name), 'utf8'));
}

const nodesDoc = load('nodes.yaml');
const edgesDoc = load('edges.yaml');
const invDoc = load('invariants.yaml');

const nodeIds = new Set();
for (const n of nodesDoc.nodes ?? []) {
  if (!n.id) fail('Node missing id');
  if (nodeIds.has(n.id)) fail(`Duplicate node id ${n.id}`);
  nodeIds.add(n.id);
  for (const sp of n.source_paths ?? []) {
  if (!fs.existsSync(path.join(repo, sp))) fail(`Missing source_path for ${n.id}: ${sp}`);
  }
}

for (const e of edgesDoc.edges ?? []) {
  if (!nodeIds.has(e.from)) fail(`Edge from unknown node ${e.from}`);
  if (!nodeIds.has(e.to)) fail(`Edge to unknown node ${e.to}`);
}

for (const inv of invDoc.invariants ?? []) {
  if (!inv.id) fail('Invariant missing id');
  for (const sp of inv.source_paths ?? []) {
    if (!fs.existsSync(path.join(repo, sp))) fail(`Missing invariant source: ${sp}`);
  }
}

if (errors.length) {
  console.error('Users & Invites graph validation FAILED');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}
console.log(`Users & Invites graph validation passed (${nodeIds.size} nodes).`);