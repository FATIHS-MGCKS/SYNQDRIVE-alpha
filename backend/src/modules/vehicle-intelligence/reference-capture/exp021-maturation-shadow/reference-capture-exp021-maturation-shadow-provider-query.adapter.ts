import { Injectable } from '@nestjs/common';
import { Exp021MaturationShadowProviderOutcomeClass } from '@prisma/client';
import { DimoAuthService } from '@modules/dimo/dimo-auth.service';
import { DimoTelemetryService } from '@modules/dimo/dimo-telemetry.service';
import { buildDimoProviderRequestContext } from '@modules/dimo/provider/dimo-provider-request-context.util';
import { buildBroadReferenceHistoricalSignalsQuery } from '../reference-capture-query-builder';
import { parseShadowSignalsResponse } from '../reference-capture-settlement-shadow-response.parser';
import { CANONICAL_EXP021_BUCKET_IDENTITY } from '../reference-capture-settlement-shadow-bucket-identity';

export type Exp021MaturationShadowProviderRequestPhase =
  | 'QUERY_BUILD_ZERO'
  | 'AUTH_PREFLIGHT_FAILED'
  | 'PROVIDER_HTTP';

export type Exp021MaturationShadowProviderQueryInput = {
  tokenId: number;
  organizationId: string;
  vehicleId: string;
  providerFields: string[];
  windowFrom: Date;
  windowTo: Date;
  interval: string;
};

export type Exp021MaturationShadowProviderQueryResult = {
  requestStartedAt: Date;
  requestCompletedAt: Date;
  providerRequestPhase: Exp021MaturationShadowProviderRequestPhase;
  providerRequestSucceeded: boolean;
  providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass;
  providerStatus: string | null;
  providerErrorClass: string | null;
  uniqueBucketLocusCount: number | null;
  uniqueTemporalBucketStartCount: number | null;
  perFieldRowCountJson: Record<string, number>;
  perFieldBucketLocusCountJson: Record<string, number>;
  firstProviderTimestamp: Date | null;
  lastProviderTimestamp: Date | null;
  bucketLocusManifestJson: string[];
  bucketLocusIdentityVersion: string;
  duplicateCount: number;
  payloadRevisionCount: number;
  changedPayloadLocusCount: number;
  queryProvenanceJson: Record<string, unknown>;
};

/**
 * Read-only DIMO historical provider adapter — no canonical reference-capture writes.
 */
@Injectable()
export class ReferenceCaptureExp021MaturationShadowProviderQueryAdapter {
  constructor(
    private readonly dimoAuth: DimoAuthService,
    private readonly dimoTelemetry: DimoTelemetryService,
  ) {}

