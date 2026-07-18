import {
  PARTNER_CANDIDATE_CONFLICT_CODES,
  PARTNER_CANDIDATE_MATCH_REASONS,
  PARTNER_KIND,
} from './partner-candidate-resolver.types';
import {
  buildNewPartnerSuggestion,
  buildPartnerResolverHints,
  buildPartnerResolverPrivateHints,
  scorePartnerCandidates,
} from './partner-candidate-matching.util';

describe('partner-candidate-matching.util', () => {
  const workshopVendor = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Werkstatt Müller GmbH',
    category: 'WORKSHOP' as const,
    email: 'werkstatt@example.com',
    contactEmail: null,
    street: 'Hauptstr 1',
    city: 'Berlin',
    postalCode: '10115',
  };
  const insuranceVendor = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Allianz Versicherung',
    category: 'INSURANCE' as const,
    email: 'kontakt@allianz.example',
    contactEmail: null,
    street: 'Versicherungsweg 2',
    city: 'München',
    postalCode: '80331',
  };

  const emptyRelationships = {
    invoiceVendorIds: new Set<string>(),
    serviceVendorIds: new Set<string>(),
    historicalByVendor: new Map(),
  };

  it('matches existing workshop vendor by exact name', () => {
    const privateHints = buildPartnerResolverPrivateHints({
      organizationId: 'org-1',
      documentType: 'INVOICE',
      extractedData: { supplier: 'Werkstatt Müller GmbH' },
    });
    const candidates = scorePartnerCandidates({
      vendors: [workshopVendor],
      privateHints,
      expectedPartnerKind: PARTNER_KIND.WORKSHOP,
      relationships: emptyRelationships,
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].vendorId).toBe(workshopVendor.id);
    expect(candidates[0].matchReasons).toContain(PARTNER_CANDIDATE_MATCH_REASONS.NAME_EXACT);
    expect(candidates[0].confirmationRequired).toBe(true);
  });

  it('prefers vendor id over fuzzy name', () => {
    const privateHints = buildPartnerResolverPrivateHints({
      organizationId: 'org-1',
      documentType: 'INVOICE',
      extractedData: {
        vendorId: workshopVendor.id,
        supplier: 'Unrelated Name GmbH',
      },
    });
    const candidates = scorePartnerCandidates({
      vendors: [workshopVendor],
      privateHints,
      expectedPartnerKind: PARTNER_KIND.WORKSHOP,
      relationships: emptyRelationships,
    });
    expect(candidates[0].matchReasons).toContain(
      PARTNER_CANDIDATE_MATCH_REASONS.VENDOR_ID_EXACT,
    );
    expect(candidates[0].confidence).toBeGreaterThan(0.9);
  });

  it('flags authority vs workshop category mismatch', () => {
    const privateHints = buildPartnerResolverPrivateHints({
      organizationId: 'org-1',
      documentType: 'FINE',
      extractedData: { issuingAuthority: 'Werkstatt Müller GmbH' },
    });
    const candidates = scorePartnerCandidates({
      vendors: [workshopVendor],
      privateHints,
      expectedPartnerKind: PARTNER_KIND.AUTHORITY,
      relationships: emptyRelationships,
    });
    expect(candidates[0].conflicts.some((c) => c.code === PARTNER_CANDIDATE_CONFLICT_CODES.CATEGORY_MISMATCH)).toBe(
      true,
    );
  });

  it('suggests new partner for unknown authority', () => {
    const privateHints = buildPartnerResolverPrivateHints({
      organizationId: 'org-1',
      documentType: 'FINE',
      extractedData: { issuingAuthority: 'Stadt München' },
    });
    const suggestion = buildNewPartnerSuggestion({
      privateHints,
      expectedPartnerKind: PARTNER_KIND.AUTHORITY,
      documentType: 'FINE',
      candidates: [],
    });
    expect(suggestion).not.toBeNull();
    expect(suggestion?.partnerKind).toBe(PARTNER_KIND.AUTHORITY);
    expect(suggestion?.confirmationRequired).toBe(true);
    expect(suggestion?.displayLabel).toContain('Behörde');
  });

  it('does not expose iban in public hints', () => {
    const privateHints = buildPartnerResolverPrivateHints({
      organizationId: 'org-1',
      documentType: 'INVOICE',
      extractedData: {
        supplier: 'Werkstatt Müller GmbH',
        iban: 'DE89370400440532013000',
        vatId: 'DE123456789',
      },
    });
    const hints = buildPartnerResolverHints(privateHints, PARTNER_KIND.WORKSHOP);
    expect(hints.ibanPresent).toBe(true);
    expect(hints.vatIdPresent).toBe(true);
    expect(JSON.stringify(hints)).not.toContain('DE89370400440532013000');
    expect(JSON.stringify(hints)).not.toContain('DE123456789');
  });

  it('boosts vendor with existing invoice relationship', () => {
    const privateHints = buildPartnerResolverPrivateHints({
      organizationId: 'org-1',
      documentType: 'INVOICE',
      extractedData: { supplier: 'Werkstatt Müller GmbH', email: 'werkstatt@example.com' },
    });
    const candidates = scorePartnerCandidates({
      vendors: [workshopVendor, insuranceVendor],
      privateHints,
      expectedPartnerKind: PARTNER_KIND.WORKSHOP,
      relationships: {
        invoiceVendorIds: new Set([workshopVendor.id]),
        serviceVendorIds: new Set<string>(),
        historicalByVendor: new Map(),
      },
    });
    expect(candidates[0].vendorId).toBe(workshopVendor.id);
    expect(candidates[0].matchReasons).toContain(
      PARTNER_CANDIDATE_MATCH_REASONS.INVOICE_RELATIONSHIP,
    );
  });
});
