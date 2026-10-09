import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION } from './raw-refuel-candidate-cross-version-compatibility.authority';
import { buildPhysicalCandidateIdentityKeyV1 } from './raw-refuel-candidate-physical-identity.authority';
import { RFRF_LEGACY_RISE_DETECTION_VERSION_V1 } from './raw-refuel-candidate-cross-version-compatibility.authority';
import { buildEvidenceRevisionFingerprint } from './raw-refuel-candidate-evidence-fingerprint';
import { buildCandidateIdentityKey } from './raw-refuel-candidate-identity-key';
import { RawRefuelCandidateService } from './raw-refuel-candidate.service';
import { buildTestObservation } from './testing/raw-refuel-candidate-test.util';

export const KS_MS_661_CANONICAL_CANDIDATE_ID = 'b27124fb-64c3-478d-8077-200751af2863';

const LIVE = process.env.RAW_REFUEL_CANDIDATE_POSTGRES_INTEGRATION === '1';
const V2_DETECTOR = 'rfrf-rise-detector-v2-contract';

const KS_RISE_ONSET = new Date('2026-09-30T04:58:04.772Z');
const KS_RISE_END = new Date('2026-09-30T05:01:34.774Z');

function freshV2Meta(): Record<string, unknown> {
  return {
    postFuelAuthority: 'SETTLED_MEDIAN',
    baselineRecencyClassification: 'FRESH',
  };
}

