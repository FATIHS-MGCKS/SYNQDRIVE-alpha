import { RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS } from '@modules/rental-driving-analysis/rental-driving-analysis.recompute.types';
import { DrivingAnalysisStageOrchestratorService } from '../driving-analysis-stage/driving-analysis-stage.orchestrator.service';
import { DriverAttributionService } from '../driver-attribution/driver-attribution.service';
import { DrivingMisuseReconcileJobHandler } from '../misuse-cases/misuse-case-reconcile/driving-misuse-reconcile.handler';
import { TripAssignmentStatus } from '@prisma/client';
import { TripAssignmentService } from '../trips/trip-assignment.service';
import type { RentalDrivingAnalysisRecomputeTriggerPort } from './rental-driving-analysis-recompute-trigger.port';

function mockRentalRecomputeTriggerPort(): jest.Mocked<RentalDrivingAnalysisRecomputeTriggerPort> {
  return {
    enqueueForBooking: jest.fn().mockResolvedValue({ enqueued: true }),
    enqueueForTrip: jest.fn().mockResolvedValue({ enqueued: true }),
  };
}

describe('RentalDrivingAnalysisRecomputeTriggerPort — VI consumer parity', () => {
  let trigger: jest.Mocked<RentalDrivingAnalysisRecomputeTriggerPort>;

  beforeEach(() => {
    trigger = mockRentalRecomputeTriggerPort();
  });

  it('DrivingMisuseReconcileJobHandler awaits enqueueForBooking with MISUSE_RECONCILED', async () => {
    const reconcile = { reconcileTrip: jest.fn().mockResolvedValue({ upserted: 1, resolved: 0 }) };
    const handler = new DrivingMisuseReconcileJobHandler(reconcile as any, trigger as any);

    await handler.handle({
      id: 'job-m',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      bookingId: 'book-1',
    } as any);

    expect(trigger.enqueueForBooking).toHaveBeenCalledTimes(1);
    expect(trigger.enqueueForBooking).toHaveBeenCalledWith({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      bookingId: 'book-1',
      tripId: 'trip-1',
      reason: RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.MISUSE_RECONCILED,
      correlationId: `rental-recompute:book-1:${RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.MISUSE_RECONCILED}`,
    });
  });

  it('DrivingMisuseReconcileJobHandler skips enqueue when bookingId missing', async () => {
    const reconcile = { reconcileTrip: jest.fn().mockResolvedValue({ upserted: 0, resolved: 0 }) };
    const handler = new DrivingMisuseReconcileJobHandler(reconcile as any, trigger as any);

    await handler.handle({
      id: 'job-m',
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
    } as any);

    expect(trigger.enqueueForBooking).not.toHaveBeenCalled();
  });

  it('DriverAttributionService awaits enqueueForBooking with ATTRIBUTION_CHANGED', async () => {
    const jobDispatcher = { enqueue: jest.fn().mockResolvedValue({ enqueued: true }) };
    const service = new DriverAttributionService(
      {} as any,
      {} as any,
      {} as any,
      jobDispatcher as any,
      { resolveBookingDriverPool: jest.fn(), isDriverInBookingPool: jest.fn() },
      trigger,
    );

    await (service as any).enqueueDownstreamReconciliation({
      organizationId: 'org-a',
      vehicleId: 'veh-a',
      tripId: 'trip-a',
      bookingId: 'book-a',
      analysisRunId: 'run-a',
      correlationId: 'attr:trip-a',
    });

    expect(trigger.enqueueForBooking).toHaveBeenCalledTimes(1);
    expect(trigger.enqueueForBooking).toHaveBeenCalledWith({
      organizationId: 'org-a',
      vehicleId: 'veh-a',
      bookingId: 'book-a',
      tripId: 'trip-a',
      reason: RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.ATTRIBUTION_CHANGED,
      correlationId: `rental-recompute:book-a:${RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.ATTRIBUTION_CHANGED}`,
    });
  });

  it('DrivingAnalysisStageOrchestratorService fire-and-forget enqueueForTrip on completed run', async () => {
    const stageRepository = {
      markCompleted: jest.fn().mockResolvedValue(undefined),
      findByRun: jest.fn().mockResolvedValue([]),
    };
    const runRepository = {
      findById: jest.fn().mockResolvedValue({
        status: 'COMPLETED',
        tripId: 'trip-s',
        vehicleId: 'veh-s',
        modelVersion: 'di-pipeline-v1',
      }),
      syncStatusFromStages: jest.fn().mockResolvedValue(undefined),
    };
    const jobDispatcher = { enqueue: jest.fn() };
    const orchestrator = new DrivingAnalysisStageOrchestratorService(
      stageRepository as any,
      runRepository as any,
      jobDispatcher as any,
      undefined,
      trigger,
    );

    await orchestrator.onJobCompleted('org-s', 'run-s', 'DRIVING_ROUTE_ENRICH');
    await new Promise((r) => setImmediate(r));

    expect(trigger.enqueueForTrip).toHaveBeenCalledWith({
      organizationId: 'org-s',
      vehicleId: 'veh-s',
      tripId: 'trip-s',
      reason: RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.TRIP_ANALYSIS_COMPLETED,
      correlationId: `rental-recompute:trip-analysis:trip-s:${RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.TRIP_ANALYSIS_COMPLETED}`,
    });
  });

  it('TripAssignmentService fire-and-forget enqueueForBooking after assignment', async () => {
    const trip = {
      id: 'trip-t',
      vehicleId: 'veh-t',
      startTime: new Date(),
      endTime: new Date(),
      driverName: null,
      assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
      assignmentSubjectType: null,
      assignmentSubjectId: null,
      assignedBookingId: null,
      bookingLinkSource: null,
      bookingCustomerId: null,
      assignedDriverId: null,
      actualDriverId: null,
      isPrivateTrip: false,
    };
    const prisma = {
      vehicleTrip: {
        findUnique: jest.fn().mockResolvedValue(trip),
        update: jest.fn().mockResolvedValue(trip),
      },
      vehicle: { findUnique: jest.fn().mockResolvedValue({ organizationId: 'org-t' }) },
    };
    const service = new TripAssignmentService(prisma as any, undefined, trigger);
    jest.spyOn(service, 'resolveForTrip').mockResolvedValue({
      assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
      assignmentSubjectType: null,
      assignmentSubjectId: null,
      assignedBookingId: 'book-t',
      bookingLinkSource: null,
      bookingCustomerId: null,
      assignedDriverId: null,
      actualDriverId: null,
      isPrivateTrip: false,
      scoreEligible: true,
    });

    await service.applyAssignmentToTrip('trip-t');
    await new Promise((r) => setImmediate(r));

    expect(trigger.enqueueForBooking).toHaveBeenCalledWith({
      organizationId: 'org-t',
      vehicleId: 'veh-t',
      bookingId: 'book-t',
      tripId: 'trip-t',
      reason: RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.BOOKING_ASSIGNMENT_CORRECTED,
      correlationId: `rental-recompute:book-t:${RENTAL_DRIVING_ANALYSIS_RECOMPUTE_REASONS.BOOKING_ASSIGNMENT_CORRECTED}`,
    });
  });
});