import {
  ZB1_P2_SEMANTICS,
  type Zb1RegistrationCertificateExtract,
} from '@modules/document-extraction/zb1/zb1-registration-certificate.contract';
import { buildVehicleSystemBaseline } from './vehicle-identity-baseline.util';
import { buildVehicleIdentityReviewSnapshot } from './vehicle-identity-reconcile.util';

describe('vehicle-identity-reconcile.util', () => {
  const capabilities = {
    p2Enabled: true,
    p3Enabled: false,
    zb1UploadEnabled: false,
    documentStoragePolicyAcknowledged: false,
  };

  const zb1Fixture: Zb1RegistrationCertificateExtract = {
    schemaVersion: 'zb1_v1',
    p2PowerSemantics: ZB1_P2_SEMANTICS,
    warnings: [] as string[],
    fields: {
      d1Manufacturer: { documentFieldCode: 'D.1', value: 'VW', extractionStatus: 'EXTRACTED', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
      d2TypeVariantVersion: { documentFieldCode: 'D.2', value: null, extractionStatus: 'MISSING', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
      d3TradeName: { documentFieldCode: 'D.3', value: 'Golf', extractionStatus: 'EXTRACTED', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
      eVin: { documentFieldCode: 'E', value: '1HGCM82633A004352', extractionStatus: 'EXTRACTED', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
      p1DisplacementCc: { documentFieldCode: 'P.1', value: 1498, extractionStatus: 'EXTRACTED', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
      p2NominalPowerKw: { documentFieldCode: 'P.2', value: 90, extractionStatus: 'EXTRACTED', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
      p3FuelOrEnergy: { documentFieldCode: 'P.3', value: 'Benzin', extractionStatus: 'EXTRACTED', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
      hsnCode21: { documentFieldCode: '2.1', value: '0603', extractionStatus: 'EXTRACTED', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
      tsnCode22: { documentFieldCode: '2.2', value: '123', extractionStatus: 'EXTRACTED', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
      f1PermissibleTotalMassKg: { documentFieldCode: 'F.1', value: null, extractionStatus: 'MISSING', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
      gKerbMassKg: { documentFieldCode: 'G', value: null, extractionStatus: 'MISSING', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
      registeredTireDimensions: [],
    },
  };

  it('marks manual vs document conflicts without treating vehicle fuel as DIMO', () => {
    const system = buildVehicleSystemBaseline({
      vin: '1HGCM82633A004352',
      make: 'VW',
      model: 'Golf',
      fuelType: 'Diesel',
      hasDimoProviderLink: true,
      motionReference: {
        systemMotorPowerKw: 85,
        source: 'OPERATOR_CONFIRMED',
        evidenceTier: 'VERIFIED',
      },
    });

    const snapshot = buildVehicleIdentityReviewSnapshot({
      system,
      zb1: zb1Fixture,
      manual: { displacementCc: 1984, fuelType: 'Diesel' },
      documentExtractionId: 'ext-1',
      capabilities,
    });

    const displacement = snapshot.fields.find((f) => f.fieldCode === 'p1DisplacementCc');
    expect(displacement?.conflict).toBe(true);
    expect(displacement?.provenance).toBe('CONFLICT');

    const fuel = snapshot.fields.find((f) => f.fieldCode === 'p3FuelOrEnergy');
    expect(fuel?.conflict).toBe(true);

    const power = snapshot.fields.find((f) => f.fieldCode === 'p2NominalPowerKw');
    expect(power?.conflict).toBe(true);
    expect(power?.baselineProvenance).toBe('USER_CONFIRMED');
  });

  it('blocks VIN mismatch until acknowledged', () => {
    const system = buildVehicleSystemBaseline({
      vin: '1HGCM82633A004352',
      make: 'VW',
      model: 'Golf',
      fuelType: 'Gasoline',
      hasDimoProviderLink: true,
      motionReference: null,
    });

    const snapshot = buildVehicleIdentityReviewSnapshot({
      system,
      zb1: {
        ...zb1Fixture,
        fields: {
          ...zb1Fixture.fields,
          eVin: {
            documentFieldCode: 'E',
            value: '1HGCM82633A004351',
            extractionStatus: 'EXTRACTED',
            confidence: null,
            provenance: 'DOCUMENT_EXTRACTED',
          },
        },
      },
      manual: null,
      documentExtractionId: 'ext-2',
      capabilities,
    });
    expect(snapshot.vinMismatchBlocked).toBe(true);
  });
});
