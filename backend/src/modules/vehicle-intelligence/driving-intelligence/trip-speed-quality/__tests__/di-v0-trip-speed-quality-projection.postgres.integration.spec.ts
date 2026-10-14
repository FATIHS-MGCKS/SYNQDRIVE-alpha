import { randomUUID } from 'crypto';
import type { PrismaClient } from '@prisma/client';
import {
  assertS4aPostgresCiEnv,
  cleanupS4aTenant,
  newS4aClient,
  S4A_POSTGRES_LIVE,
  seedS4aTenant,
} from '../../s4a-foundation/__tests__/di-v0-s4a-postgres-harness';
import { buildDiV0TripSpeedQualityProjectionV1 } from '../build-di-v0-trip-speed-quality-projection.v1';
import { DiV0TripSpeedQualityProjectionRepository } from '../di-v0-trip-speed-quality-projection.repository';
import { syntheticHighway130Input } from '../../speed-qc/__tests__/fixtures/synthetic-scenarios';

assertS4aPostgresCiEnv();

(S4A_POSTGRES_LIVE ? describe : describe.skip)('DI V0 trip speed quality projection persistence (PostgreSQL)', () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = newS4aClient();
    await db.$queryRaw`SELECT 1`;
  }, 60_000);

  afterAll(async () => {
    await db.$disconnect();
  });

  it('duplicate projection persist is idempotent', async () => {
    const tenant = await seedS4aTenant(db);
    const repo = new DiV0TripSpeedQualityProjectionRepository(db);
    const input = syntheticHighway130Input();
    const projection = buildDiV0TripSpeedQualityProjectionV1({
      organizationId: tenant.organizationId,
      vehicleId: tenant.vehicleId,
      tripId: tenant.tripId,
      workItemId: randomUUID(),
      shadowRunId: randomUUID(),
      pinnedSnapshotHash: 'SYN:PG',
      boundaryFingerprint: 'bf-1',
      sourceFamily: 'API_SYNTHETIC',
      combinedInputIdentity: 'ci',
      shadowInputEvidenceVersion: 'iev',
      workItemCompletedAt: new Date(),
      snapshotVerified: true,
      evidence: {
        positions: input.positions,
        positionStateByLabel: new Map(),
        r1Obd: [],
      },
      shadowIntervals: [
        {
          intervalStart: new Date(input.shadow.intervalStart),
          intervalEnd: new Date(input.shadow.intervalEnd),
          referenceTime: new Date(input.shadow.referenceTime),
          motionState: input.shadow.motionState,
          positionState: input.shadow.positionState,
          estimatedSpeedKmh: input.shadow.estimatedSpeedKmh,
          speedEvidenceState: input.shadow.speedEvidenceState,
          valueConfidence: input.shadow.valueConfidence,
          sourceRelation: input.shadow.sourceRelation,
          abstentionReason: input.shadow.abstentionReason,
          evidenceSources: input.shadow.evidenceSources,
          sourceQualityFlags: input.shadow.sourceQualityFlags,
        },
      ],
    });
    const first = await repo.persistCurrentProjection(projection);
    const second = await repo.persistCurrentProjection(projection);
    expect(second.id).toBe(first.id);
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
    await cleanupS4aTenant(db, tenant);
  }, 120_000);
});
