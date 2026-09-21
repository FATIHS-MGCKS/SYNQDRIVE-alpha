import type { BatteryGeneralizedEvidenceClass } from '@prisma/client';
import type { TripMetricsService } from '@modules/observability/trip-metrics.service';

export function recordGeneralizedEvidenceCreated(
  metrics: TripMetricsService | undefined,
  evidenceClass: BatteryGeneralizedEvidenceClass,
): void {
  metrics?.batteryGeneralizedEvidenceCreatedTotal.inc({ evidence_class: evidenceClass });
}

export function recordGeneralizedEvidenceDuplicate(
  metrics: TripMetricsService | undefined,
): void {
  metrics?.batteryGeneralizedEvidenceDuplicateTotal.inc();
}

export function recordRestSessionOpened(metrics: TripMetricsService | undefined): void {
  metrics?.batteryRestSessionOpenedTotal.inc();
}

export function recordRestSessionUpdated(metrics: TripMetricsService | undefined): void {
  metrics?.batteryRestSessionUpdatedTotal.inc();
}

export function recordRestSessionEnded(metrics: TripMetricsService | undefined): void {
  metrics?.batteryRestSessionEndedTotal.inc();
}

export function recordRestSessionInvalidated(metrics: TripMetricsService | undefined): void {
  metrics?.batteryRestSessionInvalidatedTotal.inc();
}

export function recordLateTripAssociation(metrics: TripMetricsService | undefined): void {
  metrics?.batteryLateTripAssociationTotal.inc();
}

export function recordRestObservation(metrics: TripMetricsService | undefined): void {
  metrics?.batteryRestObservationTotal.inc();
}

export function recordValidRestObservation(metrics: TripMetricsService | undefined): void {
  metrics?.batteryValidRestObservationTotal.inc();
}

export function recordRestWakeQualified(metrics: TripMetricsService | undefined): void {
  metrics?.batteryRestWakeQualifiedTotal.inc();
}

export function recordCadenceOutOfTolerance(metrics: TripMetricsService | undefined): void {
  metrics?.batteryCadenceOutOfToleranceTotal.inc();
}

export function recordStateAmbiguous(metrics: TripMetricsService | undefined): void {
  metrics?.batteryGeneralizedEvidenceStateAmbiguousTotal.inc();
}

export function recordStaleReplay(metrics: TripMetricsService | undefined): void {
  metrics?.batteryGeneralizedEvidenceStaleReplayTotal.inc();
}
