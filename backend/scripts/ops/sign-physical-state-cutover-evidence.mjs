#!/usr/bin/env node
/**
 * Offline ops signer for P2.5 cutover activation evidence bundles.
 * Private key MUST be supplied via --private-key-file (never committed).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const nodeRequire = createRequire(import.meta.url);
const opsLib = nodeRequire(
  join(__dirname, '../../src/modules/dimo/device-connection-physical-state/physical-state-cutover-evidence.ops-lib.cjs'),
);
const { signCutoverEvidenceManifest, validateCutoverEvidenceManifest } = opsLib;

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--manifest') args.manifest = argv[++i];
    else if (token === '--private-key-file') args.privateKeyFile = argv[++i];
    else if (token === '--key-id') args.keyId = argv[++i];
    else if (token === '--out') args.out = argv[++i];
    else if (token === '--validate-only') args.validateOnly = true;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.manifest || (!args.validateOnly && (!args.privateKeyFile || !args.keyId || !args.out))) {
    console.error(
      'Usage: sign-physical-state-cutover-evidence.mjs --manifest payload.json --private-key-file /secure/key.pem --key-id <id> --out signed-bundle.json',
    );
    console.error('       sign-physical-state-cutover-evidence.mjs --manifest payload.json --validate-only');
    process.exit(1);
  }

  const manifestPath = args.manifest.startsWith('/')
    ? args.manifest
    : join(process.cwd(), args.manifest);
  const payload = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const validation = validateCutoverEvidenceManifest(payload);
  if (!validation.ok) {
    console.error(`manifest_semantic_invalid:${validation.errors.join(',')}`);
    process.exit(1);
  }

  if (args.validateOnly) {
    console.log('manifest_semantic_valid');
    process.exit(0);
  }

  const privateKeyPem = readFileSync(args.privateKeyFile, 'utf8');
  const signed = signCutoverEvidenceManifest({
    payload,
    privateKeyPem,
    keyId: args.keyId,
  });
  if (!signed.ok) {
    console.error(`signing_rejected:${signed.errors.join(',')}`);
    process.exit(1);
  }

  writeFileSync(
    args.out,
    JSON.stringify(
      { bundle: signed.bundle, payloadCanonicalSha256: signed.payloadCanonicalSha256 },
      null,
      2,
    ),
  );
  console.log(`signed_bundle_written:${args.out}`);
  console.log(`payload_canonical_sha256:${signed.payloadCanonicalSha256}`);
}

main();
