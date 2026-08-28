import type {
  VehicleDocumentCategoryId,
  VehicleDocumentCategorySummary,
  VehicleDocumentUiStatus,
} from '../../lib/vehicle-file-summary.types';

export const MANDATORY_CATEGORY_IDS: VehicleDocumentCategoryId[] = [
  'registration',
  'insurance',
  'tax',
  'leasing_financing',
];

export const CATEGORY_TO_DOC_TYPE: Record<VehicleDocumentCategoryId, string> = {
  registration: 'VEHICLE_CONDITION',
  insurance: 'OTHER',
  tax: 'INVOICE',
  leasing_financing: 'INVOICE',
  tuv_hu: 'TUV_REPORT',
  bokraft: 'BOKRAFT_REPORT',
  service_proof: 'SERVICE',
  repair_proof: 'INVOICE',
  tire_proof: 'TIRE',
  brake_proof: 'BRAKE',
  battery_proof: 'BATTERY',
  damage_accident: 'DAMAGE',
  other: 'OTHER',
};

export interface CategoryUiMeta {
  icon: string;
  tone: 'brand' | 'info' | 'success' | 'warning' | 'critical' | 'neutral';
}

export const CATEGORY_UI_META: Record<VehicleDocumentCategoryId, CategoryUiMeta> = {
  registration: { icon: 'car', tone: 'brand' },
  insurance: { icon: 'shield', tone: 'success' },
  tax: { icon: 'receipt', tone: 'warning' },
  leasing_financing: { icon: 'credit-card', tone: 'info' },
  tuv_hu: { icon: 'clipboard-check', tone: 'success' },
  bokraft: { icon: 'shield-check', tone: 'info' },
  service_proof: { icon: 'wrench', tone: 'info' },
  repair_proof: { icon: 'file-signature', tone: 'neutral' },
  tire_proof: { icon: 'circle', tone: 'neutral' },
  brake_proof: { icon: 'disc', tone: 'neutral' },
  battery_proof: { icon: 'battery', tone: 'neutral' },
  damage_accident: { icon: 'alert-triangle', tone: 'critical' },
  other: { icon: 'file', tone: 'neutral' },
};

const STATUS_SORT_RANK: Record<VehicleDocumentUiStatus, number> = {
  expired: 0,
  error: 1,
  missing: 2,
  needs_review: 3,
  processing: 4,
  uploaded: 5,
  expiring_soon: 6,
  verified: 7,
  applied: 8,
  archived: 9,
};

export function categorySortPriority(cat: VehicleDocumentCategorySummary): number {
  let rank = STATUS_SORT_RANK[cat.uiStatus] ?? 50;
  if (cat.complianceDisplay?.status === 'critical') rank -= 20;
  if (cat.uiStatus === 'missing' && MANDATORY_CATEGORY_IDS.includes(cat.id)) rank -= 5;
  if (cat.uiStatus === 'needs_review') rank -= 3;
  return rank;
}

export function sortDocumentCategories(
  categories: VehicleDocumentCategorySummary[],
): VehicleDocumentCategorySummary[] {
  return [...categories].sort((a, b) => categorySortPriority(a) - categorySortPriority(b));
}
