import type { BatteryRepairMetadata } from './battery-data-repair.types';
import { BATTERY_REPAIR_METADATA_KEY } from './battery-data-repair.types';

export function chunkItems<T>(items: T[], batchSize: number): T[][] {
  const size = Math.max(1, batchSize);
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

export function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function readRepairMetadata(
  container: Record<string, unknown>,
): BatteryRepairMetadata | null {
  const raw = container[BATTERY_REPAIR_METADATA_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const meta = raw as BatteryRepairMetadata;
  if (typeof meta.actionId !== 'string' || typeof meta.appliedAt !== 'string') {
    return null;
  }
  return meta;
}

export function hasRepairApplied(
  container: Record<string, unknown>,
  actionId: string,
): boolean {
  const meta = readRepairMetadata(container);
  return meta?.actionId === actionId;
}

export function mergeRepairMetadata(
  container: Record<string, unknown>,
  meta: BatteryRepairMetadata | Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...container,
    [BATTERY_REPAIR_METADATA_KEY]: meta,
  };
}

export function snapshotsAreIdentical(
  a: {
    socPercent: number;
    energyUsedKwh: number | null;
    estimatedCapacityKwh: number | null;
    sohPercent: number | null;
    providerSohPercent: number | null;
    idempotencyKey: string | null;
    recordedAt: Date;
  },
  b: {
    socPercent: number;
    energyUsedKwh: number | null;
    estimatedCapacityKwh: number | null;
    sohPercent: number | null;
    providerSohPercent: number | null;
    idempotencyKey: string | null;
    recordedAt: Date;
  },
): boolean {
  return (
    a.socPercent === b.socPercent &&
    a.energyUsedKwh === b.energyUsedKwh &&
    a.estimatedCapacityKwh === b.estimatedCapacityKwh &&
    a.sohPercent === b.sohPercent &&
    a.providerSohPercent === b.providerSohPercent &&
    a.idempotencyKey === b.idempotencyKey &&
    a.recordedAt.getTime() === b.recordedAt.getTime()
  );
}
