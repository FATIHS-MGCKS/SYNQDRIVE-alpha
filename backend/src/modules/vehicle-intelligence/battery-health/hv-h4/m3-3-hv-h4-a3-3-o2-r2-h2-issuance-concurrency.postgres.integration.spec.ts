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
  createRestrictedAppLoginPostgresClientV1,
  ensureM3_3HvH4A3O2R2PostgresRolesV1,
  M3_3_HV_H4_A3_O2_R2_ISSUER_LOGIN_ROLE,
  waitUntilBackendBlockedByV1,
} from './m3-3-hv-h4-a3-3-o2-r2-postgres-roles.fixture';

const integrationEnabled = process.env.BATTERY_HV_H4_REPORT_INTEGRATION === '1';

function lockObservationGate() {
  let issuerPid = -1;
  let appPid = -1;
  let resolveIssuerLocked!: (pid: number) => void;
  let resolveAppPid!: (pid: number) => void;
  let resolveBlockObserved!: () => void;
  const waitIssuerLocked = new Promise<number>((resolve) => {
    resolveIssuerLocked = resolve;
  });
  const waitAppPid = new Promise<number>((resolve) => {
    resolveAppPid = resolve;
  });
  const waitBlockObserved = new Promise<void>((resolve) => {
    resolveBlockObserved = resolve;
  });
  return {
    notifyIssuerLocked: (pid: number) => {
      issuerPid = pid;
      resolveIssuerLocked(pid);
    },
    notifyAppUpdateBackend: (pid: number) => {
      appPid = pid;
      resolveAppPid(pid);
    },
    notifyBlockObserved: () => resolveBlockObserved(),
    waitIssuerLocked,
    waitAppPid,
    waitBlockObserved,
    getIssuerPid: () => issuerPid,
    getAppPid: () => appPid,
  };
}

