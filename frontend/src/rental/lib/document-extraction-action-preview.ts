import type { PublicDocumentExtraction } from './document-extraction.types';

export type DocumentActionPreviewItem = {
  semanticAction: string;
  requirement: 'REQUIRED' | 'OPTIONAL' | 'INFORMATIONAL' | 'SUGGESTION';
  targetModule: string;
  note?: string;
};

const MODULE_BY_DOC_TYPE: Record<string, string> = {
  SERVICE: 'vehicle-service',
  OIL_CHANGE: 'vehicle-service',
  TIRE: 'tires',
  BRAKE: 'brakes',
  BATTERY: 'battery-health',
  TUV_REPORT: 'vehicles',
  BOKRAFT_REPORT: 'vehicles',
  INVOICE: 'invoices',
  FINE: 'fines',
  DAMAGE: 'damages',
  ACCIDENT: 'damages',
  OTHER: 'document-extraction',
  VEHICLE_CONDITION: 'document-extraction',
};

function readSubtypeSchemaActions(
  record: PublicDocumentExtraction,
  schemaRegistry?: { subtypes: Array<{ subtype: string; allowedActions: Array<{ semanticAction: string; requirement: string }> }> } | null,
): DocumentActionPreviewItem[] | null {
  const subtype = record.documentSubtype;
  if (!subtype || !schemaRegistry?.subtypes?.length) return null;
  const entry = schemaRegistry.subtypes.find((row) => row.subtype === subtype);
  if (!entry?.allowedActions?.length) return null;
  return entry.allowedActions.map((action) => ({
    semanticAction: action.semanticAction,
    requirement: action.requirement as DocumentActionPreviewItem['requirement'],
    targetModule: MODULE_BY_DOC_TYPE[record.effectiveDocumentType || record.documentType || 'OTHER'] ?? 'document-extraction',
  }));
}

/** Read-only preview of downstream semantic actions — no apply execution. */
export function buildDocumentActionPreview(
  record: Pick<PublicDocumentExtraction, 'effectiveDocumentType' | 'documentType' | 'documentSubtype' | 'status'> | null,
  options?: {
    schemaRegistry?: { subtypes: Array<{ subtype: string; allowedActions: Array<{ semanticAction: string; requirement: string }> }> } | null;
    blockerPresent?: boolean;
  },
): DocumentActionPreviewItem[] {
  if (!record) return [];
  const docType = record.effectiveDocumentType || record.documentType || 'OTHER';
  const fromRegistry = readSubtypeSchemaActions(record as PublicDocumentExtraction, options?.schemaRegistry ?? null);
  if (fromRegistry?.length) return fromRegistry;

  if (options?.blockerPresent) {
    return [
      {
        semanticAction: 'ARCHIVE_ONLY',
        requirement: 'SUGGESTION',
        targetModule: 'document-extraction',
        note: 'Plausibility blocker — apply blocked',
      },
    ];
  }

  const module = MODULE_BY_DOC_TYPE[docType] ?? 'document-extraction';
  switch (docType) {
    case 'SERVICE':
    case 'OIL_CHANGE':
      return [
        { semanticAction: 'CREATE_SERVICE_EVENT', requirement: 'REQUIRED', targetModule: module },
        { semanticAction: docType === 'OIL_CHANGE' ? 'UPDATE_VEHICLE_OIL_DATES' : 'UPDATE_VEHICLE_SERVICE_DATES', requirement: 'OPTIONAL', targetModule: 'vehicles' },
      ];
    case 'TIRE':
      return [{ semanticAction: 'CREATE_TIRE_MEASUREMENT', requirement: 'REQUIRED', targetModule: module }];
    case 'BRAKE':
      return [
        { semanticAction: 'CREATE_BRAKE_SERVICE', requirement: 'REQUIRED', targetModule: module },
        { semanticAction: 'ADD_BRAKE_EVIDENCE', requirement: 'OPTIONAL', targetModule: module },
      ];
    case 'BATTERY':
      return [
        { semanticAction: 'ADD_BATTERY_EVIDENCE', requirement: 'REQUIRED', targetModule: module },
        { semanticAction: 'OPTIONAL_BATTERY_SNAPSHOT', requirement: 'OPTIONAL', targetModule: module },
      ];
    case 'TUV_REPORT':
      return [{ semanticAction: 'UPDATE_VEHICLE_TUV_DATES', requirement: 'REQUIRED', targetModule: module }];
    case 'BOKRAFT_REPORT':
      return [{ semanticAction: 'UPDATE_VEHICLE_BOKRAFT_DATES', requirement: 'REQUIRED', targetModule: module }];
    case 'INVOICE':
      return [{ semanticAction: 'CREATE_INVOICE_DRAFT', requirement: 'REQUIRED', targetModule: module }];
    case 'FINE':
      return [
        { semanticAction: 'CREATE_FINE_DRAFT', requirement: 'REQUIRED', targetModule: module },
        { semanticAction: 'CREATE_TASK_SUGGESTION', requirement: 'SUGGESTION', targetModule: 'tasks' },
      ];
    case 'DAMAGE':
    case 'ACCIDENT':
      return [{ semanticAction: 'CREATE_DAMAGE_DRAFT', requirement: 'REQUIRED', targetModule: module }];
    default:
      return [{ semanticAction: 'ARCHIVE_ONLY', requirement: 'INFORMATIONAL', targetModule: module }];
  }
}
