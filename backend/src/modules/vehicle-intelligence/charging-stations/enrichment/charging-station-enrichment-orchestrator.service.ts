import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  ChargingStationEnrichmentProcessingStatus,
  ChargingStationEnrichmentResolutionStatus,
  ChargingStationMatchConfidence,
  Prisma,
  type VehicleEnergyEvent,
  type VehicleEnergyEventChargingStationEnrichment,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ChargingStationLocationResolverService } from '../charging-station-location-resolver.service';
import { CHARGING_STATION_RESOLVER_VERSION } from '../charging-station-location.types';
import type { ChargingStationResolveResult } from '../charging-station-location.types';
import { CHARGING_ENRICHMENT_COORDINATE_SELECTOR_VERSION } from './charging-station-enrichment.constants';
import {
  deriveCanonicalChargingStationEnrichmentCoordinate,
  type ChargingEnrichmentCoordinateOutcome,
} from './derive-canonical-charging-station-enrichment-coordinate';
import { buildChargingStationEnrichmentInputFingerprint } from './charging-station-enrichment-fingerprint.util';
import { shouldSkipAutomaticChargingStationEnrichment } from './charging-station-enrichment-lifecycle.policy';
import {
  isRetryableChargingStationResolutionStatus,
  isTrustedChargingStationAssignment,
} from './charging-station-enrichment-trust.policy';
import {
  CHARGING_STATION_ENRICHMENT_ERROR_CODE,
  isCanonicalErdRechargeForChargingEnrichment,
} from './charging-station-enrichment.types';
import { ChargingStationEnrichmentMetricsService } from './charging-station-enrichment.metrics';

const MAX_ERROR_MESSAGE_LENGTH = 500;
const MAX_DIAGNOSTICS_JSON_BYTES = 4096;

export interface ChargingStationEnrichmentRunResult {
  skipped: boolean;
  reason?: string;
  enrichment?: VehicleEnergyEventChargingStationEnrichment;
}

@Injectable()
export class ChargingStationEnrichmentOrchestratorService {
  private readonly logger = new Logger(ChargingStationEnrichmentOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: ChargingStationLocationResolverService,
    @Optional() private readonly metrics?: ChargingStationEnrichmentMetricsService,
  ) {}

