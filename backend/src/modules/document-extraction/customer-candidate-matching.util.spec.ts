import {
  CUSTOMER_CANDIDATE_CONFLICT_CODES,
  CUSTOMER_CANDIDATE_MATCH_REASONS,
} from './customer-candidate-resolver.types';
import {
  buildCustomerResolverHints,
  buildCustomerResolverPrivateHints,
  scoreCustomerCandidates,
} from './customer-candidate-matching.util';

describe('customer-candidate-matching.util', () => {
  const customerA = {
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
  const customerB = {
    ...customerA,
    id: '22222222-2222-4222-8222-222222222222',
    emailNormalized: 'erika@example.com',
    phoneNormalized: '491709999999',
    fullNameNormalized: 'max muster',
    firstName: 'Max',
    lastName: 'Muster',
  };

  it('returns zero candidates when no customers match', () => {
    const privateHints = buildCustomerResolverPrivateHints({
      organizationId: 'org-1',
      documentType: 'INVOICE',
      extractedData: { email: 'unknown@example.com' },
    });
    expect(scoreCustomerCandidates({ customers: [], privateHints })).toHaveLength(0);
  });

  it('returns one unique candidate for exact email match', () => {
    const privateHints = buildCustomerResolverPrivateHints({
      organizationId: 'org-1',
      documentType: 'INVOICE',
      extractedData: { email: 'max@example.com' },
    });
    const candidates = scoreCustomerCandidates({ customers: [customerA], privateHints });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].customerId).toBe(customerA.id);
    expect(candidates[0].matchReasons).toContain(CUSTOMER_CANDIDATE_MATCH_REASONS.EMAIL_EXACT);
    expect(candidates[0].confirmationRequired).toBe(true);
  });

  it('prefers booking link over name-only signal', () => {
    const privateHints = buildCustomerResolverPrivateHints({
      organizationId: 'org-1',
      documentType: 'FINE',
      extractedData: { customerName: 'Max Muster' },
      bookingLinkCustomerId: customerA.id,
    });
    const candidates = scoreCustomerCandidates({ customers: [customerA, customerB], privateHints });
    expect(candidates[0].customerId).toBe(customerA.id);
    expect(candidates[0].matchReasons).toContain(CUSTOMER_CANDIDATE_MATCH_REASONS.BOOKING_LINK);
    expect(candidates[0].confidence).toBeGreaterThan(
      candidates.find((c) => c.customerId === customerB.id)?.confidence ?? 0,
    );
  });

  it('marks duplicate normalized names as ambiguous', () => {
    const privateHints = buildCustomerResolverPrivateHints({
      organizationId: 'org-1',
      documentType: 'INVOICE',
      extractedData: { customerName: 'Max Muster', email: 'max@example.com' },
    });
    const candidates = scoreCustomerCandidates({ customers: [customerA, customerB], privateHints });
    const nameAmbiguous = candidates.filter((candidate) =>
      candidate.matchReasons.includes(CUSTOMER_CANDIDATE_MATCH_REASONS.NAME_EXACT),
    );
    expect(nameAmbiguous.length).toBeGreaterThan(1);
    expect(nameAmbiguous.every((candidate) => candidate.confirmationRequired)).toBe(true);
    expect(
      nameAmbiguous.some((candidate) =>
        candidate.conflicts.some((conflict) => conflict.code === CUSTOMER_CANDIDATE_CONFLICT_CODES.DUPLICATE_NAME),
      ),
    ).toBe(true);
  });

  it('does not expose raw PII in public hints', () => {
    const privateHints = buildCustomerResolverPrivateHints({
      organizationId: 'org-1',
      documentType: 'INVOICE',
      extractedData: {
        email: 'max@example.com',
        customerName: 'Max Muster',
        phone: '+49 170 1234567',
      },
    });
    const hints = buildCustomerResolverHints(privateHints, 'book-1');
    expect(hints.emailPresent).toBe(true);
    expect(hints.namePresent).toBe(true);
    expect(hints.phonePresent).toBe(true);
    expect(JSON.stringify(hints)).not.toContain('max@example.com');
    expect(JSON.stringify(hints)).not.toContain('Max Muster');
  });

  it('rejects name-only matches without supporting strong signal', () => {
    const privateHints = buildCustomerResolverPrivateHints({
      organizationId: 'org-1',
      documentType: 'INVOICE',
      extractedData: { customerName: 'Max Muster' },
    });
    const candidates = scoreCustomerCandidates({ customers: [customerA], privateHints });
    expect(candidates).toHaveLength(0);
  });
});
