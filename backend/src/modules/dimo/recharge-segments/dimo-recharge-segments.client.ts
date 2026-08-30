import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoAuthService } from '../dimo-auth.service';
import { DimoTelemetryService } from '../dimo-telemetry.service';
import {
  buildDimoRechargeFetchError,
  executeDimoRechargeSegmentsGraphQL,
} from './dimo-recharge-segments.graphql';
import { buildDimoRechargeSegmentsQuery } from './dimo-recharge-segments.query';
import { normalizeDimoRechargeSegments } from './dimo-recharge-segments.normalizer';
import { splitDimoRechargeQueryWindows } from './dimo-recharge-segments.window';
import { DIMO_PRODUCTION_RECHARGE_DETECTOR_CONFIG } from '../energy-events/dimo-energy-detector.config';
import type {
  DimoRechargeSegmentFetchOptions,
  DimoRechargeSegmentFetchResult,
  DimoRechargeSegmentTenantContext,
  NormalizedDimoRechargeSegment,
} from './dimo-recharge-segments.types';
import type { DimoProviderRequestContext } from '../provider/dimo-provider-gateway.types';

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

    return this.fetchForToken(tokenId, from, to, options, {
      organizationId: context.organizationId,
      vehicleId: context.vehicleId,
      tokenId,
    });
  }

  async fetchForToken(
    tokenId: number,
    from: Date,
    to: Date,
    options?: DimoRechargeSegmentFetchOptions,
    requestContext?: DimoProviderRequestContext,
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
          queriesExecuted: 0,
          sourceFilterApplied: options?.sourceFilter ?? null,
          sourceFilterDropped: false,
          retries: 0,
          status: 'SUCCESS',
        },
      };
    }

    const windows = splitDimoRechargeQueryWindows(from, to);
    const collected: NormalizedDimoRechargeSegment[] = [];
    let queriesExecuted = 0;
    let retries = 0;
    let sourceFilterDropped = false;

    for (const window of windows) {
      try {
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
              sourceFilter: withSourceFilter ? options?.sourceFilter : null,
              detectorConfig: DIMO_PRODUCTION_RECHARGE_DETECTOR_CONFIG,
            }),
          { requestContext },
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
        queriesExecuted += 1;
      } catch (error) {
        const fetchError = buildDimoRechargeFetchError(error);
        this.logger.warn(
          `DIMO recharge segments window failed tokenId=${tokenId} mechanism=recharge window=${window.from.toISOString()}..${window.to.toISOString()} httpStatus=${fetchError.httpStatus ?? 'n/a'} retryable=${fetchError.retryable}`,
        );
        return {
          segments: [],
          meta: {
            tokenId,
            requestedFrom: from.toISOString(),
            requestedTo: to.toISOString(),
            windowsQueried: windows.length,
            queriesExecuted,
            sourceFilterApplied: sourceFilterDropped ? null : options?.sourceFilter ?? null,
            sourceFilterDropped,
            retries,
            status: 'FAILED',
          },
          error: fetchError,
        };
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
        queriesExecuted,
        sourceFilterApplied: sourceFilterDropped ? null : options?.sourceFilter ?? null,
        sourceFilterDropped,
        retries,
        status: 'SUCCESS',
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
