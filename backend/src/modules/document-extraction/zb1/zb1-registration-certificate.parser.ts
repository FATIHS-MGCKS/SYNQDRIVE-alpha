import type { DocumentPageBlock } from '../document-page.types';
import {
  buildEmptyZb1RegistrationCertificateExtract,
  zb1Field,
  emptyZb1Field,
  type Zb1RegistrationCertificateExtract,
  type Zb1ExtractedField,
} from './zb1-registration-certificate.contract';
import {
  normalizeHsnTsn,
  parseGermanDisplacementCc,
  parseGermanPowerKw,
  parseMassKg,
  validateVinFin,
} from './zb1-registration-certificate.validator';

export type Zb1OcrDocumentInput = {
  text: string;
  pages?: DocumentPageBlock[];
};

const FIELD_LABEL_PATTERNS: Array<{ code: 'D.1' | 'D.2' | 'D.3' | 'E' | 'P.1' | 'P.2' | 'P.3' | '2.1' | '2.2' | 'F.1' | 'G'; pattern: RegExp }> = [
  { code: 'D.1', pattern: /\bD\.?\s*1\b[)\s.:]*([^\n]+)/gi },
  { code: 'D.2', pattern: /\bD\.?\s*2\b[)\s.:]*([^\n]+)/gi },
  { code: 'D.3', pattern: /\bD\.?\s*3\b[)\s.:]*([^\n]+)/gi },
  {
    code: 'E',
    pattern: /\bE\b[)\s.:]*([A-HJ-NPR-Z0-9]{17})\b/gi,
  },
  { code: 'P.1', pattern: /\bP\.?\s*1\b[)\s.:]*([^\n]+)/gi },
  { code: 'P.2', pattern: /\bP\.?\s*2\b[)\s.:]*([^\n]+)/gi },
  { code: 'P.3', pattern: /\bP\.?\s*3\b[)\s.:]*([^\n]+)/gi },
  { code: '2.1', pattern: /\b2\.?\s*1\b[)\s.:]*([^\n]+)/gi },
  { code: '2.2', pattern: /\b2\.?\s*2\b[)\s.:]*([^\n]+)/gi },
  { code: 'F.1', pattern: /\bF\.?\s*1\b[)\s.:]*([^\n]+)/gi },
  { code: 'G', pattern: /(?:^|\n)\s*G\b[)\s.:]*([^\n]+)/gi },
];

const TIRE_DIMENSION_PATTERN =
  /\b(\d{3})\s*\/\s*(\d{2})\s+(?:ZR|R)\s*(\d{2})(?:\s+(\d{2,3})\s*([A-Z]))?/gi;

function collectMatches(text: string, pattern: RegExp): string[] {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const captured = (m[1] ?? m[0]).trim();
    if (captured) out.push(captured);
  }
  return out;
}

