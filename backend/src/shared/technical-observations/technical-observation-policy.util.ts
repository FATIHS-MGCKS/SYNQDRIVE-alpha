import type { ComplaintUrgency } from '@prisma/client';

/**
 * Central policy: observations are evidence, not confirmed diagnoses.
 * Severity informs module display; rental blocking requires explicit operator decision.
 */

export function normalizeObservationDescription(description: string): string {
  return description.trim().toLowerCase();
}

export function handoverObservationIdempotencyKey(
  handoverProtocolId: string,
  description: string,
): string {
  return `${handoverProtocolId}:${normalizeObservationDescription(description)}`;
}

/** Rental block only when explicitly requested — never inferred from severity. */
export function resolveObservationBlocksRental(explicit?: boolean | null): boolean {
  return explicit === true;
}

/** Observations never auto-trigger maintenance / IN_SERVICE transitions. */
export function shouldAutoSetMaintenanceFromObservation(): boolean {
  return false;
}

/** Observations never auto-create tasks — use explicit convert-to-task with dedup. */
export function shouldAutoCreateTaskFromObservation(): boolean {
  return false;
}

export function mapApiSeverityToUrgency(severity: string | undefined): ComplaintUrgency {
  const raw = (severity ?? 'medium').toLowerCase();
  if (raw === 'critical') return 'CRITICAL';
  if (raw === 'high') return 'HIGH';
  if (raw === 'low') return 'LOW';
  return 'MEDIUM';
}

export function urgencyToTraceableSeverity(urgency: ComplaintUrgency): string {
  return urgency.toLowerCase();
}

/**
 * Module health signal: critical display only when explicit rental block OR
 * severity critical (informational). Rental gate uses blocksRental only elsewhere.
 */
export function isObservationModuleCritical(input: {
  urgency: ComplaintUrgency;
  blocksRental: boolean;
}): boolean {
  return input.blocksRental || input.urgency === 'CRITICAL';
}
