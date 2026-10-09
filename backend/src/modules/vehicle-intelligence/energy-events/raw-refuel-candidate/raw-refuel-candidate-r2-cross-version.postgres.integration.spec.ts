import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  RFRF_LEGACY_RISE_DETECTION_VERSION_V1,
  RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
} from './raw-refuel-candidate-cross-version-compatibility.authority';
import {
  RawRefuelCandidateCrossVersionInsufficientEvidenceError,
  RawRefuelCandidateUnsupportedDetectionVersionError,
  RawRefuelCandidateVersionedTerminalConflictError,
} from './raw-refuel-candidate.errors';
import { buildEvidenceRevisionFingerprint } from './raw-refuel-candidate-evidence-fingerprint';
import { candidateRowToEvidenceSlice } from './raw-refuel-candidate-evidence-merge';
import { buildCandidateIdentityKey } from './raw-refuel-candidate-identity-key';
import { buildPhysicalCandidateIdentityKeyV1 } from './raw-refuel-candidate-physical-identity.authority';
import { RawRefuelCandidateService } from './raw-refuel-candidate.service';
import { buildTestObservation } from './testing/raw-refuel-candidate-test.util';

const LIVE = process.env.RAW_REFUEL_CANDIDATE_POSTGRES_INTEGRATION === '1';

export const KS_MS_661_CANONICAL_CANDIDATE_ID = 'b27124fb-64c3-478d-8077-200751af2863';
const V2_DETECTOR = 'rfrf-rise-detector-v2-contract';

