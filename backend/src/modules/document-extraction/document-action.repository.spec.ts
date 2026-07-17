import { NotFoundException } from '@nestjs/common';
import { DocumentActionRepository } from './document-action.repository';
import { buildDocumentActionIdempotencyKey } from './document-action.idempotency';

function makeRepository(prisma: Record<string, unknown>) {
  return new DocumentActionRepository(prisma as any);
}

describe('DocumentActionRepository', () => {
  const plan = {
    id: 'plan-1',
    extractionId: 'ext-1',
    organizationId: 'org-1',
  };

  it('scopes findById to organization tenant', async () => {
    const prisma = {
      documentAction: {
        findFirst: jest.fn().mockResolvedValue({ id: 'action-1', organizationId: 'org-1' }),
      },
    };
    const repository = makeRepository(prisma);

    await repository.findById('org-1', 'action-1');

    expect(prisma.documentAction.findFirst).toHaveBeenCalledWith({
      where: { id: 'action-1', organizationId: 'org-1' },
    });
  });

  it('does not return actions from another organization via idempotency lookup', async () => {
    const key = buildDocumentActionIdempotencyKey({
      organizationId: 'org-1',
      extractionId: 'ext-1',
      actionPlanId: 'plan-1',
      actionType: 'CREATE_INVOICE',
      sequence: 1,
    });

    const prisma = {
      documentAction: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const repository = makeRepository(prisma);

    const result = await repository.findByIdempotencyKey('org-2', key);

    expect(result).toBeNull();
    expect(prisma.documentAction.findUnique).toHaveBeenCalledWith({
      where: {
        organizationId_idempotencyKey: {
          organizationId: 'org-2',
          idempotencyKey: key,
        },
      },
    });
  });

  it('deduplicates planned actions by organization idempotency key', async () => {
    const key = buildDocumentActionIdempotencyKey({
      organizationId: 'org-1',
      extractionId: 'ext-1',
      actionPlanId: 'plan-1',
      actionType: 'CREATE_INVOICE',
      sequence: 1,
    });

    const existing = {
      id: 'action-existing',
      idempotencyKey: key,
      actionType: 'CREATE_INVOICE',
      requirement: 'REQUIRED',
      status: 'WOULD_APPLY',
      sequence: 1,
    };

    const prisma = {
      documentActionPlan: {
        findFirst: jest.fn().mockResolvedValue(plan),
      },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
        fn({
          documentAction: {
            aggregate: jest.fn().mockResolvedValue({ _max: { sequence: 0 } }),
            findUnique: jest.fn().mockResolvedValue(existing),
            create: jest.fn(),
          },
        }),
      ),
    };

    const repository = makeRepository(prisma);
    const result = await repository.createPlannedActions({
      organizationId: 'org-1',
      extractionId: 'ext-1',
      actionPlanId: 'plan-1',
      actions: [
        {
          actionType: 'CREATE_INVOICE',
          requirement: 'REQUIRED',
          inputPayload: { invoiceNumber: 'INV-1' },
        },
      ],
    });

    expect(result.created).toHaveLength(1);
    expect(result.created[0].id).toBe('action-existing');
    expect(result.deduplicatedKeys).toEqual([key]);
  });

  it('rejects plan lookup outside tenant scope', async () => {
    const prisma = {
      documentActionPlan: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const repository = makeRepository(prisma);

    await expect(
      repository.createPlannedActions({
        organizationId: 'org-1',
        extractionId: 'ext-1',
        actionPlanId: 'plan-missing',
        actions: [],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists required and optional actions separately', async () => {
    const prisma = {
      documentAction: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'req-1', requirement: 'REQUIRED' }])
          .mockResolvedValueOnce([{ id: 'opt-1', requirement: 'OPTIONAL' }]),
      },
    };
    const repository = makeRepository(prisma);

    const required = await repository.listRequiredByPlan('org-1', 'plan-1');
    const optional = await repository.listOptionalByPlan('org-1', 'plan-1');

    expect(required).toHaveLength(1);
    expect(optional).toHaveLength(1);
    expect(prisma.documentAction.findMany).toHaveBeenNthCalledWith(1, {
      where: {
        organizationId: 'org-1',
        actionPlanId: 'plan-1',
        requirement: { in: ['REQUIRED', 'BLOCKER'] },
      },
      orderBy: { sequence: 'asc' },
    });
    expect(prisma.documentAction.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        organizationId: 'org-1',
        actionPlanId: 'plan-1',
        requirement: { in: ['OPTIONAL', 'INFORMATIONAL'] },
      },
      orderBy: { sequence: 'asc' },
    });
  });
});
