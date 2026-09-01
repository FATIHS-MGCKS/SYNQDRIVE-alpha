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

function load(name) {
  return yaml.load(fs.readFileSync(path.join(graphDir, name), 'utf8'));
}

console.log('==> YAML syntax');
for (const name of ['schema.yaml', 'nodes.yaml', 'edges.yaml', 'invariants.yaml']) {
  load(name);
  console.log('  OK architecture/battery-v2/graph/' + name);
}

const nodes = load('nodes.yaml').nodes;
const nodeIds = new Set(nodes.map((n) => n.id));
if (nodeIds.size !== nodes.length) {
  const dupes = nodes.map((n) => n.id).filter((id, i, a) => a.indexOf(id) !== i);
  console.error('Duplicate node IDs:', [...new Set(dupes)]);
  process.exit(1);
}
console.log('==> Unique node IDs:', nodeIds.size);

const edges = load('edges.yaml').edges;
for (const e of edges) {
  for (const end of ['from', 'to']) {
    if (!nodeIds.has(e[end])) {
      console.error(`MISSING ${end}=${e[end]} in edge ${e.from} -${e.relation}-> ${e.to}`);
      process.exit(1);
    }
  }
}
console.log('==> Edge references:', edges.length, 'OK');

const invariants = load('invariants.yaml').invariants;
for (const inv of invariants) {
  for (const ref of inv.evidence ?? []) {
    if (!nodeIds.has(ref)) {
      console.error(`MISSING evidence ${ref} on invariant ${inv.id}`);
      process.exit(1);
    }
  }
}
console.log('==> Invariant evidence:', invariants.length, 'OK');

const paths = new Set();
for (const n of nodes) for (const p of n.source_paths ?? []) paths.add(p);
for (const inv of invariants) for (const p of inv.source_paths ?? []) paths.add(p);
const missingPaths = [...paths].filter((p) => !fs.existsSync(path.join(repo, p))).sort();
if (missingPaths.length) {
  for (const p of missingPaths) console.error('MISSING path:', p);
  process.exit(1);
}
console.log('==> Source paths:', paths.size, 'OK');
console.log('==> All validations passed');
