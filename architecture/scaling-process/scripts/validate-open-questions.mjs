#!/usr/bin/env node
/**
 * Guardrail: every OQ-* ID in OPEN_QUESTIONS_AND_FUTURE_WORK.md must be globally unique.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const mdPath = join(root, '..', 'OPEN_QUESTIONS_AND_FUTURE_WORK.md');
const text = readFileSync(mdPath, 'utf8');

const idPattern = /\| (OQ-\d+) \|/g;
const seen = new Map();
const duplicates = [];

for (const match of text.matchAll(idPattern)) {
  const id = match[1];
  const count = (seen.get(id) ?? 0) + 1;
  seen.set(id, count);
  if (count === 2) {
    duplicates.push(id);
  }
}

if (duplicates.length > 0) {
  console.error('Duplicate OQ IDs found:', duplicates.join(', '));
  process.exit(1);
}

console.log(`OK: ${seen.size} unique OQ IDs in OPEN_QUESTIONS_AND_FUTURE_WORK.md`);
