import { normalizeEmail } from '@modules/customers/utils/customer-normalizer.util';
import { CommunicationContextAmbiguityReason } from './communication-context.types';
import type { CommunicationContextConflict, CommunicationIdentityHints } from './communication-context.types';

export type IdentityLookupStatus = 'none' | 'unique' | 'ambiguous';

export interface IdentityLookupResult {
  status: IdentityLookupStatus;
  customerId: string | null;
}

export interface ConservativeIdentityResolution {
  customerId: string | null;
  source: 'EXACT_PHONE' | 'EXACT_EMAIL' | null;
  conflicts: CommunicationContextConflict[];
}

export function resolveConservativeCustomerIdentity(
  hints: CommunicationIdentityHints,
  phoneMatch: IdentityLookupResult,
  emailMatch: IdentityLookupResult,
): ConservativeIdentityResolution {
  const conflicts: CommunicationContextConflict[] = [];
  const hasPhone = Boolean(hints.normalizedPhone?.trim());
  const hasEmail = Boolean(normalizeEmail(hints.normalizedEmail));

  if (hasPhone && phoneMatch.status === 'ambiguous') {
    conflicts.push({
      field: 'customerId',
      code: CommunicationContextAmbiguityReason.MULTIPLE_CUSTOMERS,
    });
  }
  if (hasEmail && emailMatch.status === 'ambiguous') {
    conflicts.push({
      field: 'customerId',
      code: CommunicationContextAmbiguityReason.MULTIPLE_CUSTOMERS,
    });
  }

  const phoneUnique = phoneMatch.status === 'unique' ? phoneMatch.customerId : null;
  const emailUnique = emailMatch.status === 'unique' ? emailMatch.customerId : null;

  if (hasPhone && hasEmail) {
    if (phoneMatch.status === 'ambiguous' || emailMatch.status === 'ambiguous') {
      return { customerId: null, source: null, conflicts };
    }
    if (phoneMatch.status === 'none' || emailMatch.status === 'none') {
      conflicts.push({
        field: 'customerId',
        code: CommunicationContextAmbiguityReason.NO_MATCH,
      });
      return { customerId: null, source: null, conflicts };
    }
    if (phoneUnique !== emailUnique) {
      conflicts.push({
        field: 'customerId',
        code: CommunicationContextAmbiguityReason.CONFLICTING_IDENTITIES,
      });
      return { customerId: null, source: null, conflicts };
    }
    return { customerId: phoneUnique, source: 'EXACT_PHONE', conflicts };
  }

  if (hasPhone) {
    if (phoneMatch.status === 'unique') {
      return { customerId: phoneUnique, source: 'EXACT_PHONE', conflicts };
    }
    if (phoneMatch.status === 'none') {
      conflicts.push({
        field: 'customerId',
        code: CommunicationContextAmbiguityReason.NO_MATCH,
      });
    }
    return { customerId: null, source: null, conflicts };
  }

  if (hasEmail) {
    if (emailMatch.status === 'unique') {
      return { customerId: emailUnique, source: 'EXACT_EMAIL', conflicts };
    }
    if (emailMatch.status === 'none') {
      conflicts.push({
        field: 'customerId',
        code: CommunicationContextAmbiguityReason.NO_MATCH,
      });
    }
    return { customerId: null, source: null, conflicts };
  }

  return { customerId: null, source: null, conflicts };
}

export function hasTrustworthyOccurredAt(occurredAt?: Date | null): occurredAt is Date {
  return occurredAt instanceof Date && !Number.isNaN(occurredAt.getTime());
}

export function isBookingSafeForCustomer(
  bookingCustomerId: string,
  resolvedCustomerId: string | null,
): boolean {
  return Boolean(resolvedCustomerId) && bookingCustomerId === resolvedCustomerId;
}
