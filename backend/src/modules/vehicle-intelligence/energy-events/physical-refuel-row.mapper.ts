import type { VehicleEnergyEvent } from '@prisma/client';
import type { RefuelRowForMatcher } from './physical-refuel-identity.matcher';

interface RawDetectionMeta {
  fuelStartLiters?: number | null;
  fuelEndLiters?: number | null;
  fuelStartPercent?: number | null;
  fuelEndPercent?: number | null;
}

function readMeta(row: VehicleEnergyEvent): RawDetectionMeta {
  const meta = row.rawDetectionMeta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return {};
  return meta as RawDetectionMeta;
}

/** Map persisted VehicleEnergyEvent → G1 matcher row contract. */
export function vehicleEnergyEventToRefuelRow(row: VehicleEnergyEvent): RefuelRowForMatcher {
  const meta = readMeta(row);
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    kind: 'REFUEL',
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    fuelStartLiters: meta.fuelStartLiters ?? null,
    fuelEndLiters: meta.fuelEndLiters ?? null,
    fuelStartPercent: meta.fuelStartPercent ?? null,
    fuelEndPercent: meta.fuelEndPercent ?? null,
    fuelDeltaLiters: row.fuelDeltaLiters,
    fuelDeltaPercent: row.fuelDeltaPercent,
    durationSeconds: row.durationSeconds,
    odometerEndKm: row.odometerEndKm,
    dimoSegmentId: row.dimoSegmentId,
  };
}

/** SYNQDRIVE durable first observation = createdAt (preserved on dimoSegmentId upsert update). */
export function buildFirstObservedAtById(rows: VehicleEnergyEvent[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    map[row.id] = row.createdAt.getTime();
  }
  return map;
}

export function buildReconciliationGroupId(vehicleId: string, memberIds: string[]): string {
  return `${vehicleId}:${[...memberIds].sort().join('|')}`;
}
