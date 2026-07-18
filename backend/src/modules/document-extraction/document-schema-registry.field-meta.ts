import type { FieldDef } from './document-extraction.schemas';
import type { DocumentUiFieldMetadata } from './document-schema-registry.types';

const SENSITIVE_FIELD_KEYS = new Set([
  'sender',
  'recipient',
  'customer',
  'customerName',
  'customerNumber',
  'driverName',
  'lesseeName',
  'licensePlate',
  'vin',
  'iban',
  'email',
  'phone',
  'addressee',
  'billTo',
  'invoiceTitle',
  'vendorName',
  'supplier',
  'supplierName',
  'mentionedEntities',
]);

const UI_GROUP_BY_KEY: Record<string, string> = {
  eventDate: 'event',
  offenseDate: 'event',
  documentDate: 'event',
  measurementDate: 'event',
  dueDate: 'deadlines',
  deadlines: 'deadlines',
  licensePlate: 'vehicle',
  vin: 'vehicle',
  odometerKm: 'vehicle',
  invoiceNumber: 'finance',
  totalCents: 'finance',
  costCents: 'finance',
  offenseType: 'offense',
  location: 'offense',
  issuingAuthority: 'authority',
  sender: 'parties',
  recipient: 'parties',
  customerName: 'parties',
  summary: 'content',
  description: 'content',
  subject: 'content',
};

export function isSensitiveDocumentField(key: string): boolean {
  if (SENSITIVE_FIELD_KEYS.has(key)) return true;
  const root = key.split('.')[0];
  return SENSITIVE_FIELD_KEYS.has(root);
}

export function buildUiFieldMetadata(
  fields: FieldDef[],
  requiredFields: readonly string[],
): DocumentUiFieldMetadata[] {
  const required = new Set(requiredFields);
  return fields.map((field, index) => ({
    ...field,
    required: required.has(field.key),
    sensitive: isSensitiveDocumentField(field.key),
    uiGroup: UI_GROUP_BY_KEY[field.key] ?? UI_GROUP_BY_KEY[field.key.split('.')[0]] ?? 'general',
    order: index + 1,
    labelKey: `documentExtraction.field.${field.key.replace(/\./g, '_')}`,
  }));
}
