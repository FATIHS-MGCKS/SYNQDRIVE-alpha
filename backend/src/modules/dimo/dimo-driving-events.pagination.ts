import type { DimoVehicleEventRecord } from './queries/driving-events.query';
import { providerEventIdForSample } from './dimo-event-identity';

export const DIMO_DRIVING_EVENTS_PAGE_MS = 6 * 60 * 60 * 1000;
export const DIMO_DRIVING_EVENTS_MAX_RETRIES = 3;
export const DIMO_DRIVING_EVENTS_RETRY_BASE_MS = 250;

export function splitTimeWindowForPagination(
  from: Date,
  to: Date,
  pageMs: number = DIMO_DRIVING_EVENTS_PAGE_MS,
): Array<{ from: Date; to: Date }> {
  const windows: Array<{ from: Date; to: Date }> = [];
  let cursor = from.getTime();
  const endMs = to.getTime();
  while (cursor < endMs) {
    const next = Math.min(cursor + pageMs, endMs);
    windows.push({ from: new Date(cursor), to: new Date(next) });
    cursor = next;
  }
  return windows;
}

export function dedupeDimoEventSamples(
  samples: DimoVehicleEventRecord[],
  tokenId: number,
): DimoVehicleEventRecord[] {
  const seen = new Set<string>();
  const deduped: DimoVehicleEventRecord[] = [];
  for (const sample of samples) {
    const key = providerEventIdForSample(sample, tokenId);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(sample);
  }
  return deduped;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
