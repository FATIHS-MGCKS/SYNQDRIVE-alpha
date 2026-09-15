#!/usr/bin/env node
/**
 * Offline ops signer for P2.5 cutover activation evidence bundles.
 * Private key MUST be supplied via --private-key-file (never committed).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';
import { createHash } from 'node:crypto';

const SCHEMA_VERSION = '1';
const ALGORITHM = 'Ed25519';

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--manifest') args.manifest = argv[++i];
    else if (token === '--private-key-file') args.privateKeyFile = argv[++i];
    else if (token === '--key-id') args.keyId = argv[++i];
    else if (token === '--out') args.out = argv[++i];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.manifest || !args.privateKeyFile || !args.keyId || !args.out) {
    console.error(
      'Usage: sign-physical-state-cutover-evidence.mjs --manifest payload.json --private-key-file /secure/key.pem --key-id <id> --out signed-bundle.json',
    );
    process.exit(1);
  }

  const payload = JSON.parse(readFileSync(args.manifest, 'utf8'));
  const required = [
    'bundleId',
    'issuedAt',
    'expiresAt',
    'issuer',
    'scope',
    'targetApproval',
    'preseedRevalidation',
    'unexplainedObservation',
    'mixedReplica',
    'runtimeBuild',
  ];
  for (const field of required) {
    if (!payload[field]) {
      console.error(`manifest_missing_field:${field}`);
      process.exit(1);
    }
  }

  const canonical = stableStringify(payload);
  const privateKey = createPrivateKey(readFileSync(args.privateKeyFile, 'utf8'));
  const signature = sign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64');
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex');

  const bundle = {
    schemaVersion: SCHEMA_VERSION,
    algorithm: ALGORITHM,
    keyId: args.keyId,
    payload,
    signature,
  };

  writeFileSync(args.out, JSON.stringify({ bundle, payloadCanonicalSha256: digest }, null, 2));
  console.log(`signed_bundle_written:${args.out}`);
  console.log(`payload_canonical_sha256:${digest}`);
}

main();
