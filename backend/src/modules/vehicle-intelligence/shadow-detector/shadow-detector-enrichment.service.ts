import { Injectable } from '@nestjs/common';
import { MisuseCaseType } from '@prisma/client';
import { DimoSegmentsService, type HighFrequencyReading } from '@modules/dimo/dimo-segments.service';
import { PrismaService } from '@shared/database/prisma.service';
import { isEvPowertrain } from '../driving-signals/canonical-driving-signal-mapper.config';
import {
  computeHfCadenceCoverage,
  confirmIceOperation,
  isPhevFuelType,
} from './detectors/cold-engine-shadow.policy';
import type {
  ShadowDetectorExecutionContext,
  ShadowDetectorHfSample,
  ShadowDimoIdlingSegmentRef,
  ShadowMisuseCaseRef,
  ShadowTripContext,
} from './shadow-detector.types';

@Injectable()
export class ShadowDetectorEnrichmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: DimoSegmentsService,
  ) {}

  async buildExecutionContext(input: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    startTime: Date;
    endTime: Date | null;
  }): Promise<ShadowDetectorExecutionContext> {
    const endTime = input.endTime ?? input.startTime;
    const tripDurationMs = Math.max(0, endTime.getTime() - input.startTime.getTime());
    const tripContext: ShadowTripContext = {
      tripStartTime: input.startTime.toISOString(),
      tripEndTime: input.endTime?.toISOString() ?? null,
      tripDurationMs,
    };

    const [vehicle, misuseRows] = await Promise.all([
      this.prisma.vehicle.findFirst({
        where: { id: input.vehicleId, organizationId: input.organizationId },
        select: {
          fuelType: true,
          dimoVehicle: { select: { tokenId: true } },
        },
      }),
      this.prisma.misuseCase.findMany({
        where: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          tripId: input.tripId,
          type: {
            in: [
              MisuseCaseType.COLD_ENGINE_ABUSE,
              MisuseCaseType.OVERHEATING_DAMAGE_RISK,
            ],
          },
        },
        select: {
          type: true,
          firstDetectedAt: true,
          lastDetectedAt: true,
          eventCount: true,
        },
      }),
    ]);

    const fuelType = vehicle?.fuelType ?? null;
    const isEv = isEvPowertrain(fuelType);
    const isPhev = isPhevFuelType(fuelType);
    const tokenId = vehicle?.dimoVehicle?.tokenId;

    let hfSamples: ShadowDetectorHfSample[] = [];
    let dimoIdlingSegments: ShadowDimoIdlingSegmentRef[] = [];
    let dimoIdlingProviderError: string | null = null;

    if (tokenId != null) {
      const [rawHf, idlingResult] = await Promise.all([
        this.segments.fetchHighFrequency(tokenId, input.startTime, endTime),
        this.segments.fetchTripSegmentsForMechanism(
          tokenId,
          input.startTime,
          endTime,
          'idling',
        ),
      ]);
      hfSamples = rawHf.map(mapHfReadingToShadowSample);
      dimoIdlingProviderError = idlingResult.providerError;
      dimoIdlingSegments = idlingResult.segments.map((segment) => ({
        segmentId: segment.segmentId,
        startTime: segment.startTime,
        endTime: segment.endTime,
        durationSeconds: segment.durationSeconds,
        maxSpeedKmh: segment.maxSpeedKmh,
      }));
    }

    const cadence = computeHfCadenceCoverage(hfSamples);
    const ice = confirmIceOperation(hfSamples);
    const ignitionSampleCount = hfSamples.filter((s) => s.ignitionOn != null).length;
    const rpmSampleCount = hfSamples.filter((s) => s.rpm != null).length;
    const speedSampleCount = hfSamples.filter((s) => s.speedKmh != null).length;
    const engineRuntimeSampleCount = hfSamples.filter(
      (s) => s.engineRuntimeSec != null,
    ).length;

    const misuseCases: ShadowMisuseCaseRef[] = misuseRows.map((row) => ({
      type: row.type,
      firstDetectedAt: row.firstDetectedAt,
      lastDetectedAt: row.lastDetectedAt,
      eventCount: row.eventCount,
    }));

    return {
      fuelType,
      isEvPowertrain: isEv,
      isPhev,
      iceOperationConfirmed: isPhev ? ice.confirmed : !isEv,
      hfSamples,
      effectiveCadenceMs: cadence.effectiveCadenceMs,
      p95CadenceMs: cadence.p95CadenceMs,
      hfCoverage: cadence.coverage,
      coolantSampleCount: hfSamples.filter((s) => s.coolantC != null).length,
      exteriorTempSampleCount: hfSamples.filter((s) => s.exteriorTempC != null).length,
      misuseCases,
      tripContext,
      dimoIdlingSegments,
      dimoIdlingProviderError,
      ignitionSampleCount,
      rpmSampleCount,
      speedSampleCount,
      engineRuntimeSampleCount,
      providerGaps: buildProviderGaps({
        ignitionSampleCount,
        rpmSampleCount,
        speedSampleCount,
        engineRuntimeSampleCount,
        dimoIdlingSegments,
        dimoIdlingProviderError,
        isEvPowertrain: isEv,
      }),
    };
  }
}

function mapHfReadingToShadowSample(reading: HighFrequencyReading): ShadowDetectorHfSample {
  return {
    timestamp: reading.timestamp,
    speedKmh: reading.speedKmh,
    coolantC: reading.engineCoolantTempC,
    rpm: reading.rpm,
    throttlePct: reading.throttlePosition,
    loadPct: reading.engineLoad,
    engineRuntimeSec: reading.engineRuntimeSec ?? null,
    torqueNm: reading.engineTorqueNm ?? null,
    torquePct: reading.engineTorquePct ?? null,
    exteriorTempC: reading.exteriorAirTempC ?? null,
    tractionBatteryPowerKw: reading.tractionBatteryPowerKw,
    altitudeM: reading.altitudeM ?? null,
    gear: reading.currentGear ?? null,
    ignitionOn: reading.ignitionOn ?? null,
  };
}

function buildProviderGaps(input: {
  ignitionSampleCount: number;
  rpmSampleCount: number;
  speedSampleCount: number;
  engineRuntimeSampleCount: number;
  dimoIdlingSegments: readonly ShadowDimoIdlingSegmentRef[];
  dimoIdlingProviderError: string | null;
  isEvPowertrain: boolean;
}): string[] {
  const gaps: string[] = [];
  if (input.speedSampleCount === 0) gaps.push('MISSING_SPEED');
  if (!input.isEvPowertrain && input.rpmSampleCount === 0) gaps.push('MISSING_RPM');
  if (input.ignitionSampleCount === 0) gaps.push('MISSING_IGNITION');
  if (!input.isEvPowertrain && input.engineRuntimeSampleCount === 0) {
    gaps.push('MISSING_ENGINE_RUNTIME');
  }
  if (input.dimoIdlingProviderError) {
    gaps.push('DIMO_IDLING_PROVIDER_ERROR');
  } else if (input.dimoIdlingSegments.length === 0) {
    gaps.push('DIMO_IDLING_SEGMENTS_UNAVAILABLE');
  }
  return gaps;
}
