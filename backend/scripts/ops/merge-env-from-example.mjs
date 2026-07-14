/**
 * Merge missing KEY=value pairs from .env.example into .env (never overwrite).
 * Usage: node scripts/ops/merge-env-from-example.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..', '..');
const envPath = path.join(backendRoot, '.env');
const examplePath = path.join(backendRoot, '.env.example');

const RENAMES = [
  ['DOCUMENT_AI_ENABLED', 'DOCUMENT_AI_EXTRACTION_ENABLED'],
];

function parseKeys(content) {
  const keys = new Set();
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

function parseAssignments(content) {
  const map = new Map();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    map.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1));
  }
  return map;
}

function getValue(localLines, key) {
  for (const line of localLines) {
    const m = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`));
    if (m) return m[1];
  }
  return undefined;
}

let localContent = fs.readFileSync(envPath, 'utf8');
let localLines = localContent.split(/\r?\n/);
const exampleAssignments = parseAssignments(fs.readFileSync(examplePath, 'utf8'));

// Apply renames in-place (copy value, remove old key line)
for (const [from, to] of RENAMES) {
  const value = getValue(localLines, from);
  if (value !== undefined && !parseKeys(localLines.join('\n')).has(to)) {
    localLines = localLines.filter((line) => !/^\s*DOCUMENT_AI_ENABLED\s*=/.test(line));
    const mistralIdx = localLines.findIndex((l) => /^\s*# MISTRAL Integration/.test(l));
    const insertAt = localLines.findIndex((l, i) => i > mistralIdx && /^\s*VEHICLE_SPECS_AI_ENABLED\s*=/.test(l));
    const target = insertAt >= 0 ? insertAt + 1 : localLines.length;
    localLines.splice(target, 0, `${to}=${value}`);
    console.log(`Renamed ${from} -> ${to}=${value}`);
  } else if (value !== undefined && parseKeys(localLines.join('\n')).has(to)) {
    localLines = localLines.filter((line) => !/^\s*DOCUMENT_AI_ENABLED\s*=/.test(line));
    console.log(`Removed obsolete ${from} (${to} already set)`);
  }
}

const existingKeys = parseKeys(localLines.join('\n'));
const toAdd = [];
for (const [key, value] of exampleAssignments) {
  if (!existingKeys.has(key)) {
    toAdd.push({ key, value });
    existingKeys.add(key);
  }
}

if (toAdd.length === 0) {
  fs.writeFileSync(envPath, localLines.join('\n').replace(/\n?$/, '\n'), 'utf8');
  console.log('No new keys to add.');
  process.exit(0);
}

const append = [
  '',
  '# ── Added from .env.example (auto-merge — existing secrets unchanged) ──',
  ...toAdd.map(({ key, value }) => `${key}=${value}`),
];

fs.writeFileSync(envPath, [...localLines, ...append].join('\n').replace(/\n?$/, '\n'), 'utf8');
console.log(`Added ${toAdd.length} keys:`);
for (const { key } of toAdd) console.log(`  + ${key}`);