  async processEnergyEvent(energyEventId: string): Promise<ChargingStationEnrichmentRunResult> {
    const started = Date.now();
    const event = await this.prisma.vehicleEnergyEvent.findUnique({
      where: { id: energyEventId },
      include: { chargingStationEnrichment: true },
    });

    if (!event) {
      this.logger.warn(`Charging station enrichment skipped — event not found id=${energyEventId}`);
      return { skipped: true, reason: CHARGING_STATION_ENRICHMENT_ERROR_CODE.EVENT_NOT_FOUND };
    }

    if (event.kind !== 'RECHARGE') {
      return { skipped: true, reason: CHARGING_STATION_ENRICHMENT_ERROR_CODE.NOT_RECHARGE };
    }

    if (!isCanonicalErdRechargeForChargingEnrichment(event)) {
      return {
        skipped: true,
        reason: CHARGING_STATION_ENRICHMENT_ERROR_CODE.NOT_CANONICAL_RECHARGE,
      };
    }

    const coordinateOutcome = deriveCanonicalChargingStationEnrichmentCoordinate(event);
    this.metrics?.recordCoordinateSelector(coordinateOutcome.status);

    const inputFingerprint = buildChargingStationEnrichmentInputFingerprint({
      energyEventId: event.id,
      coordinateOutcome,
    });

    const existing = event.chargingStationEnrichment;
    if (this.shouldSkipAsIdempotent(existing, inputFingerprint)) {
      return { skipped: true, reason: 'already_completed', enrichment: existing ?? undefined };
    }

    if (coordinateOutcome.status === 'NO_COORDINATES') {
      const enrichment = await this.persistTerminalOutcome(event, {
        processingStatus: 'COMPLETED',
        resolutionStatus: 'NO_COORDINATES',
        inputLatitude: null,
        inputLongitude: null,
        inputCoordinateSource: null,
        inputFingerprint,
        resolverDiagnostics: null,
      });
      this.recordResolutionMetric(enrichment);
      this.logCompletion(event.id, enrichment, Date.now() - started);
      return { skipped: false, enrichment };
    }

    if (coordinateOutcome.status === 'INCONSISTENT_COORDINATES') {
      const enrichment = await this.persistTerminalOutcome(event, {
        processingStatus: 'COMPLETED',
        resolutionStatus: 'INCONSISTENT_COORDINATES',
        inputLatitude: null,
        inputLongitude: null,
        inputCoordinateSource: null,
        inputFingerprint,
        resolverDiagnostics: this.boundDiagnostics({
          spreadMeters: coordinateOutcome.spreadMeters,
          inconsistent: true,
        }),
      });
      this.recordResolutionMetric(enrichment);
      this.logCompletion(event.id, enrichment, Date.now() - started);
      return { skipped: false, enrichment };
    }

    const coordinate = {
      latitude: coordinateOutcome.latitude,
      longitude: coordinateOutcome.longitude,
      source: coordinateOutcome.source,
    };

    await this.markProcessing(event.id, coordinate, inputFingerprint);

    try {
      const resolveResult = await this.resolver.resolve({
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
      });

      const enrichment = await this.persistResolverOutcome(
        event,
        coordinate,
        inputFingerprint,
        resolveResult,
      );

      if (isRetryableChargingStationResolutionStatus(enrichment.resolutionStatus)) {
        throw new Error(enrichment.errorMessage ?? 'Charging station resolver ERROR');
      }

      this.recordResolutionMetric(enrichment);
      this.logCompletion(event.id, enrichment, Date.now() - started);
      return { skipped: false, enrichment };
    } catch (error) {
      const message = this.sanitizeErrorMessage(error);
      await this.markRetryableFailure(event.id, message);
      throw error;
    }
  }

  private shouldSkipAsIdempotent(
    existing: VehicleEnergyEventChargingStationEnrichment | null | undefined,
    inputFingerprint: string,
  ): boolean {
    return shouldSkipAutomaticChargingStationEnrichment({
      enrichment: existing,
      inputFingerprint,
      resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
    });
  }

  private async markProcessing(
    energyEventId: string,
    coordinate: { latitude: number; longitude: number; source: string },
    inputFingerprint: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.vehicleEnergyEventChargingStationEnrichment.upsert({
      where: { energyEventId },
      create: {
        energyEventId,
        processingStatus: 'PROCESSING',
        inputLatitude: coordinate.latitude,
        inputLongitude: coordinate.longitude,
        inputCoordinateSource: coordinate.source,
        inputCoordinateSelectorVersion: CHARGING_ENRICHMENT_COORDINATE_SELECTOR_VERSION,
        inputFingerprint,
        resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
        attemptCount: 1,
        lastAttemptAt: now,
      },
      update: {
        processingStatus: 'PROCESSING',
        inputLatitude: coordinate.latitude,
        inputLongitude: coordinate.longitude,
        inputCoordinateSource: coordinate.source,
        inputCoordinateSelectorVersion: CHARGING_ENRICHMENT_COORDINATE_SELECTOR_VERSION,
        inputFingerprint,
        resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        errorCode: null,
        errorMessage: null,
        failedAt: null,
        osmType: null,
        osmId: null,
        stationName: null,
        brand: null,
        operator: null,
        network: null,
        address: null,
        stationLatitude: null,
        stationLongitude: null,
        geometryDistanceMeters: null,
        pointDistanceMeters: null,
        access: null,
        fee: null,
        capacity: null,
        connectors: Prisma.JsonNull,
        stationMaxOutputKw: null,
        matchConfidence: null,
        matchScore: null,
        osmDatasetVersion: null,
        resolverDiagnostics: Prisma.JsonNull,
      },
    });
  }

