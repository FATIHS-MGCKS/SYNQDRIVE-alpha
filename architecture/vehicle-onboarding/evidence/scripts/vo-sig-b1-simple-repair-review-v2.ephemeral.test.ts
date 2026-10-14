/**
 * Ephemeral PostgreSQL verification for VO-SIG B1 simple repair SQL V2 (offline only).
 * Run via: backend/scripts wrapper or `cd backend && DATABASE_URL=... npx tsx ../architecture/.../this-file.ts`
 */
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BusinessType,
  PrismaClient,
  VehicleProviderConsentGrantType,
  VehicleProviderConsentStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import {
  planLegacyConnectionIdentityReconciliation,
  rollbackLegacyConnectionIdentityReconciliation,
} from '../../../../backend/src/modules/vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-connection-identity-reconcile.service';
import { computeDeterministicApprovalManifestFingerprint } from '../../../../backend/src/modules/vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconcile-approval-manifest';
import { fingerprintLinkMetadata } from '../../../../backend/src/modules/vehicle-onboarding/connection-identity/legacy-reconciliation/stable-metadata-fingerprint';
import {
  B1_RUPTELA_RAW,
  B1_TESLA_RAW,
  createLegacyDimoLinkFixture,
} from '../../../../backend/src/modules/vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';

const __dirname = dirname(fileURLToPath(import.meta.url));
const evidenceDir = resolve(__dirname, '..');
const generatorPath = resolve(__dirname, 'generate-vo-sig-b1-simple-repair-review-v2.mjs');
const productionV2Path = resolve(evidenceDir, 'VO_SIG_B1_SIMPLE_REPAIR_REVIEW_V2.sql');

const prisma = new PrismaClient();
const fixedNow = new Date('2026-10-14T11:26:20.154Z');
const runId = randomUUID();
const releaseSha = 'a1b2c3d4e5f6789012345678901234567890abcd';

function log(msg: string) {
  console.log(msg);
}

function runSqlFile(databaseUrl: string, sqlText: string) {
  const base = databaseUrl.split('?')[0];
  execFileSync('psql', [base, '-v', 'ON_ERROR_STOP=1', '-f', '-'], { input: sqlText });
}

function wrapSqlWithSettings(sqlText: string, commit: boolean) {
  const preamble = `
SELECT set_config('vo_sig_b1.run_id', '${runId}', false);
SELECT set_config('vo_sig_b1.authorization_reference', 'ephemeral-test-auth', false);
SELECT set_config('vo_sig_b1.operator_reference', 'ephemeral-test-operator', false);
SELECT set_config('vo_sig_b1.verified_at_iso', '${fixedNow.toISOString()}', false);
SELECT set_config('vo_sig_b1.production_release_sha', '${releaseSha}', false);
`;
  const body = sqlText
    .replace(/^BEGIN;\n/m, `BEGIN;\n${preamble}\n`)
    .replace(/\nROLLBACK;\s*$/m, commit ? '\nCOMMIT;\n' : '\nROLLBACK;\n');
  return body;
}

async function seedFourLinkCohort(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) {
    await prisma.organization.create({
      data: { id: orgId, companyName: 'VO-SIG B1 SQL V2 Ephemeral', businessType: BusinessType.RENTAL },
    });
  }
  const suffix = randomUUID().slice(0, 8);
  const tokenBase = 3_100_000 + (Number.parseInt(suffix.slice(0, 6), 16) % 400_000);
  const linkIds: string[] = [];
  const specs = [
    { externalId: '187784', tokenOffset: 0, raw: B1_RUPTELA_RAW('R1-865918076152229') },
    { externalId: '192922', tokenOffset: 1, raw: B1_RUPTELA_RAW('R1-865918076209847') },
    { externalId: '186946', tokenOffset: 2, raw: B1_TESLA_RAW },
    { externalId: '187361', tokenOffset: 3, raw: B1_RUPTELA_RAW('R1-861773070120068') },
  ];
  for (const spec of specs) {
    const externalId = `${spec.externalId}-${suffix}`;
    const tokenId = tokenBase + spec.tokenOffset;
    const created = await createLegacyDimoLinkFixture(prisma, {
      organizationId: orgId,
      externalId,
      rawJson: spec.raw,
      tokenId,
      registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
      consentGrant: VehicleProviderConsentGrantType.DIMO_DIRECT,
      consentStatus: VehicleProviderConsentStatus.ACTIVE,
      metadata: { provenance: 'backfill', version: 1, dimoExternalId: externalId, keep: externalId },
    });
    await prisma.vehicleDataSourceLink.update({
      where: { id: created.linkId },
      data: { lastVerifiedAt: new Date('2026-08-25T18:52:48.114Z') },
    });
    linkIds.push(created.linkId);
  }
  return linkIds;
}

