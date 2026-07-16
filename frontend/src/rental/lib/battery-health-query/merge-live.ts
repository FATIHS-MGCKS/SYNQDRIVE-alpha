import type { BatteryHealthDetail, BatteryHealthSummary } from '../../../lib/api';

/**
 * Merge only live telemetry slices from a fresh summary fetch into cached health data.
 * Avoids replacing publication/assessment/evidence when polling live values.
 */
export function mergeBatteryLiveSlice<T extends BatteryHealthSummary | BatteryHealthDetail>(
  previous: T,
  next: T,
): T {
  const mergedCanonical =
    previous.canonical && next.canonical
      ? {
          ...previous.canonical,
          liveState: next.canonical.liveState,
        }
      : (next.canonical ?? previous.canonical);

  return {
    ...previous,
    currentTelemetry: next.currentTelemetry ?? previous.currentTelemetry,
    canonical: mergedCanonical,
    lv: previous.lv
      ? {
          ...previous.lv,
          telemetry: {
            ...previous.lv.telemetry,
            ...next.lv?.telemetry,
          },
          freshness: next.lv?.freshness ?? previous.lv.freshness,
        }
      : next.lv,
    hv:
      previous.hv && next.hv
        ? {
            ...previous.hv,
            telemetry: {
              ...previous.hv.telemetry,
              ...next.hv.telemetry,
            },
            freshness: next.hv?.freshness ?? previous.hv.freshness,
          }
        : (next.hv ?? previous.hv),
  };
}
