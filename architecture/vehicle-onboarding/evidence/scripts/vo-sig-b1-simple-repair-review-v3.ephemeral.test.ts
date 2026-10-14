/**
 * Ephemeral PostgreSQL verification for VO-SIG B1 simple repair SQL V3 (offline only).
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
import { sha256CanonicalJson } from '../../../../backend/src/modules/vehicle-onboarding/connection-identity/legacy-reconciliation/connection-identity-metadata-v2';
import { fingerprintLinkMetadata } from '../../../../backend/src/modules/vehicle-onboarding/connection-identity/legacy-reconciliation/stable-metadata-fingerprint';
import {
  B1_RUPTELA_RAW,
  B1_TESLA_RAW,
  createLegacyDimoLinkFixture,
} from '../../../../backend/src/modules/vehicle-onboarding/connection-identity/legacy-reconciliation/legacy-reconciliation-postgres.fixture';

const __dirname = dirname(fileURLToPath(import.meta.url));
const evidenceDir = resolve(__dirname, '..');
const generatorPath = resolve(__dirname, 'generate-vo-sig-b1-simple-repair-review-v3.mjs');
const productionV3Path = resolve(evidenceDir, 'VO_SIG_B1_SIMPLE_REPAIR_REVIEW_V3.sql');

const prisma = new PrismaClient();
const fixedNow = new Date('2026-10-14T11:26:20.154Z');
const priorVerified = new Date('2026-08-25T18:52:48.114Z');
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
      data: { id: orgId, companyName: 'VO-SIG B1 SQL V3 Ephemeral', businessType: BusinessType.RENTAL },
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
      data: { lastVerifiedAt: priorVerified },
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

function loadPgHelperSql(): string {
  const sql = readFileSync(productionV3Path, 'utf8');
  const start = sql.indexOf('CREATE OR REPLACE FUNCTION pg_temp.vo_sig_b1_metadata_storage');
  const end = sql.indexOf('CREATE OR REPLACE FUNCTION pg_temp.vo_sig_b1_merge_connection_identity');
  if (start < 0 || end < 0) throw new Error('Could not extract pg_temp helpers from production V3 SQL');
  return `CREATE EXTENSION IF NOT EXISTS pgcrypto;\n${sql.slice(start, end)}`;
}

function sqlLiteralJson(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
}

async function generateCohortSql(orgId: string, linkIds: string[], sqlPath: string, manifestPath: string) {
  const plan = await planLegacyConnectionIdentityReconciliation(prisma, {
    organizationId: orgId,
    linkIds,
    now: fixedNow,
  });
  writeFileSync(manifestPath, JSON.stringify(buildDryRunManifest(orgId, plan), null, 2));
  execFileSync('node', [generatorPath, manifestPath, sqlPath], { stdio: 'inherit' });
  return readFileSync(sqlPath, 'utf8');
}

function testProductionV3Static() {
  const sql = readFileSync(productionV3Path, 'utf8');
  if (!sql.trimEnd().endsWith('ROLLBACK;')) throw new Error('Production V3 must end with ROLLBACK;');
  const bodyWithoutComments = sql.replace(/^--.*\n/gm, '');
  if (/\bCREATE\s+EXTENSION\b/i.test(bodyWithoutComments)) {
    throw new Error('Production V3 must not CREATE EXTENSION');
  }
  if (!bodyWithoutComments.includes('COHORT_LINK_COUNT_MISMATCH')) {
    throw new Error('Production V3 must include production cohort link guard');
  }
  if (!bodyWithoutComments.includes('MANIFEST_FINGERPRINT_MISMATCH')) {
    throw new Error('Production V3 must include manifest fingerprint guard');
  }
  if (/\bOWNER_SET_(RUN_ID|AUTH_REF|OPERATOR|VERIFIED_AT_ISO|RELEASE_SHA)/.test(bodyWithoutComments)) {
    throw new Error('Production V3 body must not contain OWNER_SET execution placeholders');
  }
  log(`PASS production V3 static checks sha256=${createHash('sha256').update(sql).digest('hex')}`);
}

async function testFingerprintParity() {
  const helperSql = loadPgHelperSql();
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
      THEN 'ok-meta-${sample.label}' ELSE 'fail-meta-${sample.label}' END;`;
  });
  const script = `BEGIN;\n${helperSql}\n${checks.join('\n')}\nROLLBACK;\n`;
  const out = execFileSync('psql', [process.env.DATABASE_URL!.split('?')[0], '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
    input: script,
    encoding: 'utf8',
  });
  for (const sample of samples) {
    if (!out.includes(`ok-meta-${sample.label}`)) {
      throw new Error(`Metadata fingerprint parity failed for ${sample.label}`);
    }
  }
  log('PASS metadata fingerprint parity');
}

async function testNodeRawJsonSha256Parity() {
  const orgId = randomUUID();
  const linkIds = await seedFourLinkCohort(orgId);
  const links = await prisma.$queryRaw<{ link_id: string; raw_json: unknown }[]>`
    SELECT l.id AS link_id, d.raw_json
    FROM vehicle_data_source_links l
    INNER JOIN dimo_vehicles d ON d.id = l.dimo_vehicle_id
    WHERE l.id = ANY(${linkIds}::text[])
  `;
  const helperSql = loadPgHelperSql();
  const checks = links.map((link) => {
    const nodeHash = sha256CanonicalJson(link.raw_json);
    return `SELECT CASE
      WHEN pg_temp.vo_sig_b1_sha256_node_json(d.raw_json) = '${nodeHash}'
      THEN 'ok-raw-${link.link_id}' ELSE 'fail-raw-${link.link_id}' END
    FROM vehicle_data_source_links l
    INNER JOIN dimo_vehicles d ON d.id = l.dimo_vehicle_id
    WHERE l.id = '${link.link_id}';`;
  });
  const script = `BEGIN;\n${helperSql}\n${checks.join('\n')}\nROLLBACK;\n`;
  const out = execFileSync('psql', [process.env.DATABASE_URL!.split('?')[0], '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
    input: script,
    encoding: 'utf8',
  });
  for (const link of links) {
    if (!out.includes(`ok-raw-${link.link_id}`)) {
      throw new Error(`Node rawJsonSha256 parity failed for link ${link.link_id}`);
    }
  }
  log('PASS Node sha256CanonicalJson parity vs pg_temp.vo_sig_b1_sha256_node_json (B1 fixture shapes)');
}

async function testHappyPathAndRollback() {
  const orgId = randomUUID();
  const linkIds = await seedFourLinkCohort(orgId);
  const sqlPath = resolve(evidenceDir, 'vo-sig-b1-ephemeral-v3-happy.sql');
  const manifestPath = resolve(evidenceDir, 'vo-sig-b1-ephemeral-v3-happy-manifest.json');
  const sql = await generateCohortSql(orgId, linkIds, sqlPath, manifestPath);

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
  const auditCount = await prisma.vehicleConnectionIdentityReconciliationAudit.count({
    where: { sourceLinkId: { in: linkIds }, outcome: 'APPLIED' },
  });
  if (auditCount !== 4) throw new Error(`Expected 4 APPLIED audits, got ${auditCount}`);

  for (const linkId of linkIds) {
    const link = await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkId } });
    const before = beforeFps.get(linkId)!;
    const meta = link!.metadata as { keep?: string; connectionIdentity?: unknown };
    if ((before.metadata as { keep?: string }).keep !== meta.keep) {
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
  log('PASS happy path: 4 updates/audits, last_verified_at unchanged, rollback restores originals');
}

async function expectSqlAbort(sql: string) {
  let failed = false;
  try {
    runSqlFile(process.env.DATABASE_URL!, wrapSqlWithSettings(sql, false));
  } catch {
    failed = true;
  }
  if (!failed) throw new Error('Expected SQL abort');
}

async function testGuardFailureRollsBack() {
  const orgId = randomUUID();
  const linkIds = await seedFourLinkCohort(orgId);
  const sqlPath = resolve(evidenceDir, 'vo-sig-b1-ephemeral-v3-guardfail.sql');
  const manifestPath = resolve(evidenceDir, 'vo-sig-b1-ephemeral-v3-guardfail-manifest.json');
  const sql = await generateCohortSql(orgId, linkIds, sqlPath, manifestPath);
  await prisma.vehicleDataSourceLink.update({ where: { id: linkIds[0] }, data: { isActive: false } });
  await expectSqlAbort(sql);
  await assertCohortUnchanged(linkIds);
  log('PASS inactive link guard rolls back all four writes');
}

async function testRawJsonDriftRejected() {
  const orgId = randomUUID();
  const linkIds = await seedFourLinkCohort(orgId);
  const sqlPath = resolve(evidenceDir, 'vo-sig-b1-ephemeral-v3-rawjson.sql');
  const manifestPath = resolve(evidenceDir, 'vo-sig-b1-ephemeral-v3-rawjson-manifest.json');
  const sql = await generateCohortSql(orgId, linkIds, sqlPath, manifestPath);
  const link = await prisma.vehicleDataSourceLink.findUnique({ where: { id: linkIds[0] } });
  if (!link?.dimoVehicleId) throw new Error('missing dimo vehicle for drift test');
  await prisma.$executeRaw`
    UPDATE dimo_vehicles
    SET raw_json = ${JSON.stringify({ mutated: true })}::jsonb
    WHERE id = ${link.dimoVehicleId}::text
  `;
  await expectSqlAbort(sql);
  await assertCohortUnchanged(linkIds);
  log('PASS changed DIMO raw_json rejected (RAW_JSON_SHA256_MISMATCH)');
}

async function testLastVerifiedAtDriftRejected() {
  const orgId = randomUUID();
  const linkIds = await seedFourLinkCohort(orgId);
  const sqlPath = resolve(evidenceDir, 'vo-sig-b1-ephemeral-v3-lv.sql');
  const manifestPath = resolve(evidenceDir, 'vo-sig-b1-ephemeral-v3-lv-manifest.json');
  const sql = await generateCohortSql(orgId, linkIds, sqlPath, manifestPath);
  await prisma.vehicleDataSourceLink.update({
    where: { id: linkIds[0] },
    data: { lastVerifiedAt: new Date('2020-01-01T00:00:00.000Z') },
  });
  await expectSqlAbort(sql);
  await assertCohortUnchanged(linkIds);
  log('PASS changed last_verified_at rejected (PRIOR_LAST_VERIFIED_AT_MISMATCH)');
}

async function assertCohortUnchanged(linkIds: string[]) {
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
    throw new Error('Failed guard left partial cohort writes');
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  testProductionV3Static();
  await testFingerprintParity();
  await testNodeRawJsonSha256Parity();
  await testHappyPathAndRollback();
  await testGuardFailureRollsBack();
  await testRawJsonDriftRejected();
  await testLastVerifiedAtDriftRejected();
  log('ALL_EPHEMERAL_V3_TESTS_PASSED');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
