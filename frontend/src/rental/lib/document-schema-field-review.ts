/** Schema-driven field review builder for document intake V2. */

import {
  formatCentsForDisplay,
  formatIsoDateForDisplay,
  parseCurrencyDisplayToCents,
  parseDisplayDateToIso,
  resolveDateLocale,
  type ExtractionFieldType,
} from './document-extraction-field-format';
import type {
  PublicDocumentSchemaField,
  PublicDocumentSubtypeSchema,
  PublicFieldProvenance,
} from './document-extraction.types';
import type { Plausibility, PlausibilityCheck, PlausibilityStatus } from '../components/documents/document-extraction.shared';

export type SchemaReviewField = {
  key: string;
  label: string;
  labelKey?: string;
  fieldType: ExtractionFieldType;
  uiGroup: string;
  order: number;
  required: boolean;
  sensitive: boolean;
  enumValues?: string[];
  unit?: string | null;
  value: string;
  isMissing: boolean;
  provenance: PublicFieldProvenance | null;
  showConfidence: boolean;
  confidencePercent: number | null;
  fieldChecks: PlausibilityCheck[];
  showSource: boolean;
};

export type SchemaReviewGroup = {
  id: string;
  labelKey: string;
  fields: SchemaReviewField[];
};

const CURRENCY_KEY_PATTERN = /(cents|gross|net|tax|amount|cost)/i;
const MULTILINE_KEY_PATTERN = /(description|summary|notes|defects|deadlines|actionRequired|mentionedEntities)/i;

const UNIT_BY_KEY: Record<string, string> = {
  odometerKm: 'km',
  mileage: 'km',
  nextServiceMileageKm: 'km',
  nextOilChangeMileageKm: 'km',
  quantityLiters: 'L',
  voltageV: 'V',
  restingVoltage: 'V',
  sohPercent: '%',
  capacityKwh: 'kWh',
  capacityAh: 'Ah',
  temperatureC: '°C',
  taxRatePercent: '%',
};

export function isCurrencySchemaField(key: string): boolean {
  return CURRENCY_KEY_PATTERN.test(key);
}

export function resolveSchemaFieldType(field: PublicDocumentSchemaField): ExtractionFieldType {
  if (field.type === 'date') return 'date';
  if (field.type === 'number' && isCurrencySchemaField(field.key)) return 'currency';
  if (MULTILINE_KEY_PATTERN.test(field.key) || field.hint?.toLowerCase().includes('multiline')) {
    return 'multiline';
  }
  return 'text';
}

export function resolveSchemaFieldUnit(key: string): string | null {
  if (UNIT_BY_KEY[key]) return UNIT_BY_KEY[key];
  if (key.endsWith('Mm')) return 'mm';
  if (key.endsWith('Km')) return 'km';
  if (key.endsWith('Bar')) return 'bar';
  if (key.endsWith('Percent') || key.endsWith('Pct')) return '%';
  return null;
}

function readNestedValue(source: Record<string, unknown> | null | undefined, key: string): unknown {
  if (!source) return undefined;
  if (!key.includes('.')) return source[key];
  const [parent, child] = key.split('.');
  const obj = source[parent];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return undefined;
  return (obj as Record<string, unknown>)[child];
}

function rawToString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

export function formatSchemaFieldValue(
  fieldType: ExtractionFieldType,
  raw: unknown,
  locale: string,
  currencyCode?: string | null,
): string {
  const asString = rawToString(raw);
  if (!asString) return '';
  switch (fieldType) {
    case 'date':
      return formatIsoDateForDisplay(asString, locale) || asString;
    case 'currency':
      return formatCentsForDisplay(asString, locale, currencyCode ?? 'EUR');
    default:
      return asString;
  }
}

export function maskSensitiveValue(value: string, sensitive: boolean): string {
  if (!sensitive || !value.trim()) return value;
  const trimmed = value.trim();
  if (trimmed.length <= 4) return '••••';
  const maskLen = Math.min(Math.max(trimmed.length - 4, 4), 10);
  return `${trimmed.slice(0, 2)}${'•'.repeat(maskLen)}${trimmed.slice(-2)}`;
}

function normalizePlausibilityStatus(status: string): PlausibilityStatus {
  if (status === 'BLOCKER') return 'BLOCKER';
  if (status === 'WARNING') return 'WARNING';
  return 'OK';
}

function matchChecksForField(checks: PlausibilityCheck[], fieldKey: string): PlausibilityCheck[] {
  const root = fieldKey.split('.')[0];
  return checks.filter((check) => {
    const fieldPaths = (check as PlausibilityCheck & { fieldPaths?: string[] }).fieldPaths;
    if (fieldPaths?.some((path) => path === fieldKey || path.startsWith(`${root}.`) || path === root)) {
      return true;
    }
    const haystack = `${check.code} ${check.message}`.toLowerCase();
    return haystack.includes(fieldKey.toLowerCase()) || haystack.includes(root.toLowerCase());
  });
}

function shouldShowConfidence(provenance: PublicFieldProvenance | null): boolean {
  if (!provenance || provenance.confidence == null) return false;
  if (provenance.sourceType === 'user_confirmed' || provenance.sourceType === 'user_correction') {
    return false;
  }
  if (provenance.manuallyEdited) return false;
  return provenance.confidence < 0.9;
}

