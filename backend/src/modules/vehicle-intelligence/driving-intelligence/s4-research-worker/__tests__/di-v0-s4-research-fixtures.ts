/** Minimal OSM graph for synthetic API_SYNTHETIC harness trips (straight segment). */
export const SYNTHETIC_RESEARCH_OSM_FIXTURE = {
  elements: [
    {
      type: 'way',
      id: 900001,
      nodes: [1, 2, 3],
      tags: { highway: 'residential', maxspeed: '50', oneway: 'no' },
    },
    { type: 'node', id: 1, lat: 50.0, lon: 10.0 },
    { type: 'node', id: 2, lat: 50.0, lon: 10.01 },
    { type: 'node', id: 3, lat: 50.0, lon: 10.02 },
  ],
} as const;

export type DiV0S4ResearchOsmRegistryBody = { elements?: unknown[] };

/** Mutable copy for test registries (readonly `as const` fixtures are not assignable to Map values). */
export function mutableOsmFixture(
  fixture: Readonly<{ elements?: readonly unknown[] }>,
): DiV0S4ResearchOsmRegistryBody {
  return JSON.parse(JSON.stringify(fixture)) as DiV0S4ResearchOsmRegistryBody;
}

/** Ruptela-style corridor fixture (distinct way id). */
export const RUPTELA_RESEARCH_OSM_FIXTURE = {
  elements: [
    {
      type: 'way',
      id: 900002,
      nodes: [10, 11],
      tags: { highway: 'primary', maxspeed: '100', oneway: 'yes' },
    },
    { type: 'node', id: 10, lat: 48.1351, lon: 11.582 },
    { type: 'node', id: 11, lat: 48.1361, lon: 11.583 },
  ],
} as const;
