import { Injectable, Logger } from '@nestjs/common';
import {
  FuelStationEnrichmentProcessingStatus,
  FuelStationEnrichmentResolutionStatus,
  FuelStationMatchConfidence,
  type VehicleEnergyEvent,
  type VehicleEnergyEventFuelStationEnrichment,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { FuelStationLocationResolverService } from '../fuel-station-location-resolver.service';
import { FUEL_STATION_RESOLVER_VERSION } from '../fuel-station-location.types';
import type { FuelStationResolveResult } from '../fuel-station-location.types';
import { deriveCanonicalFuelStationCoordinate } from './fuel-station-enrichment-coordinate.util';
import { PHYSICAL_REFUEL_COORDINATE_SOURCE_V2 } from '../../energy-events/physical-refuel-coordinate-runtime.service';
import { buildFuelStationEnrichmentInputFingerprint } from './fuel-station-enrichment-fingerprint.util';
import { isRetryableFuelStationResolutionStatus } from './fuel-station-enrichment-trust.policy';
import { shouldSkipAutomaticFuelStationEnrichment } from './fuel-station-enrichment-lifecycle.policy';
import { FUEL_STATION_ENRICHMENT_ERROR_CODE } from './fuel-station-enrichment.types';

const MAX_ERROR_MESSAGE_LENGTH = 500;

export interface FuelStationEnrichmentRunResult {
  skipped: boolean;
  reason?: string;
  enrichment?: VehicleEnergyEventFuelStationEnrichment;
}

@Injectable()
export class FuelStationEnrichmentOrchestratorService {
  private readonly logger = new Logger(FuelStationEnrichmentOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: FuelStationLocationResolverService,
  ) {}

  async processEnergyEvent(energyEventId: string): Promise<FuelStationEnrichmentRunResult> {
    const started = Date.now();
    const event = await this.prisma.vehicleEnergyEvent.findUnique({
      where: { id: energyEventId },
      include: {
        fuelStationEnrichment: true,
        refuelReconciliation: true,
      },
    });

    if (!event) {
      this.logger.warn(`Fuel station enrichment skipped — event not found id=${energyEventId}`);
      return { skipped: true, reason: FUEL_STATION_ENRICHMENT_ERROR_CODE.EVENT_NOT_FOUND };
    }

    if (event.kind !== 'REFUEL') {
      this.logger.debug(`Fuel station enrichment skipped — not REFUEL id=${energyEventId}`);
      return { skipped: true, reason: FUEL_STATION_ENRICHMENT_ERROR_CODE.NOT_REFUEL };
    }

    const v2Reconciliation = event.refuelReconciliation;
    const hasV2ReconciliationRow = v2Reconciliation != null;
    const coordinate =
      v2Reconciliation?.coordinateLatitude != null &&
      v2Reconciliation?.coordinateLongitude != null &&
      Number.isFinite(v2Reconciliation.coordinateLatitude) &&
      Number.isFinite(v2Reconciliation.coordinateLongitude) &&
      v2Reconciliation.coordinateSource
        ? {
            latitude: v2Reconciliation.coordinateLatitude,
            longitude: v2Reconciliation.coordinateLongitude,
            source:
              v2Reconciliation.coordinateSource ?? PHYSICAL_REFUEL_COORDINATE_SOURCE_V2,
          }
        : hasV2ReconciliationRow
          ? null
          : deriveCanonicalFuelStationCoordinate(event);
    if (!coordinate) {
      const noCoordinateFingerprint = buildFuelStationEnrichmentInputFingerprint({
        energyEventId: event.id,
        latitude: 0,
        longitude: 0,
      });
      const existingNoCoordinate = event.fuelStationEnrichment;
      if (this.shouldSkipAsIdempotent(existingNoCoordinate, noCoordinateFingerprint)) {
        this.logger.debug(`Fuel station enrichment idempotent NO_COORDINATES skip id=${energyEventId}`);
        return {
          skipped: true,
          reason: 'already_completed',
          enrichment: existingNoCoordinate ?? undefined,
        };
      }

      const enrichment = await this.persistTerminalOutcome(event, {
        processingStatus: 'COMPLETED',
        resolutionStatus: 'NO_COORDINATES',
        inputLatitude: null,
        inputLongitude: null,
        inputCoordinateSource: null,
        inputFingerprint: noCoordinateFingerprint,
      });
      this.logCompletion(event.id, enrichment, Date.now() - started);
      return { skipped: false, enrichment };
    }

    const inputFingerprint = buildFuelStationEnrichmentInputFingerprint({
      energyEventId: event.id,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    });

    const existing = event.fuelStationEnrichment;
    if (this.shouldSkipAsIdempotent(existing, inputFingerprint)) {
      this.logger.debug(`Fuel station enrichment idempotent skip id=${energyEventId}`);
      return { skipped: true, reason: 'already_completed', enrichment: existing ?? undefined };
    }

    await this.markProcessing(event.id, coordinate, inputFingerprint);

    try {
      const resolveResult = await this.resolver.resolve({
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
      });

      const enrichment = await this.persistResolverOutcome(event, coordinate, inputFingerprint, resolveResult);

      if (isRetryableFuelStationResolutionStatus(enrichment.resolutionStatus)) {
        throw new Error(enrichment.errorMessage ?? 'Fuel station resolver ERROR');
      }

      this.logCompletion(event.id, enrichment, Date.now() - started);
      return { skipped: false, enrichment };
    } catch (error) {
      const message = this.sanitizeErrorMessage(error);
      await this.markRetryableFailure(event.id, message);
      throw error;
    }
  }

  private shouldSkipAsIdempotent(
    existing: VehicleEnergyEventFuelStationEnrichment | null | undefined,
    inputFingerprint: string,
  ): boolean {
    return shouldSkipAutomaticFuelStationEnrichment({
      enrichment: existing,
      inputFingerprint,
      resolverVersion: FUEL_STATION_RESOLVER_VERSION,
    });
  }

  private async markProcessing(
    energyEventId: string,
    coordinate: { latitude: number; longitude: number; source: string },
    inputFingerprint: string,
  ): Promise<void> {
    const now = new Date();
    await this.prisma.vehicleEnergyEventFuelStationEnrichment.upsert({
      where: { energyEventId },
      create: {
        energyEventId,
        processingStatus: 'PROCESSING',
        inputLatitude: coordinate.latitude,
        inputLongitude: coordinate.longitude,
        inputCoordinateSource: coordinate.source,
        inputFingerprint,
        resolverVersion: FUEL_STATION_RESOLVER_VERSION,
        attemptCount: 1,
        lastAttemptAt: now,
      },
      update: {
        processingStatus: 'PROCESSING',
        inputLatitude: coordinate.latitude,
        inputLongitude: coordinate.longitude,
        inputCoordinateSource: coordinate.source,
        inputFingerprint,
        resolverVersion: FUEL_STATION_RESOLVER_VERSION,
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        errorCode: null,
        errorMessage: null,
        failedAt: null,
      },
    });
  }

  private async persistTerminalOutcome(
    event: VehicleEnergyEvent,
    data: {
      processingStatus: FuelStationEnrichmentProcessingStatus;
      resolutionStatus: FuelStationEnrichmentResolutionStatus;
      inputLatitude: number | null;
      inputLongitude: number | null;
      inputCoordinateSource: string | null;
      inputFingerprint: string;
      matchConfidence?: FuelStationMatchConfidence | null;
      matchScore?: number | null;
      osmType?: string | null;
      osmId?: string | null;
      stationName?: string | null;
      brand?: string | null;
      operator?: string | null;
      address?: string | null;
      stationLatitude?: number | null;
      stationLongitude?: number | null;
      distanceMeters?: number | null;
      osmDatasetVersion?: string | null;
      errorCode?: string | null;
      errorMessage?: string | null;
    },
  ): Promise<VehicleEnergyEventFuelStationEnrichment> {
    const now = new Date();
    return this.prisma.vehicleEnergyEventFuelStationEnrichment.upsert({
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
        address: data.address ?? null,
        stationLatitude: data.stationLatitude ?? null,
        stationLongitude: data.stationLongitude ?? null,
        distanceMeters: data.distanceMeters ?? null,
        inputLatitude: data.inputLatitude,
        inputLongitude: data.inputLongitude,
        inputCoordinateSource: data.inputCoordinateSource,
        inputFingerprint: data.inputFingerprint,
        resolverVersion: FUEL_STATION_RESOLVER_VERSION,
        osmDatasetVersion: data.osmDatasetVersion ?? null,
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
        address: data.address ?? null,
        stationLatitude: data.stationLatitude ?? null,
        stationLongitude: data.stationLongitude ?? null,
        distanceMeters: data.distanceMeters ?? null,
        inputLatitude: data.inputLatitude,
        inputLongitude: data.inputLongitude,
        inputCoordinateSource: data.inputCoordinateSource,
        inputFingerprint: data.inputFingerprint,
        resolverVersion: FUEL_STATION_RESOLVER_VERSION,
        osmDatasetVersion: data.osmDatasetVersion ?? null,
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
    result: FuelStationResolveResult,
  ): Promise<VehicleEnergyEventFuelStationEnrichment> {
    const resolutionStatus = this.mapResolverStatus(result.status);
    const station = result.station;
    const isRetryableError = resolutionStatus === 'ERROR';

    return this.persistTerminalOutcome(event, {
      processingStatus: isRetryableError ? 'PROCESSING' : 'COMPLETED',
      resolutionStatus,
      matchConfidence: (result.confidence as FuelStationMatchConfidence | undefined) ?? null,
      matchScore: result.score ?? null,
      osmType: station?.osmType ?? null,
      osmId: station?.osmId ?? null,
      stationName: station?.name ?? null,
      brand: station?.brand ?? null,
      operator: station?.operator ?? null,
      address: station?.address ?? null,
      stationLatitude: station?.latitude ?? null,
      stationLongitude: station?.longitude ?? null,
      distanceMeters: station?.distanceMeters ?? null,
      inputLatitude: coordinate.latitude,
      inputLongitude: coordinate.longitude,
      inputCoordinateSource: coordinate.source,
      inputFingerprint,
      osmDatasetVersion: result.datasetVersion ?? null,
      errorCode: isRetryableError ? FUEL_STATION_ENRICHMENT_ERROR_CODE.RESOLVER_ERROR : null,
      errorMessage: isRetryableError
        ? this.sanitizeErrorMessage(result.errorMessage ?? 'resolver error')
        : null,
    });
  }

  private mapResolverStatus(
    status: FuelStationResolveResult['status'],
  ): FuelStationEnrichmentResolutionStatus {
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

  private async markRetryableFailure(energyEventId: string, message: string): Promise<void> {
    const now = new Date();
    await this.prisma.vehicleEnergyEventFuelStationEnrichment.updateMany({
      where: { energyEventId },
      data: {
        processingStatus: 'PROCESSING',
        resolutionStatus: 'ERROR',
        errorCode: FUEL_STATION_ENRICHMENT_ERROR_CODE.RESOLVER_ERROR,
        errorMessage: message,
        lastAttemptAt: now,
      },
    });
  }

  async markFailedAfterMaxRetries(energyEventId: string, message: string): Promise<void> {
    const now = new Date();
    await this.prisma.vehicleEnergyEventFuelStationEnrichment.upsert({
      where: { energyEventId },
      create: {
        energyEventId,
        processingStatus: 'FAILED',
        resolutionStatus: 'ERROR',
        resolverVersion: FUEL_STATION_RESOLVER_VERSION,
        attemptCount: 1,
        lastAttemptAt: now,
        failedAt: now,
        errorCode: FUEL_STATION_ENRICHMENT_ERROR_CODE.WORKER_MAX_RETRIES,
        errorMessage: this.sanitizeErrorMessage(message),
      },
      update: {
        processingStatus: 'FAILED',
        resolutionStatus: 'ERROR',
        lastAttemptAt: now,
        failedAt: now,
        errorCode: FUEL_STATION_ENRICHMENT_ERROR_CODE.WORKER_MAX_RETRIES,
        errorMessage: this.sanitizeErrorMessage(message),
      },
    });
  }

  private sanitizeErrorMessage(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error ?? 'unknown error');
    return raw.slice(0, MAX_ERROR_MESSAGE_LENGTH);
  }

  private logCompletion(
    energyEventId: string,
    enrichment: VehicleEnergyEventFuelStationEnrichment,
    durationMs: number,
  ): void {
    this.logger.log(
      JSON.stringify({
        event: 'fuel_station_enrichment_completed',
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
