import { detectDisplacementVariantConflict, mergeAiSpecsIntoIdentityPreview } from './vehicle-identity-p3-bridge.util';
import type { RegistrationIdentityCanonicalIdentity } from './vehicle-identity-canonical.types';

describe('vehicle-identity-p3-bridge.util', () => {
  it('flags 1.5 eTSI vs 1984 cm³ AI displacement', () => {
    const conflict = detectDisplacementVariantConflict({
      typeVariantVersion: '1.5 eTSI',
      electrificationGrade: 'MHEV',
      confirmedDisplacementCc: null,
      aiDisplacementCc: 1984,
    });
    expect(conflict?.code).toBe('DISPLACEMENT_VARIANT_MISMATCH');
  });

  it('blocks treating P.2 nominal kW as AI system power when both differ', () => {
    const canonical: RegistrationIdentityCanonicalIdentity = {
      version: 1,
      documentExtractionId: null,
      fields: [
        {
          key: 'make',
          value: 'VW',
          provenance: 'USER_CONFIRMED',
          confirmationStatus: 'USER_CONFIRMED',
          documentExtractionId: null,
        },
        {
          key: 'model',
          value: 'Golf',
          provenance: 'USER_CONFIRMED',
          confirmationStatus: 'USER_CONFIRMED',
          documentExtractionId: null,
        },
        {
          key: 'year',
          value: 2022,
          provenance: 'USER_CONFIRMED',
          confirmationStatus: 'USER_CONFIRMED',
          documentExtractionId: null,
        },
        {
          key: 'nominalMotorPowerKw',
          value: 85,
          provenance: 'DOCUMENT_EXTRACTED',
          confirmationStatus: 'USER_CONFIRMED',
          documentExtractionId: 'ext-1',
        },
      ],
    };
    const preview = mergeAiSpecsIntoIdentityPreview({
      canonical,
      rawAiSpecs: {
        systemMotorPowerKw: 110,
        engineDisplacementCc: 1498,
        resolvedVariant: '1.5 TSI',
      },
    });
    expect(preview.conflicts.some((c) => c.code === 'P2_NOMINAL_VS_AI_SYSTEM_POWER')).toBe(true);
    expect(preview.aiSpecs.systemMotorPowerKw).toBeNull();
  });
});
