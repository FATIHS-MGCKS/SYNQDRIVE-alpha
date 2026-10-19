/**
 * EXP-021 48h full-trip 90s-chunk gap audit — read-only DIMO collection.
 */
import * as fs from 'fs';
import * as path from 'path';
import { TripStatus } from '@prisma/client';
import {
  bootstrapExp021PostCompletionGapObserverContext,
  resolveExp021GapObserverNestServices,
} from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-post-completion-gap-observer-bootstrap.lib';
import { mergeLaneManifests } from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-post-completion-gap-observer.lib';

const HF_FIELDS = [
  'angularVelocityYaw',
  'chassisAxleRow1WheelLeftSpeed',
  'chassisAxleRow1WheelRightSpeed',
  'obdEngineLoad',
  'obdThrottlePosition',
  'powertrainCombustionEngineMAF',
  'powertrainCombustionEngineSpeed',
  'powertrainCombustionEngineTPS',
  'powertrainCombustionEngineTorque',
  'powertrainCombustionEngineTorquePercent',
  'powertrainTractionBatteryStateOfChargeCurrent',
  'speed',
] as const;

const SETTLEMENT_FIELDS = [
  'angularVelocityYaw',
  'chassisAxleRow1WheelLeftSpeed',
  'chassisAxleRow1WheelLeftTirePressure',
  'chassisAxleRow1WheelRightSpeed',
  'chassisAxleRow1WheelRightTirePressure',
  'chassisAxleRow2WheelLeftTirePressure',
  'chassisAxleRow2WheelRightTirePressure',
  'chassisBrakeCircuit1PressurePrimary',
  'chassisBrakeCircuit2PressurePrimary',
  'chassisBrakeIsPedalPressed',
  'chassisBrakePedalPosition',
  'chassisTireSystemIsWarningOn',
  'currentLocationAltitude',
  'currentLocationHeading',
  'exteriorAirTemperature',
  'obdEngineLoad',
  'obdIntakeTemp',
  'obdOilTemperature',
  'obdThrottlePosition',
  'powertrainCombustionEngineECT',
  'powertrainCombustionEngineMAF',
  'powertrainCombustionEngineSpeed',
  'powertrainCombustionEngineTPS',
  'powertrainCombustionEngineTorque',
  'powertrainCombustionEngineTorquePercent',
  'powertrainTractionBatteryCurrentPower',
  'powertrainTractionBatteryStateOfChargeCurrent',
  'powertrainTransmissionActualGear',
  'powertrainTransmissionActualGearRatio',
  'powertrainTransmissionCurrentGear',
  'powertrainTransmissionSelectedGear',
  'powertrainTransmissionTemperature',
  'speed',
] as const;

const VEHICLES = [
  {
    label: 'WOB L 7503',
    vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
    tokenId: 192922,
  },
  {
    label: 'KS MS 661',
    vehicleId: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
    tokenId: 187361,
  },
] as const;

const EXCLUDED_TRIP_IDS = new Set(['9037edf0-68cc-4a18-a438-b81a49d9ca0a']);
const CHUNK_MS = 90_000;
const INTERVAL = '1s';
const OUT_DIR = process.env.EXP021_48H_GAP_AUDIT_DIR ?? '/tmp/exp021-48h-gap-audit';

type ChunkWindow = { index: number; from: string; to: string; durationMs: number };