  async executeHistoricalQuery(
    input: Exp021MaturationShadowProviderQueryInput,
  ): Promise<Exp021MaturationShadowProviderQueryResult> {
    const query = buildBroadReferenceHistoricalSignalsQuery(
      input.tokenId,
      input.providerFields,
      input.windowFrom,
      input.windowTo,
      input.interval,
    );

    const queryProvenanceJson: Record<string, unknown> = {
      adapter: 'exp021_maturation_shadow_read_only_v2',
      tokenId: input.tokenId,
      windowFrom: input.windowFrom.toISOString(),
      windowTo: input.windowTo.toISOString(),
      interval: input.interval,
      providerFieldCount: input.providerFields.length,
    };

    if (!query) {
      const completedAt = new Date();
      return {
        requestStartedAt: completedAt,
        requestCompletedAt: completedAt,
        providerRequestPhase: 'QUERY_BUILD_ZERO',
        providerRequestSucceeded: true,
        providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_ZERO,
        providerStatus: 'ZERO_RESULT',
        providerErrorClass: null,
        uniqueBucketLocusCount: 0,
        uniqueTemporalBucketStartCount: 0,
        perFieldRowCountJson: {},
        perFieldBucketLocusCountJson: {},
        firstProviderTimestamp: null,
        lastProviderTimestamp: null,
        bucketLocusManifestJson: [],
        bucketLocusIdentityVersion: CANONICAL_EXP021_BUCKET_IDENTITY,
        duplicateCount: 0,
        payloadRevisionCount: 0,
        changedPayloadLocusCount: 0,
        queryProvenanceJson: {
          ...queryProvenanceJson,
          providerRequestPhase: 'QUERY_BUILD_ZERO',
        },
      };
    }

    try {
      const authStartedAt = new Date();
      const jwt = await this.dimoAuth.getVehicleJwt(input.tokenId);
      const authCompletedAt = new Date();
      const providerContext = buildDimoProviderRequestContext(input.tokenId, {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      });
      const timed = await this.dimoTelemetry.queryGraphQLWithIngressTiming(
        jwt,
        query,
        undefined,
        providerContext,
        'REFERENCE_CAPTURE',
      );
      const rows = (timed.result?.data?.signals ?? []) as Array<Record<string, unknown>>;
      const parsed = parseShadowSignalsResponse({
        rows,
        providerFields: input.providerFields,
      });

      const perFieldBucketLocusCountJson: Record<string, number> = {};
      for (const row of parsed.parsedRows) {
        perFieldBucketLocusCountJson[row.providerField] =
          (perFieldBucketLocusCountJson[row.providerField] ?? 0) + 1;
      }

      const uniqueBucketLocusCount = parsed.uniqueBucketIdentities.length;
      const firstTs = parsed.uniqueTemporalStarts[0] ?? null;
      const lastTs = parsed.uniqueTemporalStarts[parsed.uniqueTemporalStarts.length - 1] ?? null;

      const providerOutcomeClass =
        uniqueBucketLocusCount > 0
          ? Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO
          : Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_ZERO;

      return {
        requestStartedAt: timed.requestStartedAt,
        requestCompletedAt: timed.requestCompletedAt,
        providerRequestPhase: 'PROVIDER_HTTP',
        providerRequestSucceeded: true,
        providerOutcomeClass,
        providerStatus: uniqueBucketLocusCount > 0 ? 'SUCCESS' : 'ZERO_RESULT',
        providerErrorClass: null,
        uniqueBucketLocusCount,
        uniqueTemporalBucketStartCount: parsed.uniqueTemporalStarts.length,
        perFieldRowCountJson: parsed.fieldSampleCounts,
        perFieldBucketLocusCountJson,
        firstProviderTimestamp: firstTs ? new Date(firstTs) : null,
        lastProviderTimestamp: lastTs ? new Date(lastTs) : null,
        bucketLocusManifestJson: parsed.uniqueBucketIdentities,
        bucketLocusIdentityVersion: CANONICAL_EXP021_BUCKET_IDENTITY,
        duplicateCount: 0,
        payloadRevisionCount: 0,
        changedPayloadLocusCount: 0,
        queryProvenanceJson: {
          ...queryProvenanceJson,
          providerRequestPhase: 'PROVIDER_HTTP',
          authPreflightStartedAt: authStartedAt.toISOString(),
          authPreflightCompletedAt: authCompletedAt.toISOString(),
          providerIngressStartedAt: timed.requestStartedAt.toISOString(),
          providerIngressCompletedAt: timed.requestCompletedAt.toISOString(),
        },
      };
    } catch (error) {
      const failedAt = new Date();
      const message = error instanceof Error ? error.message : String(error);
      const authFailure = /jwt|auth|token|unauthorized/i.test(message);
      return {
        requestStartedAt: failedAt,
        requestCompletedAt: failedAt,
        providerRequestPhase: authFailure ? 'AUTH_PREFLIGHT_FAILED' : 'PROVIDER_HTTP',
        providerRequestSucceeded: false,
        providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR,
        providerStatus: 'ERROR',
        providerErrorClass: message.slice(0, 500),
        uniqueBucketLocusCount: null,
        uniqueTemporalBucketStartCount: null,
        perFieldRowCountJson: {},
        perFieldBucketLocusCountJson: {},
        firstProviderTimestamp: null,
        lastProviderTimestamp: null,
        bucketLocusManifestJson: [],
        bucketLocusIdentityVersion: CANONICAL_EXP021_BUCKET_IDENTITY,
        duplicateCount: 0,
        payloadRevisionCount: 0,
        changedPayloadLocusCount: 0,
        queryProvenanceJson: {
          ...queryProvenanceJson,
          providerRequestPhase: authFailure ? 'AUTH_PREFLIGHT_FAILED' : 'PROVIDER_HTTP',
          error: message,
        },
      };
    }
  }
}
