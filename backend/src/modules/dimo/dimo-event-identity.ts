import { createHash } from 'crypto';
import type { DimoVehicleEventRecord } from './queries/driving-events.query';

export function parseDimoCounterValue(metadata: string | null): number | null {
  if (!metadata) return null;
  try {
    const meta = JSON.parse(metadata);
    return typeof meta?.counterValue === 'number' ? meta.counterValue : null;
  } catch {
    return null;
  }
}

/** Stable provider event identity for DIMO `events(...)` rows (no server-side UUID). */
export function buildDimoProviderEventId(input: {
  tokenId: number;
  timestamp: string;
  name: string;
  source: string;
  durationNs: number;
  counterValue: number | null;
}): string {
  const payload = [
    input.tokenId,
    input.timestamp,
    input.name,
    input.source,
    input.durationNs,
    input.counterValue ?? 'null',
  ].join('|');
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

export function providerEventIdForSample(
  sample: DimoVehicleEventRecord,
  tokenId: number,
): string {
  return buildDimoProviderEventId({
    tokenId,
    timestamp: sample.timestamp,
    name: sample.name,
    source: sample.source,
    durationNs: sample.durationNs,
    counterValue: parseDimoCounterValue(sample.metadata),
  });
}
