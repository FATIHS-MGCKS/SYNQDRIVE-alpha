import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RentalRulePermissionService } from './rental-rule-permission.service';
import { RentalRulesRevisionService } from './rental-rules-revision.service';
import { organizationRevisionScope } from './rental-rules-revision-scope.util';
import { buildNormalizedRentalRulesDocument, computeRentalRulesHash } from './rental-rules-revision.util';
import type { NormalizedRentalRulesDocument } from './rental-rules-revision.types';
import { RENTAL_RULES_INITIAL_EXPECTED_VERSION } from './rental-rules-concurrency.constants';

function orgDocument(minimumAgeYears: number, isActive = true): NormalizedRentalRulesDocument {
  return buildNormalizedRentalRulesDocument({
    scopeType: 'ORGANIZATION',
    row: {
      minimumAgeYears,
      minimumLicenseHoldingMonths: null,
      depositAmountCents: null,
      depositCurrency: 'EUR',
      creditCardRequired: null,
      foreignTravelPolicy: null,
      additionalDriverPolicy: null,
      youngDriverPolicy: null,
      insuranceRequirement: null,
      manualApprovalRequired: null,
      notes: null,
      isActive,
    },
  });
}

type RevisionTestStore = {
  organizationRentalRules: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  rentalRuleRevision: {
    findFirst: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
    update: jest.Mock;
    findUniqueOrThrow: jest.Mock;
  };
  $transaction: jest.Mock;
  __revisions: Array<Record<string, unknown>>;
  __orgRules: () => Record<string, unknown> | null;
};

function makeStore(): RevisionTestStore {
  const revisions: Array<Record<string, unknown>> = [];
  let orgRules: Record<string, unknown> | null = {
    organizationId: 'org1',
    version: 1,
    isActive: true,
    minimumAgeYears: 21,
    minimumLicenseHoldingMonths: null,
    depositAmountCents: null,
    depositCurrency: 'EUR',
    creditCardRequired: null,
    foreignTravelPolicy: null,
    additionalDriverPolicy: null,
    youngDriverPolicy: null,
    insuranceRequirement: null,
    manualApprovalRequired: null,
    notes: null,
  };

  const activeRevision = {
    id: 'rev-active',
    organizationId: 'org1',
    scopeType: 'ORGANIZATION',
    scopeId: 'org1',
    version: 1,
    status: 'ACTIVE',
    normalizedRules: orgDocument(21),
    rulesHash: computeRentalRulesHash(orgDocument(21)),
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    lockVersion: 1,
    createdAt: new Date('2026-01-01'),
    publishedAt: new Date('2026-01-01'),
    changeReason: 'seed',
    supersedesRevisionId: null,
  };
  revisions.push(activeRevision);

  const prisma: RevisionTestStore = {
    organizationRentalRules: {
      findUnique: jest.fn(async () => orgRules),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        orgRules = { ...data };
        return orgRules;
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        orgRules = { ...orgRules, ...data };
        return orgRules;
      }),
    },
    rentalRuleRevision: {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return (
          revisions.find((row) =>
            Object.entries(where).every(([key, value]) => {
              if (key === 'effectiveTo' && value === null) return row.effectiveTo == null;
              if (typeof value === 'object' && value && 'not' in (value as object)) {
                return row.id !== (value as { not: string }).not;
              }
              return row[key] === value;
            }),
          ) ?? null
        );
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `rev-${revisions.length + 1}`,
          createdAt: new Date(),
          publishedAt: null,
          changeReason: null,
          effectiveTo: null,
          ...data,
        };
        revisions.push(row);
        return row;
      }),
      updateMany: jest.fn(
        async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          const row = revisions.find((candidate) =>
            Object.entries(where).every(([key, value]) => candidate[key] === value),
          );
          if (!row) return { count: 0 };
          const nextData = { ...data };
          if (
            nextData.lockVersion &&
            typeof nextData.lockVersion === 'object' &&
            'increment' in nextData.lockVersion
          ) {
            row.lockVersion =
              Number(row.lockVersion) + Number((nextData.lockVersion as { increment: number }).increment);
            delete nextData.lockVersion;
          }
          Object.assign(row, nextData);
          return { count: 1 };
        },
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = revisions.find((candidate) => candidate.id === where.id);
        if (!row) throw new Error('missing');
        Object.assign(row, data);
        return row;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = revisions.find((candidate) => candidate.id === where.id);
        if (!row) throw new Error('missing');
        return row;
      }),
    },
    $transaction: jest.fn(async (callback: (tx: RevisionTestStore) => Promise<unknown>) =>
      callback(prisma),
    ),
    __revisions: revisions,
    __orgRules: () => orgRules,
  };

  return prisma;
}

