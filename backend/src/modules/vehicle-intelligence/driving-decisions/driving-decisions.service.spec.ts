import { BadRequestException } from '@nestjs/common';
import { DrivingDecisionsService } from './driving-decisions.service';

describe('DrivingDecisionsService', () => {
  const prisma = {
    drivingDecisionAudit: {
      create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const service = new DrivingDecisionsService(prisma as any);

  it('rejects short decision reasons', async () => {
    await expect(
      service.create({
        organizationId: 'org-1',
        subjectType: 'CUSTOMER',
        subjectId: 'cust-1',
        decision: 'APPROVE',
        recommendationAtDecision: 'KEINE_MASSNAHME',
        dimensionsSnapshot: {},
        reason: 'too short',
        decidedByUserId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates audit record with valid reason', async () => {
    const result = await service.create({
      organizationId: 'org-1',
      subjectType: 'BOOKING',
      subjectId: 'book-1',
      decision: 'CONDITIONAL',
      recommendationAtDecision: 'BEOBACHTEN',
      dimensionsSnapshot: { dataBasis: 'BELASTBAR' },
      reason: 'Kunde hat nachvollziehbare Erklärung geliefert.',
      decidedByUserId: 'user-1',
    });
    expect(result.id).toBe('audit-1');
    expect(prisma.drivingDecisionAudit.create).toHaveBeenCalled();
  });
});