function buildDryRunManifest(orgId: string, plan: Awaited<ReturnType<typeof planLegacyConnectionIdentityReconciliation>>) {
  return {
    mode: 'DRY_RUN',
    organizationId: orgId,
    manifestFingerprint: computeDeterministicApprovalManifestFingerprint(plan),
    rowCount: plan.length,
    rows: plan.map((row) => ({
      sourceLinkId: row.sourceLinkId,
      vehicleId: row.vehicleId,
      organizationId: row.organizationId,
      dimoTokenId: row.dimoTokenId,
      dimoExternalId: row.dimoExternalId,
      provider: 'DIMO',
      sourceMirrorId: row.sourceMirrorId,
      currentMetadataFingerprint: row.currentMetadataFingerprint,
      currentConnectionIdentity: 'absent',
      eligibility: row.eligibility,
      reasonCodes: row.reasonCodes,
      proposedMetadataV2: row.proposedMetadataV2,
      proposedMetadataFingerprint: row.proposedMetadataFingerprint,
      evidenceClassification: row.evidenceClassification,
      approvalManifestEntry: row.approvalManifestEntry,
    })),
  };
}

function loadPgFingerprintHelperSql(): string {
  const sql = readFileSync(productionV2Path, 'utf8');
  const chunk = sql.split('CREATE OR REPLACE FUNCTION pg_temp.vo_sig_b1_metadata_storage')[1]?.split('CREATE TEMP TABLE vo_sig_b1_repair_before')[0];
  if (!chunk) throw new Error('Could not extract pg_temp fingerprint helpers from production V2 SQL');
  return `CREATE EXTENSION IF NOT EXISTS pgcrypto;\nCREATE OR REPLACE FUNCTION pg_temp.vo_sig_b1_metadata_storage${chunk}`;
}

function sqlLiteralJson(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
}

async function testFingerprintParity() {
  const helperSql = loadPgFingerprintHelperSql();
  const samples: { value: unknown; label: string }[] = [
    { value: null, label: 'null' },
    { value: { a: 1, z: { y: 2, x: 3 } }, label: 'nested' },
    { value: { provenance: 'backfill', version: 1, dimoExternalId: '186946' }, label: 'backfill' },
  ];
  const checks = samples.map((sample) => {
    const nodeFp = fingerprintLinkMetadata(sample.value);
    const json = sqlLiteralJson(sample.value);
    return `SELECT CASE
      WHEN pg_temp.vo_sig_b1_fingerprint_link_metadata(${json}, pg_temp.vo_sig_b1_metadata_storage(${json})) = '${nodeFp}'
      THEN 'ok-${sample.label}' ELSE 'fail-${sample.label}' END;`;
  });
  const script = `BEGIN;\n${helperSql}\n${checks.join('\n')}\nROLLBACK;\n`;
  const out = execFileSync('psql', [process.env.DATABASE_URL!.split('?')[0], '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
    input: script,
    encoding: 'utf8',
  });
  for (const sample of samples) {
    if (!out.includes(`ok-${sample.label}`)) {
      throw new Error(`Fingerprint parity failed for ${sample.label}: ${out}`);
    }
  }
  log('PASS fingerprint parity (Node canonical contract vs pg_temp SQL helpers)');
}

function testProductionV2Static() {
  const sql = readFileSync(productionV2Path, 'utf8');
  if (!sql.trimEnd().endsWith('ROLLBACK;')) throw new Error('Production V2 must end with ROLLBACK;');
  const bodyWithoutComments = sql.replace(/^--.*\n/gm, '');
  if (/\bOWNER_SET_(RUN_ID|AUTH_REF|OPERATOR|VERIFIED_AT_ISO|RELEASE_SHA)/.test(bodyWithoutComments)) {
    throw new Error('Production V2 body must not contain OWNER_SET execution placeholders');
  }
  log(`PASS production V2 static checks sha256=${createHash('sha256').update(sql).digest('hex')}`);
}

