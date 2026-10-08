import { PrismaClient } from '@prisma/client';
import { probePostgresDatabase } from '../provider-observability-gap/provider-observability-gap-postgres.fixture';
import { M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1 } from './m3-3-hv-h4-a3-3-o2-r1-canonical-golden-vectors.v1';
import { insertCoherentRevisionWithAckO2R1 } from './m3-3-hv-h4-a3-3-o2-r1-test.fixture';
import { computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1 } from './m3-3-hv-h4-a3-charge-session-evidence-fingerprint.v1';
import { mirrorFromScientificProjectionV1 } from './m3-3-hv-h4-a3-charge-session-evidence-projection.v1';
import type { M3_3HvH4ChargeSessionEvidenceScientificProjectionV1 } from './m3-3-hv-h4-a3-charge-session-evidence.types.v1';
import {
  issueM3_3HvH4A3IntegrityAttestationIsolatedInTransactionV1,
  issueM3_3HvH4A3IntegrityAttestationIsolatedV1,
  M3_3HvH4A3IntegrityAttestationIssuePermissionError,
  M3_3HvH4A3IntegrityAttestationIssueVerificationError,
} from './m3-3-hv-h4-a3-3-o2-isolated-attestation-issuer.v1';
import {
  createIssuerLoginPostgresClientV1,
  createRestrictedAppRoleScopedPostgresClientV1,
  ensureM3_3HvH4A3O2R2PostgresRolesV1,
  M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE,
} from './m3-3-hv-h4-a3-3-o2-r2-postgres-roles.fixture';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';

function concurrencyGate(): {
  waitUntilIssuerLocked: Promise<void>;
  notifyIssuerLocked: () => void;
  waitUntilAppBlocked: Promise<void>;
  notifyAppBlocked: () => void;
} {
  let notifyIssuerLocked!: () => void;
  let notifyAppBlocked!: () => void;
  const waitUntilIssuerLocked = new Promise<void>((resolve) => {
    notifyIssuerLocked = resolve;
  });
  const waitUntilAppBlocked = new Promise<void>((resolve) => {
    notifyAppBlocked = resolve;
  });
  return {
    waitUntilIssuerLocked,
    notifyIssuerLocked,
    waitUntilAppBlocked,
    notifyAppBlocked,
  };
}

