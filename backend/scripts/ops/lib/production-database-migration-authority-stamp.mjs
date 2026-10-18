#!/usr/bin/env node
/**
 * HMAC-SHA256 migration authority stamp (write / verify). Never log the HMAC key.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const STAMP_VERSION = 'v2';
const DEFAULT_TTL_SEC = 1800;

function loadHmacKey() {
  const keyFile =
    process.env.SYNQDRIVE_MIGRATION_AUTHORITY_HMAC_KEY_FILE ||
    '/opt/synqdrive/shared/state/migration-authority.hmac.key';
  if (process.env.SYNQDRIVE_MIGRATION_AUTHORITY_HMAC_KEY) {
    return Buffer.from(process.env.SYNQDRIVE_MIGRATION_AUTHORITY_HMAC_KEY, 'utf8');
  }
  if (existsSync(keyFile)) {
    return readFileSync(keyFile);
  }
  throw new Error('MIGRATION_AUTHORITY_HMAC_KEY_MISSING');
}

function computeHmac(body, key) {
  return createHmac('sha256', key).update(body, 'utf8').digest('hex');
}

function safeEqualHex(a, b) {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

function parseStamp(text) {
  const lines = text.split('\n').filter(Boolean);
  const body = lines.find((l) => l.startsWith(`${STAMP_VERSION}|`));
  const hmac = lines.find((l) => l.startsWith('hmac='))?.slice(5);
  const consumed = lines.find((l) => l.startsWith('consumed='))?.slice(9) === '1';
  if (!body || !hmac) return null;
  const fields = {};
  for (const part of body.split('|').slice(1)) {
    const [k, v] = part.split('=');
    if (k && v !== undefined) fields[k] = v;
  }
  return { body, hmac, fields, consumed };
}

function writeStamp({
  stampPath,
  oid,
  db,
  ledger,
  releaseSha,
  context = 'deploy_preflight',
  ttlSec = DEFAULT_TTL_SEC,
}) {
  const issued = new Date();
  const expires = new Date(issued.getTime() + ttlSec * 1000);
  const nonce = randomUUID();
  const body = [
    STAMP_VERSION,
    `oid=${oid}`,
    `db=${db}`,
    `ledger=${ledger}`,
    `issued=${issued.toISOString()}`,
    `expires=${expires.toISOString()}`,
    `release=${releaseSha || 'unset'}`,
    `nonce=${nonce}`,
    `context=${context}`,
  ].join('|');
  const key = loadHmacKey();
  const hmac = computeHmac(body, key);
  const payload = `${body}\nhmac=${hmac}\nconsumed=0\n`;
  mkdirSync(dirname(stampPath), { recursive: true });
  writeFileSync(stampPath, payload, { mode: 0o600 });
  try {
    chmodSync(stampPath, 0o600);
  } catch {
    /* ignore */
  }
  process.stdout.write(`${body}\nhmac=${hmac}\n`);
}

function verifyStamp({
  stampPath,
  oidLive,
  dbLive,
  releaseSha,
  preflightNonce,
  markConsumed = false,
}) {
  if (!existsSync(stampPath)) {
    console.error('PDB_GUARD_STAMP: missing stamp file');
    process.exit(42);
  }
  const parsed = parseStamp(readFileSync(stampPath, 'utf8'));
  if (!parsed) {
    console.error('PDB_GUARD_STAMP: malformed stamp');
    process.exit(42);
  }
  if (parsed.consumed) {
    console.error('PDB_GUARD_STAMP: stamp already consumed (replay blocked)');
    process.exit(42);
  }
  const key = loadHmacKey();
  const expected = computeHmac(parsed.body, key);
  if (!safeEqualHex(parsed.hmac, expected)) {
    console.error('PDB_GUARD_STAMP: HMAC verification failed');
    process.exit(42);
  }
  const { fields } = parsed;
  if (fields.oid !== oidLive || fields.db !== dbLive) {
    console.error('PDB_GUARD_STAMP: database identity mismatch');
    process.exit(41);
  }
  const now = Date.now();
  const expires = Date.parse(fields.expires || '');
  const issued = Date.parse(fields.issued || '');
  if (!Number.isFinite(expires) || now > expires) {
    console.error('PDB_GUARD_STAMP: stamp expired');
    process.exit(42);
  }
  if (!Number.isFinite(issued) || now < issued - 60_000) {
    console.error('PDB_GUARD_STAMP: stamp issued in the future');
    process.exit(42);
  }
  if (releaseSha && fields.release !== 'unset' && fields.release !== releaseSha) {
    console.error('PDB_GUARD_STAMP: release SHA mismatch');
    process.exit(42);
  }
  if (preflightNonce && fields.nonce !== preflightNonce) {
    console.error('PDB_GUARD_STAMP: preflight nonce mismatch (replay or wrong deploy context)');
    process.exit(42);
  }
  if (fields.context !== 'deploy_preflight') {
    console.error('PDB_GUARD_STAMP: invalid authorization context');
    process.exit(42);
  }
  if (markConsumed) {
    const text = readFileSync(stampPath, 'utf8').replace(/^consumed=.*$/m, 'consumed=1\n');
    writeFileSync(stampPath, text, { mode: 0o600 });
  }
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      out[key] = argv[i + 1];
      i += 1;
    } else {
      out._.push(a);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

try {
  if (cmd === 'write') {
    writeStamp({
      stampPath: args['stamp-path'],
      oid: args.oid,
      db: args.db,
      ledger: args.ledger,
      releaseSha: args['release-sha'],
      context: args.context || 'deploy_preflight',
      ttlSec: args['ttl-sec'] ? Number(args['ttl-sec']) : DEFAULT_TTL_SEC,
    });
  } else if (cmd === 'verify') {
    verifyStamp({
      stampPath: args['stamp-path'],
      oidLive: args['oid-live'],
      dbLive: args['db-live'],
      releaseSha: args['release-sha'],
      preflightNonce: args['preflight-nonce'],
      markConsumed: args['mark-consumed'] === '1',
    });
  } else if (cmd === 'tamper-test') {
    const key = loadHmacKey();
    const body = `${STAMP_VERSION}|oid=1|db=x|ledger=1|issued=2020-01-01T00:00:00.000Z|expires=2099-01-01T00:00:00.000Z|release=unset|nonce=bad|context=deploy_preflight`;
    const good = computeHmac(body, key);
    process.stdout.write(`${body}\nhmac=${good}\n`);
  } else {
    console.error('usage: write|verify|tamper-test');
    process.exit(2);
  }
} catch (e) {
  console.error(`PDB_GUARD_STAMP: ${e.message}`);
  process.exit(41);
}
