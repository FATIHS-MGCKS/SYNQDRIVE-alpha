import { createHash } from 'crypto';

export function buildProviderEventFingerprint(event: Record<string, unknown>): string {
  const name =
    typeof event.name === 'string'
      ? event.name
      : typeof event.eventName === 'string'
        ? event.eventName
        : 'unknown.event';
  const timestamp =
    typeof event.timestamp === 'string'
      ? event.timestamp
      : event.timestamp instanceof Date
        ? event.timestamp.toISOString()
        : '';
  const source = typeof event.source === 'string' ? event.source : '';
  const durationNs = event.durationNs != null ? String(event.durationNs) : '';
  const metadata = typeof event.metadata === 'string' ? event.metadata : JSON.stringify(event.metadata ?? null);

  return createHash('sha256')
    .update([name, timestamp, source, durationNs, metadata].join('|'))
    .digest('hex');
}
