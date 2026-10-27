import {
  ZB1_FIELD_PROVENANCE,
  ZB1_P2_SEMANTICS,
  ZB1_REGISTRATION_CERTIFICATE_SCHEMA_VERSION,
} from './zb1-registration-certificate.contract';
import { parseZb1RegistrationCertificateFromOcr } from './zb1-registration-certificate.parser';
import { validateVinFin } from './zb1-registration-certificate.validator';

const VALID_FIN = '1HGCM82633A004352';

function assertAllProvenanceDocumentExtracted(
  extract: ReturnType<typeof parseZb1RegistrationCertificateFromOcr>,
): void {
  const scalarFields = Object.values(extract.fields).filter(
    (f) => !Array.isArray(f),
  ) as Array<{ provenance: string }>;
  for (const field of scalarFields) {
    expect(field.provenance).toBe(ZB1_FIELD_PROVENANCE);
    expect(field.provenance).not.toBe('USER_CONFIRMED');
  }
  for (const tire of extract.fields.registeredTireDimensions) {
    expect(tire.provenance).toBe(ZB1_FIELD_PROVENANCE);
  }
}

describe('zb1-registration-certificate.parser', () => {
  it('parses a valid ZB-I OCR sample with German units', () => {
    const text = `
D.1 VOLKSWAGEN AG
D.2 ABCD / XY
D.3 GOLF
E ${VALID_FIN}
P.1 1.998 cm³
P.2 110 kW
P.3 Benzin
2.1 0603
2.2 123
F.1 1950 kg
G 1420 kg
Reifen 225/45 R17 91V
`;
    const result = parseZb1RegistrationCertificateFromOcr({ text });
    expect(result.schemaVersion).toBe(ZB1_REGISTRATION_CERTIFICATE_SCHEMA_VERSION);
    expect(result.fields.d1Manufacturer.value).toBe('VOLKSWAGEN AG');
    expect(result.fields.p1DisplacementCc.value).toBe(1998);
    expect(result.fields.p2NominalPowerKw.value).toBe(110);
    expect(result.fields.eVin.value).toBe(VALID_FIN);
    expect(result.fields.eVin.extractionStatus).toBe('EXTRACTED');
    expect(result.fields.hsnCode21.value).toBe('0603');
    expect(result.fields.tsnCode22.value).toBe('123');
    expect(result.fields.f1PermissibleTotalMassKg.value).toBe(1950);
    expect(result.fields.gKerbMassKg.value).toBe(1420);
    expect(result.fields.registeredTireDimensions).toHaveLength(1);
    expect(result.fields.registeredTireDimensions[0]?.value).toBe('225/45 R17 91V');
    expect(result.p2PowerSemantics).toEqual(ZB1_P2_SEMANTICS);
    expect(result.warnings.some((w) => w.includes('P.2'))).toBe(true);
    assertAllProvenanceDocumentExtracted(result);
    for (const field of Object.values(result.fields)) {
      if (Array.isArray(field)) continue;
      expect(field.confidence).toBeNull();
    }
  });

  it('returns MISSING for absent fields', () => {
    const result = parseZb1RegistrationCertificateFromOcr({ text: 'Leeres Dokument' });
    expect(result.fields.d1Manufacturer.extractionStatus).toBe('MISSING');
    expect(result.fields.eVin.extractionStatus).toBe('MISSING');
    expect(result.fields.registeredTireDimensions).toHaveLength(0);
  });

  it('marks unreadable field tokens', () => {
    const text = 'D.1 ?????\nP.1 unleserlich';
    const result = parseZb1RegistrationCertificateFromOcr({ text });
    expect(result.fields.d1Manufacturer.extractionStatus).toBe('UNREADABLE');
    expect(result.fields.p1DisplacementCc.extractionStatus).toBe('UNREADABLE');
  });

  it('marks ambiguous duplicate labels', () => {
    const text = 'D.1 BMW AG\nD.1 AUDI AG';
    const result = parseZb1RegistrationCertificateFromOcr({ text });
    expect(result.fields.d1Manufacturer.extractionStatus).toBe('AMBIGUOUS');
  });

  it('marks invalid FIN', () => {
    const badFin = '1HGCM82633A004351';
    const text = `E ${badFin}`;
    const result = parseZb1RegistrationCertificateFromOcr({ text });
    expect(result.fields.eVin.extractionStatus).toBe('INVALID');
    expect(validateVinFin(badFin).status).toBe('INVALID');
  });

  it('supports multi-page OCR input', () => {
    const result = parseZb1RegistrationCertificateFromOcr({
      text: '',
      pages: [
        { pageNumber: 1, text: 'D.1 TESLA', sourceMethod: 'OCR', hasReliablePageBoundaries: true },
        {
          pageNumber: 2,
          text: `E ${VALID_FIN}\nP.2 150 kW`,
          sourceMethod: 'OCR',
          hasReliablePageBoundaries: true,
        },
      ],
    });
    expect(result.fields.d1Manufacturer.value).toBe('TESLA');
    expect(result.fields.p2NominalPowerKw.value).toBe(150);
  });

  it('handles hybrid P.3 without promoting P.2 to system power', () => {
    const text = `
D.1 BMW
P.2 85 kW
P.3 Plug-in Hybrid / Diesel
`;
    const result = parseZb1RegistrationCertificateFromOcr({ text });
    expect(result.fields.p3FuelOrEnergy.value).toMatch(/Hybrid/i);
    expect(result.fields.p2NominalPowerKw.value).toBe(85);
    expect(result.warnings).toContain(ZB1_P2_SEMANTICS.message);
  });

  it('does not assign USER_CONFIRMED provenance', () => {
    const result = parseZb1RegistrationCertificateFromOcr({
      text: `D.1 AUDI\nE ${VALID_FIN}`,
    });
    assertAllProvenanceDocumentExtracted(result);
    const provenances = new Set<string>();
    for (const f of Object.values(result.fields)) {
      if (Array.isArray(f)) {
        f.forEach((t) => provenances.add(t.provenance));
      } else {
        provenances.add(f.provenance);
      }
    }
    expect(provenances.has('USER_CONFIRMED')).toBe(false);
  });
});

describe('zb1-registration-certificate.processor.util (offline)', () => {
  it('does not invoke external providers — parser-only', () => {
    const { buildZb1RegistrationCertificateExtractionArtifacts } = require('./zb1-registration-certificate.processor.util');
    const artifacts = buildZb1RegistrationCertificateExtractionArtifacts({
      resolvedSchema: {
        legacyDocumentType: 'REGISTRATION_CERTIFICATE',
        documentSubtype: 'REGISTRATION_CERTIFICATE',
        fields: [],
        requiredFields: [],
      },
      documentContent: {
        text: `D.1 VW\nE ${VALID_FIN}`,
        pages: [],
        pageBoundaryReliable: true,
        sourceMethod: 'OCR',
      },
    });
    expect(artifacts.agentResult.success).toBe(true);
    expect(artifacts.fields.zb1RegistrationCertificate).toBeDefined();
    expect((artifacts.fields.zb1RegistrationCertificate as { schemaVersion: string }).schemaVersion).toBe(
      ZB1_REGISTRATION_CERTIFICATE_SCHEMA_VERSION,
    );
  });
});