async function probeDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function seedOrgVehicle(prisma: PrismaClient, suffix: string) {
  const org = await prisma.organization.create({
    data: {
      companyName: `RFRF R3B ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `R3B${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `R3B-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'RFRF',
      year: 2024,
      fuelType: 'GASOLINE',
      status: 'AVAILABLE',
    },
    select: { id: true, organizationId: true },
  });
  return { org, vehicle };
}

async function cleanup(prisma: PrismaClient, vehicleId: string, organizationId: string) {
  await prisma.rawRefuelCandidate.deleteMany({ where: { vehicleId } }).catch(() => undefined);
  await prisma.vehicle.deleteMany({ where: { id: vehicleId } }).catch(() => undefined);
  await prisma.organization.deleteMany({ where: { id: organizationId } }).catch(() => undefined);
}

function ksLegacyIdentityKey(vehicleId: string): string {
  return buildCandidateIdentityKey({
    vehicleId,
    detectionVersion: RFRF_LEGACY_RISE_DETECTION_VERSION_V1,
    signalChannel: 'ABSOLUTE_LITERS',
    prePlateauBucket: 6,
    riseOnsetAt: KS_RISE_ONSET,
  });
}

function ksV2Observation(orgId: string, vehicleId: string) {
  return buildTestObservation({
    organizationId: orgId,
    vehicleId,
    detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
    detectorVersion: V2_DETECTOR,
    lifecycleState: 'READY_FOR_PERSIST',
    signalChannel: 'ABSOLUTE_LITERS',
    preFuelAbsoluteLiters: 6,
    postFuelAbsoluteLiters: 19,
    riseOnsetAt: KS_RISE_ONSET,
    riseEndAt: KS_RISE_END,
    physicalEvidenceStart: new Date('2026-09-30T04:50:00.000Z'),
    physicalEvidenceEnd: new Date('2026-09-30T05:05:00.000Z'),
    scanWindowStart: new Date('2026-09-30T03:00:00.000Z'),
    scanWindowEnd: new Date('2026-09-30T06:00:00.000Z'),
    evidenceMeta: freshV2Meta(),
  });
}

async function seedKsV1Candidate(prisma: PrismaClient, orgId: string, vehicleId: string) {
  const obs = buildTestObservation({
    organizationId: orgId,
    vehicleId,
    detectionVersion: RFRF_LEGACY_RISE_DETECTION_VERSION_V1,
    lifecycleState: 'OBSERVED',
    signalChannel: 'ABSOLUTE_LITERS',
    preFuelAbsoluteLiters: 6,
    postFuelAbsoluteLiters: 20,
    riseOnsetAt: KS_RISE_ONSET,
    riseEndAt: KS_RISE_END,
    physicalEvidenceStart: new Date('2026-09-30T04:50:00.000Z'),
    physicalEvidenceEnd: new Date('2026-09-30T05:05:00.000Z'),
    scanWindowStart: new Date('2026-09-30T03:00:00.000Z'),
    scanWindowEnd: new Date('2026-09-30T06:00:00.000Z'),
  });
  const fingerprint = buildEvidenceRevisionFingerprint({ ...obs, organizationId: orgId });
  return prisma.rawRefuelCandidate.create({
    data: {
      id: KS_MS_661_CANONICAL_CANDIDATE_ID,
      organizationId: orgId,
      vehicleId,
      candidateIdentityKey: ksLegacyIdentityKey(vehicleId),
      detectionVersion: RFRF_LEGACY_RISE_DETECTION_VERSION_V1,
      detectorVersion: 'rfrf-rise-detector-v1',
      signalChannel: 'ABSOLUTE_LITERS',
      lifecycleState: 'OBSERVED',
      evidenceRevisionFingerprint: fingerprint,
      physicalEvidenceStart: obs.physicalEvidenceStart,
      physicalEvidenceEnd: obs.physicalEvidenceEnd,
      riseOnsetAt: obs.riseOnsetAt,
      riseEndAt: obs.riseEndAt,
      preFuelAbsoluteLiters: 6,
      postFuelAbsoluteLiters: 20,
      deltaAbsoluteLiters: 14,
      firstObservedAt: new Date('2026-09-30T04:00:00.000Z'),
      lastObservedAt: new Date('2026-09-30T04:00:00.000Z'),
      recoveryNextAttemptAt: new Date('2026-09-30T04:00:00.000Z'),
    },
  });
}

function ksPureV2Observation(orgId: string, vehicleId: string, overrides: Record<string, unknown> = {}) {
  return buildTestObservation({
    organizationId: orgId,
    vehicleId,
    detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
    detectorVersion: V2_DETECTOR,
    lifecycleState: 'READY_FOR_PERSIST',
    signalChannel: 'ABSOLUTE_LITERS',
    preFuelAbsoluteLiters: 6,
    postFuelAbsoluteLiters: 20,
    riseOnsetAt: KS_RISE_ONSET,
    riseEndAt: KS_RISE_END,
    physicalEvidenceStart: new Date('2026-09-30T04:50:00.000Z'),
    physicalEvidenceEnd: new Date('2026-09-30T05:05:00.000Z'),
    scanWindowStart: new Date('2026-09-30T03:00:00.000Z'),
    scanWindowEnd: new Date('2026-09-30T06:00:00.000Z'),
    evidenceMeta: freshV2Meta(),
    ...overrides,
  });
}

(LIVE ? describe : describe.skip)(
  'R3B v2→v2 rediscovery PostgreSQL integration (RAW_REFUEL_CANDIDATE_POSTGRES_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;
    let service: RawRefuelCandidateService;

    beforeAll(async () => {
      const ok = await probeDatabase();
      if (!ok) {
        throw new Error('RAW_REFUEL_CANDIDATE_POSTGRES_INTEGRATION=1 requires reachable DATABASE_URL');
      }
      prisma = new PrismaClient();
      service = RawRefuelCandidateService.withFixedClock(
        prisma as unknown as PrismaService,
        '2026-09-30T06:00:00.000Z',
      );
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('PG-R3B-1 ONE_PHYSICAL_REFUEL_ONE_CANDIDATE revised settled median', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const first = ksPureV2Observation(org.id, vehicle.id, { postFuelAbsoluteLiters: 20 });
        const created = await service.resolveOrCreateCandidate(first);
        expect(created.created).toBe(true);
        const identityKey = created.candidateIdentityKey;
        expect(identityKey).toBe(
          buildPhysicalCandidateIdentityKeyV1({
            vehicleId: vehicle.id,
            signalChannel: 'ABSOLUTE_LITERS',
            prePlateauBucket: 6,
            riseOnsetAt: KS_RISE_ONSET,
          }),
        );

        const revised = ksPureV2Observation(org.id, vehicle.id, { postFuelAbsoluteLiters: 17 });
        const second = await service.resolveOrCreateCandidate(revised);
        expect(second.created).toBe(false);
        expect(second.candidateId).toBe(created.candidateId);
        expect(second.candidateIdentityKey).toBe(identityKey);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);

        const row = await prisma.rawRefuelCandidate.findUnique({ where: { id: created.candidateId } });
        expect(row?.postFuelAbsoluteLiters).toBe(17);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('PG-R3B-2 concurrent v2→v2 rediscovery — DUPLICATE_CANDIDATES=0', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const first = ksPureV2Observation(org.id, vehicle.id);
        await service.resolveOrCreateCandidate(first);
        const revised = ksPureV2Observation(org.id, vehicle.id, { postFuelAbsoluteLiters: 17 });
        const [a, b] = await Promise.all([
          service.resolveOrCreateCandidate(revised),
          service.resolveOrCreateCandidate(revised),
        ]);
        expect(a.candidateId).toBe(b.candidateId);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('PG-R3B-3 distinct rise on same vehicle stays separated', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        await service.resolveOrCreateCandidate(ksPureV2Observation(org.id, vehicle.id));
        const distinct = ksPureV2Observation(org.id, vehicle.id, {
          riseOnsetAt: new Date('2026-09-30T08:00:00.000Z'),
          riseEndAt: new Date('2026-09-30T08:05:00.000Z'),
          physicalEvidenceStart: new Date('2026-09-30T07:50:00.000Z'),
          physicalEvidenceEnd: new Date('2026-09-30T08:10:00.000Z'),
          preFuelAbsoluteLiters: 10,
          postFuelAbsoluteLiters: 25,
        });
        const result = await service.resolveOrCreateCandidate(distinct);
        expect(result.created).toBe(true);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(2);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('PG-R3B-4 separate organizations — tenant isolation', async () => {
      const suffix = randomUUID().slice(0, 8);
      const a = await seedOrgVehicle(prisma, `a${suffix}`);
      const b = await seedOrgVehicle(prisma, `b${suffix}`);
      try {
        const v1 = await service.resolveOrCreateCandidate(ksPureV2Observation(a.org.id, a.vehicle.id));
        const v2 = await service.resolveOrCreateCandidate(ksPureV2Observation(b.org.id, b.vehicle.id));
        expect(v1.candidateId).not.toBe(v2.candidateId);
        expect(await prisma.rawRefuelCandidate.count()).toBeGreaterThanOrEqual(2);
      } finally {
        await cleanup(prisma, a.vehicle.id, a.org.id);
        await cleanup(prisma, b.vehicle.id, b.org.id);
      }
    });

    it('PG-R3B-5 KS MS 661 canonical UUID preserved on v2→v1 path', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        await seedKsV1Candidate(prisma, org.id, vehicle.id);
        const result = await service.resolveOrCreateCandidate(ksV2Observation(org.id, vehicle.id));
        expect(result.candidateId).toBe(KS_MS_661_CANONICAL_CANDIDATE_ID);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('PG-R3B-6 terminal REJECTED row — no duplicate insert', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const candidateId = randomUUID();
      const identityKey = buildPhysicalCandidateIdentityKeyV1({
        vehicleId: vehicle.id,
        signalChannel: 'ABSOLUTE_LITERS',
        prePlateauBucket: 6,
        riseOnsetAt: KS_RISE_ONSET,
      });
      try {
        await prisma.rawRefuelCandidate.create({
          data: {
            id: candidateId,
            organizationId: org.id,
            vehicleId: vehicle.id,
            candidateIdentityKey: identityKey,
            detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
            detectorVersion: V2_DETECTOR,
            signalChannel: 'ABSOLUTE_LITERS',
            lifecycleState: 'REJECTED',
            rejectionReason: 'INSUFFICIENT_POST_PLATEAU',
            evidenceRevisionFingerprint: 'fp-terminal-v2',
            evidenceMeta: freshV2Meta(),
            riseOnsetAt: KS_RISE_ONSET,
            riseEndAt: KS_RISE_END,
            preFuelAbsoluteLiters: 6,
            postFuelAbsoluteLiters: 20,
            physicalEvidenceStart: new Date('2026-09-30T04:50:00.000Z'),
            physicalEvidenceEnd: new Date('2026-09-30T05:05:00.000Z'),
            firstObservedAt: new Date('2026-09-30T04:00:00.000Z'),
            lastObservedAt: new Date('2026-09-30T04:00:00.000Z'),
            recoveryNextAttemptAt: new Date('2026-09-30T04:00:00.000Z'),
          },
        });
        const countBefore = await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } });
        const revised = ksPureV2Observation(org.id, vehicle.id, { postFuelAbsoluteLiters: 17 });
        const result = await service.resolveOrCreateCandidate(revised);
        expect(result.candidateId).toBe(candidateId);
        expect(result.updated).toBe(false);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(
          countBefore,
        );
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });
  },
);
