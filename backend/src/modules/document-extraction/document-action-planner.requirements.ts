import type { DocumentCategory, DocumentEntityType, DocumentExtractionType } from '@prisma/client';
import type {
  DocumentActionMissingRequirement,
  DocumentActionPlannerInput,
} from './document-action-planner.types';
import { hasConfirmedFieldValue } from './document-required-field.evaluator';
import { resolveDocumentRequiredFieldProfile } from './document-required-field.resolver';

const VEHICLE_SCOPED_TYPES = new Set<DocumentExtractionType>([
  'SERVICE',
  'OIL_CHANGE',
  'TUV_REPORT',
  'BOKRAFT_REPORT',
  'TIRE',
  'BRAKE',
  'BATTERY',
  'DAMAGE',
  'ACCIDENT',
  'VEHICLE_CONDITION',
  'FINE',
]);

function profileInputFromRouting(
  routingType: DocumentExtractionType,
  confirmedData: Record<string, unknown>,
): Pick<
  DocumentActionPlannerInput,
  'effectiveDocumentType' | 'documentSubtype' | 'documentCategory' | 'confirmedData' | 'entityLinks'
> {
  return {
    effectiveDocumentType: routingType,
    documentSubtype: null,
    documentCategory: 'SERVICE',
    confirmedData,
    entityLinks: [],
  };
}

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

export function collectFieldMissingRequirements(
  routingType: DocumentExtractionType | null,
  confirmedData: Record<string, unknown>,
): DocumentActionMissingRequirement[] {
  if (!routingType || routingType === 'AUTO' || routingType === 'OTHER' || routingType === 'VEHICLE_CONDITION') {
    return [];
  }

  const profile = resolveDocumentRequiredFieldProfile(
    profileInputFromRouting(routingType, confirmedData),
  );
  const missingKeys = profile.requiredForApply.filter(
    (key) => !hasConfirmedFieldValue(confirmedData, key),
  );

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