  private async persistTerminalOutcome(
    event: VehicleEnergyEvent,
    data: {
      processingStatus: ChargingStationEnrichmentProcessingStatus;
      resolutionStatus: ChargingStationEnrichmentResolutionStatus;
      inputLatitude: number | null;
      inputLongitude: number | null;
      inputCoordinateSource: string | null;
      inputFingerprint: string;
      matchConfidence?: ChargingStationMatchConfidence | null;
      matchScore?: number | null;
      osmType?: string | null;
      osmId?: string | null;
      stationName?: string | null;
      brand?: string | null;
      operator?: string | null;
      network?: string | null;
      address?: string | null;
      stationLatitude?: number | null;
      stationLongitude?: number | null;
      geometryDistanceMeters?: number | null;
      pointDistanceMeters?: number | null;
      access?: string | null;
      fee?: string | null;
      capacity?: string | null;
      connectors?: Prisma.InputJsonValue | typeof Prisma.JsonNull;
      stationMaxOutputKw?: number | null;
      osmDatasetVersion?: string | null;
      resolverDiagnostics?: Prisma.InputJsonValue | typeof Prisma.JsonNull | null;
      errorCode?: string | null;
      errorMessage?: string | null;
    },
  ): Promise<VehicleEnergyEventChargingStationEnrichment> {
    const now = new Date();
    const connectorsValue =
      data.connectors === undefined ? undefined : data.connectors ?? Prisma.JsonNull;
    return this.prisma.vehicleEnergyEventChargingStationEnrichment.upsert({
      where: { energyEventId: event.id },
      create: {
        energyEventId: event.id,
        processingStatus: data.processingStatus,
        resolutionStatus: data.resolutionStatus,
        matchConfidence: data.matchConfidence ?? null,
        matchScore: data.matchScore ?? null,
        osmType: data.osmType ?? null,
        osmId: data.osmId ?? null,
        stationName: data.stationName ?? null,
        brand: data.brand ?? null,
        operator: data.operator ?? null,
        network: data.network ?? null,
        address: data.address ?? null,
        stationLatitude: data.stationLatitude ?? null,
        stationLongitude: data.stationLongitude ?? null,
        geometryDistanceMeters: data.geometryDistanceMeters ?? null,
        pointDistanceMeters: data.pointDistanceMeters ?? null,
        access: data.access ?? null,
        fee: data.fee ?? null,
        capacity: data.capacity ?? null,
        connectors: connectorsValue ?? Prisma.JsonNull,
        stationMaxOutputKw: data.stationMaxOutputKw ?? null,
        inputLatitude: data.inputLatitude,
        inputLongitude: data.inputLongitude,
        inputCoordinateSource: data.inputCoordinateSource,
        inputCoordinateSelectorVersion: CHARGING_ENRICHMENT_COORDINATE_SELECTOR_VERSION,
        inputFingerprint: data.inputFingerprint,
        resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
        osmDatasetVersion: data.osmDatasetVersion ?? null,
        resolverDiagnostics: data.resolverDiagnostics ?? Prisma.JsonNull,
        attemptCount: 1,
        lastAttemptAt: now,
        resolvedAt: data.processingStatus === 'COMPLETED' ? now : null,
        failedAt: data.processingStatus === 'FAILED' ? now : null,
        errorCode: data.errorCode ?? null,
        errorMessage: data.errorMessage ?? null,
      },
      update: {
        processingStatus: data.processingStatus,
        resolutionStatus: data.resolutionStatus,
        matchConfidence: data.matchConfidence ?? null,
        matchScore: data.matchScore ?? null,
        osmType: data.osmType ?? null,
        osmId: data.osmId ?? null,
        stationName: data.stationName ?? null,
        brand: data.brand ?? null,
        operator: data.operator ?? null,
        network: data.network ?? null,
        address: data.address ?? null,
        stationLatitude: data.stationLatitude ?? null,
        stationLongitude: data.stationLongitude ?? null,
        geometryDistanceMeters: data.geometryDistanceMeters ?? null,
        pointDistanceMeters: data.pointDistanceMeters ?? null,
        access: data.access ?? null,
        fee: data.fee ?? null,
        capacity: data.capacity ?? null,
        ...(connectorsValue !== undefined ? { connectors: connectorsValue } : {}),
        stationMaxOutputKw: data.stationMaxOutputKw ?? null,
        inputLatitude: data.inputLatitude,
        inputLongitude: data.inputLongitude,
        inputCoordinateSource: data.inputCoordinateSource,
        inputCoordinateSelectorVersion: CHARGING_ENRICHMENT_COORDINATE_SELECTOR_VERSION,
        inputFingerprint: data.inputFingerprint,
        resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
        osmDatasetVersion: data.osmDatasetVersion ?? null,
        ...(data.resolverDiagnostics !== undefined
          ? { resolverDiagnostics: data.resolverDiagnostics ?? Prisma.JsonNull }
          : {}),
        lastAttemptAt: now,
        resolvedAt: data.processingStatus === 'COMPLETED' ? now : null,
        failedAt: data.processingStatus === 'FAILED' ? now : null,
        errorCode: data.errorCode ?? null,
        errorMessage: data.errorMessage ?? null,
      },
    });
  }