describe('M3.3-HV-H4-A3.3-O2-R2-H1 true issuer concurrency (PostgreSQL)', () => {
  let admin: PrismaClient;
  let issuerDb: PrismaClient | undefined;
  let appDb: PrismaClient | undefined;

  beforeAll(async () => {
    if (!integrationEnabled) return;
    const probe = await probePostgresDatabase();
    if (!probe) return;
    admin = new PrismaClient();
    await ensureM3_3HvH4A3O2R2PostgresRolesV1(admin);
    issuerDb = await createIssuerLoginPostgresClientV1();
    appDb = await createRestrictedAppRoleScopedPostgresClientV1();
    if (!issuerDb || !appDb) {
      throw new Error('O2-R2-H1: failed to create dedicated issuer/app login PostgreSQL clients');
    }
  });

  afterAll(async () => {
    await issuerDb?.$disconnect();
    await appDb?.$disconnect();
    await admin?.$disconnect();
  });

  beforeEach(async () => {
    if (!admin) return;
    await admin.batteryHvChargeSessionEvidenceIntegrityAttestation.deleteMany();
    await admin.batteryHvChargeSessionEvidenceAck.deleteMany();
    await admin.batteryHvChargeSessionEvidenceRevision.deleteMany();
  });

  async function seedRevision() {
    const vector = M3_3_HV_H4_A3_O2_R1_CANONICAL_GOLDEN_VECTORS_V1[0];
    const { revision, ackId } = await insertCoherentRevisionWithAckO2R1(admin!, vector.projection);
    return { revision, ackId: ackId! };
  }

  it('R2_H1_C1: issuer holds row lock → app revision UPDATE waits → issue commits → UPDATE invalidates', async () => {
    if (!admin || !issuerDb || !appDb) return;
    const { revision } = await seedRevision();
    const gate = concurrencyGate();

    const issuerWork = issuerDb.$transaction(async (tx) =>
      issueM3_3HvH4A3IntegrityAttestationIsolatedInTransactionV1(
        tx,
        { revisionId: revision.id },
        {
          afterRowLocksAcquired: async () => {
            gate.notifyIssuerLocked();
            await gate.waitUntilAppBlocked;
          },
        },
      ),
    );

    const appWork = (async () => {
      await gate.waitUntilIssuerLocked;
      const updateStarted = appDb.batteryHvChargeSessionEvidenceRevision.update({
        where: { id: revision.id },
        data: { qualityStatus: 'R2_H1_C1' },
      });
      gate.notifyAppBlocked();
      await updateStarted;
    })();

    await Promise.all([issuerWork, appWork]);
    expect(await admin.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

  it('R2_H1_C2: revision UPDATE commits before issuer verifies current state', async () => {
    if (!admin || !issuerDb) return;
    const { revision } = await seedRevision();
    const scientific = {
      ...(revision.scientificEvidenceJson as M3_3HvH4ChargeSessionEvidenceScientificProjectionV1),
      qualityStatus: 'R2_H1_C2',
    };
    const fingerprint = computeM3_3HvH4ChargeSessionSourceRevisionFingerprintV1(scientific);
    const mirror = mirrorFromScientificProjectionV1(scientific);
    await admin.batteryHvChargeSessionEvidenceRevision.update({
      where: { id: revision.id },
      data: { ...mirror, scientificEvidenceJson: scientific, sourceRevisionFingerprint: fingerprint },
    });
    await admin.batteryHvChargeSessionEvidenceAck.updateMany({
      where: { revisionId: revision.id },
      data: { sourceRevisionFingerprint: fingerprint },
    });
    await issueM3_3HvH4A3IntegrityAttestationIsolatedV1(issuerDb, { revisionId: revision.id });
    expect(await admin.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(1);
  });

  it('R2_H1_C3: issuer holds ACK lock → app ACK UPDATE waits → issue commits → UPDATE invalidates', async () => {
    if (!admin || !issuerDb || !appDb) return;
    const { revision, ackId } = await seedRevision();
    const gate = concurrencyGate();

    const issuerWork = issuerDb.$transaction(async (tx) =>
      issueM3_3HvH4A3IntegrityAttestationIsolatedInTransactionV1(
        tx,
        { revisionId: revision.id },
        {
          afterRowLocksAcquired: async () => {
            gate.notifyIssuerLocked();
            await gate.waitUntilAppBlocked;
          },
        },
      ),
    );

    const appWork = (async () => {
      await gate.waitUntilIssuerLocked;
      const updateStarted = appDb.batteryHvChargeSessionEvidenceAck.update({
        where: { id: ackId },
        data: { acknowledgedAt: new Date('2026-03-02T00:00:00.000Z') },
      });
      gate.notifyAppBlocked();
      await updateStarted;
    })();

    await Promise.all([issuerWork, appWork]);
    expect(await admin.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

  it('R2_H1_C4: ACK UPDATE commits before issuer issues on current state', async () => {
    if (!admin || !issuerDb) return;
    const { revision, ackId } = await seedRevision();
    await admin.batteryHvChargeSessionEvidenceAck.update({
      where: { id: ackId },
      data: { acknowledgedAt: new Date('2026-02-01T00:00:00.000Z') },
    });
    await issueM3_3HvH4A3IntegrityAttestationIsolatedV1(issuerDb, { revisionId: revision.id });
    expect(await admin.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(1);
  });

  it('R2_H1_C5: concurrent duplicate issuance → exactly one attestation', async () => {
    if (!admin || !issuerDb) return;
    const { revision } = await seedRevision();
    const issuerB = await createIssuerLoginPostgresClientV1();
    if (!issuerB) return;
    try {
      const results = await Promise.allSettled([
        issueM3_3HvH4A3IntegrityAttestationIsolatedV1(issuerDb, { revisionId: revision.id }),
        issueM3_3HvH4A3IntegrityAttestationIsolatedV1(issuerB, { revisionId: revision.id }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
      expect(results.filter((r) => r.status === 'rejected').length).toBe(1);
      expect(await admin.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(1);
    } finally {
      await issuerB.$disconnect();
    }
  });

  it('R2_H1_C6: verification failure rolls back (no attestation)', async () => {
    if (!admin || !issuerDb) return;
    const { revision } = await seedRevision();
    await admin.batteryHvChargeSessionEvidenceRevision.update({
      where: { id: revision.id },
      data: { sourceRevisionFingerprint: 'c'.repeat(64) },
    });
    await expect(
      issueM3_3HvH4A3IntegrityAttestationIsolatedV1(issuerDb, { revisionId: revision.id }),
    ).rejects.toBeInstanceOf(M3_3HvH4A3IntegrityAttestationIssueVerificationError);
    expect(await admin.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

  it('R2_H1_C7: permission failure during INSERT rolls back (no attestation)', async () => {
    if (!admin || !issuerDb) return;
    const { revision } = await seedRevision();
    await admin.$executeRawUnsafe(
      `REVOKE INSERT ON public.battery_hv_charge_session_evidence_integrity_attestations FROM ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE}`,
    );
    try {
      await expect(
        issueM3_3HvH4A3IntegrityAttestationIsolatedV1(issuerDb, { revisionId: revision.id }),
      ).rejects.toBeInstanceOf(M3_3HvH4A3IntegrityAttestationIssuePermissionError);
      expect(await admin.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
    } finally {
      await admin.$executeRawUnsafe(
        `GRANT INSERT ON public.battery_hv_charge_session_evidence_integrity_attestations TO ${M3_3_HV_H4_A3_O2_R2_TRUSTED_ISSUER_ROLE}`,
      );
    }
  });
});
