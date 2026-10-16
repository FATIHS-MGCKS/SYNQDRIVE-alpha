/**
 * P5B.1 evidence append-only semantics (disposable PostgreSQL).
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { assertVsi03DisposablePostgresTarget } from './vsi-readonly-composer.postgres-guard';
import { VsiApdsP5b1EvidenceWriter } from './vsi-apds-p5b1-evidence.writer';
import { VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION } from './vsi-apds-p5b1.contract';
import type { VsiApdsP5b1OfflineCorrelationRowV1 } from './vsi-apds-p5b1.types';
import { P25_APD_B4_V1 } from '../../../workers/schedulers/snapshot-polling/adaptive-polling-policy/p25-apd-policy-versions';

const LIVE = process.env.VSI03_READONLY_COMPOSER_PG === '1';

function databaseFingerprint(databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  const db = parsed.pathname.replace(/^\//, '');
  return createHash('sha256').update(`${parsed.hostname}|${parsed.port}|${db}`).digest('hex');
}

function baseRow(overrides: Partial<VsiApdsP5b1OfflineCorrelationRowV1> = {}): VsiApdsP5b1OfflineCorrelationRowV1 {
  return {
    contractVersion: VSI_APDS_P5B1_OFFLINE_CONTRACT_VERSION,
    decisionIdentity: {
      organizationId: randomUUID(),
      vehicleId: randomUUID(),
      opportunityId: `opp-${randomUUID()}`,
      policyVersion: P25_APD_B4_V1,
      decisionAt: '2026-10-16T06:00:00.000Z',
      activationEpochId: null,
      shadowExecutionVersion: null,
    },
    originalApdsDecision: 'HOLD',
    originalApdsReason: 'pg-evidence',
    sourceLinkAttribution: {
      status: 'UNIQUE_ATTRIBUTED',
      providerSourceLinkId: randomUUID(),
      historicalActiveLinkCountAtDecision: 1,
      reasons: [],
    },
    observation: null,
    correlation: null,
    investigationHints: [],
    processingStatus: 'SKIPPED_NO_ATTRIBUTABLE_LINK',
    errorCode: null,
    skippedReason: null,
    ...overrides,
  };
}

(LIVE ? describe : describe.skip)('VSI P5B.1 evidence writer (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  const writer = new VsiApdsP5b1EvidenceWriter(prisma as never);
  const priorAuthorized = process.env.VSI_P5B1_EVIDENCE_STORE_WRITE_AUTHORIZED;
  const priorEnabled = process.env.VSI_P5B1_EVIDENCE_STORE_WRITE_ENABLED;
  const priorFingerprint = process.env.VSI_P5B1_EVIDENCE_STORE_DATABASE_FINGERPRINT;

  beforeAll(() => {
    assertVsi03DisposablePostgresTarget();
    process.env.VSI_P5B1_EVIDENCE_STORE_WRITE_AUTHORIZED = '1';
    process.env.VSI_P5B1_EVIDENCE_STORE_WRITE_ENABLED = '1';
    process.env.VSI_P5B1_EVIDENCE_STORE_DATABASE_FINGERPRINT = databaseFingerprint(
      process.env.DATABASE_URL ?? '',
    );
  });

  afterAll(async () => {
    process.env.VSI_P5B1_EVIDENCE_STORE_WRITE_AUTHORIZED = priorAuthorized;
    process.env.VSI_P5B1_EVIDENCE_STORE_WRITE_ENABLED = priorEnabled;
    process.env.VSI_P5B1_EVIDENCE_STORE_DATABASE_FINGERPRINT = priorFingerprint;
    await prisma.$disconnect();
  });

  it('duplicate fingerprint is idempotent no-op', async () => {
    const row = baseRow();
    const replayRunId = randomUUID();
    const first = await writer.appendCorrelationEvidence({ replayRunId, row });
    const second = await writer.appendCorrelationEvidence({ replayRunId, row });
    expect(first.appended).toBe(1);
    expect(second.reason).toBe('DUPLICATE_FINGERPRINT');

    await prisma.vsiApdsP5CorrelationEvidence.deleteMany({
      where: { organizationId: row.decisionIdentity.organizationId },
    });
  });

  it('parallel same fingerprint → one durable row', async () => {
    const row = baseRow();
    const replayRunId = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        writer.appendCorrelationEvidence({ replayRunId, row }),
      ),
    );
    const appended = results.filter((r) => r.appended === 1);
    const duplicates = results.filter((r) => r.reason === 'DUPLICATE_FINGERPRINT');
    expect(appended.length).toBe(1);
    expect(duplicates.length).toBe(7);

    const count = await prisma.vsiApdsP5CorrelationEvidence.count({
      where: {
        organizationId: row.decisionIdentity.organizationId,
        vehicleId: row.decisionIdentity.vehicleId,
        opportunityId: row.decisionIdentity.opportunityId,
        policyVersion: row.decisionIdentity.policyVersion,
      },
    });
    expect(count).toBe(1);

    await prisma.vsiApdsP5CorrelationEvidence.deleteMany({
      where: { organizationId: row.decisionIdentity.organizationId },
    });
  });

  it('different fingerprints → append-only revisions without overwrite', async () => {
    const identity = {
      organizationId: randomUUID(),
      vehicleId: randomUUID(),
      opportunityId: `opp-${randomUUID()}`,
      policyVersion: P25_APD_B4_V1,
      decisionAt: '2026-10-16T06:00:00.000Z',
      activationEpochId: null,
      shadowExecutionVersion: null,
    };
    const rowA = baseRow({
      decisionIdentity: identity,
      originalApdsReason: 'reason-a',
    });
    const rowB = baseRow({
      decisionIdentity: identity,
      originalApdsReason: 'reason-b',
    });
    const replayRunId = randomUUID();
    const parallel = await Promise.all([
      writer.appendCorrelationEvidence({ replayRunId, row: rowA }),
      writer.appendCorrelationEvidence({ replayRunId, row: rowB }),
    ]);
    expect(parallel.filter((r) => r.appended === 1).length).toBe(2);

    const rows = await prisma.vsiApdsP5CorrelationEvidence.findMany({
      where: {
        organizationId: identity.organizationId,
        vehicleId: identity.vehicleId,
        opportunityId: identity.opportunityId,
        policyVersion: identity.policyVersion,
      },
      orderBy: { evidenceRevision: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].evidenceRevision).toBe(1);
    expect(rows[1].evidenceRevision).toBe(2);
    expect(rows[0].correlationFingerprint).not.toBe(rows[1].correlationFingerprint);

    await prisma.vsiApdsP5CorrelationEvidence.deleteMany({
      where: { organizationId: identity.organizationId },
    });
  });
});
