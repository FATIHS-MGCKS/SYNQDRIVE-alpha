import { stationNow } from './station-timezone.util';
import type { StationBookingRulesEvaluatedInstant } from './station-booking-rules.contract';

export function resolveStationBookingEvaluatedInstant(
  at: Date,
  timezone: string | null | undefined,
): StationBookingRulesEvaluatedInstant {
  const instantUtc = at.toISOString();

  if (!timezone?.trim()) {
    return {
      instantUtc,
      localDate: null,
      localTime: null,
      timezone: null,
    };
  }

  try {
    const local = stationNow(timezone, at);
    return {
      instantUtc,
      localDate: local.localDate,
      localTime: local.localTime,
      timezone: local.timezone,
    };
  } catch {
    return {
      instantUtc,
      localDate: null,
      localTime: null,
      timezone: null,
    };
  }
}