describe('M3.3-HV-H4-A3.3-O2-R2-H2 issuer-login concurrency (PostgreSQL)', () => {
  let admin: PrismaClient;
  let issuerDb: Awaited<ReturnType<typeof createIssuerLoginPostgresClientV1>>;
  let appDb: PrismaClient | undefined;

  beforeAll(async () => {
    if (!integrationEnabled) return;
    const probe = await probePostgresDatabase();
    if (!probe) return;
    admin = new PrismaClient();
    await ensureM3_3HvH4A3O2R2PostgresRolesV1(admin);
    issuerDb = await createIssuerLoginPostgresClientV1();
    appDb = await createRestrictedAppLoginPostgresClientV1();
    if (!issuerDb || !appDb) {
      throw new Error('O2-R2-H2: failed to create issuer/app login clients');
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

  async function issueOnIssuerLogin(
    issuer: NonNullable<typeof issuerDb>,
    revisionId: string,
    hooks?: { afterRowLocksAcquired?: (readBackendPid: () => Promise<number>) => Promise<void> },
  ) {
    return issuer.$transaction(async (tx) =>
      issueM3_3HvH4A3IntegrityAttestationIsolatedInTransactionV1(tx, { revisionId }, hooks),
    );
  }

  it('H2-C1: issuer lock → revision UPDATE blocked (pg_blocking_pids) → commit → invalidates', async () => {
    if (!admin || !issuerDb || !appDb) return;
    const { revision } = await seedRevision();
    const gate = lockObservationGate();

    const observer = (async () => {
      const issuerPid = await gate.waitIssuerLocked;
      const appPid = await gate.waitAppPid;
      await waitUntilBackendBlockedByV1(admin, appPid, issuerPid);
      gate.notifyBlockObserved();
    })();

    const issuerWork = issueOnIssuerLogin(issuerDb, revision.id, {
      afterRowLocksAcquired: async (readBackendPid) => {
        gate.notifyIssuerLocked(await readBackendPid());
        await gate.waitBlockObserved;
      },
    });

    const appWork = (async () => {
      await gate.waitIssuerLocked;
      await appDb!.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid()::int AS pid`;
        gate.notifyAppUpdateBackend(rows[0]?.pid ?? -1);
        await tx.batteryHvChargeSessionEvidenceRevision.update({
          where: { id: revision.id },
          data: { qualityStatus: 'H2_C1' },
        });
      });
    })();

    await Promise.all([issuerWork, appWork, observer]);
    expect(await admin.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

  it('H2-C2: revision UPDATE before issuance → issuer sees coherent state', async () => {
    if (!admin || !issuerDb) return;
    const { revision } = await seedRevision();
    const scientific = {
      ...(revision.scientificEvidenceJson as M3_3HvH4ChargeSessionEvidenceScientificProjectionV1),
      qualityStatus: 'H2_C2',
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

  it('H2-C3: issuer ACK lock → ACK UPDATE blocked → commit → invalidates', async () => {
    if (!admin || !issuerDb || !appDb) return;
    const { revision, ackId } = await seedRevision();
    const gate = lockObservationGate();

    const observer = (async () => {
      const issuerPid = await gate.waitIssuerLocked;
      const appPid = await gate.waitAppPid;
      await waitUntilBackendBlockedByV1(admin, appPid, issuerPid);
      gate.notifyBlockObserved();
    })();

    const issuerWork = issueOnIssuerLogin(issuerDb, revision.id, {
      afterRowLocksAcquired: async (readBackendPid) => {
        gate.notifyIssuerLocked(await readBackendPid());
        await gate.waitBlockObserved;
      },
    });

    const appWork = (async () => {
      await gate.waitIssuerLocked;
      await appDb!.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid()::int AS pid`;
        gate.notifyAppUpdateBackend(rows[0]?.pid ?? -1);
        await tx.batteryHvChargeSessionEvidenceAck.update({
          where: { id: ackId },
          data: { acknowledgedAt: new Date('2026-04-01T00:00:00.000Z') },
        });
      });
    })();

    await Promise.all([issuerWork, appWork, observer]);
    expect(await admin.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

  it('H2-C4: ACK UPDATE before issuance → issuer sees current ACK', async () => {
    if (!admin || !issuerDb) return;
    const { revision, ackId } = await seedRevision();
    await admin.batteryHvChargeSessionEvidenceAck.update({
      where: { id: ackId },
      data: { acknowledgedAt: new Date('2026-02-15T00:00:00.000Z') },
    });
    await issueM3_3HvH4A3IntegrityAttestationIsolatedV1(issuerDb, { revisionId: revision.id });
    expect(await admin.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(1);
  });

  it('H2-C5: two issuer-login transactions → exactly one attestation', async () => {
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

  it('H2-C6: verification failure → rollback, zero attestations', async () => {
    if (!admin || !issuerDb) return;
    const { revision } = await seedRevision();
    await admin.batteryHvChargeSessionEvidenceRevision.update({
      where: { id: revision.id },
      data: { sourceRevisionFingerprint: 'e'.repeat(64) },
    });
    await expect(
      issueM3_3HvH4A3IntegrityAttestationIsolatedV1(issuerDb, { revisionId: revision.id }),
    ).rejects.toBeInstanceOf(M3_3HvH4A3IntegrityAttestationIssueVerificationError);
    expect(await admin.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
  });

  it('H2-C7: issuer INSERT denied → rollback, zero attestations', async () => {
    if (!admin || !issuerDb) return;
    const { revision } = await seedRevision();
    await admin.$executeRawUnsafe(
      `REVOKE INSERT ON public.battery_hv_charge_session_evidence_integrity_attestations FROM ${M3_3_HV_H4_A3_O2_R2_ISSUER_LOGIN_ROLE}`,
    );
    try {
      await expect(
        issueM3_3HvH4A3IntegrityAttestationIsolatedV1(issuerDb, { revisionId: revision.id }),
      ).rejects.toBeInstanceOf(M3_3HvH4A3IntegrityAttestationIssuePermissionError);
      expect(await admin.batteryHvChargeSessionEvidenceIntegrityAttestation.count()).toBe(0);
    } finally {
      await admin.$executeRawUnsafe(
        `GRANT INSERT ON public.battery_hv_charge_session_evidence_integrity_attestations TO ${M3_3_HV_H4_A3_O2_R2_ISSUER_LOGIN_ROLE}`,
      );
    }
  });
});
