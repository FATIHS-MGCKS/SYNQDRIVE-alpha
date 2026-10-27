import { ZB1_P2_SEMANTICS } from '@modules/document-extraction/zb1/zb1-registration-certificate.contract';
import { buildVehicleIdentityReviewSnapshot } from './vehicle-identity-reconcile.util';

describe('vehicle-identity-reconcile.util', () => {
  const capabilities = {
    p2Enabled: true,
    zb1UploadEnabled: false,
    documentStoragePolicyAcknowledged: false,
  };

  it('marks displacement conflict between DIMO and document', () => {
    const snapshot = buildVehicleIdentityReviewSnapshot({
      dimo: {
        vin: '1HGCM82633A004352',
        make: 'VW',
        model: 'Golf',
        year: 2020,
        fuelType: 'Diesel',
        motorPowerKw: 85,
        displacementCc: 1984,
      },
      zb1: {
        schemaVersion: 'zb1_v1',
        p2PowerSemantics: ZB1_P2_SEMANTICS,
        warnings: [],
        fields: {
          d1Manufacturer: { documentFieldCode: 'D.1', value: 'VW', extractionStatus: 'EXTRACTED', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          d2TypeVariantVersion: { documentFieldCode: 'D.2', value: null, extractionStatus: 'MISSING', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          d3TradeName: { documentFieldCode: 'D.3', value: 'Golf', extractionStatus: 'EXTRACTED', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          eVin: { documentFieldCode: 'E', value: '1HGCM82633A004352', extractionStatus: 'EXTRACTED', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          p1DisplacementCc: { documentFieldCode: 'P.1', value: 1498, extractionStatus: 'EXTRACTED', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          p2NominalPowerKw: { documentFieldCode: 'P.2', value: 85, extractionStatus: 'EXTRACTED', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          p3FuelOrEnergy: { documentFieldCode: 'P.3', value: 'Benzin', extractionStatus: 'EXTRACTED', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          hsnCode21: { documentFieldCode: '2.1', value: '0603', extractionStatus: 'EXTRACTED', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          tsnCode22: { documentFieldCode: '2.2', value: '123', extractionStatus: 'EXTRACTED', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          f1PermissibleTotalMassKg: { documentFieldCode: 'F.1', value: null, extractionStatus: 'MISSING', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          gKerbMassKg: { documentFieldCode: 'G', value: null, extractionStatus: 'MISSING', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          registeredTireDimensions: [],
        },
      },
      manual: null,
      documentExtractionId: 'ext-1',
      capabilities,
    });

    const displacement = snapshot.fields.find((f) => f.fieldCode === 'p1DisplacementCc');
    expect(displacement?.conflict).toBe(true);
    expect(displacement?.provenance).toBe('CONFLICT');

    const fuel = snapshot.fields.find((f) => f.fieldCode === 'p3FuelOrEnergy');
    expect(fuel?.conflict).toBe(true);
  });

  it('blocks VIN mismatch until acknowledged', () => {
    const snapshot = buildVehicleIdentityReviewSnapshot({
      dimo: {
        vin: '1HGCM82633A004352',
        make: 'VW',
        model: 'Golf',
        year: 2020,
        fuelType: 'Gasoline',
        motorPowerKw: null,
        displacementCc: null,
      },
      zb1: {
        schemaVersion: 'zb1_v1',
        p2PowerSemantics: ZB1_P2_SEMANTICS,
        warnings: [],
        fields: {
          d1Manufacturer: { documentFieldCode: 'D.1', value: null, extractionStatus: 'MISSING', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          d2TypeVariantVersion: { documentFieldCode: 'D.2', value: null, extractionStatus: 'MISSING', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          d3TradeName: { documentFieldCode: 'D.3', value: null, extractionStatus: 'MISSING', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          eVin: { documentFieldCode: 'E', value: '1HGCM82633A004351', extractionStatus: 'EXTRACTED', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          p1DisplacementCc: { documentFieldCode: 'P.1', value: null, extractionStatus: 'MISSING', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          p2NominalPowerKw: { documentFieldCode: 'P.2', value: null, extractionStatus: 'MISSING', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          p3FuelOrEnergy: { documentFieldCode: 'P.3', value: null, extractionStatus: 'MISSING', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          hsnCode21: { documentFieldCode: '2.1', value: null, extractionStatus: 'MISSING', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          tsnCode22: { documentFieldCode: '2.2', value: null, extractionStatus: 'MISSING', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          f1PermissibleTotalMassKg: { documentFieldCode: 'F.1', value: null, extractionStatus: 'MISSING', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          gKerbMassKg: { documentFieldCode: 'G', value: null, extractionStatus: 'MISSING', confidence: null, provenance: 'DOCUMENT_EXTRACTED' },
          registeredTireDimensions: [],
        },
      },
      manual: null,
      documentExtractionId: 'ext-2',
      capabilities,
    });
    expect(snapshot.vinMismatchBlocked).toBe(true);
  });
});
