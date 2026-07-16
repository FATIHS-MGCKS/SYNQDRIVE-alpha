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
  ShadowMisuseCaseRef,
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
            in: [MisuseCaseType.COLD_ENGINE_ABUSE],
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

    let hfSamples: ShadowDetectorHfSample[] = [];
    const tokenId = vehicle?.dimoVehicle?.tokenId;
    if (tokenId != null && !isEv) {
      const raw = await this.segments.fetchHighFrequency(tokenId, input.startTime, endTime);
      hfSamples = raw.map(mapHfReadingToShadowSample);
    }

    const coolantSampleCount = hfSamples.filter((s) => s.coolantC != null).length;
    const exteriorTempSampleCount = hfSamples.filter((s) => s.exteriorTempC != null).length;
    const cadence = computeHfCadenceCoverage(hfSamples);
    const ice = confirmIceOperation(hfSamples);

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
      coolantSampleCount,
      exteriorTempSampleCount,
      misuseCases,
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
  };
}
