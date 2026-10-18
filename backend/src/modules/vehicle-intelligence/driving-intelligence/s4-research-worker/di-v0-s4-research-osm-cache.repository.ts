import type { PrismaClient } from '@prisma/client';
import { parseCachedOverpass } from './di-v0-s4-research-osm-context';

export class DiV0S4ResearchOsmCacheRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async readHit(
    osmContextKey: string,
    maxUncompressedBytes: number,
  ): Promise<{ osmSnapshotSha256: string; overpassBody: { elements?: unknown[] } } | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        osm_snapshot_sha256: string;
        overpass_gzip: Buffer;
        uncompressed_bytes: number;
      }>
    >`
      SELECT osm_snapshot_sha256, overpass_gzip, uncompressed_bytes
      FROM di_v0_s4_research_osm_cache_v1
      WHERE osm_context_key = ${osmContextKey}
      LIMIT 1`;
    const row = rows[0];
    if (!row) return null;
    const body = parseCachedOverpass(Buffer.from(row.overpass_gzip), row.osm_snapshot_sha256, maxUncompressedBytes);
    return { osmSnapshotSha256: row.osm_snapshot_sha256, overpassBody: body };
  }

  async upsert(input: {
    osmContextKey: string;
    osmSnapshotSha256: string;
    bboxJson: unknown;
    corridorMarginM: number;
    overpassGzip: Buffer;
    uncompressedBytes: number;
    providerKind: string;
  }): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO di_v0_s4_research_osm_cache_v1 (
        osm_context_key, osm_snapshot_sha256, bbox_json, corridor_margin_m,
        overpass_gzip, uncompressed_bytes, provider_kind
      ) VALUES (
        ${input.osmContextKey}, ${input.osmSnapshotSha256}, ${JSON.stringify(input.bboxJson)}::jsonb,
        ${input.corridorMarginM}, ${input.overpassGzip}, ${input.uncompressedBytes}, ${input.providerKind}
      )
      ON CONFLICT (osm_context_key) DO UPDATE SET
        osm_snapshot_sha256 = EXCLUDED.osm_snapshot_sha256,
        bbox_json = EXCLUDED.bbox_json,
        corridor_margin_m = EXCLUDED.corridor_margin_m,
        overpass_gzip = EXCLUDED.overpass_gzip,
        uncompressed_bytes = EXCLUDED.uncompressed_bytes,
        provider_kind = EXCLUDED.provider_kind`;
  }
}
