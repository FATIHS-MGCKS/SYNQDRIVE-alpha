import type {
  DamageEvidenceStatus,
  DamageLocationView,
  DamageRentalImpact,
  DamageSeverity,
  DamageStatus,
} from '@prisma/client';
import { deriveDamageStatus, isActiveDamage, type DamageWithImages } from './damage.mapper';

export const HEATMAP_GRID_SIZE = 8;
export const MIN_HEATMAP_PLACED_DAMAGES = 3;
export const REPEAT_CLUSTER_RADIUS_PERCENT = 8;

export interface HeatmapCellDto {
  gridX: number;
  gridY: number;
  count: number;
}

export interface RepeatLocationClusterDto {
  locationView: DamageLocationView;
  centerX: number;
  centerY: number;
  damageCount: number;
  label: string | null;
}

export interface DamageVehicleInsightsDto {
  hasEnoughData: boolean;
  totalDamages: number;
  mostAffectedView: DamageLocationView | null;
  mostAffectedViewCount: number;
  /** Sum of recorded actual repair costs (repaired damages only). Null when none recorded. */
  totalRepairCostCents: number | null;
  totalEstimatedOpenCostCents: number;
  /** Sum of chargedToCustomerCents where set. Null when none recorded. */
  totalChargedToCustomerCents: number | null;
  avgRepairDurationDays: number | null;
  avgRepairDurationSampleSize: number;
  evidenceCompletionRate: number | null;
  openedLast30Days: number;
  repairedLast30Days: number;
  repeatLocationClusters: RepeatLocationClusterDto[];
  heatmapByView: Partial<Record<DamageLocationView, HeatmapCellDto[]>>;
}

export type FleetDamageAggregateRow = {
  status: DamageStatus;
  severity: DamageSeverity;
  rentalImpact: DamageRentalImpact;
  locationView: DamageLocationView;
  estimatedCostCents: number | null;
  repairCostCents: number | null;
  chargedToCustomerCents: number | null;
  repairStartedAt: Date | null;
  repairedAt: Date | null;
  createdAt: Date;
  evidenceStatus: DamageEvidenceStatus;
  locationX: number | null;
  locationY: number | null;
  vehicleId: string;
  bookingId: string | null;
  customerId: string | null;
  vehicle: { make: string; model: string };
};

export interface FleetDamageModelBreakdownDto {
  modelKey: string;
  make: string;
  model: string;
  damageCount: number;
  activeCount: number;
  blockingCount: number;
}

export interface FleetDamageStatsDto {
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
  byModel: FleetDamageModelBreakdownDto[];
}

const EXTERIOR_VIEWS: DamageLocationView[] = ['FRONT', 'LEFT', 'RIGHT', 'REAR', 'ROOF'];

function hasValidPin(row: {
  locationView: DamageLocationView;
  locationX: number | null;
  locationY: number | null;
}): boolean {
  return (
    row.locationView !== 'UNKNOWN' &&
    typeof row.locationX === 'number' &&
    typeof row.locationY === 'number' &&
    Number.isFinite(row.locationX) &&
    Number.isFinite(row.locationY) &&
    row.locationX >= 0 &&
    row.locationX <= 100 &&
    row.locationY >= 0 &&
    row.locationY <= 100
  );
}

function daysBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
}

function repairDurationDays(row: {
  repairStartedAt: Date | null;
  repairedAt: Date | null;
  createdAt: Date;
}): number | null {
  if (!row.repairedAt) return null;
  const start = row.repairStartedAt ?? row.createdAt;
  const days = daysBetween(start, row.repairedAt);
  return Number.isFinite(days) && days >= 0 ? days : null;
}

export function buildHeatmapCells(
  points: Array<{ x: number; y: number }>,
  gridSize = HEATMAP_GRID_SIZE,
): HeatmapCellDto[] {
  if (points.length < MIN_HEATMAP_PLACED_DAMAGES) return [];
  const cellSize = 100 / gridSize;
  const map = new Map<string, HeatmapCellDto>();
  for (const p of points) {
    const gridX = Math.min(gridSize - 1, Math.max(0, Math.floor(p.x / cellSize)));
    const gridY = Math.min(gridSize - 1, Math.max(0, Math.floor(p.y / cellSize)));
    const key = `${gridX}:${gridY}`;
    const existing = map.get(key);
    if (existing) existing.count += 1;
    else map.set(key, { gridX, gridY, count: 1 });
  }
  return [...map.values()].filter((c) => c.count > 0);
}

