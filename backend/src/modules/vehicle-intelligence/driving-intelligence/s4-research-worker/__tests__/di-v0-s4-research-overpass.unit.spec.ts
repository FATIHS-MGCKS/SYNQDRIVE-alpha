import {
  fetchBoundedOverpassJson,
  validateResearchOsmBbox,
} from '../di-v0-s4-research-overpass.client';
import { DI_V0_S4_RESEARCH_OSM_TUNING } from '../di-v0-s4-research-osm.config';

describe('fetchBoundedOverpassJson', () => {
  const bbox = { south: 51.33, west: 9.5, north: 51.34, east: 9.51 };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends a descriptive User-Agent (Overpass returns HTTP 406 without one)', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Buffer.from(JSON.stringify({ elements: [] })),
    } as unknown as Response);

    await fetchBoundedOverpassJson(bbox, {
      endpoint: 'https://overpass-api.de/api/interpreter',
      userAgent: DI_V0_S4_RESEARCH_OSM_TUNING.defaultOverpassUserAgent,
      timeoutMs: 5_000,
      maxResponseBytes: 1_000_000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['User-Agent']).toBe(DI_V0_S4_RESEARCH_OSM_TUNING.defaultOverpassUserAgent);
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });
});

describe('validateResearchOsmBbox', () => {
  it('rejects corridors exceeding configured span (long-trip partial analysis contract)', () => {
    const reason = validateResearchOsmBbox(
      { south: 48.0, west: 11.0, north: 49.5, east: 12.0 },
      0.25,
    );
    expect(reason).toBe('BBOX_TOO_LARGE');
  });

  it('accepts bounded corridor', () => {
    const reason = validateResearchOsmBbox(
      { south: 48.13, west: 11.58, north: 48.14, east: 11.59 },
      0.25,
    );
    expect(reason).toBeNull();
  });
});
