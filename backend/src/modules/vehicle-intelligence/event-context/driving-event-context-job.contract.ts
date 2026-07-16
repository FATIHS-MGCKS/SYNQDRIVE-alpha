import { EVENT_CONTEXT_MODEL_VERSION } from './event-context.config';

const PER_EVENT_PREFIX = 'ctx-enrich:';

export function buildPerEventContextJobIdempotencyKey(
  drivingEventId: string,
  contextModelVersion: string = EVENT_CONTEXT_MODEL_VERSION,
): string {
  return `${PER_EVENT_PREFIX}${drivingEventId}:${contextModelVersion}`;
}

export function isPerEventContextJobIdempotencyKey(idempotencyKey: string): boolean {
  return idempotencyKey.startsWith(PER_EVENT_PREFIX);
}

export function parsePerEventContextJobIdempotencyKey(
  idempotencyKey: string,
): { drivingEventId: string; contextModelVersion: string } | null {
  if (!isPerEventContextJobIdempotencyKey(idempotencyKey)) return null;
  const body = idempotencyKey.slice(PER_EVENT_PREFIX.length);
  const sep = body.lastIndexOf(':');
  if (sep <= 0) return null;
  const drivingEventId = body.slice(0, sep);
  const contextModelVersion = body.slice(sep + 1);
  if (!drivingEventId || !contextModelVersion) return null;
  return { drivingEventId, contextModelVersion };
}

export function isTripContextCoordinatorJobIdempotencyKey(idempotencyKey: string): boolean {
  return idempotencyKey.startsWith('stage:') && idempotencyKey.includes(':EVENT_CONTEXT:');
}
