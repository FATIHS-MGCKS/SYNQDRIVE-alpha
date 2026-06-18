import type {
  DamageEvidenceStatus,
  DamageLiabilityStatus,
  DamageRentalImpact,
  DamageSeverity,
  DamageSource,
  DamageStatus,
  VehicleDamage,
  VehicleDamageImage,
} from '@prisma/client';

export interface DamageImageResponseDto {
  id: string;
  url: string;
  mimeType: string | null;
  caption: string | null;
  createdAt: string;
  uploadedBy: string | null;
}

export interface DamageResponseDto {
  id: string;
  vehicleId: string;
  damageType: string;
  severity: DamageSeverity;
  status: DamageStatus;
  description: string | null;
  locationView: string;
  locationX: number | null;
  locationY: number | null;
  locationLabel: string | null;
  estimatedCostCents: number | null;
  repairCostCents: number | null;
  chargedToCustomerCents: number | null;
  depositHoldCents: number | null;
  source: string;
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
  resolvedDate: string | null;
  bookingId: string | null;
  customerId: string | null;
  handoverProtocolId: string | null;
  taskId: string | null;
  images: DamageImageResponseDto[];
}

import type { DamageVehicleInsightsDto } from './damage-analytics';

export interface DamageStatsDto {
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
  insights?: DamageVehicleInsightsDto;
}

export type DamageWithImages = VehicleDamage & { images: VehicleDamageImage[] };

/** Derive stable lifecycle status when legacy rows lack persisted status. */
export function deriveDamageStatus(row: Pick<VehicleDamage, 'status' | 'repairedAt' | 'repairStartedAt'>): DamageStatus {
  if (row.status === 'ARCHIVED') return 'ARCHIVED';
  if (row.repairedAt) return 'REPAIRED';
  if (row.status === 'IN_REPAIR' || row.repairStartedAt) return 'IN_REPAIR';
  if (row.status === 'REPAIRED') return 'REPAIRED';
  return row.status ?? 'OPEN';
}

export function defaultRentalImpactForSeverity(severity: DamageSeverity): DamageRentalImpact {
  switch (severity) {
    case 'MINOR':
      return 'NONE';
    case 'MODERATE':
      return 'WATCH';
    case 'MAJOR':
      return 'BLOCK_RENTAL';
    case 'CRITICAL':
      return 'SAFETY_CRITICAL';
    default:
      return 'NONE';
  }
}

export function defaultLiabilityForSource(source: DamageSource): DamageLiabilityStatus {
  switch (source) {
    case 'PICKUP_HANDOVER':
      return 'NOT_APPLICABLE';
    case 'RETURN_HANDOVER':
      return 'NEEDS_REVIEW';
    case 'MANUAL':
      return 'NEEDS_REVIEW';
    default:
      return 'NOT_APPLICABLE';
  }
}

export function evidenceStatusFromImageCount(
  count: number,
  current: DamageEvidenceStatus,
): DamageEvidenceStatus {
  if (current === 'DISPUTED') return 'DISPUTED';
  if (count <= 0) return 'MISSING';
  if (count === 1) return 'PARTIAL';
  return 'COMPLETE';
}

export function mapDamageImage(image: VehicleDamageImage): DamageImageResponseDto {
  return {
    id: image.id,
    url: image.imageData,
    mimeType: image.mimeType,
    caption: image.caption,
    createdAt: image.createdAt.toISOString(),
    uploadedBy: image.uploadedBy,
  };
}

export function mapDamageToResponse(row: DamageWithImages): DamageResponseDto {
  const status = deriveDamageStatus(row);
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    damageType: row.damageType,
    severity: row.severity,
    status,
    description: row.description,
    locationView: row.locationView,
    locationX: row.locationX,
    locationY: row.locationY,
    locationLabel: row.locationLabel,
    estimatedCostCents: row.estimatedCostCents,
    repairCostCents: row.repairCostCents,
    chargedToCustomerCents: row.chargedToCustomerCents,
    depositHoldCents: row.depositHoldCents,
    source: row.source,
    rentalImpact: row.rentalImpact,
    evidenceStatus: row.evidenceStatus,
    liabilityStatus: row.liabilityStatus,
    liabilityNote: row.liabilityNote,
    reportedBy: row.reportedBy,
    reportedAt: row.createdAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    repairStartedAt: row.repairStartedAt?.toISOString() ?? null,
    repairedAt: row.repairedAt?.toISOString() ?? null,
    resolvedDate: row.repairedAt?.toISOString() ?? null,
    bookingId: row.bookingId,
    customerId: row.customerId,
    handoverProtocolId: row.handoverProtocolId,
    taskId: row.taskId,
    images: row.images.map(mapDamageImage),
  };
}

const ACTIVE_STATUSES: DamageStatus[] = ['OPEN', 'IN_REPAIR'];

export function isActiveDamage(row: Pick<VehicleDamage, 'status' | 'repairedAt' | 'repairStartedAt'>): boolean {
  const status = deriveDamageStatus(row);
  return ACTIVE_STATUSES.includes(status);
}

export function sortDamagesForList(rows: DamageWithImages[]): DamageWithImages[] {
  const rank = (row: DamageWithImages): number => {
    const status = deriveDamageStatus(row);
    if (status === 'OPEN' && (row.rentalImpact === 'BLOCK_RENTAL' || row.rentalImpact === 'SAFETY_CRITICAL')) return 0;
    if (status === 'OPEN') return 1;
    if (status === 'IN_REPAIR') return 2;
    if (status === 'REPAIRED') return 3;
    return 4;
  };
  return [...rows].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    if (deriveDamageStatus(a) === 'REPAIRED' && deriveDamageStatus(b) === 'REPAIRED') {
      return (b.repairedAt?.getTime() ?? 0) - (a.repairedAt?.getTime() ?? 0);
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export function buildDamageStats(rows: DamageWithImages[]): DamageStatsDto {
  let open = 0;
  let inRepair = 0;
  let repaired = 0;
  let archived = 0;
  let blockingRental = 0;
  let safetyCritical = 0;
  let missingEvidence = 0;
  let unplaced = 0;
  let estimatedOpenCostCents = 0;
  let oldestOpenDamageAt: Date | null = null;

  for (const row of rows) {
    const status = deriveDamageStatus(row);
    if (status === 'OPEN') open += 1;
    if (status === 'IN_REPAIR') inRepair += 1;
    if (status === 'REPAIRED') repaired += 1;
    if (status === 'ARCHIVED') archived += 1;

    if (isActiveDamage(row)) {
      if (row.rentalImpact === 'BLOCK_RENTAL') blockingRental += 1;
      if (row.rentalImpact === 'SAFETY_CRITICAL') safetyCritical += 1;
      if (row.evidenceStatus === 'MISSING') missingEvidence += 1;
      if (row.locationX == null || row.locationY == null || row.locationView === 'UNKNOWN') unplaced += 1;
      estimatedOpenCostCents += row.estimatedCostCents ?? 0;
      if (!oldestOpenDamageAt || row.createdAt < oldestOpenDamageAt) {
        oldestOpenDamageAt = row.createdAt;
      }
    }
  }

  return {
    total: rows.length,
    open,
    inRepair,
    repaired,
    archived,
    active: open + inRepair,
    blockingRental,
    safetyCritical,
    missingEvidence,
    unplaced,
    estimatedOpenCostCents,
    oldestOpenDamageAt: oldestOpenDamageAt?.toISOString() ?? null,
  };
}