function clusterRepeatLocations(
  rows: Array<{
    locationView: DamageLocationView;
    locationX: number | null;
    locationY: number | null;
    locationLabel: string | null;
  }>,
): RepeatLocationClusterDto[] {
  const placed = rows.filter(hasValidPin) as Array<{
    locationView: DamageLocationView;
    locationX: number;
    locationY: number;
    locationLabel: string | null;
  }>;
  const clusters: RepeatLocationClusterDto[] = [];

  for (const view of EXTERIOR_VIEWS) {
    const viewRows = placed.filter((r) => r.locationView === view);
    if (viewRows.length < 2) continue;

    const visited = new Set<number>();
    for (let i = 0; i < viewRows.length; i++) {
      if (visited.has(i)) continue;
      const group = [viewRows[i]];
      visited.add(i);
      for (let j = i + 1; j < viewRows.length; j++) {
        if (visited.has(j)) continue;
        const dx = viewRows[i].locationX - viewRows[j].locationX;
        const dy = viewRows[i].locationY - viewRows[j].locationY;
        if (Math.hypot(dx, dy) <= REPEAT_CLUSTER_RADIUS_PERCENT) {
          group.push(viewRows[j]);
          visited.add(j);
        }
      }
      if (group.length >= 2) {
        const centerX =
          Math.round((group.reduce((s, g) => s + g.locationX, 0) / group.length) * 10) / 10;
        const centerY =
          Math.round((group.reduce((s, g) => s + g.locationY, 0) / group.length) * 10) / 10;
        const label = group.find((g) => g.locationLabel)?.locationLabel ?? null;
        clusters.push({
          locationView: view,
          centerX,
          centerY,
          damageCount: group.length,
          label,
        });
      }
    }
  }

  return clusters.sort((a, b) => b.damageCount - a.damageCount);
}

export function buildVehicleDamageInsights(rows: DamageWithImages[]): DamageVehicleInsightsDto {
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  const viewCounts = new Map<DamageLocationView, number>();
  let totalRepairCostCents = 0;
  let repairCostCount = 0;
  let totalChargedToCustomerCents = 0;
  let chargedCount = 0;
  let totalEstimatedOpenCostCents = 0;
  let evidenceComplete = 0;
  let openedLast30Days = 0;
  let repairedLast30Days = 0;
  const repairDurations: number[] = [];

  for (const row of rows) {
    if (row.locationView !== 'UNKNOWN') {
      viewCounts.set(row.locationView, (viewCounts.get(row.locationView) ?? 0) + 1);
    }

    if (isActiveDamage(row)) {
      totalEstimatedOpenCostCents += row.estimatedCostCents ?? 0;
      if (row.evidenceStatus === 'COMPLETE' || row.evidenceStatus === 'PARTIAL') {
        evidenceComplete += 1;
      }
    }

    if (row.repairCostCents != null) {
      totalRepairCostCents += row.repairCostCents;
      repairCostCount += 1;
    }

    if (row.chargedToCustomerCents != null) {
      totalChargedToCustomerCents += row.chargedToCustomerCents;
      chargedCount += 1;
    }

    const createdAt = row.createdAt.getTime();
    if (createdAt >= thirtyDaysAgo) openedLast30Days += 1;
    if (row.repairedAt && row.repairedAt.getTime() >= thirtyDaysAgo) repairedLast30Days += 1;

    const duration = repairDurationDays(row);
    if (duration != null) repairDurations.push(duration);
  }

  let mostAffectedView: DamageLocationView | null = null;
  let mostAffectedViewCount = 0;
  for (const [view, count] of viewCounts) {
    if (count > mostAffectedViewCount) {
      mostAffectedView = view;
      mostAffectedViewCount = count;
    }
  }

  const heatmapByView: Partial<Record<DamageLocationView, HeatmapCellDto[]>> = {};
  for (const view of EXTERIOR_VIEWS) {
    const points = rows
      .filter((r) => r.locationView === view && hasValidPin(r))
      .map((r) => ({ x: r.locationX as number, y: r.locationY as number }));
    const cells = buildHeatmapCells(points);
    if (cells.length > 0) heatmapByView[view] = cells;
  }

  const avgRepairDurationDays =
    repairDurations.length > 0
      ? Math.round((repairDurations.reduce((a, b) => a + b, 0) / repairDurations.length) * 10) /
        10
      : null;

  const activeCount = rows.filter(isActiveDamage).length;
  const evidenceCompletionRate =
    rows.length === 0 ? null : activeCount === 0 ? null : evidenceComplete / activeCount;

  return {
    hasEnoughData: rows.length > 0,
    totalDamages: rows.length,
    mostAffectedView,
    mostAffectedViewCount,
    totalRepairCostCents: repairCostCount > 0 ? totalRepairCostCents : null,
    totalEstimatedOpenCostCents,
    totalChargedToCustomerCents: chargedCount > 0 ? totalChargedToCustomerCents : null,
    avgRepairDurationDays,
    avgRepairDurationSampleSize: repairDurations.length,
    evidenceCompletionRate,
    openedLast30Days,
    repairedLast30Days,
    repeatLocationClusters: clusterRepeatLocations(rows),
    heatmapByView,
  };
}

