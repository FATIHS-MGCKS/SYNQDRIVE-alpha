import {
  BatteryGeneralizedEvidenceClass,
  BatteryRestSessionEndReason,
} from '@prisma/client';
import { BatteryRestSessionService } from './battery-rest-session.service';
import { GeneralizedEvidenceRepository } from './generalized-evidence.repository';
import type { GeneralizedEvidenceFieldBundle } from './generalized-evidence.types';
import { SHUTDOWN_TIMESTAMP_SOURCES } from '../shutdown-evidence/shutdown-evidence.constants';

function restFields(
  overrides: Partial<GeneralizedEvidenceFieldBundle> = {},
): GeneralizedEvidenceFieldBundle {
  const at = new Date('2026-09-21T08:00:00.000Z');
  return {
    voltage: 12.3,
    voltageObservedAt: at,
    voltageTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP,
    speedKmh: 0,
    speedObservedAt: at,
    speedTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    ignitionOn: false,
    ignitionObservedAt: at,
    ignitionTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    engineRunning: false,
    engineRunningObservedAt: at,
    engineRunningTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    isLvCharging: false,
    isHvCharging: false,
    chargingContextObservedAt: at,
    chargingContextTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_SNAPSHOT_TIMESTAMP,
    activeTrip: false,
    activeTripObservedAt: at,
    activeTripTimestampSource: SHUTDOWN_TIMESTAMP_SOURCES.INGEST_WALL_CLOCK,
    vehicleOnline: true,
    vehicleOnlineObservedAt: at,
    providerLastSeenAt: at,
    ...overrides,
  };
}

describe('BatteryRestSessionService', () => {
  it('E: ends active session on driving evidence before opening a new rest chain', async () => {
    const sessionId = 'session-1';
    const updateRestSession = jest.fn().mockResolvedValue({
      id: sessionId,
      anchorAt: new Date('2026-09-21T00:00:00.000Z'),
      firstRestObservationAt: null,
    });
    const repository = {
      findActiveRestSession: jest
        .fn()
        .mockResolvedValueOnce({
          id: sessionId,
          anchorAt: new Date('2026-09-21T00:00:00.000Z'),
        })
        .mockResolvedValue(null),
      updateRestSession,
      createRestSessionIdempotent: jest.fn(),
      linkObservationToSession: jest.fn(),
    } as unknown as GeneralizedEvidenceRepository;

    const service = new BatteryRestSessionService(repository);
    const referenceAt = new Date('2026-09-21T08:05:00.000Z');

    const outcome = await service.processObservation({
      organizationId: 'org',
      vehicleId: 'veh',
      observation: {
        id: 'obs-1',
        evidenceClass: BatteryGeneralizedEvidenceClass.DRIVING_NON_CHARGING,
        voltageObservedAt: referenceAt,
        tripId: null,
      } as any,
      fields: restFields({
        engineRunning: true,
        ignitionOn: true,
        speedKmh: 40,
      }),
      referenceAt,
    });

    expect(outcome).toBe('session_invalidated');
    expect(updateRestSession).toHaveBeenCalledWith(
      sessionId,
      expect.objectContaining({
        endReason: BatteryRestSessionEndReason.VEHICLE_ACTIVITY,
      }),
    );
  });

  it('opens candidate session on ENGINE_OFF_TRANSITION', async () => {
    const repository = {
      findActiveRestSession: jest.fn().mockResolvedValue(null),
      createRestSessionIdempotent: jest.fn().mockResolvedValue('created'),
      updateRestSession: jest.fn(),
      linkObservationToSession: jest.fn(),
    } as unknown as GeneralizedEvidenceRepository;

    const service = new BatteryRestSessionService(repository);
    const anchorAt = new Date('2026-09-21T20:00:44.000Z');

    const outcome = await service.processObservation({
      organizationId: 'org',
      vehicleId: 'veh',
      observation: {
        id: 'obs-shutdown',
        evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
        voltageObservedAt: anchorAt,
        tripId: 'ongoing-trip',
      } as any,
      fields: restFields(),
      referenceAt: anchorAt,
    });

    expect(outcome).toBe('session_opened');
    expect(repository.createRestSessionIdempotent).toHaveBeenCalled();
  });
});