function buildChunks(start: Date, end: Date): ChunkWindow[] {
  const chunks: ChunkWindow[] = [];
  let cursor = start.getTime();
  const endMs = end.getTime();
  let idx = 0;
  while (cursor < endMs) {
    const chunkEnd = Math.min(cursor + CHUNK_MS, endMs);
    chunks.push({
      index: idx++,
      from: new Date(cursor).toISOString(),
      to: new Date(chunkEnd).toISOString(),
      durationMs: chunkEnd - cursor,
    });
    cursor = chunkEnd;
  }
  return chunks;
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const since = new Date(Date.now() - 48 * 3600 * 1000);
  const app = await bootstrapExp021PostCompletionGapObserverContext({ logger: ['error', 'warn'] });
  const { prisma, providerQuery } = resolveExp021GapObserverNestServices(app);

  const cohortMeta: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    since: since.toISOString(),
    queryGeometry: '90s_trip_chunks_non_overlapping',
    vehicles: VEHICLES,
    excludedTripIds: [...EXCLUDED_TRIP_IDS],
  };

  const tripsOut: unknown[] = [];

  for (const vehicle of VEHICLES) {
    const orgVehicle = await prisma.vehicle.findFirst({
      where: { id: vehicle.vehicleId },
      select: { organizationId: true },
    });
    if (!orgVehicle) throw new Error(`Vehicle missing ${vehicle.vehicleId}`);
    const organizationId = orgVehicle.organizationId;

    const rows = await prisma.vehicleTrip.findMany({
      where: {
        vehicleId: vehicle.vehicleId,
        tripStatus: TripStatus.COMPLETED,
        startTime: { gte: since },
        endTime: { not: null },
      },
      orderBy: { endTime: 'asc' },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        distanceKm: true,
        durationMinutes: true,
      },
    });

    for (const trip of rows) {
      if (!trip.startTime || !trip.endTime) continue;
      const exclusion: string | null = EXCLUDED_TRIP_IDS.has(trip.id)
        ? 'KNOWN_OVERLAP_DEFECT_TRIP'
        : trip.endTime.getTime() <= trip.startTime.getTime()
          ? 'INVALID_DURATION_END_LTE_START'
          : null;

      if (exclusion) {
        tripsOut.push({
          vehicle: vehicle.label,
          vehicleId: vehicle.vehicleId,
          tripId: trip.id,
          excluded: true,
          exclusionReason: exclusion,
        });
        continue;
      }

      const chunks = buildChunks(trip.startTime, trip.endTime);
      const chunkResults: unknown[] = [];

      for (const chunk of chunks) {
        const windowFrom = new Date(chunk.from);
        const windowTo = new Date(chunk.to);
        const hf = await providerQuery.executeHistoricalQuery({
          tokenId: vehicle.tokenId,
          organizationId,
          vehicleId: vehicle.vehicleId,
          providerFields: [...HF_FIELDS],
          windowFrom,
          windowTo,
          interval: INTERVAL,
        });
        const settlement = await providerQuery.executeHistoricalQuery({
          tokenId: vehicle.tokenId,
          organizationId,
          vehicleId: vehicle.vehicleId,
          providerFields: [...SETTLEMENT_FIELDS],
          windowFrom,
          windowTo,
          interval: INTERVAL,
        });
        const merged = mergeLaneManifests([
          hf.bucketLocusManifestJson ?? [],
          settlement.bucketLocusManifestJson ?? [],
        ]);
        chunkResults.push({
          chunkIndex: chunk.index,
          windowFrom: chunk.from,
          windowTo: chunk.to,
          durationMs: chunk.durationMs,
          hf: {
            success: hf.providerRequestSucceeded,
            manifest: hf.bucketLocusManifestJson ?? [],
          },
          settlement: {
            success: settlement.providerRequestSucceeded,
            manifest: settlement.bucketLocusManifestJson ?? [],
          },
          mergedManifest: merged,
        });
        process.stderr.write(
          `${vehicle.label} ${trip.id} chunk ${chunk.index + 1}/${chunks.length}\n`,
        );
      }

      const durationSec = (trip.endTime.getTime() - trip.startTime.getTime()) / 1000;
      tripsOut.push({
        vehicle: vehicle.label,
        vehicleId: vehicle.vehicleId,
        tokenId: vehicle.tokenId,
        organizationId,
        tripId: trip.id,
        excluded: false,
        startTime: trip.startTime.toISOString(),
        endTime: trip.endTime.toISOString(),
        durationSec,
        durationClass: durationSec < 180 ? 'SHORT_LT_3MIN' : 'GROUND_TRUTH_ELIGIBLE_GTE_3MIN',
        distanceKm: trip.distanceKm,
        chunkCount: chunks.length,
        chunks: chunkResults,
      });

      fs.writeFileSync(
        path.join(OUT_DIR, `trip-${trip.id}.json`),
        JSON.stringify(tripsOut[tripsOut.length - 1]),
      );
    }
  }

  fs.writeFileSync(
    path.join(OUT_DIR, 'cohort-raw.json'),
    JSON.stringify({ ...cohortMeta, trips: tripsOut }, null, 0),
  );
  await app.close();
  process.stdout.write(`COLLECTION_COMPLETE trips=${tripsOut.length} dir=${OUT_DIR}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