function resolveInitialRawValue(
  key: string,
  extracted: Record<string, unknown> | null | undefined,
  confirmed: Record<string, unknown> | null | undefined,
  provenance: PublicFieldProvenance | null,
): unknown {
  const saved = readNestedValue(confirmed, key);
  if (saved != null && saved !== '') return saved;
  if (provenance?.confirmedValue != null && provenance.confirmedValue !== '') {
    return provenance.confirmedValue;
  }
  return readNestedValue(extracted, key);
}

export function buildSchemaReviewGroups(input: {
  schema: PublicDocumentSubtypeSchema | null;
  extractedData?: Record<string, unknown> | null;
  confirmedData?: Record<string, unknown> | null;
  fieldProvenance?: PublicFieldProvenance[] | null;
  plausibility?: Plausibility | null;
  locale?: string;
  showSourceByDefault?: boolean;
}): SchemaReviewGroup[] {
  if (!input.schema?.fields?.length) return [];

  const locale = resolveDateLocale(input.locale);
  const provenanceByKey = new Map(
    (input.fieldProvenance ?? []).map((row) => [row.fieldKey, row]),
  );
  const checks = input.plausibility?.checks ?? [];
  const currencyCode =
    typeof input.extractedData?.currency === 'string'
      ? input.extractedData.currency
      : typeof input.confirmedData?.currency === 'string'
        ? input.confirmedData.currency
        : 'EUR';

  const groups = new Map<string, SchemaReviewField[]>();

  for (const field of [...input.schema.fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
    const fieldType = resolveSchemaFieldType(field);
    const provenance = provenanceByKey.get(field.key) ?? null;
    const raw = resolveInitialRawValue(
      field.key,
      input.extractedData ?? null,
      input.confirmedData ?? null,
      provenance,
    );
    const value = formatSchemaFieldValue(fieldType, raw, locale, currencyCode);
    const isMissing = field.required === true && (raw == null || rawToString(raw).trim() === '');
    const fieldChecks = matchChecksForField(checks, field.key).map((check) => ({
      ...check,
      status: normalizePlausibilityStatus(check.status),
    }));

    const row: SchemaReviewField = {
      key: field.key,
      label: field.label,
      labelKey: field.labelKey,
      fieldType,
      uiGroup: field.uiGroup ?? 'general',
      order: field.order ?? 0,
      required: field.required === true,
      sensitive: field.sensitive === true,
      enumValues: field.enumValues,
      unit: resolveSchemaFieldUnit(field.key),
      value,
      isMissing,
      provenance,
      showConfidence: shouldShowConfidence(provenance),
      confidencePercent:
        provenance?.confidence != null ? Math.round(provenance.confidence * 100) : null,
      fieldChecks,
      showSource: input.showSourceByDefault === true,
    };

    const groupId = row.uiGroup;
    const list = groups.get(groupId) ?? [];
    list.push(row);
    groups.set(groupId, list);
  }

  return [...groups.entries()].map(([id, fields]) => ({
    id,
    labelKey: `docUpload.fieldReview.group.${id}`,
    fields,
  }));
}

export function flattenSchemaReviewGroups(groups: SchemaReviewGroup[]): SchemaReviewField[] {
  return groups.flatMap((group) => group.fields);
}

export function parseSchemaReviewFieldsForSave(
  fields: SchemaReviewField[],
  options?: { locale?: string },
): Record<string, unknown> {
  const locale = resolveDateLocale(options?.locale);
  const confirmedData: Record<string, unknown> = {};

  for (const field of fields) {
    const trimmed = field.value.trim();
    let value: unknown = trimmed === '' ? null : trimmed;
    if (trimmed !== '') {
      if (field.fieldType === 'date') {
        value = parseDisplayDateToIso(trimmed, locale) ?? trimmed;
      } else if (field.fieldType === 'currency') {
        value = parseCurrencyDisplayToCents(trimmed);
      }
    }

    if (field.key.includes('.')) {
      const [parent, child] = field.key.split('.');
      if (!confirmedData[parent] || typeof confirmedData[parent] !== 'object') {
        confirmedData[parent] = {};
      }
      (confirmedData[parent] as Record<string, unknown>)[child] = value;
    } else {
      confirmedData[field.key] = value;
    }
  }

  return confirmedData;
}

const META_CONFIRMED_KEYS = new Set(['acceptedEntityLinks']);

export function hasSavedFieldReview(confirmedData: unknown): boolean {
  if (!confirmedData || typeof confirmedData !== 'object' || Array.isArray(confirmedData)) {
    return false;
  }
  return Object.keys(confirmedData as Record<string, unknown>).some((key) => !META_CONFIRMED_KEYS.has(key));
}

export function schemaReviewValuesEqual(a: SchemaReviewField[], b: SchemaReviewField[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((field, index) => field.value === b[index]?.value);
}

export function countSchemaReviewIssues(groups: SchemaReviewGroup[]): {
  missingRequired: number;
  blockers: number;
  warnings: number;
} {
  const fields = flattenSchemaReviewGroups(groups);
  let missingRequired = 0;
  let blockers = 0;
  let warnings = 0;

  for (const field of fields) {
    if (field.isMissing) missingRequired += 1;
    for (const check of field.fieldChecks) {
      if (check.status === 'BLOCKER') blockers += 1;
      if (check.status === 'WARNING') warnings += 1;
    }
  }

  return { missingRequired, blockers, warnings };
}
