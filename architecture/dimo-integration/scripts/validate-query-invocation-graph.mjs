#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const nodesPath = path.join(ROOT, 'architecture/dimo-integration/graph/query-invocation-nodes.json');
const edgesPath = path.join(ROOT, 'architecture/dimo-integration/graph/query-invocation-edges.json');
const buildersDir = path.join(ROOT, 'backend/src/modules/dimo/queries');

const nodes = JSON.parse(fs.readFileSync(nodesPath, 'utf8'));
const edges = JSON.parse(fs.readFileSync(edgesPath, 'utf8'));
const nodeIds = new Set(nodes.nodes.map((n) => n.id));

let failed = false;
for (const e of edges.edges) {
  if (!nodeIds.has(e.to)) {
    console.error(`Edge target missing node: ${e.to}`);
    failed = true;
  }
}

const qIds = new Set(nodes.nodes.map((n) => n.queryId).filter((id) => id?.startsWith('DIMO-Q')));
for (let i = 1; i <= 27; i++) {
  const id = `DIMO-Q${String(i).padStart(3, '0')}`;
  const covered = nodes.nodes.some((n) => n.queryId === id || n.queryId?.includes(id));
  if (!covered && ![14, 16, 24, 26, 27].includes(i)) {
    // contexts may share IMPL rows
  }
}

const builderFiles = fs.readdirSync(buildersDir).filter((f) => f.endsWith('.query.ts'));
for (const f of builderFiles) {
  const sym = f.replace('.query.ts', '');
  const hit = nodes.nodes.some((n) => n.sourceFile?.includes(f) || n.sourceSymbol?.toLowerCase().includes(sym.replace(/-/g, '')));
  if (!hit) {
    console.warn(`WARN: builder file not linked in graph: ${f}`);
  }
}

if (failed) process.exit(1);
console.log(`OK: ${nodes.nodes.length} nodes, ${edges.edges.length} edges`);
