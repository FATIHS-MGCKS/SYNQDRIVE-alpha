import type { OsmSignal } from './exp021-retrospective-halt-prototype.lib';

export type OverpassFetchResult = {
  signals: OsmSignal[];
  source: string;
  fetchedAtUtc: string;
  requestMethod: 'POST' | 'GET';
  error?: string;
  httpStatus?: number;
  responseSnippet?: string;
};

const OVERPASS_INTERPRETER = 'https://overpass-api.de/api/interpreter';

export async function fetchOsmTrafficSignalsPost(bbox: {
  south: number;
  west: number;
  north: number;
  east: number;
}): Promise<OverpassFetchResult> {
  const fetchedAtUtc = new Date().toISOString();
  const query = `[out:json][timeout:25];node["highway"="traffic_signals"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});out body;`;
  const source = 'OpenStreetMap Overpass API (highway=traffic_signals, POST interpreter)';
  try {
    const res = await fetch(OVERPASS_INTERPRETER, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'SynqDrive-EXP021-Research/1.0 (offline forensic prototype)',
        Accept: 'application/json',
      },
      body: new URLSearchParams({ data: query }).toString(),
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        signals: [],
        source,
        fetchedAtUtc,
        requestMethod: 'POST',
        error: `HTTP ${res.status}`,
        httpStatus: res.status,
        responseSnippet: text.slice(0, 400),
      };
    }
    const body = JSON.parse(text) as { elements?: Array<{ id: number; lat: number; lon: number }> };
    const signals = (body.elements ?? []).map((e) => ({ id: e.id, lat: e.lat, lon: e.lon }));
    return { signals, source, fetchedAtUtc, requestMethod: 'POST', httpStatus: res.status };
  } catch (e) {
    return {
      signals: [],
      source,
      fetchedAtUtc,
      requestMethod: 'POST',
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
