import { PartnerCandidateResolverService } from './partner-candidate-resolver.service';
import { PARTNER_CANDIDATE_MATCH_REASONS, PARTNER_KIND } from './partner-candidate-resolver.types';

describe('PartnerCandidateResolverService', () => {
  function makeService(prismaOverrides: Record<string, unknown> = {}) {
    const prisma = {
      vendor: { findMany: jest.fn(), findFirst: jest.fn() },
      orgInvoice: { findMany: jest.fn() },
      serviceCase: { findMany: jest.fn() },
      ...prismaOverrides,
    };
    return { svc: new PartnerCandidateResolverService(prisma as any), prisma };
  }

  const workshopVendor = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Werkstatt Müller GmbH',
    category: 'WORKSHOP',
    email: 'werkstatt@example.com',
    contactEmail: null,
    street: 'Hauptstr 1',
    city: 'Berlin',
    postalCode: '10115',
  };

  it('returns tenant-scoped vendor candidate for known supplier', async () => {
    const { svc, prisma } = makeService({
      orgInvoice: { findMany: jest.fn().mockResolvedValue([]) },
      serviceCase: { findMany: jest.fn().mockResolvedValue([]) },
      vendor: { findMany: jest.fn().mockResolvedValue([workshopVendor]) },
    });

    const result = await svc.resolve({
      organizationId: 'org-1',
      documentType: 'INVOICE',
      extractedData: { supplier: 'Werkstatt Müller GmbH' },
    });

    expect(prisma.vendor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1', isActive: true }),
      }),
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].matchReasons).toContain(
      PARTNER_CANDIDATE_MATCH_REASONS.NAME_EXACT,
    );
    expect(result.autoConfirmEligible).toBe(false);
  });

  it('returns new partner suggestion for unknown authority', async () => {
    const { svc } = makeService({
      orgInvoice: { findMany: jest.fn().mockResolvedValue([]) },
      serviceCase: { findMany: jest.fn().mockResolvedValue([]) },
      vendor: { findMany: jest.fn().mockResolvedValue([]) },
    });

    const result = await svc.resolve({
      organizationId: 'org-1',
      documentType: 'FINE',
      extractedData: { issuingAuthority: 'Stadt München' },
    });

    expect(result.candidates).toHaveLength(0);
    expect(result.newPartnerSuggestion).not.toBeNull();
    expect(result.newPartnerSuggestion?.partnerKind).toBe(PARTNER_KIND.AUTHORITY);
    expect(result.hints.expectedPartnerKind).toBe(PARTNER_KIND.AUTHORITY);
  });

  it('matches historical iban from prior invoice extractedData', async () => {
    const { svc, prisma } = makeService({
      orgInvoice: {
        findMany: jest.fn().mockResolvedValue([
          {
            vendorId: workshopVendor.id,
            extractedData: { iban: 'DE89370400440532013000' },
          },
        ]),
      },
      serviceCase: { findMany: jest.fn().mockResolvedValue([]) },
      vendor: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(workshopVendor),
      },
    });

    const result = await svc.resolve({
      organizationId: 'org-1',
      documentType: 'INVOICE',
      extractedData: { iban: 'DE89 3704 0044 0532 0130 00' },
    });

    expect(prisma.vendor.findFirst).toHaveBeenCalled();
    expect(result.candidates[0]?.matchReasons).toContain(
      PARTNER_CANDIDATE_MATCH_REASONS.IBAN_EXACT,
    );
  });
});
