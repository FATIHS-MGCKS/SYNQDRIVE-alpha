import { randomUUID } from 'crypto';
import {
  BatteryEvidenceScope,
  BatteryGroundTruthSourceAuthority,
  BatteryGroundTruthType,
  PrismaClient,
} from '@prisma/client';
import { filterAdmissibleGroundTruthAtAsOf } from './f5-ground-truth-correlation.policy';
import { createGtOrgVehicle } from '../../../../ground-truth/ground-truth-postgres.fixture';

const integrationEnabled = process.env.BATTERY_F5_NATURAL_CALIBRATION_REPORT_INTEGRATION === '1';

(integrationEnabled ? describe : describe.skip)('F5 ground-truth historical asOf postgres G3.1', () => {
  let prisma: PrismaClient;
  const createdOrganizationIds: string[] = [];

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterEach(async () => {
    for (const organizationId of createdOrganizationIds) {
      await prisma.batteryGroundTruthRevocation.deleteMany({ where: { organizationId } });
      await prisma.batteryGroundTruthEvent.deleteMany({ where: { organizationId } });
      await prisma.$executeRaw`DELETE FROM vehicles WHERE organization_id = ${organizationId}::uuid`;
      await prisma.organization.deleteMany({ where: { id: organizationId } });
    }
    createdOrganizationIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createIsolatedOrgVehicle() {
    const ref = await createGtOrgVehicle(prisma);
    createdOrganizationIds.push(ref.organizationId);
    return ref;
  }

  it('G3.1-A1/A2 — revocation after asOf visible at asOf; revocation before later asOf excludes row', async () => {
    const { organizationId, vehicleId } = await createIsolatedOrgVehicle();
    const gtId = randomUUID();
    const fingerprint = randomUUID().replace(/-/g, '');
    await prisma.batteryGroundTruthEvent.create({
      data: {
        id: gtId,
        organizationId,
        vehicleId,
        groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
        batteryScope: BatteryEvidenceScope.LV,
        effectiveAt: new Date('2026-06-01T00:00:00.000Z'),
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        sourceAuthority: BatteryGroundTruthSourceAuthority.MANUAL_CONFIRMED,
        verificationStatus: 'CONFIRMED',
        sourceContentFingerprint: fingerprint,
      },
    });

    const vehicleKeys = new Set([`${organizationId}::${vehicleId}`]);
    const loadRows = async () =>
      prisma.batteryGroundTruthEvent.findMany({
        where: { organizationId, vehicleId },
        select: {
          id: true,
          organizationId: true,
          vehicleId: true,
          groundTruthType: true,
          batteryScope: true,
          sourceAuthority: true,
          effectiveAt: true,
          createdAt: true,
          verificationStatus: true,
          supersedesGroundTruthEventId: true,
          revocations: { select: { revokedAt: true } },
        },
      });

    const june15 = new Date('2026-06-15T00:00:00.000Z');
    expect(
      filterAdmissibleGroundTruthAtAsOf(await loadRows(), june15, vehicleKeys).admissible,
    ).toHaveLength(1);

    await prisma.batteryGroundTruthRevocation.create({
      data: {
        organizationId,
        groundTruthEventId: gtId,
        reasonCode: 'OPERATOR_REVOKE',
        revokedAt: new Date('2026-06-20T00:00:00.000Z'),
      },
    });
    await prisma.batteryGroundTruthEvent.update({
      where: { id: gtId },
      data: { verificationStatus: 'REVOKED' },
    });

    expect(
      filterAdmissibleGroundTruthAtAsOf(await loadRows(), june15, vehicleKeys).admissible,
    ).toHaveLength(1);

    const june25 = new Date('2026-06-25T00:00:00.000Z');
    expect(
      filterAdmissibleGroundTruthAtAsOf(await loadRows(), june25, vehicleKeys).admissible,
    ).toHaveLength(0);
  });

  it('G3.1-A3/A4 — supersession after asOf leaves prior admissible; before later asOf excludes prior', async () => {
    const { organizationId, vehicleId } = await createIsolatedOrgVehicle();
    const priorId = randomUUID();
    const fp1 = randomUUID().replace(/-/g, '');
    await prisma.batteryGroundTruthEvent.create({
      data: {
        id: priorId,
        organizationId,
        vehicleId,
        groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
        batteryScope: BatteryEvidenceScope.LV,
        effectiveAt: new Date('2026-06-01T00:00:00.000Z'),
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        sourceAuthority: BatteryGroundTruthSourceAuthority.MANUAL_CONFIRMED,
        verificationStatus: 'CONFIRMED',
        sourceContentFingerprint: fp1,
      },
    });

    const vehicleKeys = new Set([`${organizationId}::${vehicleId}`]);
    const loadRows = async () =>
      prisma.batteryGroundTruthEvent.findMany({
        where: { organizationId, vehicleId },
        select: {
          id: true,
          organizationId: true,
          vehicleId: true,
          groundTruthType: true,
          batteryScope: true,
          sourceAuthority: true,
          effectiveAt: true,
          createdAt: true,
          verificationStatus: true,
          supersedesGroundTruthEventId: true,
          revocations: { select: { revokedAt: true } },
        },
      });

    const june15 = new Date('2026-06-15T00:00:00.000Z');
    expect(
      filterAdmissibleGroundTruthAtAsOf(await loadRows(), june15, vehicleKeys).admissible.map((r) => r.id),
    ).toEqual([priorId]);

    const successorId = randomUUID();
    await prisma.batteryGroundTruthEvent.create({
      data: {
        id: successorId,
        organizationId,
        vehicleId,
        groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
        batteryScope: BatteryEvidenceScope.LV,
        effectiveAt: new Date('2026-06-20T00:00:00.000Z'),
        createdAt: new Date('2026-06-20T00:00:00.000Z'),
        sourceAuthority: BatteryGroundTruthSourceAuthority.MANUAL_CONFIRMED,
        verificationStatus: 'CONFIRMED',
        sourceContentFingerprint: randomUUID().replace(/-/g, ''),
        supersedesGroundTruthEventId: priorId,
      },
    });
    await prisma.batteryGroundTruthEvent.update({
      where: { id: priorId },
      data: { verificationStatus: 'SUPERSEDED' },
    });

    expect(
      filterAdmissibleGroundTruthAtAsOf(await loadRows(), june15, vehicleKeys).admissible.map((r) => r.id),
    ).toEqual([priorId]);

    const june25 = new Date('2026-06-25T00:00:00.000Z');
    const admissible = filterAdmissibleGroundTruthAtAsOf(await loadRows(), june25, vehicleKeys).admissible;
    expect(admissible.map((r) => r.id)).toEqual([successorId]);
  });

  it('G3.1-A5 — same rows + asOf yields deterministic admissible ordering', async () => {
    const { organizationId, vehicleId } = await createIsolatedOrgVehicle();
    await prisma.batteryGroundTruthEvent.create({
      data: {
        id: randomUUID(),
        organizationId,
        vehicleId,
        groundTruthType: BatteryGroundTruthType.BATTERY_REPLACEMENT,
        batteryScope: BatteryEvidenceScope.LV,
        effectiveAt: new Date('2026-06-01T00:00:00.000Z'),
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        sourceAuthority: BatteryGroundTruthSourceAuthority.MANUAL_CONFIRMED,
        verificationStatus: 'CONFIRMED',
        sourceContentFingerprint: randomUUID().replace(/-/g, ''),
      },
    });
    const vehicleKeys = new Set([`${organizationId}::${vehicleId}`]);
    const asOf = new Date('2026-06-15T00:00:00.000Z');
    const loadRows = async () =>
      prisma.batteryGroundTruthEvent.findMany({
        where: { organizationId, vehicleId },
        select: {
          id: true,
          organizationId: true,
          vehicleId: true,
          groundTruthType: true,
          batteryScope: true,
          sourceAuthority: true,
          effectiveAt: true,
          createdAt: true,
          verificationStatus: true,
          supersedesGroundTruthEventId: true,
          revocations: { select: { revokedAt: true } },
        },
      });
    const once = filterAdmissibleGroundTruthAtAsOf(await loadRows(), asOf, vehicleKeys);
    const twice = filterAdmissibleGroundTruthAtAsOf(await loadRows(), asOf, vehicleKeys);
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
  });
});
