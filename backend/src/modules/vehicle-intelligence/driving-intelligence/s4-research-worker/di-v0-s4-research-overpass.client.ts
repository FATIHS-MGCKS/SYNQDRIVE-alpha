import { DI_V0_S4_RESEARCH_OSM_TUNING } from './di-v0-s4-research-osm.config';

export type DiV0S4ResearchBbox = { south: number; west: number; north: number; east: number };

export function validateResearchOsmBbox(bbox: DiV0S4ResearchBbox, maxSpanDeg: number): string | null {
  const { south, west, north, east } = bbox;
  if (![south, west, north, east].every((v) => Number.isFinite(v))) return 'BBOX_NON_FINITE';
  if (south >= north) return 'BBOX_INVERTED_LAT';
  if (west >= east) return 'BBOX_INVERTED_LON';
  if (north - south > maxSpanDeg || east - west > maxSpanDeg) return 'BBOX_TOO_LARGE';
  return null;
}

export function buildBoundedOverpassQuery(bbox: DiV0S4ResearchBbox): string {
  const { south, west, north, east } = bbox;
  return `[out:json][timeout:25];
(
  way["highway"](${south},${west},${north},${east});
);
out body;
>;
out skel qt;`;
}

export async function fetchBoundedOverpassJson(
  bbox: DiV0S4ResearchBbox,
  input: {
    endpoint: string;
    timeoutMs: number;
    maxResponseBytes: number;
  },
): Promise<{ elements?: unknown[] }> {
  const query = buildBoundedOverpassQuery(bbox);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const res = await fetch(input.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`OVERPASS_HTTP_${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > input.maxResponseBytes) throw new Error('OVERPASS_RESPONSE_TOO_LARGE');
    const json = JSON.parse(buf.toString('utf8')) as { elements?: unknown[] };
    if (!json || typeof json !== 'object') throw new Error('OVERPASS_INVALID_JSON');
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export const overpassGlobalConcurrency = {
  active: 0,
  async withSlot<T>(maxConcurrent: number, fn: () => Promise<T>): Promise<T> {
    while (overpassGlobalConcurrency.active >= maxConcurrent) {
      await new Promise((r) => setTimeout(r, DI_V0_S4_RESEARCH_OSM_TUNING.overpassPollMs));
    }
    overpassGlobalConcurrency.active += 1;
    try {
      return await fn();
    } finally {
      overpassGlobalConcurrency.active -= 1;
    }
  },
};
