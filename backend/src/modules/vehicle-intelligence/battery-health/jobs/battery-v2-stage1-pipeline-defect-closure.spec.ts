/**
 * Battery V2 Stage 1 pipeline defect closure — production-shaped regressions
 * for defects A/B/C/D (liveness, trip binding, REST temporal execution, DLQ).
 */
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { BatteryMeasurementSessionRepository } from '../battery-measurement-session.repository';
import { BatteryV2JobProducerService } from './battery-v2-job-producer.service';
import { BatteryV2ReconciliationService } from './battery-v2-reconciliation.service';
import { resolveLvRestWindowAnchorAt } from '../lv-rest-window/lv-rest-window.state-machine';
import { LvRestWindowEventType } from '../battery-v2-domain';
import { reduceLvRestWindow } from '../lv-rest-window/lv-rest-window.state-machine';
import { buildLvRestWindowPolicyContext } from '../lv-rest-window/lv-rest-window.policy';
import { resolveBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.resolver';
import {
  BatteryChemistry,
  BatteryDriveProfile,
} from '../battery-v2-domain';

jest.mock('@config/battery-health-v2.config', () => {
  const actual = jest.requireActual('@config/battery-health-v2.config');
  return {
    ...actual,
    isBatteryV2RestShadowEnabled: jest.fn().mockReturnValue(true),
  };
});

const ORG = 'clorg1234567890123456789012';
const VEH = 'c10351f8-b6a2-4258-947f-631aeaa6d359';

function icePolicy() {
  return buildLvRestWindowPolicyContext(
    resolveBatteryPolicy({
      driveProfile: BatteryDriveProfile.ICE,
      chemistry: BatteryChemistry.LEAD_ACID,
      lvSignalPresent: true,
    }),
  );
}

const TRIP = 'cltrip1234567890123456789012';

describe('Battery V2 Stage 1 pipeline defect closure', () => {
  describe('B — cross-trip session identity (production mis-binding shapes)', () => {
    it('repository repairs trip_id when anchor matches authoritative trip', async () => {
      const anchor = new Date('2026-08-30T12:05:53.000Z');
      const authoritativeTripId = '435cfbc3-authoritative';
      const staleTripId = '2795fa9a-stale';

      const existingSession = {
        id: 'd8b4db92-session',
        organizationId: ORG,
        vehicleId: VEH,
        tripId: staleTripId,
        startedAt: anchor,
        idempotencyKey: `lv-rest:${VEH}:${anchor.getTime()}`,
      };

      const prisma = {
        batteryMeasurementSession: {
          update: jest.fn().mockResolvedValue({
            ...existingSession,
            tripId: authoritativeTripId,
            sourceEntityId: authoritativeTripId,
          }),
        },
      };

      const repo = new BatteryMeasurementSessionRepository(prisma as any);
      const result = await repo.repairCanonicalTripBindingIfNeeded(existingSession as any, {
        organizationId: ORG,
        tripId: authoritativeTripId,
        startedAt: anchor,
        sourceEntityType: 'trip',
        sourceEntityId: authoritativeTripId,
      });

      expect(prisma.batteryMeasurementSession.update).toHaveBeenCalled();
      expect(result.tripId).toBe(authoritativeTripId);
    });

    it('FSM binds anchor to tripEndAt for sequential trips (dde74be4 shape)', () => {
      const anchorN = new Date('2026-08-30T15:47:23.000Z');
      const staleActivity = new Date('2026-08-30T15:47:23.800Z');

      const anchor = resolveLvRestWindowAnchorAt({
        observedAt: anchorN,
        providerObservedAt: anchorN,
        providerError: false,
        speedKmh: 0,
        ignitionOn: false,
        engineRunning: true,
        hasActiveTrip: false,
        isLvCharging: false,
        isHvCharging: false,
        lvVoltage: 12.5,
        lastActivityAt: staleActivity,
        tripEndAt: anchorN,
        tripId: 'e87db63d-trip-n',
      });

      expect(anchor).toEqual(anchorN);

      const transition = reduceLvRestWindow(
        VEH,
        null,
        {
          type: LvRestWindowEventType.TRIP_ENDED,
          at: anchorN,
          signal: {
            observedAt: anchorN,
            providerObservedAt: anchorN,
            providerError: false,
            speedKmh: 0,
            ignitionOn: false,
            engineRunning: true,
            hasActiveTrip: false,
            isLvCharging: false,
            isHvCharging: false,
            lvVoltage: 12.5,
            lastActivityAt: staleActivity,
            tripEndAt: anchorN,
            tripId: 'e87db63d-trip-n',
          },
        },
        icePolicy(),
      );

      expect(transition.current?.tripId).toBe('e87db63d-trip-n');
      expect(transition.current?.anchorAt).toEqual(anchorN);
    });
  });

  describe('A — finalization / deployment liveness', () => {
    const basePrisma = () => ({
      vehicleLatestState: { findMany: jest.fn().mockResolvedValue([]) },
      batteryFeatures: { findMany: jest.fn().mockResolvedValue([]) },
      batteryMeasurementSession: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      batteryMeasurement: { findFirst: jest.fn().mockResolvedValue(null) },
      vehicleTrip: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      vehicleTripDetectionState: { findMany: jest.fn().mockResolvedValue([]) },
      vehicleEnergyEvent: { findMany: jest.fn().mockResolvedValue([]) },
      hvChargeSession: { findUnique: jest.fn() },
      batteryAssessment: { findFirst: jest.fn() },
      hvBatteryHealthSnapshot: { findFirst: jest.fn() },
      batteryHealthSnapshot: { findFirst: jest.fn() },
    });

    function buildReconciliation(prisma: ReturnType<typeof basePrisma>) {
      const sessionArming = {
        ensureLvRestWindowForFinalizedTrip: jest
          .fn()
          .mockResolvedValue({ outcome: 'opened', sessionId: 'sess-recovered' }),
      };
      const lvRestSessionProducer = {
        enqueueSessionOpenForFinalizedTrip: jest.fn().mockResolvedValue('job-recovery'),
        canEnqueueForVehicle: jest.fn().mockResolvedValue(true),
      };
      const deadLetters = {
        isDeadLetter: jest.fn().mockResolvedValue(false),
        clearDeadLetter: jest.fn().mockResolvedValue(true),
      };

      return {
        service: new BatteryV2ReconciliationService(
          prisma as any,
          { enqueue: jest.fn() } as any,
          { classifyAndEnqueue: jest.fn() } as any,
          deadLetters as any,
          {
            reconcilePeriodicRefresh: jest.fn().mockResolvedValue(0),
            reconcileSignalLossRefresh: jest.fn().mockResolvedValue(0),
          } as any,
          lvRestSessionProducer as any,
          sessionArming as any,
          { repairCanonicalTripBindingIfNeeded: jest.fn() } as any,
          {
            scheduleRest60m: jest.fn(),
            scheduleRest6h: jest.fn(),
            buildScheduledTargetMetadata: jest.fn(),
            getRest60mDelayMs: jest.fn().mockReturnValue(3600000),
            getRest6hDelayMs: jest.fn().mockReturnValue(21600000),
          } as any,
          { enqueueStartProxy: jest.fn() } as any,
          { reconcilePeriodic: jest.fn().mockResolvedValue(0) } as any,
        ),
        sessionArming,
        lvRestSessionProducer,
      };
    }

    it('reconciliation directly arms missing session after simulated deploy gap (ea7696b6 shape)', async () => {
      const anchor = new Date('2026-08-30T13:57:50.848Z');
      const prisma = basePrisma();
      prisma.vehicleTrip.findMany.mockImplementation(async (args: any) => {
        if (args.where?.tripStatus === 'COMPLETED') {
          return [
            {
              id: 'ea7696b6-trip',
              vehicleId: VEH,
              endTime: anchor,
              vehicle: { organizationId: ORG },
            },
          ];
        }
        return [];
      });

      const { service, sessionArming, lvRestSessionProducer } = buildReconciliation(prisma);
      const result = await service.reconcileAll();

      expect(result.restSessions).toBe(1);
      expect(sessionArming.ensureLvRestWindowForFinalizedTrip).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG,
          vehicleId: VEH,
          tripId: 'ea7696b6-trip',
        }),
      );
      expect(lvRestSessionProducer.enqueueSessionOpenForFinalizedTrip).not.toHaveBeenCalled();
    });

    it('recovery enqueue clears DLQ suppression after lock contention dead letter', async () => {
      const anchor = new Date(Date.now() - 10 * 60_000);
      const prisma = basePrisma();
      prisma.vehicleTrip.findMany.mockImplementation(async (args: any) => {
        if (args.where?.tripStatus === 'COMPLETED') {
          return [
            {
              id: 'trip-lock',
              vehicleId: VEH,
              endTime: anchor,
              vehicle: { organizationId: ORG },
            },
          ];
        }
        return [];
      });

      const { service, sessionArming, lvRestSessionProducer } = buildReconciliation(prisma);
      sessionArming.ensureLvRestWindowForFinalizedTrip.mockResolvedValueOnce({
        outcome: 'error',
        reason: 'transient',
      });

      await service.reconcileAll();

      expect(lvRestSessionProducer.enqueueSessionOpenForFinalizedTrip).toHaveBeenCalledWith(
        expect.objectContaining({ recovery: true }),
      );
    });
  });

  describe('D — LOCK_CONTENTION / DLQ recovery semantics', () => {
    beforeEach(() => {
      jest.spyOn(RuntimeStatusRegistry, 'getWorkersEnabled').mockReturnValue(true);
    });

    it('producer bypasses dead-letter gate only on explicit recovery enqueue', async () => {
      const queue = {
        getJob: jest.fn().mockResolvedValue(null),
        add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      };
      const deadLetters = {
        isDeadLetter: jest.fn().mockResolvedValue(true),
      };
      const producer = new BatteryV2JobProducerService(queue as any, deadLetters as any);

      await producer.enqueue(
        'BATTERY_LV_REST_SESSION_OPEN',
        {
          organizationId: ORG,
          vehicleId: VEH,
          tripId: TRIP,
          tripEndedAt: new Date('2026-08-30T13:57:50.848Z').toISOString(),
          idempotencyKey: `lv-rest-open:${VEH}:1725028670848`,
          sourceEntityId: TRIP,
        } as any,
        { ignoreDeadLetter: true },
      );

      expect(deadLetters.isDeadLetter).not.toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalled();
    });
  });
});
