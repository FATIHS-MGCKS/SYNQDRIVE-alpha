import { randomUUID } from 'crypto';
import {
  DetectionConfidence,
  PrismaClient,
  TripDetectionState,
  TripStatus,
  VehicleDetectionProfile,
} from '@prisma/client';

import { TripDecisionEngine } from '../decision/trip-decision.engine';
import { TripDetectionOrchestrationService } from '../trip-detection-orchestration.service';
import {
  END_DETECTION_MODES,
  TRIP_TRACKING_TRIGGERS,
  type TripTrackingJobData,
} from '../trip-detection.types';
import type { TripTrackingQueueLike } from '../trip-tracking-queue.util';
import { enqueueEndCycleTripTrackingJob } from '../trip-tracking-queue.util';

export type TripFinalizePostgresFixture = {
  suffix: string;
  org: { id: string };
  vehicle: { id: string; organizationId: string; dimoTokenId: number };
  trip: { id: string; startTime: Date };
  cycleToken: string;
  endTime: Date;
};

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function probeTripFinalizeDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

export async function createTripFinalizePostgresFixture(
  prisma: PrismaClient,
  options?: {
    cycleToken?: string;
    endTime?: Date;
  },
): Promise<TripFinalizePostgresFixture> {
  const suffix = uniqueSuffix();
  const cycleToken = options?.cycleToken ?? '2026-09-08T05:02:20.000Z';
  const endTime = options?.endTime ?? new Date('2026-09-08T05:02:45.000Z');
  const startTime = new Date('2026-09-08T04:33:00.000Z');

  const dimoTokenId = 900000 + Math.floor(Math.random() * 1000);

  const org = await prisma.organization.create({
    data: {
      companyName: `Trip Finalize PG ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });

  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `TF-${suffix}`.slice(0, 12),
      make: 'Test',
      model: 'Finalize',
      year: 2024,
      fuelType: 'GASOLINE',
      status: 'AVAILABLE',
    },
    select: { id: true, organizationId: true },
  });

  const trip = await prisma.vehicleTrip.create({
    data: {
      vehicleId: vehicle.id,
      tripStatus: TripStatus.ONGOING,
      startTime,
      startLatitude: 51.2,
      startLongitude: 9.3,
      distanceKm: 5.2,
      rawDetectionMeta: {},
    },
    select: { id: true, startTime: true },
  });

  await prisma.vehicleTripDetectionState.create({
    data: {
      vehicleId: vehicle.id,
      organizationId: org.id,
      state: TripDetectionState.POSSIBLE_END,
      detectionProfile: VehicleDetectionProfile.ICE,
      activeTripId: trip.id,
      possibleEndAt: new Date('2026-09-08T05:02:15.000Z'),
      possibleEndEnteredAt: new Date(cycleToken),
      lastMeaningfulMovementAt: endTime,
      lastActivityAt: endTime,
      endDetectionMode: END_DETECTION_MODES.CUSUM_VALIDATED,
      endConfidence: DetectionConfidence.MEDIUM,
      cusumValidatedAt: new Date('2026-09-08T05:17:36.000Z'),
      cusumSegmentStart: startTime,
      cusumSegmentEnd: endTime,
      endValidationAttempts: 1,
      lastEvidenceSummary: {
        endValidationCompletedAt: '2026-09-08T05:17:36.000Z',
      },
    },
  });

  return {
    suffix,
    org,
    vehicle: {
      id: vehicle.id,
      organizationId: vehicle.organizationId,
      dimoTokenId,
    },
    trip,
    cycleToken,
    endTime,
  };
}

export async function cleanupTripFinalizePostgresFixture(
  prisma: PrismaClient,
  fixture: TripFinalizePostgresFixture,
): Promise<void> {
  await prisma.vehicleTripTrackingRun.deleteMany({
    where: { vehicleId: fixture.vehicle.id },
  });
  await prisma.dimoPollLog.deleteMany({ where: { vehicleId: fixture.vehicle.id } });
  await prisma.vehicleTripWaypoint.deleteMany({ where: { tripId: fixture.trip.id } });
  await prisma.tripBehaviorEvent.deleteMany({ where: { tripId: fixture.trip.id } });
  await prisma.tripDrivingImpact.deleteMany({ where: { tripId: fixture.trip.id } });
  await prisma.vehicleTripDetectionState.deleteMany({
    where: { vehicleId: fixture.vehicle.id },
  });
  await prisma.vehicleTrip.deleteMany({ where: { vehicleId: fixture.vehicle.id } });
  await prisma.vehicle.delete({ where: { id: fixture.vehicle.id } }).catch(() => undefined);
  await prisma.organization.delete({ where: { id: fixture.org.id } }).catch(() => undefined);
}

export function createInMemoryTripTrackingQueue(): TripTrackingQueueLike & {
  jobs: Map<string, { state: string; data: TripTrackingJobData }>;
  added: TripTrackingJobData[];
} {
  const jobs = new Map<string, { state: string; data: TripTrackingJobData }>();
  const added: TripTrackingJobData[] = [];

  return {
    jobs,
    added,
    getJob: async (id: string) => {
      const entry = jobs.get(id);
      if (!entry) return undefined;
      return {
        getState: async () => entry.state,
        remove: async () => {
          jobs.delete(id);
        },
      };
    },
    add: async (_name: string, data: TripTrackingJobData, opts: { jobId: string }) => {
      added.push(data);
      jobs.set(opts.jobId, { state: 'waiting', data });
    },
  };
}

export function buildTripFinalizeJobId(vehicleId: string, tripId: string): string {
  return `trip-fin-${vehicleId}-${tripId}`;
}

export type TripFinalizeIntegrationOrchestration = {
  prisma: PrismaClient;
  decisionEngine: TripDecisionEngine;
  trackingQueue: ReturnType<typeof createInMemoryTripTrackingQueue>;
  logger: { log: (...args: unknown[]) => void; debug: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };
  getOrCreateDetectionState: TripDetectionOrchestrationService['getOrCreateDetectionState'];
  transitionState: TripDetectionOrchestrationService['transitionState'];
  acquireWorkerLock: TripDetectionOrchestrationService['acquireWorkerLock'];
  releaseWorkerLock: TripDetectionOrchestrationService['releaseWorkerLock'];
  maybeRecoverLifecycleInvariant: () => Promise<'continue'>;
  logTrackingRun: TripDetectionOrchestrationService['logTrackingRun'];
  postFinalizeAnalysisProducer: { produceAfterPersistedCompletion: () => Promise<void> };
  enrichmentOrchestrator: { enqueueBehaviorEnrichment: () => Promise<void> };
  batteryLvRestSessionProducer: { enqueueSessionOpenForFinalizedTrip: () => Promise<void> };
  logTripEndTimeline: () => void;
  parseEvidenceTimestamp: () => null;
  scheduleFinalize: TripDetectionOrchestrationService['scheduleFinalize'];
  LOCK_TTL_MS: number;
};

export function buildTripFinalizeIntegrationOrchestration(
  prisma: PrismaClient,
  queue: ReturnType<typeof createInMemoryTripTrackingQueue>,
): TripFinalizeIntegrationOrchestration {
  const decisionEngine = new TripDecisionEngine(prisma as never);
  const logger = {
    log: () => undefined,
    debug: () => undefined,
    warn: () => undefined,
  };
  const proto = TripDetectionOrchestrationService.prototype as unknown as Record<
    string,
    (...args: never[]) => unknown
  >;

  const svc = {
    prisma,
    decisionEngine,
    trackingQueue: queue,
    logger,
    LOCK_TTL_MS: 120_000,
    getOrCreateDetectionState: proto.getOrCreateDetectionState,
    transitionState: proto.transitionState,
    acquireWorkerLock: proto.acquireWorkerLock,
    releaseWorkerLock: proto.releaseWorkerLock,
    maybeRecoverLifecycleInvariant: async () => 'continue' as const,
    logTrackingRun: proto.logTrackingRun,
    postFinalizeAnalysisProducer: {
      produceAfterPersistedCompletion: async () => undefined,
    },
    enrichmentOrchestrator: {
      enqueueBehaviorEnrichment: async () => undefined,
    },
    batteryLvRestSessionProducer: {
      enqueueSessionOpenForFinalizedTrip: async () => undefined,
    },
    logTripEndTimeline: () => undefined,
    parseEvidenceTimestamp: () => null,
    scheduleFinalize: proto.scheduleFinalize,
    tripTrackingJobId: proto.tripTrackingJobId,
    enqueueTripTrackingJob: proto.enqueueTripTrackingJob,
    resolveActiveTripIdForScheduling: async (vehicleId: string) => {
      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId },
        select: { activeTripId: true },
      });
      return det?.activeTripId ?? null;
    },
  };

  return svc as unknown as TripFinalizeIntegrationOrchestration;
}

export async function scheduleFinalizeThroughQueue(
  orchestration: TripFinalizeIntegrationOrchestration,
  fixture: TripFinalizePostgresFixture,
): Promise<TripTrackingJobData | undefined> {
  await TripDetectionOrchestrationService.prototype.scheduleFinalize.call(
    orchestration,
    fixture.vehicle.id,
    fixture.org.id,
    fixture.vehicle.dimoTokenId,
  );
  const jobId = buildTripFinalizeJobId(fixture.vehicle.id, fixture.trip.id);
  return orchestration.trackingQueue.jobs.get(jobId)?.data;
}

export async function enqueueLegacyFinalizeJob(params: {
  queue: ReturnType<typeof createInMemoryTripTrackingQueue>;
  fixture: TripFinalizePostgresFixture;
  requestedAt: string;
  endCycleToken?: string;
}): Promise<TripTrackingJobData> {
  const jobId = buildTripFinalizeJobId(params.fixture.vehicle.id, params.fixture.trip.id);
  const data: TripTrackingJobData = {
    vehicleId: params.fixture.vehicle.id,
    organizationId: params.fixture.org.id,
    dimoTokenId: params.fixture.vehicle.dimoTokenId,
    trigger: TRIP_TRACKING_TRIGGERS.FINALIZE,
    requestedAt: params.requestedAt,
    ...(params.endCycleToken ? { endCycleToken: params.endCycleToken } : {}),
  };
  await enqueueEndCycleTripTrackingJob({
    queue: params.queue,
    jobName: 'trip-tracking',
    jobId,
    data,
    trigger: TRIP_TRACKING_TRIGGERS.FINALIZE,
  });
  return data;
}

export async function consumeTripTrackingFinalizeJob(
  orchestration: TripFinalizeIntegrationOrchestration,
  job: TripTrackingJobData,
): Promise<void> {
  await TripDetectionOrchestrationService.prototype.processFinalize.call(
    orchestration,
    job,
  );
}
