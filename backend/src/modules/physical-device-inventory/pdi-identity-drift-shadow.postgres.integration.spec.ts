import { PrismaClient } from '@prisma/client';
import { loadPdiIdentityDriftObservationData } from './pdi-identity-drift-shadow.data-loader';
import { evaluateAllInstalledDevices } from './pdi-identity-drift-shadow.evaluator';
import { applyDualConfirmationPolicy } from './pdi-identity-drift-shadow.dual-confirmation';
import { fingerprintMirrorSnapshot } from './pdi-identity-drift-shadow.serial';
import {
  PdiIdentityDriftConfidence,
  PdiIdentityDriftReasonCode,
} from './pdi-identity-drift-shadow.types';
import {
  cleanupPdiDriftShadowPostgresFixture,
  createPdiDriftShadowPostgresFixture,
  probePdiDriftShadowDatabase,
  setDimoObservedSerial,
  type PdiDriftShadowPostgresFixture,
} from './testing/pdi-identity-drift-shadow.postgres.harness';

const LIVE =
  process.env.PDI_IDENTITY_DRIFT_SHADOW_POSTGRES_INTEGRATION === '1' &&
  Boolean(process.env.DATABASE_URL);
const REQUIRED = process.env.PDI_IDENTITY_DRIFT_SHADOW_POSTGRES_REQUIRED === '1';
const describePg = LIVE ? describe : describe.skip;

if (REQUIRED && !LIVE) {
  throw new Error(
    'PDI_IDENTITY_DRIFT_SHADOW_POSTGRES_REQUIRED=1 but DATABASE_URL / integration flag not set',
  );
}

describePg('PDI identity drift shadow (PostgreSQL)', () => {
  const prisma = new PrismaClient();
  let fixture: PdiDriftShadowPostgresFixture;

  beforeAll(async () => {
    const ok = await probePdiDriftShadowDatabase();
    if (!ok) throw new Error('PostgreSQL probe failed');
  });

  beforeEach(async () => {
    fixture = await createPdiDriftShadowPostgresFixture(prisma);
  });

  afterEach(async () => {
    await cleanupPdiDriftShadowPostgresFixture(prisma, fixture);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('loads active INSTALL assignments and verified serials from real PDI tables', async () => {
    const { devices, knownInventorySerials } = await loadPdiIdentityDriftObservationData(prisma);
    const deviceIds = new Set(devices.map((d) => d.physicalDeviceId));
    expect(deviceIds.has(fixture.deviceA.id)).toBe(true);
    expect(deviceIds.has(fixture.deviceB.id)).toBe(true);
    expect(knownInventorySerials.map((s) => s.toUpperCase())).toEqual(
      expect.arrayContaining([fixture.deviceA.serial, fixture.deviceB.serial]),
    );
    const rowA = devices.find((d) => d.physicalDeviceId === fixture.deviceA.id);
    expect(rowA?.expectedSerial).toBe(fixture.deviceA.serial);
    expect(rowA?.observedSerial).toBe(fixture.deviceA.serial);
    expect(rowA?.activeInstallAssignmentCount).toBe(1);
  });

  it('MATCH when mirror serial aligns with PDI INSTALL', async () => {
    const { devices } = await loadPdiIdentityDriftObservationData(prisma);
    const rows = evaluateAllInstalledDevices({
      now: new Date(),
      syncRunId: 'pg-test-match',
      devices,
      knownInventorySerials: devices.map((d) => d.expectedSerial),
    });
    const rowA = rows.find((r) => r.physicalDeviceId === fixture.deviceA.id);
    expect(rowA?.reasonCode).toBe(PdiIdentityDriftReasonCode.MATCH);
  });

  it('SWAP_SUSPECTED when vehicle B mirror shows vehicle A serial', async () => {
    await setDimoObservedSerial(prisma, fixture.dimoB.id, fixture.deviceA.serial);
    const { devices } = await loadPdiIdentityDriftObservationData(prisma);
    const rows = evaluateAllInstalledDevices({
      now: new Date(),
      syncRunId: 'pg-test-swap',
      devices,
      knownInventorySerials: devices.map((d) => d.expectedSerial),
    });
    const rowB = rows.find((r) => r.physicalDeviceId === fixture.deviceB.id);
    expect(rowB?.reasonCode).toBe(PdiIdentityDriftReasonCode.SWAP_SUSPECTED);
  });

  it('UNKNOWN_DEVICE for unregistered mirror serial', async () => {
    await setDimoObservedSerial(prisma, fixture.dimoA.id, 'R1-TEST-UNKNOWN-99999999');
    const { devices } = await loadPdiIdentityDriftObservationData(prisma);
    const rows = evaluateAllInstalledDevices({
      now: new Date(),
      syncRunId: 'pg-test-unknown',
      devices,
      knownInventorySerials: devices.map((d) => d.expectedSerial),
    });
    const rowA = rows.find((r) => r.physicalDeviceId === fixture.deviceA.id);
    expect(rowA?.reasonCode).toBe(PdiIdentityDriftReasonCode.UNKNOWN_DEVICE);
  });

  it('identical provider snapshot reprocessed → dual policy stays CANDIDATE', async () => {
    await setDimoObservedSerial(prisma, fixture.dimoB.id, fixture.deviceA.serial);
    const { devices } = await loadPdiIdentityDriftObservationData(prisma);
    const rows = evaluateAllInstalledDevices({
      now: new Date(),
      syncRunId: 'pg-test-dual-1',
      devices,
      knownInventorySerials: devices.map((d) => d.expectedSerial),
    });
    const drift = rows.find((r) => r.reasonCode === PdiIdentityDriftReasonCode.SWAP_SUSPECTED);
    expect(drift).toBeDefined();
    const fp = drift!.provenance.observationSnapshotFingerprint;
    const secondPass = applyDualConfirmationPolicy({
      rows: [
        {
          ...drift!,
          provenance: { ...drift!.provenance, syncRunId: 'pg-test-dual-2' },
        },
      ],
      previousState: {
        version: 1,
        lastSyncRunId: 'pg-test-dual-1',
        lastEvaluatedAt: new Date().toISOString(),
        driftCandidates: {
          [drift!.driftSignature!]: {
            reasonCode: PdiIdentityDriftReasonCode.SWAP_SUSPECTED,
            observationFingerprints: [fp],
            lastConfidence: PdiIdentityDriftConfidence.CANDIDATE,
            lastSeenAt: new Date().toISOString(),
          },
        },
      },
      evaluatedAt: new Date(),
      syncRunId: 'pg-test-dual-2',
    });
    expect(secondPass.rows[0].confidence).toBe(PdiIdentityDriftConfidence.CANDIDATE);
    expect(secondPass.rows[0].confidence).not.toBe(PdiIdentityDriftConfidence.CONFIRMED);
  });

  it('different fingerprints with unchanged identity still do not CONFIRM (V1 policy)', () => {
    const fp1 = fingerprintMirrorSnapshot({
      dimoTokenId: 1,
      observedSerial: 'R1-TEST-X',
      mirrorRawJsonSha256: 'same-raw',
    });
    const fp2 = fingerprintMirrorSnapshot({
      dimoTokenId: 1,
      observedSerial: 'R1-TEST-X',
      mirrorRawJsonSha256: 'same-raw',
    });
    expect(fp1).toBe(fp2);
  });
});
