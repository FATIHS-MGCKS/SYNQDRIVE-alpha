import { Test, TestingModule } from '@nestjs/testing';
import { RentalRulesRevisionService } from './rental-rules-revision.service';
import { RentalRulePermissionService } from './rental-rule-permission.service';
import { PrismaService } from '@shared/database/prisma.service';

describe('RentalRulesRevisionService history', () => {
  let service: RentalRulesRevisionService;
  const prisma = {
    rentalRuleRevision: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RentalRulesRevisionService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: RentalRulePermissionService,
          useValue: { assert: jest.fn(), assertPublishIfActiveChange: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(RentalRulesRevisionService);
    jest.clearAllMocks();
  });

  it('lists revisions with actor names', async () => {
    prisma.rentalRuleRevision.findMany.mockResolvedValue([
      {
        id: 'rev-1',
        organizationId: 'org-1',
        scopeType: 'ORGANIZATION',
        scopeId: 'org-1',
        version: 2,
        status: 'ACTIVE',
        normalizedRules: { rules: {}, scopeMeta: {} },
        rulesHash: 'abc123',
        effectiveFrom: new Date('2026-07-23T10:00:00.000Z'),
        effectiveTo: null,
        lockVersion: 1,
        changeReason: 'Initial publish',
        createdAt: new Date('2026-07-23T09:00:00.000Z'),
        publishedAt: new Date('2026-07-23T10:00:00.000Z'),
        supersedesRevisionId: null,
        createdBy: 'user-1',
        publishedBy: 'user-2',
        createdByUser: { firstName: 'Anna', lastName: 'Admin', email: 'anna@example.com' },
        publishedByUser: { firstName: 'Bob', lastName: 'Ops', email: 'bob@example.com' },
      },
    ]);

    const result = await service.listRevisions('org-1', { limit: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].createdByName).toBe('Anna Admin');
    expect(result.items[0].publishedByName).toBe('Bob Ops');
    expect(result.items[0].rulesHash).toBe('abc123');
  });
});
