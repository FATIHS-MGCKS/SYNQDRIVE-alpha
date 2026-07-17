import { Logger } from '@nestjs/common';
import type { CanonicalBatteryHealthService } from '../canonical-battery-health.service';

const logger = new Logger('CanonicalBatterySummaryFetch');

export type CanonicalBatterySummaryResult =
  | {
      ok: true;
      summary: NonNullable<Awaited<ReturnType<CanonicalBatteryHealthService['getSummary']>>>;
    }
  | { ok: false; summary: null; reason: 'not_found' | 'transient_error' };

export async function fetchCanonicalBatterySummarySafe(
  service: CanonicalBatteryHealthService,
  vehicleId: string,
  context: string,
): Promise<CanonicalBatterySummaryResult> {
  try {
    const summary = await service.getSummary(vehicleId);
    if (!summary) {
      return { ok: false, summary: null, reason: 'not_found' };
    }
    return { ok: true, summary };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(
      `Canonical battery summary fetch failed vehicle=${vehicleId} context=${context}: ${message}`,
    );
    return { ok: false, summary: null, reason: 'transient_error' };
  }
}
