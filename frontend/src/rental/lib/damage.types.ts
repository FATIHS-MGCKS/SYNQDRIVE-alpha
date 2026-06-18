export type DamageStatus = 'OPEN' | 'IN_REPAIR' | 'REPAIRED' | 'ARCHIVED';

export type DamageLocationView = 'FRONT' | 'LEFT' | 'RIGHT' | 'REAR' | 'ROOF' | 'UNKNOWN';

export type DamageSource =
  | 'MANUAL'
  | 'PICKUP_HANDOVER'
  | 'RETURN_HANDOVER'
  | 'AI_UPLOAD'
  | 'WORKSHOP'
  | 'INSPECTION';

export type DamageRentalImpact = 'NONE' | 'WATCH' | 'BLOCK_RENTAL' | 'SAFETY_CRITICAL';

export type DamageEvidenceStatus = 'MISSING' | 'PARTIAL' | 'COMPLETE' | 'DISPUTED';

export type DamageSeverity = 'MINOR' | 'MODERATE' | 'MAJOR' | 'CRITICAL';

export type DamageLiabilityStatus =
  | 'NOT_APPLICABLE'
  | 'NEEDS_REVIEW'
  | 'CUSTOMER_RESPONSIBLE'
  | 'COMPANY_RESPONSIBLE'
  | 'INSURANCE_CLAIM'
  | 'DISPUTED';

export interface DamageImageResponse {
  id: string;
  url: string;
  mimeType: string | null;
  caption: string | null;
  createdAt: string;
  uploadedBy: string | null;
}

export interface DamageResponse {
  id: string;
  vehicleId: string;
  damageType: string;
  severity: DamageSeverity;
  status: DamageStatus;
  description: string | null;
  locationView: DamageLocationView;
  locationX: number | null;
  locationY: number | null;
  locationLabel: string | null;
  estimatedCostCents: number | null;
  repairCostCents: number | null;
  chargedToCustomerCents: number | null;
  depositHoldCents: number | null;
  source: DamageSource;
  rentalImpact: DamageRentalImpact;
  evidenceStatus: DamageEvidenceStatus;
  liabilityStatus: DamageLiabilityStatus;
  liabilityNote: string | null;
  reportedBy: string | null;
  reportedAt: string;
  createdAt: string;
  updatedAt: string;
  repairStartedAt: string | null;
  repairedAt: string | null;
  /** Backend compatibility alias — prefer repairedAt */
  resolvedDate?: string | null;
  bookingId?: string | null;
  customerId?: string | null;
  handoverProtocolId?: string | null;
  taskId?: string | null;
  images: DamageImageResponse[];
}

export interface DamageStatsResponse {
  total: number;
  open: number;
  inRepair: number;
  repaired: number;
  archived: number;
  active: number;
  blockingRental: number;
  safetyCritical: number;
  missingEvidence: number;
  unplaced: number;
  estimatedOpenCostCents: number;
  oldestOpenDamageAt: string | null;
  insights?: DamageVehicleInsights;
}

export interface HeatmapCell {
  gridX: number;
  gridY: number;
  count: number;
}

export interface RepeatLocationCluster {
  locationView: DamageLocationView;
  centerX: number;
  centerY: number;
  damageCount: number;
  label: string | null;
}

export interface DamageVehicleInsights {
  hasEnoughData: boolean;
  totalDamages: number;
  mostAffectedView: DamageLocationView | null;
  mostAffectedViewCount: number;
  totalRepairCostCents: number | null;
  totalEstimatedOpenCostCents: number;
  totalChargedToCustomerCents: number | null;
  avgRepairDurationDays: number | null;
  avgRepairDurationSampleSize: number;
  evidenceCompletionRate: number | null;
  openedLast30Days: number;
  repairedLast30Days: number;
  repeatLocationClusters: RepeatLocationCluster[];
  heatmapByView: Partial<Record<DamageLocationView, HeatmapCell[]>>;
}

export interface FleetDamageModelBreakdown {
  modelKey: string;
  make: string;
  model: string;
  damageCount: number;
  activeCount: number;
  blockingCount: number;
}

export interface FleetDamageStatsResponse {
  organizationId: string;
  total: number;
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  byRentalImpact: Record<string, number>;
  byLocationView: Record<string, number>;
  missingEvidence: number;
  unplaced: number;
  vehiclesWithBlockingDamage: number;
  activeBacklog: number;
  avgEstimatedCostCents: number | null;
  avgRepairDurationDays: number | null;
  avgRepairDurationSampleSize: number;
  totalRepairCostCents: number | null;
  totalEstimatedOpenCostCents: number;
  totalChargedToCustomerCents: number | null;
  withBookingContext: number;
  withCustomerContext: number;
  byModel: FleetDamageModelBreakdown[];
}

export interface CreateVehicleDamageInput {
  damageType: string;
  severity?: DamageSeverity;
  description?: string;
  locationView?: DamageLocationView;
  locationX?: number;
  locationY?: number;
  locationLabel?: string;
  estimatedCostCents?: number;
  source?: DamageSource;
  rentalImpact?: DamageRentalImpact;
  reportedBy?: string;
  bookingId?: string;
  customerId?: string;
  handoverProtocolId?: string;
  liabilityStatus?: DamageLiabilityStatus;
  liabilityNote?: string;
  depositHoldCents?: number;
  chargedToCustomerCents?: number;
  images?: { imageData: string; caption?: string }[];
}

