import { Injectable, Logger } from '@nestjs/common';
import { HardwareType } from '@prisma/client';
import { DimoAuthService } from '../../dimo/dimo-auth.service';
import { DimoTelemetryService } from '../../dimo/dimo-telemetry.service';
import { buildDimoProviderRequestContext } from '../../dimo/provider/dimo-provider-request-context.util';
import { buildAvailableSignalsQuery } from '../../dimo/queries/available-signals.query';
import { buildLatestSnapshotQuery } from '../../dimo/queries/latest-vehicle-snapshot.query';
import {
  buildDataSummaryQuery,
  parseDataSummaryResponse,
} from '../../dimo/queries/data-summary.query';
import { PrismaService } from '@shared/database/prisma.service';
import {
  REFERENCE_CAPTURE_ACQUISITION_TIER,
  REFERENCE_CAPTURE_CONNECTION_PROFILE,
  REFERENCE_CAPTURE_PROVIDER,
} from './reference-capture.constants';
import {
  buildCanonicalKeyLookup,
  loadFrozenReferenceManifest,
} from './reference-capture-manifest.loader';
import { inferTemporalClass } from './reference-capture-temporal.util';
import { buildRawIdentity } from './reference-capture.contract';
import type {
  BroadObservationFieldDescriptor,
  ReferenceCaptureCapabilityState,
  ReferenceCapturePreflightResult,
} from './reference-capture.types';

function resolvePowertrainProfile(fuelType: string | null | undefined): string | null {
  if (!fuelType) return null;
  const map: Record<string, string> = {
    GASOLINE: 'ICE_GASOLINE',
    DIESEL: 'ICE_DIESEL',
    ELECTRIC: 'BEV',
    HYBRID: 'PHEV',
    PLUGIN_HYBRID: 'PHEV',
  };
  return map[fuelType] ?? fuelType;
}

@Injectable()
export class ReferenceCapturePreflightService {
  private readonly logger = new Logger(ReferenceCapturePreflightService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dimoAuth: DimoAuthService,
    private readonly dimoTelemetry: DimoTelemetryService,
  ) {}

  async runPreflight(
    organizationId: string,
    vehicleId: string,
  ): Promise<ReferenceCapturePreflightResult> {
    const manifest = loadFrozenReferenceManifest();
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: {
        hardwareType: true,
        fuelType: true,
        dimoVehicle: { select: { tokenId: true } },
      },
    });

    if (!vehicle?.dimoVehicle?.tokenId) {
      throw new Error('Vehicle has no DIMO tokenId — preflight unavailable');
    }

    if (vehicle.hardwareType !== HardwareType.LTE_R1) {
      throw new Error(
        `Reference capture preflight requires hardwareType LTE_R1, got ${vehicle.hardwareType}`,
      );
    }

    const tokenId = vehicle.dimoVehicle.tokenId;
    const jwt = await this.dimoAuth.getVehicleJwt(tokenId);
    const providerContext = buildDimoProviderRequestContext(tokenId, {
      organizationId,
      vehicleId,
    });

    const availableTimed = await this.dimoTelemetry.queryGraphQLWithIngressTiming(
      jwt,
      buildAvailableSignalsQuery(tokenId),
      undefined,
      providerContext,
      'REFERENCE_CAPTURE',
    );

    const dataSummaryTimed = await this.dimoTelemetry.queryGraphQLWithIngressTiming(
      jwt,
      buildDataSummaryQuery(tokenId),
      undefined,
      providerContext,
      'REFERENCE_CAPTURE',
    );

    const availableSignals = Array.isArray(availableTimed.result?.data?.availableSignals)
      ? availableTimed.result.data.availableSignals.filter(
          (entry: unknown): entry is string => typeof entry === 'string',
        )
      : [];

    const dataSummary = parseDataSummaryResponse(dataSummaryTimed.result?.data);
    const snapshotTimed = await this.dimoTelemetry.queryGraphQLWithIngressTiming(
      jwt,
      buildLatestSnapshotQuery(tokenId),
      undefined,
      providerContext,
      'REFERENCE_CAPTURE',
    );
    const signalsLatest = (snapshotTimed.result?.data?.signalsLatest ?? {}) as Record<
      string,
      unknown
    >;
    const latestFields = Object.keys(signalsLatest);

    const broadFieldSet = new Set<string>([...availableSignals, ...latestFields]);
    const canonicalLookup = buildCanonicalKeyLookup();

    const broadObservationFields: BroadObservationFieldDescriptor[] = [...broadFieldSet]
      .sort()
      .map((providerField) => {
        const canonicalKey = canonicalLookup.get(providerField) ?? null;
        const summaryValue = signalsLatest[providerField];
        const capabilityState = this.classifyFieldState(
          availableSignals,
          providerField,
          summaryValue,
        );

        return {
          providerField,
          canonicalKey,
          rawIdentity: buildRawIdentity(providerField),
          temporalClass: inferTemporalClass(providerField),
          acquisitionTier: REFERENCE_CAPTURE_ACQUISITION_TIER,
          capabilityState,
        };
      });

    return {
      availableSignals,
      broadObservationFields,
      broadObservationFieldCount: broadObservationFields.length,
      manifestId: manifest.manifestId,
      manifestVersion: manifest.manifestVersion,
      connectionProfile: REFERENCE_CAPTURE_CONNECTION_PROFILE,
      powertrainProfile: resolvePowertrainProfile(vehicle.fuelType),
      hardwareProfile: vehicle.hardwareType,
      checkedAt: new Date().toISOString(),
    };
  }

  private classifyFieldState(
    availableSignals: string[],
    providerField: string,
    summaryValue: unknown,
  ): ReferenceCaptureCapabilityState {
    const listed = availableSignals.includes(providerField);
    const hasValue =
      summaryValue != null &&
      typeof summaryValue === 'object' &&
      (summaryValue as { value?: unknown }).value != null;

    if (listed && hasValue) return 'OBSERVED_NON_NULL';
    if (listed) return 'LISTED_AVAILABLE';
    if (hasValue) return 'SCHEMA_SUPPORTED';
    return 'UNKNOWN';
  }

  buildBroadObservationSetFromAvailableSignals(
    availableSignals: string[],
    dataSummarySignals: Record<string, unknown> = {},
  ): BroadObservationFieldDescriptor[] {
    const canonicalLookup = buildCanonicalKeyLookup();
    const broadFieldSet = new Set<string>([
      ...availableSignals,
      ...Object.keys(dataSummarySignals),
    ]);

    return [...broadFieldSet].sort().map((providerField) => ({
      providerField,
      canonicalKey: canonicalLookup.get(providerField) ?? null,
      rawIdentity: buildRawIdentity(providerField),
      temporalClass: inferTemporalClass(providerField),
      acquisitionTier: REFERENCE_CAPTURE_ACQUISITION_TIER,
      capabilityState: this.classifyFieldState(
        availableSignals,
        providerField,
        dataSummarySignals[providerField],
      ),
    }));
  }
}
