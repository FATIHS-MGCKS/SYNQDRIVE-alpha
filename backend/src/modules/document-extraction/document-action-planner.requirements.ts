import type { DocumentCategory, DocumentEntityType, DocumentExtractionType } from '@prisma/client';
import type {
  DocumentActionMissingRequirement,
  DocumentActionPlannerInput,
} from './document-action-planner.types';
import type { ApplyDocumentExtractionType } from './document-extraction.schemas';

const VEHICLE_SCOPED_TYPES = new Set<DocumentExtractionType>([
  'SERVICE',
  'OIL_CHANGE',
  'TUV_REPORT',
  'BOKRAFT_REPORT',
  'BRAKE',
  'TIRE',
  'BATTERY',
  'DAMAGE',
  'ACCIDENT',
  'INVOICE',
  'VEHICLE_CONDITION',
]);

const CRITICAL_FIELD_KEYS: Partial<Record<ApplyDocumentExtractionType, string[]>> = {
  INVOICE: ['invoiceNumber', 'totalCents'],
  TUV_REPORT: ['eventDate', 'validUntil'],
  BOKRAFT_REPORT: ['eventDate', 'validUntil'],
  TIRE: ['treadDepthMm.fl'],
  DAMAGE: ['description'],
  ACCIDENT: ['description', 'eventDate'],
};

export function resolvePlannerRoutingType(
  input: Pick<DocumentActionPlannerInput, 'effectiveDocumentType' | 'documentCategory'>,
): DocumentExtractionType | null {
  if (input.effectiveDocumentType && input.effectiveDocumentType !== 'AUTO') {
    return input.effectiveDocumentType;
  }
  return categoryToDefaultRoutingType(input.documentCategory);
}

function categoryToDefaultRoutingType(
  category: DocumentCategory | null,
): DocumentExtractionType | null {
  switch (category) {
    case 'SERVICE':
      return 'SERVICE';
    case 'MAINTENANCE':
      return null;
    case 'INSPECTION':
      return 'TUV_REPORT';
    case 'FINANCE':
      return null;
    case 'DAMAGE':
      return 'DAMAGE';
    case 'CONDITION':
      return 'VEHICLE_CONDITION';
    case 'GENERAL':
      return 'OTHER';
    default:
      return null;
  }
}

function hasNestedField(data: Record<string, unknown>, key: string): boolean {
  if (!key.includes('.')) {
    const value = data[key];
    return value != null && value !== '';
  }
  const [parent, child] = key.split('.');
  const obj = data[parent];
  if (obj == null || typeof obj !== 'object') return false;
  const nested = (obj as Record<string, unknown>)[child];
  return nested != null && nested !== '';
}

function hasAnyTreadDepth(data: Record<string, unknown>): boolean {
  const tread = data.treadDepthMm;
  if (tread == null || typeof tread !== 'object') return false;
  const record = tread as Record<string, unknown>;
  return ['fl', 'fr', 'rl', 'rr'].some((wheel) => record[wheel] != null && record[wheel] !== '');
}

export function collectFieldMissingRequirements(
  routingType: DocumentExtractionType | null,
  confirmedData: Record<string, unknown>,
): DocumentActionMissingRequirement[] {
  if (!routingType || routingType === 'AUTO' || routingType === 'OTHER' || routingType === 'VEHICLE_CONDITION') {
    return [];
  }

  const applyType = routingType as ApplyDocumentExtractionType;
  const keys = CRITICAL_FIELD_KEYS[applyType] ?? [];
  const missingKeys = keys.filter((key) => {
    if (applyType === 'TIRE' && key.startsWith('treadDepthMm')) {
      return !hasAnyTreadDepth(confirmedData);
    }
    return !hasNestedField(confirmedData, key);
  });

  if (missingKeys.length === 0) return [];

  return [
    {
      code: 'MISSING_CONFIRMED_FIELDS',
      message: `Missing required confirmed fields for ${routingType}: ${missingKeys.join(', ')}`,
      fieldKeys: missingKeys,
    },
  ];
}

export function requiresVehicleEntityLink(routingType: DocumentExtractionType | null): boolean {
  if (!routingType) return false;
  return VEHICLE_SCOPED_TYPES.has(routingType);
}

export function collectEntityMissingRequirements(
  routingType: DocumentExtractionType | null,
  entityLinks: DocumentActionPlannerInput['entityLinks'],
): DocumentActionMissingRequirement[] {
  if (!requiresVehicleEntityLink(routingType)) {
    return [];
  }

  const vehicleLink = entityLinks.find(
    (link) => String(link.entityType).toUpperCase() === 'VEHICLE' && link.entityId?.trim(),
  );
  if (vehicleLink) return [];

  return [
    {
      code: 'MISSING_VEHICLE_ENTITY_LINK',
      message: 'A confirmed VEHICLE entity link is required before downstream apply.',
      entityType: 'VEHICLE' as DocumentEntityType,
    },
  ];
}

export function findVehicleEntityId(
  entityLinks: DocumentActionPlannerInput['entityLinks'],
): string | null {
  const vehicleLink = entityLinks.find(
    (link) => String(link.entityType).toUpperCase() === 'VEHICLE' && link.entityId?.trim(),
  );
  return vehicleLink?.entityId?.trim() ?? null;
}
