import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { gunzipSync, gzipSync } from 'zlib';
import type { ResearchGpsBucket } from '../s4-research/contracts';
import { computeCorridorBbox, buildRoadContextFromOverpass } from '../s4-research/osm-parse';

export type DiV0S4ResearchOsmProviderKind = 'FILE_REGISTRY' | 'OVERPASS_BOUNDED' | 'TEST_FIXTURE' | 'NONE';

export type DiV0S4ResearchOsmResolveResult =
  | { status: 'HIT'; osmContextKey: string; osmSnapshotSha256: string; overpassBody: { elements?: unknown[] } }
  | { status: 'MISS'; osmContextKey: string; reason: string };

export interface DiV0S4ResearchOsmProvider {
  kind: DiV0S4ResearchOsmProviderKind;
  resolve(input: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    bbox: { south: number; west: number; north: number; east: number };
    corridorMarginM: number;
  }): Promise<DiV0S4ResearchOsmResolveResult>;
}

export function buildOsmContextKey(input: {
  bbox: { south: number; west: number; north: number; east: number };
  corridorMarginM: number;
  providerKind: string;
  dataVersion: string;
}): string {
  const payload = JSON.stringify({ ...input.bbox, m: input.corridorMarginM, p: input.providerKind, v: input.dataVersion });
  return `DI_V0_S4_RESEARCH_OSM_CTX_V1:sha256:${createHash('sha256').update(payload).digest('hex')}`;
}

export function sha256HexUtf8(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function corridorBboxFromBuckets(buckets: ResearchGpsBucket[], marginM: number) {
  const points = buckets
    .filter((b) => b.availability === 'PRESENT' && b.latitude != null && b.longitude != null)
    .map((b) => ({ latitude: b.latitude!, longitude: b.longitude! }));
  if (points.length === 0) return null;
  return computeCorridorBbox(points, marginM);
}

export function gzipOverpassBody(body: unknown): { gzip: Buffer; uncompressedBytes: number; sha256: string } {
  const json = JSON.stringify(body);
  const gzip = gzipSync(Buffer.from(json, 'utf8'));
  return { gzip, uncompressedBytes: json.length, sha256: sha256HexUtf8(json) };
}

export function parseCachedOverpass(gzip: Buffer, expectedSha256: string, maxBytes: number): { elements?: unknown[] } {
  const raw = gunzipSync(gzip, { maxOutputLength: maxBytes });
  const json = raw.toString('utf8');
  if (sha256HexUtf8(json) !== expectedSha256) throw new Error('OSM_CACHE_SHA_MISMATCH');
  return JSON.parse(json) as { elements?: unknown[] };
}

export function buildRoadContextFromOsmBody(
  overpassBody: { elements?: unknown[] },
  buckets: ResearchGpsBucket[],
  corridorMarginM: number,
) {
  return buildRoadContextFromOverpass(overpassBody as { elements?: Array<Record<string, unknown>> }, {
    buckets,
    corridorMarginM,
  });
}

/** In-memory registry for tests / pinned fixtures — not for arbitrary production trips. */
export class DiV0S4ResearchFileRegistryOsmProvider implements DiV0S4ResearchOsmProvider {
  readonly kind: DiV0S4ResearchOsmProviderKind = 'FILE_REGISTRY';

  constructor(private readonly registry: ReadonlyMap<string, { elements?: unknown[] }>) {}

  async resolve(input: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    bbox: { south: number; west: number; north: number; east: number };
    corridorMarginM: number;
  }): Promise<DiV0S4ResearchOsmResolveResult> {
    const key = `${input.organizationId}:${input.tripId}`;
    const body = this.registry.get(key) ?? this.registry.get(input.tripId);
    const bbox = { south: 0, west: 0, north: 0, east: 0 };
    const osmContextKey = buildOsmContextKey({
      bbox,
      corridorMarginM: 0,
      providerKind: this.kind,
      dataVersion: key,
    });
    if (!body) return { status: 'MISS', osmContextKey, reason: 'REGISTRY_MISS' };
    const sha = sha256HexUtf8(JSON.stringify(body));
    return { status: 'HIT', osmContextKey, osmSnapshotSha256: sha, overpassBody: body };
  }
}

@Injectable()
export class DiV0S4ResearchNullOsmProvider implements DiV0S4ResearchOsmProvider {
  readonly kind: DiV0S4ResearchOsmProviderKind = 'NONE';

  async resolve(input: {
    bbox: { south: number; west: number; north: number; east: number };
    corridorMarginM: number;
  }): Promise<DiV0S4ResearchOsmResolveResult> {
    const osmContextKey = buildOsmContextKey({
      bbox: input.bbox,
      corridorMarginM: input.corridorMarginM,
      providerKind: this.kind,
      dataVersion: 'NONE',
    });
    return { status: 'MISS', osmContextKey, reason: 'PROVIDER_DISABLED' };
  }
}
