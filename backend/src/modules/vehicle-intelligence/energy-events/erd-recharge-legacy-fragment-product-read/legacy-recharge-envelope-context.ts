import { EnergyEventKind, type Prisma, type VehicleEnergyEvent } from '@prisma/client';
import { intervalsOverlap } from '../erd-recharge-shadow-parity/erd-recharge-shadow-pairing.policy';
import type { LegacyFragmentHvPhysicalAnchor } from './erd-recharge-legacy-fragment-physical-episode.policy';

export type VehicleEnergyEventCanonicalInclude = {
  fuelStationEnrichment: true;
  chargingStationEnrichment: true;
  refuelReconciliation: true;
};

export function mapHvChargeSessionsToPhysicalAnchors(
  sessions: Array<{
    dimoSegmentId: string | null;
    startAt: Date;
    endAt: Date | null;
    startSocPercent: number | null;
    endSocPercent: number | null;
    startEnergyKwh: number | null;
    endEnergyKwh: number | null;
  }>,
): LegacyFragmentHvPhysicalAnchor[] {
  const anchors: LegacyFragmentHvPhysicalAnchor[] = [];
  for (const session of sessions) {
    const dimo = session.dimoSegmentId?.trim() ?? '';
    if (dimo === '') continue;
    if (session.endAt == null) continue;
    anchors.push({
      dimoSegmentId: dimo,
      startAt: session.startAt,
      endAt: session.endAt,
      startSocPercent: session.startSocPercent,
      endSocPercent: session.endSocPercent,
      startEnergyKwh: session.startEnergyKwh,
      endEnergyKwh: session.endEnergyKwh,
    });
  }
  return anchors;
}

export function mergeVehicleEnergyEventsById<T extends { id: string; startTime: Date }>(
  primary: T[],
  additional: T[],
): T[] {
  const byId = new Map<string, T>();
  for (const row of primary) {
    byId.set(row.id, row);
  }
  for (const row of additional) {
    byId.set(row.id, row);
  }
  return [...byId.values()].sort(
    (a, b) => a.startTime.getTime() - b.startTime.getTime(),
  );
}

export function buildHvChargeSessionOverlapWhere(input: {
  vehicleId: string;
  from?: Date;
  to?: Date;
}): Prisma.HvChargeSessionWhereInput {
  if (!input.from && !input.to) {
    return { vehicleId: input.vehicleId };
  }
  const from = input.from ?? new Date(0);
  const to = input.to ?? new Date(8_640_000_000_000_000);
  return {
    vehicleId: input.vehicleId,
    startAt: { lte: to },
    endAt: { gte: from },
  };
}

export function selectMissingParentDimoSegmentIds(input: {
  rows: VehicleEnergyEvent[];
  anchors: LegacyFragmentHvPhysicalAnchor[];
}): string[] {
  const present = new Set(
    input.rows
      .map((row) => row.dimoSegmentId?.trim() ?? '')
      .filter((dimo) => dimo !== ''),
  );
  const missing: string[] = [];
  for (const anchor of input.anchors) {
    if (!present.has(anchor.dimoSegmentId)) {
      missing.push(anchor.dimoSegmentId);
    }
  }
  return [...new Set(missing)];
}

export function buildParentEnvelopeFetchWhere(input: {
  vehicleId: string;
  dimoSegmentIds: string[];
}): Prisma.VehicleEnergyEventWhereInput | null {
  if (input.dimoSegmentIds.length === 0) return null;
  return {
    vehicleId: input.vehicleId,
    kind: EnergyEventKind.RECHARGE,
    dimoSegmentId: { in: input.dimoSegmentIds },
  };
}

export function hvSessionOverlapsProductWindow(
  session: { startAt: Date; endAt: Date },
  from?: Date,
  to?: Date,
): boolean {
  if (!from && !to) return true;
  const windowStart = from ?? new Date(0);
  const windowEnd = to ?? new Date(8_640_000_000_000_000);
  return intervalsOverlap(session.startAt, session.endAt, windowStart, windowEnd);
}
