import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentEntityCandidateRepository } from './document-entity-candidate.repository';
import { DocumentEntityLinkRepository } from './document-entity-link.repository';

function makeCandidateRepository(prisma: Record<string, unknown>) {
  return new DocumentEntityCandidateRepository(prisma as any);
}

function makeLinkRepository(
  prisma: Record<string, unknown>,
  candidateRepository?: DocumentEntityCandidateRepository,
) {
  return new DocumentEntityLinkRepository(
    prisma as any,
    candidateRepository ?? makeCandidateRepository({}),
  );
}

const proposedCandidate = {
  id: 'cand-1',
  organizationId: 'org-1',
  extractionId: 'ext-1',
  entityType: 'VEHICLE' as const,
  entityId: 'veh-1',
  status: 'PROPOSED' as const,
  rank: 1,
};

describe('DocumentEntityLinkRepository', () => {
  it('confirms candidate, supersedes prior active link, and marks candidate CONFIRMED', async () => {
    const existingLink = {
      id: 'link-old',
      organizationId: 'org-1',
      extractionId: 'ext-1',
      entityType: 'VEHICLE',
      status: 'ACTIVE',
      supersededAt: null,
    };
    const newLink = {
      id: 'link-new',
      organizationId: 'org-1',
      extractionId: 'ext-1',
      entityType: 'VEHICLE',
      entityId: 'veh-1',
      status: 'ACTIVE',
      sourceCandidateId: 'cand-1',
    };

    const candidateRepository = {
      findById: jest.fn().mockResolvedValue(proposedCandidate),
    } as unknown as DocumentEntityCandidateRepository;

    const prisma = {
      vehicleDocumentExtraction: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ext-1', organizationId: 'org-1' }),
      },
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({ id: 'veh-1' }),
      },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
        fn({
          documentEntityLink: {
            findFirst: jest.fn().mockResolvedValue(existingLink),
            update: jest.fn().mockResolvedValue({
              ...existingLink,
              status: 'SUPERSEDED',
              supersededAt: new Date(),
            }),
            create: jest.fn().mockResolvedValue(newLink),
          },
          documentEntityCandidate: {
            update: jest.fn().mockResolvedValue({ ...proposedCandidate, status: 'CONFIRMED' }),
          },
        }),
      ),
    };

    const repository = makeLinkRepository(prisma, candidateRepository);
    const result = await repository.confirmCandidate({
      organizationId: 'org-1',
      extractionId: 'ext-1',
      candidateId: 'cand-1',
      confirmedByUserId: 'user-1',
    });

    expect(result.link.id).toBe('link-new');
    expect(result.supersededLinkId).toBe('link-old');
  });

  it('rejects confirmation for non-proposed candidates', async () => {
    const candidateRepository = {
      findById: jest.fn().mockResolvedValue({ ...proposedCandidate, status: 'CONFIRMED' }),
    } as unknown as DocumentEntityCandidateRepository;

    const repository = makeLinkRepository({}, candidateRepository);

    await expect(
      repository.confirmCandidate({
        organizationId: 'org-1',
        extractionId: 'ext-1',
        candidateId: 'cand-1',
        confirmedByUserId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('scopes link lookup to organization tenant', async () => {
    const prisma = {
      documentEntityLink: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const repository = makeLinkRepository(prisma);

    await expect(repository.findById('org-2', 'link-1')).resolves.toBeNull();
    expect(prisma.documentEntityLink.findFirst).toHaveBeenCalledWith({
      where: { id: 'link-1', organizationId: 'org-2' },
    });
  });

  it('supersedes active links for audit trail', async () => {
    const activeLink = {
      id: 'link-1',
      organizationId: 'org-1',
      status: 'ACTIVE',
      supersededAt: null,
    };
    const prisma = {
      documentEntityLink: {
        findFirst: jest.fn().mockResolvedValue(activeLink),
        update: jest.fn().mockResolvedValue({
          ...activeLink,
          status: 'SUPERSEDED',
          supersededAt: new Date(),
        }),
      },
    };
    const repository = makeLinkRepository(prisma);

    const result = await repository.supersedeLink({
      organizationId: 'org-1',
      linkId: 'link-1',
    });

    expect(result.status).toBe('SUPERSEDED');
  });
});

describe('DocumentEntityCandidateRepository', () => {
  it('supersedes prior proposed candidates when replacing resolver output', async () => {
    const prisma = {
      vehicleDocumentExtraction: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ext-1', organizationId: 'org-1' }),
      },
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) =>
        fn({
          documentEntityCandidate: {
            updateMany: jest.fn().mockResolvedValue({ count: 2 }),
            create: jest.fn().mockImplementation(async ({ data }: any) => ({
              id: `cand-${data.entityType}`,
              ...data,
            })),
          },
        }),
      ),
    };

    const repository = makeCandidateRepository(prisma);
    const created = await repository.replaceProposedCandidates({
      organizationId: 'org-1',
      extractionId: 'ext-1',
      candidates: [
        { entityType: 'CUSTOMER', entityId: 'cust-1', confidence: 0.7 },
        { entityType: 'DRIVER', entityId: 'drv-1', confidence: 0.6 },
      ],
    });

    expect(created).toHaveLength(2);
    expect(created.map((row) => row.entityType).sort()).toEqual(['CUSTOMER', 'DRIVER']);
  });

  it('rejects candidate replacement when extraction is outside tenant', async () => {
    const prisma = {
      vehicleDocumentExtraction: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const repository = makeCandidateRepository(prisma);

    await expect(
      repository.replaceProposedCandidates({
        organizationId: 'org-1',
        extractionId: 'ext-missing',
        candidates: [{ entityType: 'VEHICLE', entityId: 'veh-1', confidence: 0.9 }],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
