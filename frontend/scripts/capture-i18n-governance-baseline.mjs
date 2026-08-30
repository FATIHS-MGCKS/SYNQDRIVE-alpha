#!/usr/bin/env node
/**
 * Capture enhanced governance baseline fingerprints into the manifest.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanRepository } from './i18n-hardcoded-scan.mjs';
import { validateManifestSchema } from './lib/i18n-governance/manifest-validator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = join(__dirname, '..');
const manifestPath = join(frontendRoot, 'src/i18n/i18n-debt-classifications.json');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const { findings } = scanRepository({ includeEnhanced: true });
manifest.baselineFingerprints = findings.map((finding) => finding.fingerprint).sort();
manifest.governanceBaseline = {
  capturedAt: new Date().toISOString().slice(0, 10),
  capturedFromSha: process.env.I18N_BASELINE_SHA ?? '381671605ea1cd55844518312839b0f7d99a48bd',
  mode: 'enhanced',
  findingCount: findings.length,
};

const schema = validateManifestSchema(manifest);
if (!schema.valid) {
  console.error('Manifest schema invalid after baseline capture:');
  for (const error of schema.errors) console.error(`  - ${error}`);
  process.exit(1);
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Captured ${manifest.baselineFingerprints.length} baseline fingerprints.`);
