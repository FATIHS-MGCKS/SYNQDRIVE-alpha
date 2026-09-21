import type { BatteryGeneralizedEvidenceClass } from '@prisma/client';
import type { TripMetricsService } from '@modules/observability/trip-metrics.service';

/** Shadow-safe counters — wired when prometheus registry extended in M3.3B. */
export function recordGeneralizedEvidenceCreated(
  _metrics: TripMetricsService | undefined,
  _evidenceClass: BatteryGeneralizedEvidenceClass,
): void {}

export function recordGeneralizedEvidenceDuplicate(_metrics: TripMetricsService | undefined): void {}

export function recordRestSessionOpened(_metrics: TripMetricsService | undefined): void {}

export function recordRestSessionUpdated(_metrics: TripMetricsService | undefined): void {}

export function recordRestSessionInvalidated(_metrics: TripMetricsService | undefined): void {}

export function recordLateTripAssociation(_metrics: TripMetricsService | undefined): void {}
