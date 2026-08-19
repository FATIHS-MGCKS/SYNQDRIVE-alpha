#!/usr/bin/env node
/**
 * Deterministic rental/i18n compatibility-shim inventory.
 *
 * Definition (matches P2.2.1 audit baseline):
 * - COMPAT consumer: TypeScript/TSX file under `src/rental/` containing a static import
 *   whose specifier is exactly `../i18n/...` (single parent segment → `rental/i18n/` shim).
 * - CANONICAL consumer: static import with two or more `../` segments before `i18n/`
 *   (resolves to `src/i18n/`).
 *
 * Usage: node scripts/i18n-shim-inventory.mjs [--json]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const rentalRoot = join(frontendRoot, 'src/rental');
const compatRe = /from ['"]\.\.\/i18n\//;
const canonRe = /from ['"](\.\.\/){2,}i18n\//;

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) acc.push(full);
  }
  return acc;
}

const files = walk(rentalRoot);
const compat = [];
const canonical = [];

for (const file of files) {
  const content = readFileSync(file, 'utf8');
  const rel = relative(frontendRoot, file).replace(/\\/g, '/');
  if (compatRe.test(content)) compat.push(rel);
  if (canonRe.test(content)) canonical.push(rel);
}

compat.sort();
canonical.sort();

const compatProd = compat.filter((f) => !/\.test\./.test(f));
const compatTest = compat.filter((f) => /\.test\./.test(f));

const summary = {
  definition: "static import from '../i18n/' under src/rental (rental/i18n compat shim)",
  compatTotal: compat.length,
  compatProduction: compatProd.length,
  compatTest: compatTest.length,
  canonicalTotal: canonical.length,
  compatFiles: compat,
  compatProductionFiles: compatProd,
  compatTestFiles: compatTest,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(`COMPAT ../i18n/ total: ${summary.compatTotal} (prod ${summary.compatProduction}, test ${summary.compatTest})`);
  console.log(`CANON ../../i18n/+ total: ${summary.canonicalTotal}`);
  console.log('Compat production files:');
  for (const f of compatProd) console.log(`  ${f}`);
  console.log('Compat test files:');
  for (const f of compatTest) console.log(`  ${f}`);
}
