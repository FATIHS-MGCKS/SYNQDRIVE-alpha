#!/usr/bin/env node
/**
 * Fail-closed Prisma CLI wrapper — blocks destructive commands against production identity.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(__dirname, '../../..');
const contractPath =
  process.env.SYNQDRIVE_PRODUCTION_DB_CONTRACT ??
  join(backendRoot, 'scripts/ops/contracts/production-database-identity.v1.json');
const stampMjs = join(__dirname, 'production-database-migration-authority-stamp.mjs');

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
    const pgSchema = u.searchParams.get('schema') || 'public';
    return {
      user: decodeURIComponent(u.username || ''),
      host: u.hostname || '',
      port: u.port || '5432',
      database: db,
      pgSchema,
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

function prismaSchemaFileArg(args) {
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--schema' && args[i + 1]) return args[i + 1];
    if (args[i].startsWith('--schema=')) return args[i].slice('--schema='.length);
  }
  return null;
}

function assertPrismaSchemaDatasource(schemaRelPath) {
  const schemaPath = isAbsolute(schemaRelPath) ? schemaRelPath : resolve(backendRoot, schemaRelPath);
  if (!schemaPath.endsWith('.prisma') || !existsSync(schemaPath)) {
    console.error(`PDB_GUARD: invalid Prisma schema file ${schemaRelPath}`);
    process.exit(EXIT_IDENTITY);
  }
  const text = readFileSync(schemaPath, 'utf8');
  if (/url\s*=\s*"postgres/i.test(text) || /url\s*=\s*'postgres/i.test(text)) {
    console.error('PDB_GUARD: Prisma schema must not embed literal postgres URL on production path');
    process.exit(EXIT_IDENTITY);
  }
  const datasourceBlocks = [...text.matchAll(/datasource\s+\w+\s*\{([^}]*)\}/g)];
  if (datasourceBlocks.length === 0) {
    console.error('PDB_GUARD: Prisma schema missing datasource block');
    process.exit(EXIT_IDENTITY);
  }
  for (const block of datasourceBlocks) {
    const body = block[1];
    if (!/url\s*=\s*env\(\s*["']DATABASE_URL["']\s*\)/.test(body)) {
      console.error('PDB_GUARD: Prisma datasource must use env("DATABASE_URL")');
      process.exit(EXIT_IDENTITY);
    }
    const shadow = body.match(/shadowDatabaseUrl\s*=\s*env\(\s*["']([^"']+)["']\s*\)/);
    if (shadow && shadow[1] !== 'SHADOW_DATABASE_URL') {
      console.error('PDB_GUARD: unexpected shadowDatabaseUrl env reference');
      process.exit(EXIT_IDENTITY);
    }
  }
}

function isDestructive(args) {
  const joined = argvJoined(args);
  if (joined.includes(' migrate reset') || joined.includes(' migrate dev')) return true;
  if (joined.includes(' db push')) return true;
  if (joined.includes(' db execute') && joined.includes('drop schema')) return true;
  return false;
}

function assertDsnParity(contract) {
  const runtime = parseDatabaseUrl(process.env.DATABASE_URL);
  const migrate = parseDatabaseUrl(process.env.SYNQDRIVE_MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL);
  const direct = parseDatabaseUrl(process.env.DIRECT_URL);
  if (!runtime) return;
  const eq = (a, b, label) => {
    if (!b) return;
    if (
      a.host !== b.host ||
      a.port !== b.port ||
      a.database !== b.database ||
      a.pgSchema !== b.pgSchema
    ) {
      console.error(`PDB_GUARD: ${label} DSN mismatch vs DATABASE_URL`);
      process.exit(EXIT_IDENTITY);
    }
  };
  eq(runtime, migrate, 'migration');
  eq(runtime, direct, 'DIRECT_URL');
}

function verifyMigrationStamp(parsed) {
  const stampPath =
    process.env.SYNQDRIVE_MIGRATION_AUTHORITY_STAMP_FILE ??
    '/opt/synqdrive/shared/state/migration-authority.stamp';
  const nonce =
    process.env.SYNQDRIVE_MIGRATION_PREFLIGHT_NONCE ||
    readFileSync(stampPath, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('v2|'))
      ?.match(/nonce=([^|]+)/)?.[1];
  const result = spawnSync(
    process.execPath,
    [
      stampMjs,
      'verify',
      '--stamp-path',
      stampPath,
      '--oid-live',
      process.env.SYNQDRIVE_STAMP_OID_LIVE || '0',
      '--db-live',
      parsed.database,
      '--release-sha',
      process.env.SYNQDRIVE_REQUESTED_DEPLOY_SHA || '',
      '--preflight-nonce',
      nonce || '',
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) {
    console.error('PDB_GUARD: migration authority stamp verification failed');
    process.exit(EXIT_DESTRUCTIVE);
  }
}

function assertAllowed(args) {
  const contract = loadContract();
  const parsed = parseDatabaseUrl(process.env.DATABASE_URL);
  const profile = process.env.SYNQDRIVE_DATABASE_IDENTITY_PROFILE ?? (isVpsProductionContext() ? 'production_vps' : 'unset');
  const schemaFile = prismaSchemaFileArg(args) ?? 'prisma/schema.prisma';

  if (parsed?.pgSchema && parsed.pgSchema !== 'public' && isReservedProductionName(parsed.database, contract)) {
    console.error(`PDB_GUARD: DATABASE_URL PostgreSQL schema ${parsed.pgSchema} must be public on production`);
    process.exit(EXIT_IDENTITY);
  }

  const joined = argvJoined(args);
  if (joined.includes(' migrate deploy') || joined.includes(' migrate resolve')) {
    assertPrismaSchemaDatasource(schemaFile);
  }

  if (process.env.SYNQDRIVE_PRODUCTION_GUARD_BYPASS === '1') {
    console.error('PDB_GUARD: SYNQDRIVE_PRODUCTION_GUARD_BYPASS=1 is forbidden');
    process.exit(EXIT_IDENTITY);
  }
  if (process.env.SYNQDRIVE_ALLOW_DESTRUCTIVE_PRISMA === '1') {
    console.error('PDB_GUARD: SYNQDRIVE_ALLOW_DESTRUCTIVE_PRISMA=1 is not an approved bypass');
    process.exit(EXIT_DESTRUCTIVE);
  }

  assertDsnParity(contract);

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

  if (joined.includes(' migrate resolve')) {
    if (parsed && isReservedProductionName(parsed.database, contract) && isVpsProductionContext()) {
      if (process.env.SYNQDRIVE_MIGRATION_RECOVERY_RESOLVE_AUTHORIZED !== '1') {
        console.error('PDB_GUARD: migrate resolve requires recovery authorization on production VPS');
        process.exit(EXIT_DESTRUCTIVE);
      }
      if (process.env.SYNQDRIVE_MIGRATION_AUTHORITY === '1') {
        console.error('PDB_GUARD: migrate resolve cannot run under deploy migration authority');
        process.exit(EXIT_DESTRUCTIVE);
      }
    }
  }

  if (joined.includes(' migrate deploy')) {
    if (parsed && isReservedProductionName(parsed.database, contract) && isVpsProductionContext()) {
      if (process.env.SYNQDRIVE_MIGRATION_AUTHORITY !== '1') {
        console.error('PDB_GUARD: migrate deploy requires deploy pipeline authority on production VPS');
        process.exit(EXIT_DESTRUCTIVE);
      }
      verifyMigrationStamp(parsed);
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
