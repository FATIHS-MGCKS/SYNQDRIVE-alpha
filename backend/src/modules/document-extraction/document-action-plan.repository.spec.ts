import { NotFoundException } from '@nestjs/common';
import { DocumentActionPlanRepository } from './document-action-plan.repository';

function makeRepository(prisma: Record<string, unknown>) {
  return new DocumentActionPlanRepository(prisma as any);
}

const extraction = { id: 'ext-1', organizationId: 'org-1' };

describe('DocumentActionPlanRepository versioning', () => {
  it('returns existing current plan when fingerprint matches (idempotent)', async () => {
    const existingPlan = {
      id: 'plan-1',
      organizationId: 'org-1',
      extractionId: 'ext-1',
      planVersion: 1,
      inputFingerprint: 'dedup-fp',
      status: 'DRAFT',
      applyMode: 'PREVIEW',
      supersedesPlanId: null,
      invalidatedAt: null,
    };

    const prisma = {
      vehicleDocumentExtraction: {
        findFirst: jest.fn().mockResolvedValue(extraction),
      },
      documentActionPlan: {
        findFirst: jest.fn().mockResolvedValue(existingPlan),
      },
      $transaction: jest.fn(),
    };

    const repository = makeRepository(prisma);
    const result = await repository.resolveOrCreatePlan({
      organizationId: 'org-1',
      extractionId: 'ext-1',
      identity: {
        effectiveDocumentType: 'INVOICE',
        confirmedData: { invoiceNumber: 'INV-1' },
        applyMode: 'PREVIEW',
      },
      snapshot: { actions: [] },
    });

    expect(result.plan.id).toBe('plan-1');
    expect(result.deduplicated).toBe(true);
    expect(result.created).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('invalidates prior current plan and creates superseding version on fingerprint change', async () => {
    const current = {
      id: 'plan-old',
      organizationId: 'org-1',
      extractionId: 'ext-1',
      planVersion: 2,
      inputFingerprint: 'old-fp',
      invalidatedAt: null,
    };
    const created = {
      id: 'plan-new',
      organizationId: 'org-1',
      extractionId: 'ext-1',
      planVersion: 3,
      inputFingerprint: 'new-fp',
      status: 'DRAFT',
      applyMode: 'PREVIEW',
      supersedesPlanId: 'plan-old',
      invalidatedAt: null,
    };

    const update = jest.fn().mockResolvedValue({
      ...current,
      invalidatedAt: new Date(),
      status: 'SUPERSEDED',
    });
    const create = jest.fn().mockResolvedValue(created);

    const prisma = {
      vehicleDocumentExtraction: {
        findFirst: jest.fn().mockResolvedValue(extraction),
      },
      documentActionPlan: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
        fn({
          documentActionPlan: {
            findFirst: jest.fn().mockResolvedValue(current),
            findMany: jest.fn().mockResolvedValue([{ planVersion: 2 }]),
            update,
            create,
          },
        }),
      ),
    };

    const repository = makeRepository(prisma);
    const result = await repository.resolveOrCreatePlan({
      organizationId: 'org-1',
      extractionId: 'ext-1',
      identity: {
        effectiveDocumentType: 'INVOICE',
        confirmedData: { invoiceNumber: 'INV-2' },
        applyMode: 'PREVIEW',
      },
      snapshot: { actions: [{ kind: 'CREATE_INVOICE' }] },
      summary: 'Would create invoice',
    });

    expect(result.created).toBe(true);
    expect(result.supersededPlanId).toBe('plan-old');
    expect(result.plan.id).toBe('plan-new');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'plan-old' },
        data: expect.objectContaining({
          status: 'SUPERSEDED',
          invalidationReason: 'INPUT_FINGERPRINT_CHANGED',
        }),
      }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          planVersion: 3,
          supersedesPlanId: 'plan-old',
        }),
      }),
    );
  });

  it('throws when extraction is outside organization scope', async () => {
    const prisma = {
      vehicleDocumentExtraction: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const repository = makeRepository(prisma);

    await expect(
      repository.resolveOrCreatePlan({
        organizationId: 'org-1',
        extractionId: 'ext-missing',
        identity: {
          effectiveDocumentType: 'INVOICE',
          confirmedData: {},
          applyMode: 'PREVIEW',
        },
        snapshot: {},
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
