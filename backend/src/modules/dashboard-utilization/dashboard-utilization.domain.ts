import type { E4UtilizationVehicleFacts } from '@modules/evaluations-analytics/e4/evaluations-insights.repository';
import { computeUtilization } from '@modules/evaluations-analytics/e4/domain/evaluations-utilization.domain';

export function utilizationPercentFromRatio(ratio: number | null): number | null {
  if (ratio === null) return null;
  return Math.round(ratio * 1000) / 10;
}

export function computeWindowUtilizationPercent(
  vehicles: readonly E4UtilizationVehicleFacts[],
  startMs: number,
  endExclusiveMs: number,
): number | null {
  const inputs = vehicles.map((vehicle) => ({
    eligibility: vehicle.eligibility,
    rented: vehicle.rented,
    maintenance: vehicle.maintenance,
    blocked: vehicle.blocked,
  }));
  const result = computeUtilization(inputs, startMs, endExclusiveMs);
  return utilizationPercentFromRatio(result.utilizationRatio);
}

export function computeUtilizationDeltaPp(
  current: number | null,
  previous: number | null,
): number | null {
  if (current === null || previous === null) return null;
  return Math.round((current - previous) * 10) / 10;
}

export function computeBookingDeltaPercent(
  current: number,
  previous: number,
): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function monthWindow(year: number, month: number): { start: Date; endExclusive: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, endExclusive };
}

export function previousMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function dayWindow(
  year: number,
  month: number,
  day: number,
): { startMs: number; endExclusiveMs: number } {
  const start = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const endExclusive = Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0);
  return { startMs: start, endExclusiveMs: endExclusive };
}

export function vehicleMatchesStation(
  vehicle: { homeStationId: string | null; currentStationId: string | null },
  stationId: string | null,
): boolean {
  if (!stationId) return true;
  return vehicle.homeStationId === stationId || vehicle.currentStationId === stationId;
}