/** Matches backend Prisma DamageType enum */
export const DAMAGE_TYPE_OPTIONS = [
  'SCRATCH',
  'DENT',
  'CRACK',
  'BROKEN_PART',
  'PAINT_DAMAGE',
  'GLASS_DAMAGE',
  'TIRE_DAMAGE',
  'INTERIOR_DAMAGE',
  'OTHER',
] as const;

export const DAMAGE_LOCATION_VIEW_OPTIONS: DamageLocationView[] = [
  'UNKNOWN',
  'FRONT',
  'LEFT',
  'RIGHT',
  'REAR',
  'ROOF',
];

export const DAMAGE_RENTAL_IMPACT_OPTIONS: DamageRentalImpact[] = [
  'NONE',
  'WATCH',
  'BLOCK_RENTAL',
  'SAFETY_CRITICAL',
];

export const DESCRIPTION_MAX_LENGTH = 4000;

export const DAMAGE_LIABILITY_OPTIONS: DamageLiabilityStatus[] = [
  'NOT_APPLICABLE',
  'NEEDS_REVIEW',
  'CUSTOMER_RESPONSIBLE',
  'COMPANY_RESPONSIBLE',
  'INSURANCE_CLAIM',
  'DISPUTED',
];

export interface UpdateVehicleDamageInput {
  damageType?: string;
  severity?: DamageSeverity;
  status?: DamageStatus;
  description?: string;
  locationView?: DamageLocationView;
  locationX?: number;
  locationY?: number;
  locationLabel?: string;
  estimatedCostCents?: number;
  repairCostCents?: number;
  chargedToCustomerCents?: number;
  depositHoldCents?: number;
  rentalImpact?: DamageRentalImpact;
  evidenceStatus?: DamageEvidenceStatus;
  liabilityStatus?: DamageLiabilityStatus;
  liabilityNote?: string | null;
  taskId?: string | null;
  bookingId?: string | null;
  customerId?: string | null;
  handoverProtocolId?: string | null;
  repairStartedAt?: string | null;
}

export interface MarkDamageRepairedInput {
  repairCostCents?: number;
  note?: string;
  repairedBy?: string;
}

export interface AddDamageImageInput {
  imageData: string;
  caption?: string;
  uploadedBy?: string;
}

export interface PlaceDamageOnVehicleInput {
  locationView: DamageLocationView;
  locationX: number;
  locationY: number;
  locationLabel?: string;
}

/** Stable lifecycle when backend row predates persisted status. */
export function normalizeDamageStatus(
  damage: Pick<DamageResponse, 'status' | 'repairedAt' | 'repairStartedAt'>,
): DamageStatus {
  if (damage.status === 'ARCHIVED') return 'ARCHIVED';
  if (damage.repairedAt) return 'REPAIRED';
  if (damage.status === 'IN_REPAIR' || damage.repairStartedAt) return 'IN_REPAIR';
  if (damage.status === 'REPAIRED') return 'REPAIRED';
  return damage.status ?? 'OPEN';
}

export function isActiveDamage(damage: DamageResponse): boolean {
  const status = normalizeDamageStatus(damage);
  return status === 'OPEN' || status === 'IN_REPAIR';
}

export function isSolvedDamage(damage: DamageResponse): boolean {
  return normalizeDamageStatus(damage) === 'REPAIRED';
}

export function isArchivedDamage(damage: DamageResponse): boolean {
  return normalizeDamageStatus(damage) === 'ARCHIVED';
}

export function hasValidMapPin(damage: DamageResponse): boolean {
  const status = normalizeDamageStatus(damage);
  if (status === 'ARCHIVED') return false;
  if (!damage.locationView || damage.locationView === 'UNKNOWN') return false;
  if (typeof damage.locationX !== 'number' || typeof damage.locationY !== 'number') return false;
  if (damage.locationX < 0 || damage.locationX > 100) return false;
  if (damage.locationY < 0 || damage.locationY > 100) return false;
  return true;
}

export function formatDamageDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('de-DE');
}

export function formatDamageType(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatLiabilityStatus(value: DamageLiabilityStatus | string): string {
  return formatDamageType(value);
}

export function formatDamageSource(value: DamageSource | string): string {
  const map: Record<string, string> = {
    PICKUP_HANDOVER: 'Pickup handover',
    RETURN_HANDOVER: 'Return handover',
    AI_UPLOAD: 'AI upload',
    MANUAL: 'Manual',
    WORKSHOP: 'Workshop',
    INSPECTION: 'Inspection',
  };
  return map[value] ?? formatDamageType(value);
}

export function formatSeverity(value: DamageSeverity | string): string {
  const map: Record<string, string> = {
    MINOR: 'Minor',
    MODERATE: 'Moderate',
    MAJOR: 'Major',
    CRITICAL: 'Critical',
  };
  return map[value] ?? value;
}

export function formatEuroCents(cents: number | null | undefined): string | null {
  if (cents == null || cents < 0) return null;
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

export function parseDamageList(payload: unknown): DamageResponse[] {
  const rows = Array.isArray(payload) ? payload : (payload as { data?: unknown })?.data;
  if (!Array.isArray(rows)) return [];
  return rows as DamageResponse[];
}
