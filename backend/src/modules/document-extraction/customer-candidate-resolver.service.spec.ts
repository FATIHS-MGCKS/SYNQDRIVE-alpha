import { CustomerCandidateResolverService } from './customer-candidate-resolver.service';
import { CUSTOMER_CANDIDATE_MATCH_REASONS } from './customer-candidate-resolver.types';

describe('CustomerCandidateResolverService', () => {
  function makeService(prismaOverrides: Record<string, unknown> = {}) {
    const prisma = {
      customer: { findMany: jest.fn() },
      booking: { findFirst: jest.fn() },
      ...prismaOverrides,
    };
    return { svc: new CustomerCandidateResolverService(prisma as any), prisma };
  }

  const customerRow = {
    id: '11111111-1111-4111-8111-111111111111',
    firstName: 'Max',
    lastName: 'Muster',
    company: null,
    emailNormalized: 'max@example.com',
    phoneNormalized: '491701234567',
    fullNameNormalized: 'max muster',
    address: 'Hauptstr 1',
    city: 'Berlin',
    zip: '10115',
    taxId: null,
    idNumberNormalized: null,
  };

  it('returns unique tenant-scoped candidate for exact email', async () => {
    const { svc, prisma } = makeService({
      customer: { findMany: jest.fn().mockResolvedValue([customerRow]) },
    });

    const result = await svc.resolve({
      organizationId: 'org-1',
      documentType: 'INVOICE',
      extractedData: { email: 'max@example.com' },
    });

    expect(prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1' }),
      }),
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].matchReasons).toContain(
      CUSTOMER_CANDIDATE_MATCH_REASONS.EMAIL_EXACT,
    );
    expect(result.autoConfirmEligible).toBe(false);
  });

  it('resolves booking link customer with higher-value signal', async () => {
    const { svc, prisma } = makeService({
      booking: {
        findFirst: jest.fn().mockResolvedValue({ customerId: customerRow.id }),
      },
      customer: { findMany: jest.fn().mockResolvedValue([customerRow]) },
    });

    const result = await svc.resolve({
      organizationId: 'org-1',
      documentType: 'FINE',
      extractedData: { customerName: 'Max Muster' },
      linkedBookingId: 'book-1',
    });

    expect(prisma.booking.findFirst).toHaveBeenCalledWith({
      where: { id: 'book-1', organizationId: 'org-1' },
      select: { customerId: true },
    });
    expect(result.candidates[0].matchReasons).toContain(
      CUSTOMER_CANDIDATE_MATCH_REASONS.BOOKING_LINK,
    );
    expect(result.hints.bookingLinkPresent).toBe(true);
  });

  it('returns ambiguous candidates for duplicate names', async () => {
    const { svc } = makeService({
      customer: {
        findMany: jest.fn().mockResolvedValue([
          customerRow,
          {
            ...customerRow,
            id: '22222222-2222-4222-8222-222222222222',
            emailNormalized: 'erika@example.com',
          },
        ]),
      },
    });

    const result = await svc.resolve({
      organizationId: 'org-1',
      documentType: 'INVOICE',
      extractedData: { customerName: 'Max Muster', email: 'max@example.com' },
    });

    expect(result.candidates.length).toBeGreaterThan(1);
    expect(result.ambiguousNameMatch).toBe(true);
    expect(result.candidates.every((candidate) => candidate.confirmationRequired)).toBe(true);
  });
});
