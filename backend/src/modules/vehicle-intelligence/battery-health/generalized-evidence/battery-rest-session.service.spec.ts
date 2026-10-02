import {
  BatteryGeneralizedEvidenceClass,
  BatteryShutdownStateAlignmentClass,
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
  it('E: ends active session on driving evidence', async () => {
    const sessionId = 'session-1';
    const updateRestSession = jest.fn().mockResolvedValue({ id: sessionId });
    const repository = {
      findActiveRestSession: jest
        .fn()
        .mockResolvedValueOnce({
          id: sessionId,
          anchorAt: new Date('2026-09-21T00:00:00.000Z'),
        })
        .mockResolvedValue(null),
      updateRestSession,
      claimOrCreateActiveRestSession: jest.fn(),
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
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
    });

    expect(outcome).toBe('session_invalidated');
    expect(updateRestSession).toHaveBeenCalled();
  });

  it('links anchor observation when opening session', async () => {
    const linkObservationToSession = jest.fn();
    const repository = {
      findActiveRestSession: jest.fn().mockResolvedValue(null),
      claimOrCreateActiveRestSession: jest
        .fn()
        .mockResolvedValue({ sessionId: 'sess-1', created: true }),
      linkObservationToSession,
      updateRestSession: jest.fn(),
    } as unknown as GeneralizedEvidenceRepository;

    const service = new BatteryRestSessionService(repository);
    const anchorAt = new Date('2026-09-21T20:00:44.000Z');

    await service.processObservation({
      organizationId: 'org',
      vehicleId: 'veh',
      observation: {
        id: 'obs-shutdown',
        evidenceClass: BatteryGeneralizedEvidenceClass.ENGINE_OFF_TRANSITION,
        voltageObservedAt: anchorAt,
        tripId: null,
      } as any,
      fields: restFields(),
      referenceAt: anchorAt,
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
    });

    expect(linkObservationToSession).toHaveBeenCalledWith(
      expect.objectContaining({
        observationId: 'obs-shutdown',
        restSessionId: 'sess-1',
        actualRestAgeMs: 0,
      }),
    );
  });
});