  private async persistResolverOutcome(
    event: VehicleEnergyEvent,
    coordinate: { latitude: number; longitude: number; source: string },
    inputFingerprint: string,
    result: ChargingStationResolveResult,
  ): Promise<VehicleEnergyEventChargingStationEnrichment> {
    const resolutionStatus = this.mapResolverStatus(result.status);
    const isRetryableError = resolutionStatus === 'ERROR';
    const station = resolutionStatus === 'MATCHED' ? result.station : undefined;

    return this.persistTerminalOutcome(event, {
      processingStatus: isRetryableError ? 'PROCESSING' : 'COMPLETED',
      resolutionStatus,
      matchConfidence: (result.confidence as ChargingStationMatchConfidence | undefined) ?? null,
      matchScore: result.score ?? null,
      osmType: station?.osmType ?? null,
      osmId: station?.osmId ?? null,
      stationName: station?.name ?? null,
      brand: station?.brand ?? null,
      operator: station?.operator ?? null,
      network: station?.network ?? null,
      address: station?.address ?? null,
      stationLatitude: station?.latitude ?? null,
      stationLongitude: station?.longitude ?? null,
      geometryDistanceMeters: station?.geometryDistanceMeters ?? null,
      pointDistanceMeters: station?.pointDistanceMeters ?? null,
      access: station?.access ?? null,
      fee: station?.fee ?? null,
      capacity: station?.capacity ?? null,
      connectors: station?.connectors
        ? (station.connectors as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      stationMaxOutputKw: station?.stationMaxOutputKw ?? null,
      inputLatitude: coordinate.latitude,
      inputLongitude: coordinate.longitude,
      inputCoordinateSource: coordinate.source,
      inputFingerprint,
      osmDatasetVersion: result.datasetVersion ?? null,
      resolverDiagnostics: this.boundResolverDiagnostics(result),
      errorCode: isRetryableError ? CHARGING_STATION_ENRICHMENT_ERROR_CODE.RESOLVER_ERROR : null,
      errorMessage: isRetryableError
        ? this.sanitizeErrorMessage(result.errorMessage ?? 'resolver error')
        : null,
    });
  }

  private mapResolverStatus(
    status: ChargingStationResolveResult['status'],
  ): ChargingStationEnrichmentResolutionStatus {
    switch (status) {
      case 'MATCHED':
        return 'MATCHED';
      case 'AMBIGUOUS':
        return 'AMBIGUOUS';
      case 'NOT_FOUND':
        return 'NOT_FOUND';
      case 'INVALID_COORDINATES':
        return 'INVALID_COORDINATES';
      case 'ERROR':
      default:
        return 'ERROR';
    }
  }

  private boundResolverDiagnostics(result: ChargingStationResolveResult): Prisma.InputJsonValue {
    const diag = result.diagnostics;
    return this.boundDiagnostics({
      status: result.status,
      candidateCount: diag?.dedupedCandidateCount ?? diag?.rawCandidateCount,
      searchRadiusMeters: diag?.searchRadiusMeters,
      usedFallbackRadius: diag?.usedFallbackRadius,
      ambiguousCandidateCount: result.status === 'AMBIGUOUS' ? result.candidates?.length : undefined,
    });
  }

  private boundDiagnostics(payload: Record<string, unknown>): Prisma.InputJsonValue {
    const json = JSON.stringify(payload);
    if (json.length <= MAX_DIAGNOSTICS_JSON_BYTES) {
      return payload as Prisma.InputJsonValue;
    }
    return { truncated: true, preview: json.slice(0, MAX_DIAGNOSTICS_JSON_BYTES) };
  }

  private async markRetryableFailure(energyEventId: string, message: string): Promise<void> {
    const now = new Date();
    await this.prisma.vehicleEnergyEventChargingStationEnrichment.updateMany({
      where: { energyEventId },
      data: {
        processingStatus: 'PROCESSING',
        resolutionStatus: 'ERROR',
        errorCode: CHARGING_STATION_ENRICHMENT_ERROR_CODE.RESOLVER_ERROR,
        errorMessage: message,
        lastAttemptAt: now,
      },
    });
  }

  async markFailedAfterMaxRetries(energyEventId: string, message: string): Promise<void> {
    const now = new Date();
    await this.prisma.vehicleEnergyEventChargingStationEnrichment.upsert({
      where: { energyEventId },
      create: {
        energyEventId,
        processingStatus: 'FAILED',
        resolutionStatus: 'ERROR',
        resolverVersion: CHARGING_STATION_RESOLVER_VERSION,
        inputCoordinateSelectorVersion: CHARGING_ENRICHMENT_COORDINATE_SELECTOR_VERSION,
        attemptCount: 1,
        lastAttemptAt: now,
        failedAt: now,
        errorCode: CHARGING_STATION_ENRICHMENT_ERROR_CODE.WORKER_MAX_RETRIES,
        errorMessage: this.sanitizeErrorMessage(message),
      },
      update: {
        processingStatus: 'FAILED',
        resolutionStatus: 'ERROR',
        lastAttemptAt: now,
        failedAt: now,
        errorCode: CHARGING_STATION_ENRICHMENT_ERROR_CODE.WORKER_MAX_RETRIES,
        errorMessage: this.sanitizeErrorMessage(message),
      },
    });
  }

  private sanitizeErrorMessage(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error ?? 'unknown error');
    return raw.slice(0, MAX_ERROR_MESSAGE_LENGTH);
  }

  private recordResolutionMetric(enrichment: VehicleEnergyEventChargingStationEnrichment): void {
    this.metrics?.recordResolution({
      resolutionStatus: enrichment.resolutionStatus ?? 'unknown',
      confidence: enrichment.matchConfidence ?? 'none',
      trusted: String(
        isTrustedChargingStationAssignment({
          resolutionStatus: enrichment.resolutionStatus,
          matchConfidence: enrichment.matchConfidence,
        }),
      ),
    });
  }

  private logCompletion(
    energyEventId: string,
    enrichment: VehicleEnergyEventChargingStationEnrichment,
    durationMs: number,
  ): void {
    this.logger.log(
      JSON.stringify({
        event: 'charging_station_enrichment_completed',
        energyEventId,
        processingStatus: enrichment.processingStatus,
        resolutionStatus: enrichment.resolutionStatus,
        matchConfidence: enrichment.matchConfidence,
        resolverVersion: enrichment.resolverVersion,
        osmDatasetVersion: enrichment.osmDatasetVersion,
        attemptNumber: enrichment.attemptCount,
        durationMs,
      }),
    );
  }
}
