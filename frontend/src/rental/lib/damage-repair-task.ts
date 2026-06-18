import type { ApiTaskPriority, CreateTaskPayload } from '../../lib/api';
import type { DamageResponse } from './damage.types';
import { formatDamageType, formatEuroCents, normalizeDamageStatus } from './damage.types';

function damageBlocksVehicle(damage: DamageResponse): boolean {
  return damage.rentalImpact === 'BLOCK_RENTAL' || damage.rentalImpact === 'SAFETY_CRITICAL';
}

export interface CreateRepairTaskInput {
  dueDate?: string;
  vendorId?: string;
  note?: string;
}

export function buildRepairTaskTitle(damage: DamageResponse): string {
  const typeLabel = formatDamageType(damage.damageType);
  const location =
    damage.locationLabel?.trim() ||
    (damage.locationView !== 'UNKNOWN' ? damage.locationView : null);
  return location ? `Repair: ${typeLabel} - ${location}` : `Repair: ${typeLabel}`;
}

export function deriveTaskPriorityFromDamage(damage: DamageResponse): ApiTaskPriority {
  switch (damage.rentalImpact) {
    case 'SAFETY_CRITICAL':
      return 'CRITICAL';
    case 'BLOCK_RENTAL':
      return 'HIGH';
    case 'WATCH':
      return 'NORMAL';
    case 'NONE':
    default:
      return damage.severity === 'MINOR' ? 'LOW' : 'NORMAL';
  }
}

export function buildRepairTaskDescription(
  damage: DamageResponse,
  extraNote?: string,
): string {
  const lines = [
    damage.description?.trim() || null,
    `Damage ID: ${damage.id}`,
    `Severity: ${damage.severity}`,
    `Rental impact: ${damage.rentalImpact}`,
    `Evidence: ${damage.evidenceStatus}`,
    damage.estimatedCostCents != null
      ? `Estimated cost: ${formatEuroCents(damage.estimatedCostCents)}`
      : null,
    damage.locationView !== 'UNKNOWN'
      ? `Location: ${damage.locationView}${damage.locationLabel ? ` · ${damage.locationLabel}` : ''}`
      : null,
    extraNote?.trim() || null,
  ].filter((line): line is string => Boolean(line));

  return lines.join('\n');
}

export function buildRepairTaskPayload(
  damage: DamageResponse,
  vehicleId: string,
  input: CreateRepairTaskInput = {},
): CreateTaskPayload {
  return {
    title: buildRepairTaskTitle(damage),
    description: buildRepairTaskDescription(damage, input.note),
    type: 'REPAIR',
    source: 'MANUAL',
    category: 'Repair',
    priority: deriveTaskPriorityFromDamage(damage),
    vehicleId,
    vendorId: input.vendorId || undefined,
    dueDate: input.dueDate || undefined,
    estimatedCostCents: damage.estimatedCostCents ?? undefined,
    blocksVehicleAvailability: damageBlocksVehicle(damage),
    metadata: {
      origin: 'DAMAGE',
      damageId: damage.id,
      rentalImpact: damage.rentalImpact,
    },
  };
}

export function canCreateRepairTaskForDamage(damage: DamageResponse): boolean {
  const status = normalizeDamageStatus(damage);
  return !damage.taskId && status !== 'REPAIRED' && status !== 'ARCHIVED';
}
