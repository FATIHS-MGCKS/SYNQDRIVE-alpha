import {
  DocumentExtractionStatus,
  DocumentExtractionType,
  type VehicleDocumentExtraction,
} from '@prisma/client';
import type {
  VehicleDocumentCategoryId,
  VehicleDocumentCategorySummary,
  VehicleDocumentExtractionSummary,
  VehicleDocumentUiStatus,
} from './vehicle-file-summary.types';

const CATEGORY_DEFS: Array<{ id: VehicleDocumentCategoryId; label: string }> = [
  { id: 'registration', label: 'Zulassung / Registration' },
  { id: 'insurance', label: 'Versicherung / Insurance' },
  { id: 'tax', label: 'Kfz-Steuer / Tax' },
  { id: 'leasing_financing', label: 'Leasing / Finanzierung' },
  { id: 'tuv_hu', label: 'HU / TÜV' },
  { id: 'bokraft', label: 'BOKraft' },
  { id: 'service_proof', label: 'Service-Nachweise' },
  { id: 'repair_proof', label: 'Reparatur-Nachweise' },
  { id: 'tire_proof', label: 'Reifen-Nachweise' },
  { id: 'brake_proof', label: 'Bremsen-Nachweise' },
  { id: 'battery_proof', label: 'Batterie-Nachweise' },
  { id: 'damage_accident', label: 'Damage / Accident' },
  { id: 'other', label: 'Sonstige' },
];

const TYPE_TO_CATEGORY: Partial<Record<DocumentExtractionType, VehicleDocumentCategoryId>> = {
  TUV_REPORT: 'tuv_hu',
  BOKRAFT_REPORT: 'bokraft',
  SERVICE: 'service_proof',
  OIL_CHANGE: 'service_proof',
  INVOICE: 'repair_proof',
  TIRE: 'tire_proof',
  BRAKE: 'brake_proof',
  BATTERY: 'battery_proof',
  DAMAGE: 'damage_accident',
  ACCIDENT: 'damage_accident',
  VEHICLE_CONDITION: 'registration',
  FINE: 'other',
  OTHER: 'other',
};

export function resolveRowDocumentType(row: VehicleDocumentExtraction): DocumentExtractionType {
  const resolved = row.effectiveDocumentType ?? row.documentType;
  if (!resolved || resolved === 'AUTO') {
    return 'OTHER';
  }
  return resolved;
}

export function extractionToUiStatus(status: DocumentExtractionStatus): VehicleDocumentUiStatus {
  switch (status) {
    case 'PENDING':
    case 'QUEUED':
      return 'uploaded';
    case 'PROCESSING':
      return 'processing';
    case 'AWAITING_DOCUMENT_TYPE':
      return 'needs_review';
    case 'READY_FOR_REVIEW':
      return 'needs_review';
    case 'CONFIRMED':
      return 'verified';
    case 'APPLIED':
      return 'applied';
    case 'FAILED':
      return 'error';
    case 'REJECTED':
    case 'CANCELLED':
      return 'archived';
    default:
      return 'uploaded';
  }
}

export function toExtractionSummary(row: VehicleDocumentExtraction): VehicleDocumentExtractionSummary {
  return {
    id: row.id,
    documentType: resolveRowDocumentType(row),
    status: row.status,
    sourceFileName: row.sourceFileName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    appliedAt: row.appliedAt?.toISOString() ?? null,
    errorMessage: row.errorMessage,
    uiStatus: extractionToUiStatus(row.status),
  };
}

function bestDocumentStatus(statuses: VehicleDocumentUiStatus[]): VehicleDocumentUiStatus {
  if (statuses.length === 0) return 'missing';
  const rank: Record<VehicleDocumentUiStatus, number> = {
    needs_review: 7,
    processing: 6,
    error: 5,
    uploaded: 4,
    applied: 3,
    verified: 3,
    expiring_soon: 2,
    expired: 2,
    archived: 1,
    missing: 0,
  };
  return statuses.sort((a, b) => rank[b] - rank[a])[0];
}

export function buildDocumentCategories(input: {
  extractions: VehicleDocumentExtraction[];
  hasInsuranceRecords: boolean;
  hasLeasingMasterData: boolean;
  hasTaxMasterData: boolean;
  complianceCategoryStatus: Partial<
    Record<'tuv_hu' | 'bokraft' | 'service_proof', VehicleDocumentCategorySummary['complianceDisplay']>
  >;
}): VehicleDocumentCategorySummary[] {
  const byCategory = new Map<VehicleDocumentCategoryId, VehicleDocumentExtraction[]>();
  for (const ext of input.extractions) {
    const cat = TYPE_TO_CATEGORY[resolveRowDocumentType(ext)] ?? 'other';
    const list = byCategory.get(cat) ?? [];
    list.push(ext);
    byCategory.set(cat, list);
  }

  return CATEGORY_DEFS.map((def) => {
    const docs = byCategory.get(def.id) ?? [];
    const docStatuses = docs.map((d) => extractionToUiStatus(d.status));
    let uiStatus = bestDocumentStatus(docStatuses);
    let statusSource: VehicleDocumentCategorySummary['statusSource'] =
      docs.length > 0 ? 'document_extraction' : 'not_available';
    const complianceDisplay = input.complianceCategoryStatus[def.id as keyof typeof input.complianceCategoryStatus] ?? null;

    if (def.id === 'insurance' && input.hasInsuranceRecords) {
      uiStatus = uiStatus === 'missing' ? 'verified' : uiStatus;
      statusSource = 'insurance_module';
    }
    if (def.id === 'leasing_financing' && input.hasLeasingMasterData) {
      uiStatus = uiStatus === 'missing' ? 'verified' : uiStatus;
      statusSource = 'vehicle_master_data';
    }
    if (def.id === 'tax' && input.hasTaxMasterData) {
      uiStatus = uiStatus === 'missing' ? 'verified' : uiStatus;
      statusSource = 'vehicle_master_data';
    }

    if (complianceDisplay && (def.id === 'tuv_hu' || def.id === 'bokraft' || def.id === 'service_proof')) {
      uiStatus = complianceDisplay.uiStatus;
      statusSource = 'service_compliance_service';
    }

    const latest = docs[0] ?? null;
    return {
      id: def.id,
      label: def.label,
      uiStatus,
      statusSource,
      documentCount: docs.length,
      latestExtractionId: latest?.id ?? null,
      latestFileName: latest?.sourceFileName ?? null,
      complianceDisplay,
    };
  });
}

export const MANDATORY_DOCUMENT_CATEGORY_IDS: VehicleDocumentCategoryId[] = [
  'registration',
  'insurance',
  'tax',
  'leasing_financing',
];