const KS_RISE_ONSET = new Date('2026-09-30T04:58:04.772Z');
const KS_RISE_END = new Date('2026-09-30T05:01:34.774Z');

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
      companyName: `RFRF R2 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `R2${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `R2-${suffix}`.slice(0, 12),
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

function ksV1Observation(orgId: string, vehicleId: string) {
  return buildTestObservation({
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
}

function ksV2Observation(orgId: string, vehicleId: string, overrides: Record<string, unknown> = {}) {
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
    evidenceMeta: { postFuelAuthority: 'SETTLED_MEDIAN' },
    ...overrides,
  });
}

async function seedKsV1Candidate(
  prisma: PrismaClient,
  orgId: string,
  vehicleId: string,
  lifecycleState: 'OBSERVED' | 'REJECTED' | 'PROMOTED' | 'CONVERGED_NATIVE' = 'OBSERVED',
) {
  const obs = ksV1Observation(orgId, vehicleId);
  const identityKey = ksLegacyIdentityKey(vehicleId);
  const fingerprint = buildEvidenceRevisionFingerprint({
    ...obs,
    organizationId: orgId,
  });
  return prisma.rawRefuelCandidate.create({
    data: {
      id: KS_MS_661_CANONICAL_CANDIDATE_ID,
      organizationId: orgId,
      vehicleId,
      candidateIdentityKey: identityKey,
      detectionVersion: RFRF_LEGACY_RISE_DETECTION_VERSION_V1,
      detectorVersion: 'rfrf-rise-detector-v1',
      signalChannel: 'ABSOLUTE_LITERS',
      lifecycleState,
      rejectionReason:
        lifecycleState === 'REJECTED' ? 'INSUFFICIENT_POST_PLATEAU' : null,
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

(LIVE ? describe : describe.skip)(
  'R2 cross-version PostgreSQL integration (RAW_REFUEL_CANDIDATE_POSTGRES_INTEGRATION=1)',
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

    it('PG1 KS MS 661 canonical v2→v1 reconciliation', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const seeded = await seedKsV1Candidate(prisma, org.id, vehicle.id);
        const originalKey = seeded.candidateIdentityKey;
        expect(originalKey).not.toBeNull();

        const v2 = ksV2Observation(org.id, vehicle.id);
        const result = await service.resolveOrCreateCandidate(v2);

        expect(result.candidateId).toBe(KS_MS_661_CANONICAL_CANDIDATE_ID);
        expect(result.created).toBe(false);
        expect(result.updated).toBe(true);
        expect(result.candidateIdentityKey).toBe(originalKey);

        const row = await prisma.rawRefuelCandidate.findUnique({
          where: { id: KS_MS_661_CANONICAL_CANDIDATE_ID },
        });
        expect(row?.lifecycleState).toBe('READY_FOR_PERSIST');
        expect(row?.detectionVersion).toBe(RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION);
        expect(row?.detectorVersion).toBe(V2_DETECTOR);
        expect(row?.postFuelAbsoluteLiters).toBe(19);
        expect(row?.candidateIdentityKey).toBe(originalKey);
        expect(row?.evidenceRevisionFingerprint).toBe(result.evidenceRevisionFingerprint);
        expect(row?.evidenceRevisionFingerprint).toBe(
          buildEvidenceRevisionFingerprint(candidateRowToEvidenceSlice(row!)),
        );
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('PG2 authorized cross-version + null pre fails closed', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        await seedKsV1Candidate(prisma, org.id, vehicle.id);
        const before = await prisma.rawRefuelCandidate.findFirst({ where: { vehicleId: vehicle.id } });
        await expect(
          service.resolveOrCreateCandidate(
            ksV2Observation(org.id, vehicle.id, { preFuelAbsoluteLiters: null }),
          ),
        ).rejects.toBeInstanceOf(RawRefuelCandidateCrossVersionInsufficientEvidenceError);
        const after = await prisma.rawRefuelCandidate.findFirst({ where: { vehicleId: vehicle.id } });
        expect(after?.evidenceRevisionFingerprint).toBe(before?.evidenceRevisionFingerprint);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('PG3 missing v2 postFuelAuthority fails closed', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        await seedKsV1Candidate(prisma, org.id, vehicle.id);
        const countBefore = await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } });
        await expect(
          service.resolveOrCreateCandidate(
            ksV2Observation(org.id, vehicle.id, { evidenceMeta: {} }),
          ),
        ).rejects.toBeInstanceOf(RawRefuelCandidateCrossVersionInsufficientEvidenceError);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(
          countBefore,
        );
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    for (const lifecycle of ['REJECTED', 'PROMOTED', 'CONVERGED_NATIVE'] as const) {
      it(`PG terminal ${lifecycle} => VERSIONED_TERMINAL_CONFLICT`, async () => {
        const suffix = randomUUID().slice(0, 8);
        const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
        try {
          await prisma.rawRefuelCandidate.create({
            data: {
              id: randomUUID(),
              organizationId: org.id,
              vehicleId: vehicle.id,
              candidateIdentityKey: ksLegacyIdentityKey(vehicle.id),
              detectionVersion: RFRF_LEGACY_RISE_DETECTION_VERSION_V1,
              detectorVersion: 'rfrf-rise-detector-v1',
              signalChannel: 'ABSOLUTE_LITERS',
              lifecycleState: lifecycle,
              rejectionReason: lifecycle === 'REJECTED' ? 'INSUFFICIENT_POST_PLATEAU' : null,
              evidenceRevisionFingerprint: 'fp-terminal',
              riseOnsetAt: KS_RISE_ONSET,
              riseEndAt: KS_RISE_END,
              preFuelAbsoluteLiters: 6,
              postFuelAbsoluteLiters: 20,
              firstObservedAt: new Date('2026-09-30T04:00:00.000Z'),
              lastObservedAt: new Date('2026-09-30T04:00:00.000Z'),
              recoveryNextAttemptAt: new Date('2026-09-30T04:00:00.000Z'),
            },
          });
          const countBefore = await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } });
          await expect(
            service.resolveOrCreateCandidate(ksV2Observation(org.id, vehicle.id)),
          ).rejects.toBeInstanceOf(RawRefuelCandidateVersionedTerminalConflictError);
          expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(
            countBefore,
          );
        } finally {
          await cleanup(prisma, vehicle.id, org.id);
        }
      });
    }

    it('PG13 unknown v99 observation fails closed without insert', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        await seedKsV1Candidate(prisma, org.id, vehicle.id);
        const v99 = ksV2Observation(org.id, vehicle.id, {
          detectionVersion: 'rfrf-rise-v99',
          lifecycleState: 'OBSERVED',
        });
        await expect(service.resolveOrCreateCandidate(v99)).rejects.toBeInstanceOf(
          RawRefuelCandidateUnsupportedDetectionVersionError,
        );
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('U2 reconcileExistingCandidateById v99 rejects without row mutation', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const candidateId = randomUUID();
      try {
        const identityKey = ksLegacyIdentityKey(vehicle.id);
        await prisma.rawRefuelCandidate.create({
          data: {
            id: candidateId,
            organizationId: org.id,
            vehicleId: vehicle.id,
            candidateIdentityKey: identityKey,
            detectionVersion: RFRF_LEGACY_RISE_DETECTION_VERSION_V1,
            detectorVersion: 'rfrf-rise-detector-v1',
            signalChannel: 'ABSOLUTE_LITERS',
            lifecycleState: 'OBSERVED',
            evidenceRevisionFingerprint: 'fp-u2-stable',
            riseOnsetAt: KS_RISE_ONSET,
            riseEndAt: KS_RISE_END,
            preFuelAbsoluteLiters: 6,
            postFuelAbsoluteLiters: 20,
            firstObservedAt: new Date('2026-09-30T04:00:00.000Z'),
            lastObservedAt: new Date('2026-09-30T04:00:00.000Z'),
            recoveryNextAttemptAt: new Date('2026-09-30T04:00:00.000Z'),
          },
        });
        const before = await prisma.rawRefuelCandidate.findUnique({ where: { id: candidateId } });
        const v99 = ksV2Observation(org.id, vehicle.id, {
          detectionVersion: 'rfrf-rise-v99',
          lifecycleState: 'OBSERVED',
        });
        await expect(service.reconcileExistingCandidateById(candidateId, v99)).rejects.toMatchObject({
          name: 'RawRefuelCandidateUnsupportedDetectionVersionError',
          code: 'RAW_REFUEL_CANDIDATE_UNSUPPORTED_DETECTION_VERSION',
        });
        const after = await prisma.rawRefuelCandidate.findUnique({ where: { id: candidateId } });
        expect(after?.detectionVersion).toBe(before?.detectionVersion);
        expect(after?.detectorVersion).toBe(before?.detectorVersion);
        expect(after?.evidenceRevisionFingerprint).toBe(before?.evidenceRevisionFingerprint);
        expect(after?.lifecycleState).toBe(before?.lifecycleState);
        expect(after?.lastObservedAt.toISOString()).toBe(before?.lastObservedAt.toISOString());
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('U3 reconcileExistingCandidateByIdForRecoveryClaim v99 rejects without row mutation', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const candidateId = randomUUID();
      const mutationTime = new Date('2026-09-30T06:00:00.000Z');
      const leaseEnd = new Date('2026-09-30T06:30:00.000Z');
      try {
        await prisma.rawRefuelCandidate.create({
          data: {
            id: candidateId,
            organizationId: org.id,
            vehicleId: vehicle.id,
            candidateIdentityKey: ksLegacyIdentityKey(vehicle.id),
            detectionVersion: RFRF_LEGACY_RISE_DETECTION_VERSION_V1,
            detectorVersion: 'rfrf-rise-detector-v1',
            signalChannel: 'ABSOLUTE_LITERS',
            lifecycleState: 'OBSERVED',
            evidenceRevisionFingerprint: 'fp-u3-stable',
            riseOnsetAt: KS_RISE_ONSET,
            riseEndAt: KS_RISE_END,
            preFuelAbsoluteLiters: 6,
            postFuelAbsoluteLiters: 20,
            recoveryAttemptCount: 1,
            recoveryLeaseExpiresAt: leaseEnd,
            firstObservedAt: new Date('2026-09-30T04:00:00.000Z'),
            lastObservedAt: new Date('2026-09-30T04:00:00.000Z'),
            recoveryNextAttemptAt: new Date('2026-09-30T04:00:00.000Z'),
          },
        });
        const before = await prisma.rawRefuelCandidate.findUnique({ where: { id: candidateId } });
        const v99 = ksV2Observation(org.id, vehicle.id, {
          detectionVersion: 'rfrf-rise-v99',
          lifecycleState: 'OBSERVED',
        });
        await expect(
          service.reconcileExistingCandidateByIdForRecoveryClaim(candidateId, v99, {
            claim: {
              expectedClaimGeneration: 1,
              requireActiveLease: true,
              leaseExpiresAt: leaseEnd,
            },
            mutationClock: () => mutationTime,
          }),
        ).rejects.toMatchObject({
          name: 'RawRefuelCandidateUnsupportedDetectionVersionError',
          code: 'RAW_REFUEL_CANDIDATE_UNSUPPORTED_DETECTION_VERSION',
        });
        const after = await prisma.rawRefuelCandidate.findUnique({ where: { id: candidateId } });
        expect(after?.detectionVersion).toBe(before?.detectionVersion);
        expect(after?.evidenceRevisionFingerprint).toBe(before?.evidenceRevisionFingerprint);
        expect(after?.lifecycleState).toBe(before?.lifecycleState);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('PG14 stored v1 null post + valid v2 SETTLED fails closed without mutation', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const candidateId = randomUUID();
      try {
        await prisma.rawRefuelCandidate.create({
          data: {
            id: candidateId,
            organizationId: org.id,
            vehicleId: vehicle.id,
            candidateIdentityKey: ksLegacyIdentityKey(vehicle.id),
            detectionVersion: RFRF_LEGACY_RISE_DETECTION_VERSION_V1,
            detectorVersion: 'rfrf-rise-detector-v1',
            signalChannel: 'ABSOLUTE_LITERS',
            lifecycleState: 'OBSERVED',
            evidenceRevisionFingerprint: 'fp-pg14',
            riseOnsetAt: KS_RISE_ONSET,
            riseEndAt: KS_RISE_END,
            preFuelAbsoluteLiters: 6,
            postFuelAbsoluteLiters: null,
            physicalEvidenceStart: new Date('2026-09-30T04:50:00.000Z'),
            physicalEvidenceEnd: new Date('2026-09-30T05:05:00.000Z'),
            firstObservedAt: new Date('2026-09-30T04:00:00.000Z'),
            lastObservedAt: new Date('2026-09-30T04:00:00.000Z'),
            recoveryNextAttemptAt: new Date('2026-09-30T04:00:00.000Z'),
          },
        });
        const countBefore = await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } });
        const before = await prisma.rawRefuelCandidate.findUnique({ where: { id: candidateId } });
        await expect(
          service.resolveOrCreateCandidate(ksV2Observation(org.id, vehicle.id)),
        ).rejects.toBeInstanceOf(RawRefuelCandidateCrossVersionInsufficientEvidenceError);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(
          countBefore,
        );
        const after = await prisma.rawRefuelCandidate.findUnique({ where: { id: candidateId } });
        expect(after?.evidenceRevisionFingerprint).toBe(before?.evidenceRevisionFingerprint);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('PG15 incoming v2 null post + valid v1 peak fails closed without mutation', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        await seedKsV1Candidate(prisma, org.id, vehicle.id);
        const before = await prisma.rawRefuelCandidate.findUnique({
          where: { id: KS_MS_661_CANONICAL_CANDIDATE_ID },
        });
        const countBefore = await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } });
        await expect(
          service.resolveOrCreateCandidate(
            ksV2Observation(org.id, vehicle.id, { postFuelAbsoluteLiters: null }),
          ),
        ).rejects.toBeInstanceOf(RawRefuelCandidateCrossVersionInsufficientEvidenceError);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(
          countBefore,
        );
        const after = await prisma.rawRefuelCandidate.findUnique({
          where: { id: KS_MS_661_CANONICAL_CANDIDATE_ID },
        });
        expect(after?.evidenceRevisionFingerprint).toBe(before?.evidenceRevisionFingerprint);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('PG8 reverse v1 observation against v2 stored is unauthorized', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const v2Key = buildPhysicalCandidateIdentityKeyV1({
          vehicleId: vehicle.id,
          signalChannel: 'ABSOLUTE_LITERS',
          prePlateauBucket: 6,
          riseOnsetAt: KS_RISE_ONSET,
        });
        await prisma.rawRefuelCandidate.create({
          data: {
            organizationId: org.id,
            vehicleId: vehicle.id,
            candidateIdentityKey: v2Key,
            detectionVersion: RFRF_PLANNED_SETTLED_POST_DETECTION_VERSION,
            detectorVersion: V2_DETECTOR,
            signalChannel: 'ABSOLUTE_LITERS',
            lifecycleState: 'OBSERVED',
            evidenceRevisionFingerprint: 'fp-v2',
            riseOnsetAt: KS_RISE_ONSET,
            preFuelAbsoluteLiters: 6,
            postFuelAbsoluteLiters: 19,
            evidenceMeta: { postFuelAuthority: 'SETTLED_MEDIAN' },
            firstObservedAt: new Date('2026-09-30T04:00:00.000Z'),
            lastObservedAt: new Date('2026-09-30T04:00:00.000Z'),
            recoveryNextAttemptAt: new Date('2026-09-30T04:00:00.000Z'),
          },
        });
        const v1Obs = ksV1Observation(org.id, vehicle.id);
        const result = await service.resolveOrCreateCandidate(v1Obs);
        expect(result.created).toBe(true);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(2);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('PG9 distinct physical v2 refuel creates new physical identity key', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        await seedKsV1Candidate(prisma, org.id, vehicle.id);
        const distinct = ksV2Observation(org.id, vehicle.id, {
          riseOnsetAt: new Date('2026-09-30T08:00:00.000Z'),
          physicalEvidenceStart: new Date('2026-09-30T07:50:00.000Z'),
          physicalEvidenceEnd: new Date('2026-09-30T08:10:00.000Z'),
          preFuelAbsoluteLiters: 10,
          postFuelAbsoluteLiters: 25,
        });
        const result = await service.resolveOrCreateCandidate(distinct);
        expect(result.created).toBe(true);
        expect(result.candidateIdentityKey).toBe(
          buildPhysicalCandidateIdentityKeyV1({
            vehicleId: vehicle.id,
            signalChannel: 'ABSOLUTE_LITERS',
            prePlateauBucket: 10,
            riseOnsetAt: distinct.riseOnsetAt!,
          }),
        );
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(2);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('PG11 distant v1 null-pre does not block distinct v2 insert', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        await prisma.rawRefuelCandidate.create({
          data: {
            organizationId: org.id,
            vehicleId: vehicle.id,
            candidateIdentityKey: ksLegacyIdentityKey(vehicle.id),
            detectionVersion: RFRF_LEGACY_RISE_DETECTION_VERSION_V1,
            detectorVersion: 'rfrf-rise-detector-v1',
            signalChannel: 'ABSOLUTE_LITERS',
            lifecycleState: 'OBSERVED',
            evidenceRevisionFingerprint: 'fp-distant-v1',
            riseOnsetAt: new Date('2026-09-30T01:00:00.000Z'),
            riseEndAt: new Date('2026-09-30T01:05:00.000Z'),
            preFuelAbsoluteLiters: null,
            postFuelAbsoluteLiters: 20,
            physicalEvidenceStart: new Date('2026-09-30T00:50:00.000Z'),
            physicalEvidenceEnd: new Date('2026-09-30T01:10:00.000Z'),
            scanWindowStart: new Date('2026-09-30T00:00:00.000Z'),
            scanWindowEnd: new Date('2026-09-30T12:00:00.000Z'),
            firstObservedAt: new Date('2026-09-30T01:00:00.000Z'),
            lastObservedAt: new Date('2026-09-30T01:00:00.000Z'),
            recoveryNextAttemptAt: new Date('2026-09-30T01:00:00.000Z'),
          },
        });
        const distinct = ksV2Observation(org.id, vehicle.id, {
          riseOnsetAt: new Date('2026-09-30T08:00:00.000Z'),
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

    it('PG12 malformed stored legacy authority fails closed without mutation', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const identityKey = ksLegacyIdentityKey(vehicle.id);
        await prisma.rawRefuelCandidate.create({
          data: {
            id: KS_MS_661_CANONICAL_CANDIDATE_ID,
            organizationId: org.id,
            vehicleId: vehicle.id,
            candidateIdentityKey: identityKey,
            detectionVersion: RFRF_LEGACY_RISE_DETECTION_VERSION_V1,
            detectorVersion: 'rfrf-rise-detector-v1',
            signalChannel: 'ABSOLUTE_LITERS',
            lifecycleState: 'OBSERVED',
            evidenceRevisionFingerprint: 'fp-malformed-authority',
            evidenceMeta: { postFuelAuthority: 'BOGUS' },
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
        const before = await prisma.rawRefuelCandidate.findUnique({
          where: { id: KS_MS_661_CANONICAL_CANDIDATE_ID },
        });
        await expect(
          service.resolveOrCreateCandidate(ksV2Observation(org.id, vehicle.id)),
        ).rejects.toBeInstanceOf(RawRefuelCandidateCrossVersionInsufficientEvidenceError);
        const after = await prisma.rawRefuelCandidate.findUnique({
          where: { id: KS_MS_661_CANONICAL_CANDIDATE_ID },
        });
        expect(after?.evidenceRevisionFingerprint).toBe(before?.evidenceRevisionFingerprint);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('PG10 repeated v2 rediscovery against v1 seed stays single row', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        await seedKsV1Candidate(prisma, org.id, vehicle.id);
        const v2 = ksV2Observation(org.id, vehicle.id);
        const a = await service.resolveOrCreateCandidate(v2);
        const b = await service.resolveOrCreateCandidate(v2);
        expect(a.candidateId).toBe(KS_MS_661_CANONICAL_CANDIDATE_ID);
        expect(b.candidateId).toBe(KS_MS_661_CANONICAL_CANDIDATE_ID);
        expect(a.candidateIdentityKey).toBe(b.candidateIdentityKey);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });
  },
);