async function testHappyPathGeneratedSql() {
  const orgId = randomUUID();
  const linkIds = await seedFourLinkCohort(orgId);
  const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
    organizationId: orgId,
    linkIds,
    now: fixedNow,
  });
  const manifestPath = resolve(evidenceDir, 'vo-sig-b1-ephemeral-test-manifest.json');
  const sqlPath = resolve(evidenceDir, 'vo-sig-b1-ephemeral-test-repair.sql');
  writeFileSync(manifestPath, JSON.stringify(buildDryRunManifest(orgId, plan), null, 2));
  execFileSync('node', [generatorPath, manifestPath, sqlPath], { stdio: 'inherit' });
  const sql = readFileSync(sqlPath, 'utf8');
  const bodyWithoutComments = sql.replace(/^--.*\n/gm, '');
  if (/\bOWNER_SET_(RUN_ID|AUTH_REF|OPERATOR|VERIFIED_AT_ISO|RELEASE_SHA)/.test(bodyWithoutComments)) {
    throw new Error('Ephemeral SQL contains OWNER_SET execution placeholders');
  }

  const beforeFps = new Map<string, { metadata: unknown; lastVerifiedAt: string | null; fp: string }>();
  for (const linkId of linkIds) {
    const link = await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkId } });
    if (!link) throw new Error('missing link');
    beforeFps.set(linkId, {
      metadata: JSON.parse(JSON.stringify(link.metadata)),
      lastVerifiedAt: link.lastVerifiedAt?.toISOString() ?? null,
      fp: fingerprintLinkMetadata(link.metadata),
    });
  }

  runSqlFile(process.env.DATABASE_URL!, wrapSqlWithSettings(sql, true));
  const auditCount = await prisma.vehicleConnectionIdentityReconciliationAudit.count({ where: { outcome: 'APPLIED' } });
  if (auditCount !== 4) throw new Error(`Expected 4 APPLIED audits, got ${auditCount}`);

  for (const linkId of linkIds) {
    const link = await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkId } });
    const before = beforeFps.get(linkId)!;
    const meta = link!.metadata as { keep?: string; connectionIdentity?: unknown };
    if (before.metadata && (before.metadata as { keep?: string }).keep !== meta.keep) {
      throw new Error(`Unrelated metadata changed for ${linkId}`);
    }
    if (link!.lastVerifiedAt?.toISOString() !== before.lastVerifiedAt) {
      throw new Error(`last_verified_at changed for ${linkId}`);
    }
    if (!meta.connectionIdentity) throw new Error(`connectionIdentity missing for ${linkId}`);

    const audit = await prisma.vehicleConnectionIdentityReconciliationAudit.findFirst({
      where: { sourceLinkId: linkId, outcome: 'APPLIED' },
    });
    if (!audit) throw new Error(`Missing audit for ${linkId}`);
    if (audit.beforeMetadataJson && JSON.stringify(audit.beforeMetadataJson) !== JSON.stringify(before.metadata)) {
      throw new Error(`Audit before_metadata_json drift for ${linkId}`);
    }

    const rolled = await rollbackLegacyConnectionIdentityReconciliation(prisma, {
      mode: 'ROLLBACK_EXECUTE',
      ownerAuthorized: true,
      targetAuditId: audit.id,
      runId,
      authorizationReference: 'ephemeral-test-auth',
      operatorReference: 'ephemeral-test-operator',
    });
    if (rolled.outcome !== 'ROLLED_BACK') {
      throw new Error(`Rollback failed for ${linkId}: ${rolled.reason ?? 'unknown'}`);
    }
    const restored = await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkId } });
    if (fingerprintLinkMetadata(restored!.metadata) !== before.fp) {
      throw new Error(`Rollback metadata fingerprint mismatch for ${linkId}`);
    }
  }
  log('PASS happy path: 4 updates, 4 audits, metadata preserved, last_verified_at unchanged, rollback CAS compatible');
}

async function testGuardFailureRollsBack() {
  const orgId = randomUUID();
  const linkIds = await seedFourLinkCohort(orgId);
  const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
    organizationId: orgId,
    linkIds,
    now: fixedNow,
  });
  const manifestPath = resolve(evidenceDir, 'vo-sig-b1-ephemeral-guardfail-manifest.json');
  const sqlPath = resolve(evidenceDir, 'vo-sig-b1-ephemeral-guardfail-repair.sql');
  writeFileSync(manifestPath, JSON.stringify(buildDryRunManifest(orgId, plan), null, 2));
  execFileSync('node', [generatorPath, manifestPath, sqlPath], { stdio: 'inherit' });

  await prisma.vehicleDataSourceLink.update({ where: { id: linkIds[0] }, data: { isActive: false } });
  const sql = readFileSync(sqlPath, 'utf8');
  let failed = false;
  try {
    runSqlFile(process.env.DATABASE_URL!, wrapSqlWithSettings(sql, false));
  } catch {
    failed = true;
  }
  if (!failed) throw new Error('Expected guard failure to abort transaction');
  const auditCount = await prisma.vehicleConnectionIdentityReconciliationAudit.count({
    where: { sourceLinkId: { in: linkIds } },
  });
  const withCi = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT count(*)::bigint AS count
    FROM vehicle_data_source_links
    WHERE id = ANY(${linkIds}::text[])
      AND metadata ? 'connectionIdentity'
  `;
  if (auditCount > 0 || Number(withCi[0].count) > 0) {
    throw new Error('Guard failure left partial writes behind for cohort links');
  }
  log('PASS guard failure rolls back all writes (0 audits, 0 connectionIdentity)');
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  testProductionV2Static();
  await testFingerprintParity();
  await testHappyPathGeneratedSql();
  await testGuardFailureRollsBack();
  log('ALL_EPHEMERAL_TESTS_PASSED');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