function incrementMap(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

export function buildModelKey(make: string, model: string): string {
  return `${make.trim().toLowerCase()}|${model.trim().toLowerCase()}`;
}

export function buildFleetDamageStats(
  orgId: string,
  rows: FleetDamageAggregateRow[],
): FleetDamageStatsDto {
  const byStatus: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byRentalImpact: Record<string, number> = {};
  const byLocationView: Record<string, number> = {};
  const modelMap = new Map<string, FleetDamageModelBreakdownDto>();
  const blockingVehicleIds = new Set<string>();

  let missingEvidence = 0;
  let unplaced = 0;
  let activeBacklog = 0;
  let totalEstimatedOpenCostCents = 0;
  let estimatedSamples = 0;
  let estimatedSum = 0;
  let totalRepairCostCents = 0;
  let repairCostCount = 0;
  let totalChargedToCustomerCents = 0;
  let chargedCount = 0;
  let withBookingContext = 0;
  let withCustomerContext = 0;
  const repairDurations: number[] = [];

  for (const row of rows) {
    const status = deriveDamageStatus(row);
    incrementMap(byStatus, status);
    incrementMap(bySeverity, row.severity);
    incrementMap(byRentalImpact, row.rentalImpact);
    incrementMap(byLocationView, row.locationView);

    const active = status === 'OPEN' || status === 'IN_REPAIR';
    if (active) {
      activeBacklog += 1;
      totalEstimatedOpenCostCents += row.estimatedCostCents ?? 0;
      if (row.evidenceStatus === 'MISSING') missingEvidence += 1;
      if (!hasValidPin(row)) unplaced += 1;
      if (row.rentalImpact === 'BLOCK_RENTAL' || row.rentalImpact === 'SAFETY_CRITICAL') {
        blockingVehicleIds.add(row.vehicleId);
      }
    }

    if (row.estimatedCostCents != null) {
      estimatedSum += row.estimatedCostCents;
      estimatedSamples += 1;
    }
    if (row.repairCostCents != null) {
      totalRepairCostCents += row.repairCostCents;
      repairCostCount += 1;
    }
    if (row.chargedToCustomerCents != null) {
      totalChargedToCustomerCents += row.chargedToCustomerCents;
      chargedCount += 1;
    }
    if (row.bookingId) withBookingContext += 1;
    if (row.customerId) withCustomerContext += 1;

    const duration = repairDurationDays(row);
    if (duration != null) repairDurations.push(duration);

    const modelKey = buildModelKey(row.vehicle.make, row.vehicle.model);
    const existing = modelMap.get(modelKey) ?? {
      modelKey,
      make: row.vehicle.make,
      model: row.vehicle.model,
      damageCount: 0,
      activeCount: 0,
      blockingCount: 0,
    };
    existing.damageCount += 1;
    if (active) {
      existing.activeCount += 1;
      if (row.rentalImpact === 'BLOCK_RENTAL' || row.rentalImpact === 'SAFETY_CRITICAL') {
        existing.blockingCount += 1;
      }
    }
    modelMap.set(modelKey, existing);
  }

  const avgRepairDurationDays =
    repairDurations.length > 0
      ? Math.round((repairDurations.reduce((a, b) => a + b, 0) / repairDurations.length) * 10) /
        10
      : null;

  return {
    organizationId: orgId,
    total: rows.length,
    byStatus,
    bySeverity,
    byRentalImpact,
    byLocationView,
    missingEvidence,
    unplaced,
    vehiclesWithBlockingDamage: blockingVehicleIds.size,
    activeBacklog,
    avgEstimatedCostCents:
      estimatedSamples > 0 ? Math.round(estimatedSum / estimatedSamples) : null,
    avgRepairDurationDays,
    avgRepairDurationSampleSize: repairDurations.length,
    totalRepairCostCents: repairCostCount > 0 ? totalRepairCostCents : null,
    totalEstimatedOpenCostCents,
    totalChargedToCustomerCents: chargedCount > 0 ? totalChargedToCustomerCents : null,
    withBookingContext,
    withCustomerContext,
    byModel: [...modelMap.values()].sort((a, b) => b.damageCount - a.damageCount),
  };
}
