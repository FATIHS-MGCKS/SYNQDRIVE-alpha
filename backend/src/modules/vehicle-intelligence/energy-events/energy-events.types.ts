import type {
  EnergyEventKind,
  EnergyEventConfidence,
  VehicleEnergyEvent,
} from '@prisma/client';

// ── Canonical shapes for the Trips-Tab timeline ───────────────────────────
// Kept intentionally distinct from `VehicleTrip` so the frontend can render a
// dedicated "refill / recharge between trips" card without polluting the trip
// data contract.

export interface EnergyEventDto {
  id: string;
  vehicleId: string;
  dimoSegmentId: string;
  kind: EnergyEventKind;
  detectionMechanism: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  startLatitude: number | null;
  startLongitude: number | null;
  endLatitude: number | null;
  endLongitude: number | null;
  fuelDeltaLiters: number | null;
  fuelDeltaPercent: number | null;
  socDeltaPercent: number | null;
  energyDeltaKwh: number | null;
  odometerStartKm: number | null;
  odometerEndKm: number | null;
  confidence: EnergyEventConfidence;
}

export type TimelineItem =
  | ({ itemType: 'trip' } & Record<string, unknown>)
  | ({ itemType: 'energy-event' } & EnergyEventDto);

export function toEnergyEventDto(row: VehicleEnergyEvent): EnergyEventDto {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    dimoSegmentId: row.dimoSegmentId,
    kind: row.kind,
    detectionMechanism: row.detectionMechanism,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    durationSeconds: row.durationSeconds,
    startLatitude: row.startLatitude,
    startLongitude: row.startLongitude,
    endLatitude: row.endLatitude,
    endLongitude: row.endLongitude,
    fuelDeltaLiters: row.fuelDeltaLiters,
    fuelDeltaPercent: row.fuelDeltaPercent,
    socDeltaPercent: row.socDeltaPercent,
    energyDeltaKwh: row.energyDeltaKwh,
    odometerStartKm: row.odometerStartKm,
    odometerEndKm: row.odometerEndKm,
    confidence: row.confidence,
  };
}