function pickSingleOrAmbiguous(
  code: 'D.1' | 'D.2' | 'D.3' | 'E' | 'P.1' | 'P.2' | 'P.3' | '2.1' | '2.2' | 'F.1' | 'G',
  values: string[],
): Zb1ExtractedField<string | null> {
  if (values.length === 0) return emptyZb1Field(code, 'MISSING');
  const unique = [...new Set(values.map((v) => v.trim()).filter(Boolean))];
  if (unique.length > 1) {
    return zb1Field(code, unique[0] ?? null, 'AMBIGUOUS');
  }
  const raw = unique[0] ?? null;
  if (!raw || /^[?#*x]+$/i.test(raw) || /unleserlich/i.test(raw)) {
    return zb1Field(code, null, 'UNREADABLE');
  }
  return zb1Field(code, raw, 'EXTRACTED');
}

function extractTireFields(text: string): Zb1ExtractedField<string | null>[] {
  const re = new RegExp(TIRE_DIMENSION_PATTERN.source, 'gi');
  const seen = new Set<string>();
  const fields: Zb1ExtractedField<string | null>[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const normalized = `${m[1]}/${m[2]} R${m[3]}${m[4] && m[5] ? ` ${m[4]}${m[5]}` : ''}`;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    fields.push(zb1Field('TIRE', normalized, 'EXTRACTED'));
  }
  return fields;
}

function joinDocumentText(input: Zb1OcrDocumentInput): string {
  if (input.pages?.length) {
    return input.pages.map((p) => p.text ?? '').join('\n\n');
  }
  return input.text ?? '';
}

/**
 * Deterministic ZB-I parser over Mistral OCR markdown (no live LLM calls).
 */
export function parseZb1RegistrationCertificateFromOcr(
  input: Zb1OcrDocumentInput,
): Zb1RegistrationCertificateExtract {
  const text = joinDocumentText(input);
  const base = buildEmptyZb1RegistrationCertificateExtract();
  const warnings: string[] = [];

  const byCode: Record<string, string[]> = {};
  for (const { code, pattern } of FIELD_LABEL_PATTERNS) {
    byCode[code] = collectMatches(text, pattern);
  }

  const d1 = pickSingleOrAmbiguous('D.1', byCode['D.1'] ?? []);
  const d2 = pickSingleOrAmbiguous('D.2', byCode['D.2'] ?? []);
  const d3 = pickSingleOrAmbiguous('D.3', byCode['D.3'] ?? []);

  const eRaw = pickSingleOrAmbiguous('E', byCode.E ?? []);
  const vinValidation = validateVinFin(eRaw.value);
  const eVin = zb1Field('E', vinValidation.normalized, vinValidation.status);
  if (vinValidation.reason) warnings.push(vinValidation.reason);

  const p1Raw = pickSingleOrAmbiguous('P.1', byCode['P.1'] ?? []);
  const displacement = parseGermanDisplacementCc(p1Raw.value);
  const p1 =
    p1Raw.extractionStatus === 'EXTRACTED' && displacement == null
      ? zb1Field('P.1', null, 'UNREADABLE')
      : zb1Field('P.1', displacement, displacement != null ? 'EXTRACTED' : p1Raw.extractionStatus);

  const p2Raw = pickSingleOrAmbiguous('P.2', byCode['P.2'] ?? []);
  const p2Kw = parseGermanPowerKw(p2Raw.value);
  const p2 =
    p2Raw.extractionStatus === 'AMBIGUOUS'
      ? zb1Field('P.2', p2Kw, 'AMBIGUOUS')
      : p2Kw != null
        ? zb1Field('P.2', p2Kw, 'EXTRACTED')
        : zb1Field('P.2', null, p2Raw.extractionStatus === 'MISSING' ? 'MISSING' : 'UNREADABLE');

  if (p2.value != null) {
    warnings.push(base.p2PowerSemantics.message);
  }

  const p3 = pickSingleOrAmbiguous('P.3', byCode['P.3'] ?? []);

  const hsnRaw = pickSingleOrAmbiguous('2.1', byCode['2.1'] ?? []);
  const hsn = normalizeHsnTsn(hsnRaw.value, 'HSN');
  const hsnCode21 = zb1Field(
    '2.1',
    hsn,
    hsn != null ? 'EXTRACTED' : hsnRaw.extractionStatus === 'MISSING' ? 'MISSING' : 'UNREADABLE',
  );

  const tsnRaw = pickSingleOrAmbiguous('2.2', byCode['2.2'] ?? []);
  const tsn = normalizeHsnTsn(tsnRaw.value, 'TSN');
  const tsnCode22 = zb1Field(
    '2.2',
    tsn,
    tsn != null ? 'EXTRACTED' : tsnRaw.extractionStatus === 'MISSING' ? 'MISSING' : 'UNREADABLE',
  );

  const f1Raw = pickSingleOrAmbiguous('F.1', byCode['F.1'] ?? []);
  const f1Kg = parseMassKg(f1Raw.value);
  const f1PermissibleTotalMassKg = zb1Field(
    'F.1',
    f1Kg,
    f1Kg != null ? 'EXTRACTED' : f1Raw.extractionStatus === 'MISSING' ? 'MISSING' : 'UNREADABLE',
  );

  const gRaw = pickSingleOrAmbiguous('G', byCode.G ?? []);
  const gKg = parseMassKg(gRaw.value);
  const gKerbMassKg = zb1Field(
    'G',
    gKg,
    gKg != null ? 'EXTRACTED' : gRaw.extractionStatus === 'MISSING' ? 'MISSING' : 'UNREADABLE',
  );

  const tires = extractTireFields(text);

  return {
    schemaVersion: base.schemaVersion,
    p2PowerSemantics: base.p2PowerSemantics,
    warnings,
    fields: {
      d1Manufacturer: d1,
      d2TypeVariantVersion: d2,
      d3TradeName: d3,
      eVin,
      p1DisplacementCc: p1,
      p2NominalPowerKw: p2,
      p3FuelOrEnergy: p3,
      hsnCode21,
      tsnCode22,
      f1PermissibleTotalMassKg,
      gKerbMassKg,
      registeredTireDimensions: tires,
    },
  };
}

/** Stored on VehicleDocumentExtraction.extractedData. */
export function zb1ExtractToStoredPayload(
  extract: Zb1RegistrationCertificateExtract,
): Record<string, unknown> {
  return {
    zb1RegistrationCertificate: extract,
  };
}
