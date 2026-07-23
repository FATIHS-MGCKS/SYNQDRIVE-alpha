import { buildResolverContext } from './legal-document-resolver.context';
import {
  LEGAL_DOCUMENT_RESOLVER_ERROR_CODES,
  LEGAL_DOCUMENT_RESOLVER_FALLBACK_SOURCE,
} from './legal-document-resolver.constants';

describe('legal-document-resolver.context', () => {
  it('never silently falls back to German when language is missing', () => {
    const built = buildResolverContext({
      resolverInput: { organizationId: 'org-1' },
      organization: { language: null, country: 'DE', businessType: 'RENTAL' },
    });
    expect(built.context.customerLanguage).toBeNull();
    expect(
      built.errors.some((e) => e.code === LEGAL_DOCUMENT_RESOLVER_ERROR_CODES.MISSING_LANGUAGE),
    ).toBe(true);
    expect(
      built.fallbackDecisions.some(
        (f) => f.field === 'customerLanguage' && f.value === 'de' && f.source !== LEGAL_DOCUMENT_RESOLVER_FALLBACK_SOURCE.EXPLICIT,
      ),
    ).toBe(false);
  });

  it('uses organization language with documented fallback decision', () => {
    const built = buildResolverContext({
      resolverInput: { organizationId: 'org-1', customerLanguage: 'en' },
      organization: { language: 'de', country: 'DE', businessType: 'RENTAL' },
    });
    expect(built.context.customerLanguage).toBe('en');
    expect(
      built.fallbackDecisions.some(
        (f) =>
          f.field === 'customerLanguage' &&
          f.source === LEGAL_DOCUMENT_RESOLVER_FALLBACK_SOURCE.EXPLICIT,
      ),
    ).toBe(true);
  });

  it('derives B2B segment from corporate customer type', () => {
    const built = buildResolverContext({
      resolverInput: { organizationId: 'org-1', customerLanguage: 'de' },
      customer: { customerType: 'CORPORATE', country: 'DE' },
    });
    expect(built.context.customerSegment).toBe('B2B');
  });

  it('defaults booking channel to MANUAL with fallback decision', () => {
    const built = buildResolverContext({
      resolverInput: { organizationId: 'org-1', customerLanguage: 'de' },
    });
    expect(built.context.bookingChannel).toBe('MANUAL');
    expect(
      built.fallbackDecisions.some(
        (f) => f.source === LEGAL_DOCUMENT_RESOLVER_FALLBACK_SOURCE.DEFAULT_BOOKING_CHANNEL,
      ),
    ).toBe(true);
  });
});
