import { FuelType } from '@prisma/client';
import {
  collectProtectedIdentityViolations,
  normalizeAcceptedSuggestions,
} from './vehicle-identity-p3-persistence.util';
import type { RegistrationIdentityCanonicalIdentity } from './vehicle-identity-canonical.types';

describe('vehicle-identity-p3-persistence.util', () => {
  const vehicle = {
    make: 'VW',
    model: 'Golf',
    year: 2020,
    vin: 'VIN1',
    fuelType: FuelType.GASOLINE,
  };

  const canonical = (fields: RegistrationIdentityCanonicalIdentity['fields']): RegistrationIdentityCanonicalIdentity => ({
    version: 1,
    documentExtractionId: null,
    fields,
  });

  it('blocks AI engineDisplacementCc alias overriding protected displacementCc', () => {
    const violations = collectProtectedIdentityViolations({
      existing: {
        version: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
        fields: {
          displacementCc: {
            value: 1498,
            provenance: 'USER_CONFIRMED',
            confirmationStatus: 'USER_CONFIRMED',
            confirmedAt: '2026-01-01T00:00:00.000Z',
            documentExtractionId: null,
          },
        },
      },
      vehicle,
      canonical: canonical([]),
      acceptedSuggestions: normalizeAcceptedSuggestions(
        {
          engineDisplacementCc: {
            value: 1984,
            provenance: 'AI_ESTIMATED',
            confirmationStatus: 'SUGGESTED',
            confirmedAt: null,
            documentExtractionId: null,
          },
        },
        new Set(['engineDisplacementCc']),
      ),
      explicitlyConfirmedCanonicalKeys: new Set(),
    });
    expect(violations.some((v) => v.code === 'PROTECTED_FIELD_CHANGE_DENIED')).toBe(true);
  });

  it('normalizes engineDisplacementCc to displacementCc in accepted suggestions', () => {
    const normalized = normalizeAcceptedSuggestions(
      {
        engineDisplacementCc: {
          value: 1498,
          provenance: 'AI_ESTIMATED',
          confirmationStatus: 'SUGGESTED',
          confirmedAt: null,
          documentExtractionId: null,
        },
      },
      new Set(['engineDisplacementCc']),
    );
    expect(normalized.displacementCc?.value).toBe(1498);
  });
});
