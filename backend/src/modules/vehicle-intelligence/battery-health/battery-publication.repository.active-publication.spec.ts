import {
  BatteryEvidenceScope,
  SohPublicationState,
  type BatteryPublication,
} from '@prisma/client';
import { BatteryPublicationRepository } from './battery-publication.repository';

describe('BatteryPublicationRepository active LV publication read path', () => {
  const organizationId = 'org-1';
  const vehicleId = 'veh-1';
  const now = new Date('2026-07-16T12:00:00.000Z');

  function publicationRow(input: {
    id: string;
    assessmentId: string;
    reason: Record<string, unknown>;
  }): BatteryPublication {
    return {
      id: input.id,
      organizationId,
      vehicleId,
      scope: BatteryEvidenceScope.LV,
      assessmentId: input.assessmentId,
      status: SohPublicationState.STABLE,
      publishedAt: now,
      staleAt: null,
      reason: JSON.stringify(input.reason),
      version: 1,
      idempotencyKey: `pub:${input.assessmentId}:v1`,
      createdAt: now,
    };
  }

  it('returns B as active when A remains STABLE but B carries supersedePublicationId', async () => {
    const pubA = publicationRow({
      id: 'pub-a',
      assessmentId: 'assessment-a',
      reason: {
        maturity: 'STABLE',
        publishedEstimatedHealth: 82,
        stabilizedEstimatedHealth: 82,
        assessmentTrack: 'TELEMETRY',
      },
    });
    const pubB = publicationRow({
      id: 'pub-b',
      assessmentId: 'assessment-b',
      reason: {
        maturity: 'STABLE',
        supersedePublicationId: 'pub-a',
        publishedEstimatedHealth: 76,
        stabilizedEstimatedHealth: 76,
        assessmentTrack: 'WORKSHOP_OVERRIDE',
      },
    });

    const prisma = {
      batteryPublication: {
        findMany: jest.fn(async () => [pubB, pubA]),
      },
    };

    const repository = new BatteryPublicationRepository(prisma as never);
    const active = await repository.findLatestActiveLvPublication({
      organizationId,
      vehicleId,
    });

    expect(active?.id).toBe('pub-b');
    expect(active?.assessmentId).toBe('assessment-b');
    expect(active?.id).not.toBe('pub-a');
  });
});