describe('RentalRulesRevisionService draft/publish workflow', () => {
  const scope = organizationRevisionScope('org1');
  const actor = { id: 'user-1', organizationId: 'org1' } as const;

  function buildService(prisma: ReturnType<typeof makeStore>) {
    const permissions = {
      assert: jest.fn().mockResolvedValue(undefined),
      assertPublishIfActiveChange: jest.fn().mockResolvedValue(undefined),
    };
    const service = new RentalRulesRevisionService(prisma as never, permissions as unknown as RentalRulePermissionService);
    return { service, permissions, prisma };
  }

  it('creates a DRAFT revision on first edit without changing live rules', async () => {
    const prisma = makeStore();
    const { service } = buildService(prisma);

    const result = await service.upsertDraft({
      scope,
      expectedVersion: 1,
      rulePatch: { minimumAgeYears: 25 },
      sourceRow: prisma.__orgRules()!,
      actor,
    });

    expect(result.created).toBe(true);
    expect(result.revision.status).toBe('DRAFT');
    expect(prisma.__orgRules()?.minimumAgeYears).toBe(21);
    expect(prisma.__revisions.filter((row: Record<string, unknown>) => row.status === 'DRAFT')).toHaveLength(1);
  });

  it('updates an existing DRAFT on subsequent edits', async () => {
    const prisma = makeStore();
    const { service } = buildService(prisma);

    const first = await service.upsertDraft({
      scope,
      expectedVersion: 1,
      rulePatch: { minimumAgeYears: 25 },
      sourceRow: prisma.__orgRules()!,
      actor,
    });
    const second = await service.upsertDraft({
      scope,
      expectedVersion: 1,
      rulePatch: { minimumAgeYears: 30 },
      sourceRow: prisma.__orgRules()!,
      actor,
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.revision.lockVersion).toBe(first.revision.lockVersion + 1);
    expect(prisma.__revisions.filter((row: Record<string, unknown>) => row.status === 'DRAFT')).toHaveLength(1);
  });

  it('publishes draft atomically: retires ACTIVE, promotes DRAFT, syncs live table', async () => {
    const prisma = makeStore();
    const { service } = buildService(prisma);

    const draft = await service.upsertDraft({
      scope,
      expectedVersion: 1,
      rulePatch: { minimumAgeYears: 25 },
      sourceRow: prisma.__orgRules()!,
      actor,
    });

    const published = await service.publishDraft(
      scope,
      {
        revisionId: draft.revision.id,
        expectedVersion: 1,
        expectedLockVersion: draft.revision.lockVersion,
        changeReason: 'Increase minimum age',
      },
      actor,
    );

    expect(published.publishedVersion).toBe(2);
    expect(published.revision.status).toBe('ACTIVE');
    expect(prisma.__orgRules()?.minimumAgeYears).toBe(25);
    expect(prisma.__orgRules()?.version).toBe(2);
    expect(prisma.__revisions.filter((row: Record<string, unknown>) => row.status === 'ACTIVE')).toHaveLength(1);
    expect(prisma.__revisions.filter((row: Record<string, unknown>) => row.status === 'RETIRED')).toHaveLength(1);
    expect(published.revision.changeReason).toBe('Increase minimum age');
  });

  it('rejects publish without rental_rules.publish permission', async () => {
    const prisma = makeStore();
    const { service, permissions } = buildService(prisma);
    permissions.assert.mockRejectedValueOnce(
      new ForbiddenException('Missing permission: rental-rules-publish.write'),
    );

    const draft = await service.upsertDraft({
      scope,
      expectedVersion: 1,
      rulePatch: { minimumAgeYears: 25 },
      sourceRow: prisma.__orgRules()!,
      actor,
    });

    await expect(
      service.publishDraft(
        scope,
        {
          revisionId: draft.revision.id,
          expectedVersion: 1,
          expectedLockVersion: draft.revision.lockVersion,
          changeReason: 'Increase minimum age',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects publish for invalid draft values', async () => {
    const prisma = makeStore();
    const { service } = buildService(prisma);

    const draft = await service.upsertDraft({
      scope,
      expectedVersion: 1,
      rulePatch: { minimumAgeYears: 10 },
      sourceRow: prisma.__orgRules()!,
      actor,
    });

    await expect(
      service.publishDraft(
        scope,
        {
          revisionId: draft.revision.id,
          expectedVersion: 1,
          expectedLockVersion: draft.revision.lockVersion,
          changeReason: 'Increase minimum age',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects parallel publish when lockVersion is stale', async () => {
    const prisma = makeStore();
    const { service } = buildService(prisma);

    const draft = await service.upsertDraft({
      scope,
      expectedVersion: 1,
      rulePatch: { minimumAgeYears: 25 },
      sourceRow: prisma.__orgRules()!,
      actor,
    });

    await expect(
      service.publishDraft(
        scope,
        {
          revisionId: draft.revision.id,
          expectedVersion: 1,
          expectedLockVersion: draft.revision.lockVersion + 99,
          changeReason: 'Increase minimum age',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rolls back publish when retiring active revision fails', async () => {
    const prisma = makeStore();
    const { service } = buildService(prisma);
    const draft = await service.upsertDraft({
      scope,
      expectedVersion: 1,
      rulePatch: { minimumAgeYears: 25 },
      sourceRow: prisma.__orgRules()!,
      actor,
    });

    const originalUpdateMany = prisma.rentalRuleRevision.updateMany;
    let call = 0;
    prisma.rentalRuleRevision.updateMany = jest.fn(async (args) => {
      call += 1;
      if (call === 1) {
        return { count: 0 };
      }
      return originalUpdateMany(args);
    });

    await expect(
      service.publishDraft(
        scope,
        {
          revisionId: draft.revision.id,
          expectedVersion: 1,
          expectedLockVersion: draft.revision.lockVersion,
          changeReason: 'Increase minimum age',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.__orgRules()?.minimumAgeYears).toBe(21);
    expect(prisma.__revisions.find((row: Record<string, unknown>) => row.id === draft.revision.id)?.status).toBe('DRAFT');
  });

  it('preview supports active, draft, and diff modes', async () => {
    const prisma = makeStore();
    const { service } = buildService(prisma);

    await service.upsertDraft({
      scope,
      expectedVersion: 1,
      rulePatch: { minimumAgeYears: 25 },
      sourceRow: prisma.__orgRules()!,
      actor,
    });

    const activePreview = await service.preview(scope, 'active', prisma.__orgRules()!);
    const draftPreview = await service.preview(scope, 'draft', prisma.__orgRules()!);
    const diffPreview = await service.preview(scope, 'diff', prisma.__orgRules()!);

    expect(activePreview.preview.active?.rules.minimumAgeYears).toBe(21);
    expect(draftPreview.preview.draft?.rules.minimumAgeYears).toBe(25);
    expect(diffPreview.preview.hasChanges).toBe(true);
    expect(diffPreview.preview.ruleDiffs.find((row) => row.field === 'minimumAgeYears')?.changed).toBe(
      true,
    );
  });

  it('rejects draft upsert when published version changed', async () => {
    const prisma = makeStore();
    const { service } = buildService(prisma);

    await expect(
      service.upsertDraft({
        scope,
        expectedVersion: RENTAL_RULES_INITIAL_EXPECTED_VERSION,
        rulePatch: { minimumAgeYears: 25 },
        sourceRow: prisma.__orgRules()!,
        actor,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects publish without change reason', async () => {
    const prisma = makeStore();
    const { service } = buildService(prisma);
    const draft = await service.upsertDraft({
      scope,
      expectedVersion: 1,
      rulePatch: { minimumAgeYears: 25 },
      sourceRow: prisma.__orgRules()!,
      actor,
    });

    await expect(
      service.publishDraft(
        scope,
        {
          revisionId: draft.revision.id,
          expectedVersion: 1,
          expectedLockVersion: draft.revision.lockVersion,
          changeReason: '   ',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects publish when draft revision is missing', async () => {
    const prisma = makeStore();
    const { service } = buildService(prisma);

    await expect(
      service.publishDraft(
        scope,
        {
          revisionId: 'missing',
          expectedVersion: 1,
          expectedLockVersion: 1,
          changeReason: 'Test publish',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
