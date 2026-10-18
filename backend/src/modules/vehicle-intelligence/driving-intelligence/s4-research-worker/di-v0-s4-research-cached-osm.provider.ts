import { Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildOsmContextKey,
  gzipOverpassBody,
  type DiV0S4ResearchOsmProvider,
  type DiV0S4ResearchOsmProviderKind,
  type DiV0S4ResearchOsmResolveResult,
} from './di-v0-s4-research-osm-context';
import { DiV0S4ResearchOsmCacheRepository } from './di-v0-s4-research-osm-cache.repository';
import { parseDiV0S4ResearchOsmRuntimeConfig } from './di-v0-s4-research-osm.config';
import { resolveOsmDataVersion } from './di-v0-s4-research-intent';
import { fetchBoundedOverpassJson, overpassGlobalConcurrency, validateResearchOsmBbox } from './di-v0-s4-research-overpass.client';

/**
 * Production research OSM provider: versioned cache table + optional bounded Overpass (explicit env ON).
 * Fail-closed on invalid bbox / oversize / fetch errors — never throws to S4 paths.
 */
@Injectable()
export class DiV0S4ResearchCachedOsmProvider implements DiV0S4ResearchOsmProvider {
  readonly kind: DiV0S4ResearchOsmProviderKind = 'OVERPASS_BOUNDED';
  private readonly cache: DiV0S4ResearchOsmCacheRepository;
  private readonly config = parseDiV0S4ResearchOsmRuntimeConfig(process.env);
  private readonly dataVersion = resolveOsmDataVersion(process.env);

  constructor(prisma: PrismaService) {
    this.cache = new DiV0S4ResearchOsmCacheRepository(prisma as unknown as PrismaClient);
  }

  async resolve(input: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    bbox: { south: number; west: number; north: number; east: number };
    corridorMarginM: number;
  }): Promise<DiV0S4ResearchOsmResolveResult> {
    const bboxErr = validateResearchOsmBbox(input.bbox, this.config.maxBboxSpanDeg);
    const osmContextKey = buildOsmContextKey({
      bbox: input.bbox,
      corridorMarginM: input.corridorMarginM,
      providerKind: this.kind,
      dataVersion: this.dataVersion,
    });
    if (bboxErr) {
      return { status: 'MISS', osmContextKey, reason: bboxErr };
    }

    try {
      const cached = await this.cache.readHit(osmContextKey, this.config.maxUncompressedBytes);
      if (cached) {
        return {
          status: 'HIT',
          osmContextKey,
          osmSnapshotSha256: cached.osmSnapshotSha256,
          overpassBody: cached.overpassBody,
        };
      }
    } catch {
      return { status: 'MISS', osmContextKey, reason: 'CACHE_READ_FAILED' };
    }

    if (!this.config.overpassEnabled) {
      return { status: 'MISS', osmContextKey, reason: 'OVERPASS_DISABLED' };
    }

    let lastErr = 'OVERPASS_FETCH_FAILED';
    for (let attempt = 0; attempt <= this.config.fetchRetryBudget; attempt += 1) {
      try {
        const body = await overpassGlobalConcurrency.withSlot(this.config.maxConcurrentFetches, () =>
          fetchBoundedOverpassJson(input.bbox, {
            endpoint: this.config.overpassEndpoint,
            timeoutMs: this.config.requestTimeoutMs,
            maxResponseBytes: this.config.maxResponseBytes,
          }),
        );
        const packed = gzipOverpassBody(body);
        if (packed.uncompressedBytes > this.config.maxUncompressedBytes) {
          return { status: 'MISS', osmContextKey, reason: 'OVERPASS_PAYLOAD_TOO_LARGE' };
        }
        await this.cache.upsert({
          osmContextKey,
          osmSnapshotSha256: packed.sha256,
          bboxJson: input.bbox,
          corridorMarginM: input.corridorMarginM,
          overpassGzip: packed.gzip,
          uncompressedBytes: packed.uncompressedBytes,
          providerKind: 'OVERPASS_BOUNDED',
        });
        return {
          status: 'HIT',
          osmContextKey,
          osmSnapshotSha256: packed.sha256,
          overpassBody: body,
        };
      } catch (e) {
        lastErr = e instanceof Error ? e.message.slice(0, 120) : 'OVERPASS_FETCH_FAILED';
      }
    }
    return { status: 'MISS', osmContextKey, reason: lastErr };
  }
}
