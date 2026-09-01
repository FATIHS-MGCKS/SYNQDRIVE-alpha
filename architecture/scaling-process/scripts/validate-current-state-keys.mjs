#!/usr/bin/env node
/**
 * Guardrail: machine-readable header keys in CURRENT_STATE.md must be unique.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const mdPath = join(root, '..', 'CURRENT_STATE.md');
const text = readFileSync(mdPath, 'utf8');

const blockMatch = text.match(/```\n([\s\S]*?)\n```/);
if (!blockMatch) {
  console.error('Machine-readable header block not found in CURRENT_STATE.md');
  process.exit(1);
}

const keyPattern = /^([A-Z0-9_]+)\s*=/gm;
const seen = new Map();
const dupList = [];

for (const match of blockMatch[1].matchAll(keyPattern)) {
  const key = match[1];
  const count = (seen.get(key) ?? 0) + 1;
  seen.set(key, count);
  if (count === 2) {
    dupList.push(key);
  }
}

if (dupList.length > 0) {
  console.error('Duplicate machine-readable keys in CURRENT_STATE.md:', dupList.join(', '));
  process.exit(1);
}

console.log(`OK: ${seen.size} unique machine-readable keys in CURRENT_STATE.md`);
