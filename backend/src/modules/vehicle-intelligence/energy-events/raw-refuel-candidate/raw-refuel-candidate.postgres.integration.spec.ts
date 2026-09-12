import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  RawRefuelCandidateAmbiguityError,
  RawRefuelCandidateLifecycleTransitionError,
  RawRefuelCandidateLifecycleValidationError,
  RawRefuelCandidateOrgVehicleIntegrityError,
} from './raw-refuel-candidate.errors';
import { buildEvidenceRevisionFingerprint } from './raw-refuel-candidate-evidence-fingerprint';
import { candidateRowToEvidenceSlice } from './raw-refuel-candidate-evidence-merge';
import { RawRefuelCandidateService } from './raw-refuel-candidate.service';
import { buildTestObservation } from './testing/raw-refuel-candidate-test.util';

const LIVE = process.env.RAW_REFUEL_CANDIDATE_POSTGRES_INTEGRATION === '1';

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
      companyName: `RFRF F2 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `RF${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `RF-${suffix}`.slice(0, 12),
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

(LIVE ? describe : describe.skip)(
  'RawRefuelCandidate PostgreSQL integration (RAW_REFUEL_CANDIDATE_POSTGRES_INTEGRATION=1)',
  () => {
    let prisma: PrismaClient;
    let service: RawRefuelCandidateService;

    beforeAll(async () => {
      const ok = await probeDatabase();
      if (!ok) {
        throw new Error('RAW_REFUEL_CANDIDATE_POSTGRES_INTEGRATION=1 requires reachable DATABASE_URL');
      }
      prisma = new PrismaClient();
      service = new RawRefuelCandidateService(prisma as unknown as PrismaService);
    }, 60_000);

    afterAll(async () => {
      await prisma?.$disconnect().catch(() => undefined);
    });

    it('bucket-shift rediscovery reuses row and preserves candidateIdentityKey', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const pass1 = buildTestObservation({
          organizationId: org.id,
          vehicleId: vehicle.id,
          riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
        });
        const first = await service.resolveOrCreateCandidate(pass1);
        expect(first.created).toBe(true);
        expect(first.candidateIdentityKey).not.toBeNull();

        const pass2 = buildTestObservation({
          organizationId: org.id,
          vehicleId: vehicle.id,
          riseOnsetAt: new Date('2026-09-06T09:34:30.000Z'),
        });
        const second = await service.resolveOrCreateCandidate(pass2);

        expect(second.created).toBe(false);
        expect(second.candidateId).toBe(first.candidateId);
        expect(second.candidateIdentityKey).toBe(first.candidateIdentityKey);
        expect(second.evidenceRevisionFingerprint).not.toBe(first.evidenceRevisionFingerprint);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('window shift reuses same candidate', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const fast = buildTestObservation({
          organizationId: org.id,
          vehicleId: vehicle.id,
          scanWindowStart: new Date('2026-09-06T09:15:00.000Z'),
          scanWindowEnd: new Date('2026-09-06T10:00:00.000Z'),
        });
        const warm = buildTestObservation({
          organizationId: org.id,
          vehicleId: vehicle.id,
          scanWindowStart: new Date('2026-09-06T09:00:00.000Z'),
          scanWindowEnd: new Date('2026-09-06T10:30:00.000Z'),
        });
        const a = await service.resolveOrCreateCandidate(fast);
        const b = await service.resolveOrCreateCandidate(warm);
        expect(b.candidateId).toBe(a.candidateId);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('post-plateau maturation updates same row', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const pass1 = buildTestObservation({
          organizationId: org.id,
          vehicleId: vehicle.id,
          postFuelAbsoluteLiters: 29,
          deltaAbsoluteLiters: 22,
          lifecycleState: 'OBSERVED',
        });
        const pass2 = buildTestObservation({
          organizationId: org.id,
          vehicleId: vehicle.id,
          postFuelAbsoluteLiters: 31,
          deltaAbsoluteLiters: 24,
          lifecycleState: 'SETTLING',
        });
        const first = await service.resolveOrCreateCandidate(pass1);
        const second = await service.resolveOrCreateCandidate(pass2);
        expect(second.candidateId).toBe(first.candidateId);
        expect(second.candidateIdentityKey).toBe(first.candidateIdentityKey);
        const row = await prisma.rawRefuelCandidate.findUniqueOrThrow({ where: { id: first.candidateId } });
        expect(row.postFuelAbsoluteLiters).toBe(31);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('two close refuels remain distinct rows', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const first = await service.resolveOrCreateCandidate(
          buildTestObservation({
            organizationId: org.id,
            vehicleId: vehicle.id,
            riseOnsetAt: new Date('2026-09-06T09:40:00.000Z'),
            preFuelAbsoluteLiters: 7,
            postFuelAbsoluteLiters: 31,
          }),
        );
        const second = await service.resolveOrCreateCandidate(
          buildTestObservation({
            organizationId: org.id,
            vehicleId: vehicle.id,
            riseOnsetAt: new Date('2026-09-06T10:25:00.000Z'),
            preFuelAbsoluteLiters: 20,
            postFuelAbsoluteLiters: 45,
            physicalEvidenceStart: new Date('2026-09-06T10:20:00.000Z'),
            physicalEvidenceEnd: new Date('2026-09-06T10:30:00.000Z'),
          }),
        );
        expect(first.candidateId).not.toBe(second.candidateId);
        expect(first.candidateIdentityKey).not.toBe(second.candidateIdentityKey);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(2);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('identical observation is idempotent', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const obs = buildTestObservation({ organizationId: org.id, vehicleId: vehicle.id });
        const results = await Promise.all(
          Array.from({ length: 3 }, () => service.resolveOrCreateCandidate({ ...obs })),
        );
        expect(new Set(results.map((r) => r.candidateId)).size).toBe(1);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
        expect(results.every((r) => r.candidateIdentityKey === results[0].candidateIdentityKey)).toBe(true);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('concurrent same observation yields one row', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      const prismaB = new PrismaClient();
      const serviceB = new RawRefuelCandidateService(prismaB as unknown as PrismaService);
      try {
        const obs = buildTestObservation({ organizationId: org.id, vehicleId: vehicle.id });
        const [a, b] = await Promise.all([
          service.resolveOrCreateCandidate({ ...obs }),
          serviceB.resolveOrCreateCandidate({ ...obs }),
        ]);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
        expect(a.candidateIdentityKey).toBe(b.candidateIdentityKey);
      } finally {
        await prismaB.$disconnect().catch(() => undefined);
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('different vehicles process in parallel', async () => {
      const suffix = randomUUID().slice(0, 8);
      const a = await seedOrgVehicle(prisma, `${suffix}-a`);
      const b = await seedOrgVehicle(prisma, `${suffix}-b`);
      try {
        const [ra, rb] = await Promise.all([
          service.resolveOrCreateCandidate(
            buildTestObservation({ organizationId: a.org.id, vehicleId: a.vehicle.id }),
          ),
          service.resolveOrCreateCandidate(
            buildTestObservation({ organizationId: b.org.id, vehicleId: b.vehicle.id }),
          ),
        ]);
        expect(ra.candidateId).not.toBe(rb.candidateId);
      } finally {
        await cleanup(prisma, a.vehicle.id, a.org.id);
        await cleanup(prisma, b.vehicle.id, b.org.id);
      }
    });

    it('firstObservedAt remains immutable on rediscovery (service-owned clock)', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const firstObservedAt = new Date('2026-09-06T10:00:00.000Z');
        const firstService = RawRefuelCandidateService.withFixedClock(
          prisma as unknown as PrismaService,
          firstObservedAt,
        );
        await firstService.resolveOrCreateCandidate(
          buildTestObservation({
            organizationId: org.id,
            vehicleId: vehicle.id,
            physicalEvidenceStart: new Date('2026-09-06T09:35:00.000Z'),
          }),
        );
        const laterService = RawRefuelCandidateService.withFixedClock(
          prisma as unknown as PrismaService,
          '2026-09-06T10:30:00.000Z',
        );
        await laterService.resolveOrCreateCandidate(
          buildTestObservation({
            organizationId: org.id,
            vehicleId: vehicle.id,
            physicalEvidenceStart: new Date('2026-09-06T09:28:30.000Z'),
          }),
        );
        const row = await prisma.rawRefuelCandidate.findFirstOrThrow({ where: { vehicleId: vehicle.id } });
        expect(row.firstObservedAt.toISOString()).toBe(firstObservedAt.toISOString());
        expect(row.physicalEvidenceStart?.toISOString()).toBe('2026-09-06T09:28:30.000Z');
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('lastObservedAt advances on unchanged evidence re-observation', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const obs = buildTestObservation({ organizationId: org.id, vehicleId: vehicle.id });
        const firstService = RawRefuelCandidateService.withFixedClock(
          prisma as unknown as PrismaService,
          '2026-09-06T10:00:00.000Z',
        );
        await firstService.resolveOrCreateCandidate(obs);
        const laterService = RawRefuelCandidateService.withFixedClock(
          prisma as unknown as PrismaService,
          '2026-09-06T10:30:00.000Z',
        );
        const second = await laterService.resolveOrCreateCandidate({ ...obs });
        const row = await prisma.rawRefuelCandidate.findFirstOrThrow({ where: { vehicleId: vehicle.id } });
        expect(row.lastObservedAt.toISOString()).toBe('2026-09-06T10:30:00.000Z');
        expect(second.updated).toBe(true);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('rejects organization/vehicle mismatch with zero candidates', async () => {
      const suffix = randomUUID().slice(0, 8);
      const orgA = await prisma.organization.create({
        data: {
          companyName: `RFRF mismatch A ${suffix}`,
          businessType: 'RENTAL',
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      const orgB = await prisma.organization.create({
        data: {
          companyName: `RFRF mismatch B ${suffix}`,
          businessType: 'RENTAL',
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      const vehicle = await prisma.vehicle.create({
        data: {
          organizationId: orgB.id,
          vin: `RF${suffix}`.slice(0, 17).padEnd(17, '0'),
          licensePlate: `RF-M-${suffix}`.slice(0, 12),
          make: 'Test',
          model: 'RFRF',
          year: 2024,
          fuelType: 'GASOLINE',
          status: 'AVAILABLE',
        },
        select: { id: true },
      });
      try {
        await expect(
          service.resolveOrCreateCandidate(
            buildTestObservation({ organizationId: orgA.id, vehicleId: vehicle.id }),
          ),
        ).rejects.toBeInstanceOf(RawRefuelCandidateOrgVehicleIntegrityError);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(0);
      } finally {
        await cleanup(prisma, vehicle.id, orgB.id);
        await prisma.organization.deleteMany({ where: { id: orgA.id } }).catch(() => undefined);
      }
    });

    it('persists INSUFFICIENT candidate without pre-plateau and assigns identity key once', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const insufficient = await service.resolveOrCreateCandidate(
          buildTestObservation({
            organizationId: org.id,
            vehicleId: vehicle.id,
            lifecycleState: 'INSUFFICIENT',
            rejectionReason: 'INSUFFICIENT_PRE_PLATEAU',
            preFuelAbsoluteLiters: null,
            riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
          }),
        );
        expect(insufficient.created).toBe(true);
        expect(insufficient.candidateIdentityKey).toBeNull();

        const matured = await service.resolveOrCreateCandidate(
          buildTestObservation({
            organizationId: org.id,
            vehicleId: vehicle.id,
            lifecycleState: 'OBSERVED',
            preFuelAbsoluteLiters: 7,
            riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
          }),
        );
        expect(matured.candidateId).toBe(insufficient.candidateId);
        expect(matured.candidateIdentityKey).not.toBeNull();

        const shifted = await service.resolveOrCreateCandidate(
          buildTestObservation({
            organizationId: org.id,
            vehicleId: vehicle.id,
            lifecycleState: 'OBSERVED',
            preFuelAbsoluteLiters: 7.1,
            riseOnsetAt: new Date('2026-09-06T09:34:30.000Z'),
          }),
        );
        expect(shifted.candidateIdentityKey).toBe(matured.candidateIdentityKey);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('rejects READY_FOR_PERSIST without candidateIdentityKey', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        await expect(
          service.resolveOrCreateCandidate(
            buildTestObservation({
              organizationId: org.id,
              vehicleId: vehicle.id,
              lifecycleState: 'READY_FOR_PERSIST',
              preFuelAbsoluteLiters: null,
              riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
            }),
          ),
        ).rejects.toBeInstanceOf(RawRefuelCandidateLifecycleValidationError);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('rediscovers PROMOTED candidate without duplicate insert', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const created = await service.resolveOrCreateCandidate(
          buildTestObservation({ organizationId: org.id, vehicleId: vehicle.id }),
        );
        await prisma.rawRefuelCandidate.update({
          where: { id: created.candidateId },
          data: { lifecycleState: 'PROMOTED' },
        });
        const rediscovered = await service.resolveOrCreateCandidate(
          buildTestObservation({
            organizationId: org.id,
            vehicleId: vehicle.id,
            riseOnsetAt: new Date('2026-09-06T09:34:30.000Z'),
          }),
        );
        expect(rediscovered.created).toBe(false);
        expect(rediscovered.updated).toBe(false);
        expect(rediscovered.lifecycleState).toBe('PROMOTED');
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('rediscovers REJECTED candidate without duplicate insert', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const created = await service.resolveOrCreateCandidate(
          buildTestObservation({
            organizationId: org.id,
            vehicleId: vehicle.id,
            lifecycleState: 'REJECTED',
            rejectionReason: 'RISE_TOO_SMALL',
          }),
        );
        const rediscovered = await service.resolveOrCreateCandidate(
          buildTestObservation({
            organizationId: org.id,
            vehicleId: vehicle.id,
            lifecycleState: 'REJECTED',
            rejectionReason: 'RISE_TOO_SMALL',
            scanWindowStart: new Date('2026-09-06T08:00:00.000Z'),
            scanWindowEnd: new Date('2026-09-06T13:00:00.000Z'),
          }),
        );
        expect(rediscovered.candidateId).toBe(created.candidateId);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(1);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('throws on invalid lifecycle transition during non-terminal update', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        await service.resolveOrCreateCandidate(
          buildTestObservation({
            organizationId: org.id,
            vehicleId: vehicle.id,
            lifecycleState: 'INSUFFICIENT',
            rejectionReason: 'INSUFFICIENT_PRE_PLATEAU',
            preFuelAbsoluteLiters: null,
            riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
          }),
        );
        await expect(
          service.resolveOrCreateCandidate(
            buildTestObservation({
              organizationId: org.id,
              vehicleId: vehicle.id,
              lifecycleState: 'READY_FOR_PERSIST',
              preFuelAbsoluteLiters: 7,
              riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
            }),
          ),
        ).rejects.toBeInstanceOf(RawRefuelCandidateLifecycleTransitionError);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('fails closed on multiple SAME physical rise ambiguity', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const shared = {
          organizationId: org.id,
          vehicleId: vehicle.id,
          detectionVersion: 'rfrf-v1',
          detectorVersion: 'rfrf-detector-v0-stub',
          signalChannel: 'ABSOLUTE_LITERS' as const,
          lifecycleState: 'OBSERVED' as const,
          evidenceRevisionFingerprint: 'seed-a',
          riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
          physicalEvidenceStart: new Date('2026-09-06T09:28:30.000Z'),
          physicalEvidenceEnd: new Date('2026-09-06T09:43:00.000Z'),
          preFuelAbsoluteLiters: 7,
          postFuelAbsoluteLiters: 29,
          firstObservedAt: new Date('2026-09-06T10:00:00.000Z'),
          lastObservedAt: new Date('2026-09-06T10:00:00.000Z'),
        };
        await prisma.rawRefuelCandidate.createMany({
          data: [
            { ...shared, candidateIdentityKey: 'seed-key-a' },
            {
              ...shared,
              candidateIdentityKey: 'seed-key-b',
              evidenceRevisionFingerprint: 'seed-b',
              riseOnsetAt: new Date('2026-09-06T09:39:00.000Z'),
            },
          ],
        });
        await expect(
          service.resolveOrCreateCandidate(
            buildTestObservation({
              organizationId: org.id,
              vehicleId: vehicle.id,
              riseOnsetAt: new Date('2026-09-06T09:39:15.000Z'),
              preFuelAbsoluteLiters: 7,
            }),
          ),
        ).rejects.toMatchObject({ reason: 'MULTIPLE_SAME_PHYSICAL_RISE' });
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('fails closed when one SAME and one INSUFFICIENT neighbor coexist', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        await service.resolveOrCreateCandidate(
          buildTestObservation({
            organizationId: org.id,
            vehicleId: vehicle.id,
            riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
            preFuelAbsoluteLiters: 7,
          }),
        );
        // Rise >45m from observation, compatible pre-plateau, non-overlapping physical
        // envelope → INSUFFICIENT_EVIDENCE (not SAME) while still inside bounded lookup.
        await prisma.rawRefuelCandidate.create({
          data: {
            organizationId: org.id,
            vehicleId: vehicle.id,
            candidateIdentityKey: null,
            detectionVersion: 'rfrf-v1',
            detectorVersion: 'rfrf-detector-v0-stub',
            signalChannel: 'ABSOLUTE_LITERS',
            lifecycleState: 'INSUFFICIENT',
            rejectionReason: 'INSUFFICIENT_PRE_PLATEAU',
            evidenceRevisionFingerprint: 'manual-insufficient-neighbor',
            riseOnsetAt: new Date('2026-09-06T08:00:00.000Z'),
            preFuelAbsoluteLiters: 7,
            postFuelAbsoluteLiters: null,
            physicalEvidenceStart: new Date('2026-09-06T07:50:00.000Z'),
            physicalEvidenceEnd: new Date('2026-09-06T08:15:00.000Z'),
            scanWindowStart: new Date('2026-09-06T07:30:00.000Z'),
            scanWindowEnd: new Date('2026-09-06T09:00:00.000Z'),
            firstObservedAt: new Date('2026-09-06T08:00:00.000Z'),
            lastObservedAt: new Date('2026-09-06T08:00:00.000Z'),
          },
        });
        await expect(
          service.resolveOrCreateCandidate(
            buildTestObservation({
              organizationId: org.id,
              vehicleId: vehicle.id,
              riseOnsetAt: new Date('2026-09-06T09:39:15.000Z'),
              preFuelAbsoluteLiters: 7,
            }),
          ),
        ).rejects.toMatchObject({ reason: 'SAME_WITH_INSUFFICIENT_NEIGHBOR' });
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('reuses one SAME candidate while distant terminal rows stay outside bounded lookup', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        const active = await service.resolveOrCreateCandidate(
          buildTestObservation({
            organizationId: org.id,
            vehicleId: vehicle.id,
            riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
          }),
        );
        await prisma.rawRefuelCandidate.create({
          data: {
            organizationId: org.id,
            vehicleId: vehicle.id,
            candidateIdentityKey: 'distant-terminal-key',
            detectionVersion: 'rfrf-v1',
            detectorVersion: 'rfrf-detector-v0-stub',
            signalChannel: 'ABSOLUTE_LITERS',
            lifecycleState: 'PROMOTED',
            evidenceRevisionFingerprint: 'distant-terminal',
            riseOnsetAt: new Date('2026-01-01T09:39:30.000Z'),
            physicalEvidenceStart: new Date('2026-01-01T09:28:30.000Z'),
            physicalEvidenceEnd: new Date('2026-01-01T09:43:00.000Z'),
            preFuelAbsoluteLiters: 7,
            postFuelAbsoluteLiters: 29,
            firstObservedAt: new Date('2026-01-01T10:00:00.000Z'),
            lastObservedAt: new Date('2026-01-01T10:00:00.000Z'),
          },
        });
        const rediscovered = await service.resolveOrCreateCandidate(
          buildTestObservation({
            organizationId: org.id,
            vehicleId: vehicle.id,
            riseOnsetAt: new Date('2026-09-06T09:34:30.000Z'),
          }),
        );
        expect(rediscovered.candidateId).toBe(active.candidateId);
        expect(await prisma.rawRefuelCandidate.count({ where: { vehicleId: vehicle.id } })).toBe(2);
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });

    it('stores fingerprint matching persisted merged evidence', async () => {
      const suffix = randomUUID().slice(0, 8);
      const { org, vehicle } = await seedOrgVehicle(prisma, suffix);
      try {
        await service.resolveOrCreateCandidate(
          buildTestObservation({
            organizationId: org.id,
            vehicleId: vehicle.id,
            physicalEvidenceStart: new Date('2026-09-06T09:28:30.000Z'),
            riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
          }),
        );
        await service.resolveOrCreateCandidate(
          buildTestObservation({
            organizationId: org.id,
            vehicleId: vehicle.id,
            physicalEvidenceStart: new Date('2026-09-06T09:30:00.000Z'),
            riseOnsetAt: new Date('2026-09-06T09:34:30.000Z'),
          }),
        );
        const row = await prisma.rawRefuelCandidate.findFirstOrThrow({ where: { vehicleId: vehicle.id } });
        expect(row.physicalEvidenceStart?.toISOString()).toBe('2026-09-06T09:28:30.000Z');
        expect(row.riseOnsetAt?.toISOString()).toBe('2026-09-06T09:34:30.000Z');
        expect(row.evidenceRevisionFingerprint).toBe(
          buildEvidenceRevisionFingerprint(candidateRowToEvidenceSlice(row)),
        );
      } finally {
        await cleanup(prisma, vehicle.id, org.id);
      }
    });
  },
);
