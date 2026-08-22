import {
  hasTrustworthyOccurredAt,
  isBookingSafeForCustomer,
  resolveConservativeCustomerIdentity,
} from './communication-identity-match.util';
import { CommunicationContextAmbiguityReason } from './communication-context.types';

describe('communication identity match util', () => {
  it('distinguishes NO_MATCH from AMBIGUOUS for phone', () => {
    const noMatch = resolveConservativeCustomerIdentity(
      { normalizedPhone: '491701234567' },
      { status: 'none', customerId: null },
      { status: 'none', customerId: null },
    );
    expect(noMatch.customerId).toBeNull();
    expect(noMatch.conflicts.some((c) => c.code === CommunicationContextAmbiguityReason.NO_MATCH)).toBe(true);

    const ambiguous = resolveConservativeCustomerIdentity(
      { normalizedPhone: '491701234567' },
      { status: 'ambiguous', customerId: null },
      { status: 'none', customerId: null },
    );
    expect(ambiguous.customerId).toBeNull();
    expect(ambiguous.conflicts.some((c) => c.code === CommunicationContextAmbiguityReason.MULTIPLE_CUSTOMERS)).toBe(true);
  });

  it('requires both hints to be unique when phone and email are present', () => {
    const unresolved = resolveConservativeCustomerIdentity(
      {
        normalizedPhone: '491701234567',
        normalizedEmail: 'user@example.com',
      },
      { status: 'ambiguous', customerId: null },
      { status: 'unique', customerId: 'cust-email' },
    );
    expect(unresolved.customerId).toBeNull();

    const unresolvedReverse = resolveConservativeCustomerIdentity(
      {
        normalizedPhone: '491701234567',
        normalizedEmail: 'user@example.com',
      },
      { status: 'unique', customerId: 'cust-phone' },
      { status: 'ambiguous', customerId: null },
    );
    expect(unresolvedReverse.customerId).toBeNull();
  });

  it('validates trustworthy occurredAt only for real dates', () => {
    expect(hasTrustworthyOccurredAt(new Date('2026-08-21T10:00:00Z'))).toBe(true);
    expect(hasTrustworthyOccurredAt(undefined)).toBe(false);
    expect(hasTrustworthyOccurredAt(new Date('invalid'))).toBe(false);
  });

  it('validates booking safety against resolved customer', () => {
    expect(isBookingSafeForCustomer('booking-customer', 'booking-customer')).toBe(true);
    expect(isBookingSafeForCustomer('booking-customer', 'other-customer')).toBe(false);
    expect(isBookingSafeForCustomer('booking-customer', null)).toBe(false);
  });
});
