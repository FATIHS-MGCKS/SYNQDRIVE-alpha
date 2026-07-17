import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoAuthService } from '../dimo-auth.service';
import { DimoTelemetryService } from '../dimo-telemetry.service';
import { executeDimoRechargeSegmentsGraphQL } from './dimo-recharge-segments.graphql';
import { buildDimoRechargeSegmentsQuery } from './dimo-recharge-segments.query';
import { normalizeDimoRechargeSegments } from './dimo-recharge-segments.normalizer';
import { splitDimoRechargeQueryWindows } from './dimo-recharge-segments.window';
import {
  DIMO_RECHARGE_SEGMENT_DEFAULT_PAGE_LIMIT,
  DIMO_RECHARGE_SEGMENT_MAX_PAGES,
  type DimoRechargeSegmentFetchOptions,
  type DimoRechargeSegmentFetchResult,
  type DimoRechargeSegmentTenantContext,
  type NormalizedDimoRechargeSegment,
} from './dimo-recharge-segments.types';

@Injectable()
export class DimoRechargeSegmentsClient {
  private readonly logger = new Logger(DimoRechargeSegmentsClient.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dimoAuth: DimoAuthService,
    private readonly dimoTelemetry: DimoTelemetryService,
  ) {}

  /**
   * Tenant-safe entry point: resolves DIMO tokenId only when vehicle belongs to org.
   */
  async fetchForVehicle(
    context: DimoRechargeSegmentTenantContext,
    from: Date,
    to: Date,
    options?: DimoRechargeSegmentFetchOptions,
  ): Promise<DimoRechargeSegmentFetchResult | null> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        id: context.vehicleId,
        organizationId: context.organizationId,
      },
      select: {
        dimoVehicle: { select: { tokenId: true } },
      },
    });

    const tokenId = vehicle?.dimoVehicle?.tokenId;
    if (tokenId == null) {
      this.logger.debug(
        `Skipping recharge segments: no DIMO token vehicle=${context.vehicleId} org=${context.organizationId}`,
      );
      return null;
    }

    return this.fetchForToken(tokenId, from, to, options);
  }

  async fetchForToken(
    tokenId: number,
    from: Date,
    to: Date,
    options?: DimoRechargeSegmentFetchOptions,
  ): Promise<DimoRechargeSegmentFetchResult> {
    const vehicleJwt = await this.dimoAuth.getVehicleJwt(tokenId);
    if (!vehicleJwt) {
      return {
        segments: [],
        meta: {
          tokenId,
          requestedFrom: from.toISOString(),
          requestedTo: to.toISOString(),
          windowsQueried: 0,
          pagesFetched: 0,
          sourceFilterApplied: options?.sourceFilter ?? null,
          sourceFilterDropped: false,
          retries: 0,
          truncated: false,
        },
      };
    }

    const pageLimit = options?.pageLimit ?? DIMO_RECHARGE_SEGMENT_DEFAULT_PAGE_LIMIT;
    const maxPagesPerWindow = options?.maxPagesPerWindow ?? DIMO_RECHARGE_SEGMENT_MAX_PAGES;
    const windows = splitDimoRechargeQueryWindows(from, to);

    const collected: NormalizedDimoRechargeSegment[] = [];
    let pagesFetched = 0;
    let retries = 0;
    let sourceFilterDropped = false;
    let truncated = false;

    for (const window of windows) {
      let afterIso: string | null = null;
      let pagesInWindow = 0;

      while (pagesInWindow < maxPagesPerWindow) {
        const includeSourceFilter = !sourceFilterDropped;
        const pageResult = await executeDimoRechargeSegmentsGraphQL(
          this.dimoTelemetry,
          this.logger,
          vehicleJwt,
          tokenId,
          (withSourceFilter) =>
            buildDimoRechargeSegmentsQuery({
              tokenId,
              fromIso: window.from.toISOString(),
              toIso: window.to.toISOString(),
              afterIso,
              limit: pageLimit,
              sourceFilter: withSourceFilter ? options?.sourceFilter : null,
            }),
        );

        retries += pageResult.retries;
        if (pageResult.sourceFilterDropped) {
          sourceFilterDropped = true;
        }

        const normalized = normalizeDimoRechargeSegments(
          tokenId,
          pageResult.data.segments,
        );
        collected.push(...normalized);
        pagesFetched += 1;
        pagesInWindow += 1;

        if (normalized.length < pageLimit) {
          break;
        }

        const last = normalized[normalized.length - 1];
        afterIso = last?.startAt ?? null;
        if (!afterIso) break;
      }

      if (pagesInWindow >= maxPagesPerWindow) {
        truncated = true;
        this.logger.warn(
          `DIMO recharge segments pagination truncated tokenId=${tokenId} window=${window.from.toISOString()}..${window.to.toISOString()}`,
        );
      }
    }

    const deduped = dedupeRechargeSegments(collected);

    return {
      segments: deduped,
      meta: {
        tokenId,
        requestedFrom: from.toISOString(),
        requestedTo: to.toISOString(),
        windowsQueried: windows.length,
        pagesFetched,
        sourceFilterApplied: sourceFilterDropped ? null : options?.sourceFilter ?? null,
        sourceFilterDropped,
        retries,
        truncated,
      },
    };
  }
}

function dedupeRechargeSegments(
  segments: NormalizedDimoRechargeSegment[],
): NormalizedDimoRechargeSegment[] {
  const byId = new Map<string, NormalizedDimoRechargeSegment>();
  for (const segment of segments) {
    byId.set(segment.segmentId, segment);
  }
  return [...byId.values()].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
}
