#!/usr/bin/env node
/**
 * Fail-closed Prisma CLI wrapper — blocks destructive commands against production identity.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(__dirname, '../../..');
const contractPath =
  process.env.SYNQDRIVE_PRODUCTION_DB_CONTRACT ??
  join(backendRoot, 'scripts/ops/contracts/production-database-identity.v1.json');

const EXIT_DESTRUCTIVE = 42;
const EXIT_IDENTITY = 41;

function loadContract() {
  return JSON.parse(readFileSync(contractPath, 'utf8'));
}

function parseDatabaseUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url.replace(/^postgresql:/, 'postgres:'));
    const db = (u.pathname || '').replace(/^\//, '').split('/')[0] || '';
    const schema = u.searchParams.get('schema') || 'public';
    return {
      user: decodeURIComponent(u.username || ''),
      host: u.hostname || '',
      port: u.port || '5432',
      database: db,
      schema,
    };
  } catch {
    return null;
  }
}

function isReservedProductionName(db, contract) {
  if (contract.reservedProductionNames?.includes(db)) return true;
  for (const pat of contract.ephemeralDatabaseNamePatterns ?? []) {
    if (new RegExp(pat).test(db)) return false;
  }
  return false;
}

function isVpsProductionContext() {
  return existsSync('/opt/synqdrive/shared/backend.env');
}

function argvJoined(args) {
  return ` ${args.join(' ')} `.toLowerCase();
}

function isDestructive(args) {
  const joined = argvJoined(args);
  if (joined.includes(' migrate reset') || joined.includes(' migrate dev')) return true;
  if (joined.includes(' db push')) {
    if (joined.includes('force-reset') || joined.includes('accept-data-loss')) return true;
  }
  return false;
}

function assertAllowed(args) {
  const contract = loadContract();
  const parsed = parseDatabaseUrl(process.env.DATABASE_URL);
  const profile = process.env.SYNQDRIVE_DATABASE_IDENTITY_PROFILE ?? (isVpsProductionContext() ? 'production_vps' : 'unset');

  if (process.env.SYNQDRIVE_PRODUCTION_GUARD_BYPASS === '1') {
    console.error('PDB_GUARD: SYNQDRIVE_PRODUCTION_GUARD_BYPASS=1 is forbidden');
    process.exit(EXIT_IDENTITY);
  }
  if (process.env.SYNQDRIVE_ALLOW_DESTRUCTIVE_PRISMA === '1') {
    console.error('PDB_GUARD: SYNQDRIVE_ALLOW_DESTRUCTIVE_PRISMA=1 is not an approved bypass');
    process.exit(EXIT_DESTRUCTIVE);
  }

  if (isDestructive(args)) {
    if (!parsed?.database) {
      console.error('PDB_GUARD: destructive prisma blocked (DATABASE_URL missing/invalid)');
      process.exit(EXIT_DESTRUCTIVE);
    }
    for (const frag of contract.forbiddenUrlSubstrings ?? []) {
      if ((process.env.DATABASE_URL || '').toLowerCase().includes(frag.toLowerCase())) {
        console.error(`PDB_GUARD: destructive prisma blocked (forbidden URL fragment ${frag})`);
        process.exit(EXIT_DESTRUCTIVE);
      }
    }
    if (isReservedProductionName(parsed.database, contract)) {
      console.error(`PDB_GUARD: destructive prisma blocked for reserved database ${parsed.database}`);
      process.exit(EXIT_DESTRUCTIVE);
    }
    const local = ['localhost', '127.0.0.1', '::1', ''];
    if (!local.includes(parsed.host.toLowerCase())) {
      console.error(`PDB_GUARD: destructive prisma blocked for host ${parsed.host}`);
      process.exit(EXIT_DESTRUCTIVE);
    }
    if (isVpsProductionContext() || profile === 'production_vps') {
      console.error('PDB_GUARD: destructive prisma blocked in production VPS context');
      process.exit(EXIT_DESTRUCTIVE);
    }
    console.error('PDB_GUARD: destructive prisma blocked');
    process.exit(EXIT_DESTRUCTIVE);
  }

  const joined = argvJoined(args);
  if (joined.includes(' migrate deploy')) {
    if (parsed && isReservedProductionName(parsed.database, contract) && isVpsProductionContext()) {
      if (process.env.SYNQDRIVE_MIGRATION_AUTHORITY !== '1') {
        console.error('PDB_GUARD: migrate deploy requires SYNQDRIVE_MIGRATION_AUTHORITY=1 on production VPS');
        process.exit(EXIT_DESTRUCTIVE);
      }
    }
  }
}

const prismaArgs = process.argv.slice(2);
assertAllowed(prismaArgs);

const prismaBin = resolve(backendRoot, 'node_modules/prisma/build/index.js');
const result = spawnSync(process.execPath, [prismaBin, ...prismaArgs], {
  stdio: 'inherit',
  cwd: backendRoot,
  env: process.env,
});

process.exit(result.status ?? 1);
