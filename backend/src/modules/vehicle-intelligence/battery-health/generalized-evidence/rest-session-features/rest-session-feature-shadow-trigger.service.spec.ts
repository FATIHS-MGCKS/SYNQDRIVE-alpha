import {
  BatteryGeneralizedEvidenceClass,
  BatteryRestSessionEndReason,
  BatteryShutdownStateAlignmentClass,
} from '@prisma/client';
import { BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV } from '@config/battery-health-v2.config';
import { BatteryRestSessionService } from '../battery-rest-session.service';
import { GeneralizedEvidenceRepository } from '../generalized-evidence.repository';
import { LateTripAssociationService } from '../late-trip-association.service';
import { SHUTDOWN_TIMESTAMP_SOURCES } from '../../shutdown-evidence/shutdown-evidence.constants';
import type { GeneralizedEvidenceFieldBundle } from '../generalized-evidence.types';
import { RestSessionFeatureComputationService } from './rest-session-feature-computation.service';
import { RestSessionFeatureShadowTriggerService } from './rest-session-feature-shadow-trigger.service';
import { readFileSync } from 'fs';
import { join } from 'path';

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

describe('RestSessionFeatureShadowTriggerService (C4 unit)', () => {
  const shadowBackup = process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV];

  afterEach(() => {
    if (shadowBackup === undefined) {
      delete process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV];
    } else {
      process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV] = shadowBackup;
    }
  });

  function buildHarness(flagOn: boolean) {
    process.env[BATTERY_V2_REST_SESSION_FEATURES_SHADOW_ENABLED_ENV] = flagOn
      ? 'true'
      : 'false';
    const computeAndPersist = jest.fn();
    const computation = {
      computeAndPersist,
    } as unknown as RestSessionFeatureComputationService;
    const trigger = new RestSessionFeatureShadowTriggerService(computation);
    return { trigger, computeAndPersist };
  }

  const baseInput = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    restSessionId: 'sess-1',
  };

  it('TEST_A: flag OFF valid-rest trigger → C3 not called', async () => {
    const { trigger, computeAndPersist } = buildHarness(false);
    const outcome = await trigger.triggerFeatureComputation({
      ...baseInput,
      reason: 'VALID_REST_OBSERVATION_LINKED',
    });
    expect(outcome.status).toBe('SKIPPED_FLAG_OFF');
    expect(computeAndPersist).not.toHaveBeenCalled();
  });

  it('TEST_B: flag OFF terminal trigger → C3 not called', async () => {
    const { trigger, computeAndPersist } = buildHarness(false);
    await trigger.triggerFeatureComputation({
      ...baseInput,
      reason: 'REST_SESSION_TERMINAL',
      terminalSubcontext: 'SESSION_TIMEOUT',
    });
    expect(computeAndPersist).not.toHaveBeenCalled();
  });

  it('TEST_C: flag OFF late-association trigger → C3 not called', async () => {
    const { trigger, computeAndPersist } = buildHarness(false);
    await trigger.triggerFeatureComputation({
      ...baseInput,
      reason: 'LATE_TRIP_ASSOCIATION',
    });
    expect(computeAndPersist).not.toHaveBeenCalled();
  });

  it('TEST_J: C3 CREATED maps through trigger', async () => {
    const { trigger, computeAndPersist } = buildHarness(true);
    computeAndPersist.mockResolvedValue({ status: 'CREATED', row: { id: 'row-1' } });
    const outcome = await trigger.triggerFeatureComputation({
      ...baseInput,
      reason: 'VALID_REST_OBSERVATION_LINKED',
    });
    expect(outcome.status).toBe('CREATED');
  });

  it('TEST_K: C3 DUPLICATE_EXISTING maps through trigger', async () => {
    const { trigger, computeAndPersist } = buildHarness(true);
    computeAndPersist.mockResolvedValue({ status: 'DUPLICATE_EXISTING', row: { id: 'row-1' } });
    const outcome = await trigger.triggerFeatureComputation({
      ...baseInput,
      reason: 'REST_SESSION_TERMINAL',
    });
    expect(outcome.status).toBe('DUPLICATE_EXISTING');
  });

  it('TEST_L: C3 SESSION_NOT_FOUND remains isolated', async () => {
    const { trigger, computeAndPersist } = buildHarness(true);
    computeAndPersist.mockResolvedValue({ status: 'SESSION_NOT_FOUND' });
    const outcome = await trigger.triggerFeatureComputation({
      ...baseInput,
      reason: 'LATE_TRIP_ASSOCIATION',
    });
    expect(outcome.status).toBe('SESSION_NOT_FOUND');
  });

  it('TEST_M: C3 throws → FAILED_ISOLATED → no throw to caller', async () => {
    const { trigger, computeAndPersist } = buildHarness(true);
    computeAndPersist.mockRejectedValue(new Error('boom'));
    await expect(
      trigger.triggerFeatureComputation({
        ...baseInput,
        reason: 'VALID_REST_OBSERVATION_LINKED',
      }),
    ).resolves.toEqual(
      expect.objectContaining({ status: 'FAILED_ISOLATED', errorMessage: 'boom' }),
    );
  });

  it('TEST_N: trigger reason does not enter digest/input', async () => {
    const { trigger, computeAndPersist } = buildHarness(true);
    computeAndPersist.mockResolvedValue({ status: 'CREATED', row: { id: 'r' } });
    await trigger.triggerFeatureComputation({
      ...baseInput,
      reason: 'REST_SESSION_TERMINAL',
      terminalSubcontext: 'NEW_TRIP',
    });
    expect(computeAndPersist).toHaveBeenCalledWith({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      restSessionId: 'sess-1',
    });
  });
});

describe('BatteryRestSessionService C4 hooks', () => {
  it('TEST_D: valid rest observation → trigger after linkage', async () => {
    const triggerFeatureComputation = jest.fn().mockResolvedValue({ status: 'CREATED' });
    const trigger = {
      triggerFeatureComputation,
    } as unknown as RestSessionFeatureShadowTriggerService;
    const linkObservationToSession = jest.fn();
    const updateRestSession = jest.fn().mockResolvedValue({ id: 'sess-1' });
    const repository = {
      findActiveRestSession: jest.fn().mockResolvedValue({
        id: 'sess-1',
        organizationId: 'org',
        vehicleId: 'veh',
        anchorAt: new Date('2026-09-21T00:00:00.000Z'),
      }),
      updateRestSession,
      linkObservationToSession,
    } as unknown as GeneralizedEvidenceRepository;
    const service = new BatteryRestSessionService(repository, undefined, trigger);
    const observedAt = new Date('2026-09-21T08:00:00.000Z');
    await service.processObservation({
      organizationId: 'org',
      vehicleId: 'veh',
      observation: {
        id: 'obs-rest',
        evidenceClass: BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
        voltageObservedAt: observedAt,
        tripId: null,
      } as any,
      fields: restFields({ voltageObservedAt: observedAt }),
      referenceAt: observedAt,
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
    });
    expect(linkObservationToSession).toHaveBeenCalled();
    expect(triggerFeatureComputation).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'VALID_REST_OBSERVATION_LINKED',
        restSessionId: 'sess-1',
      }),
    );
  });

  it('TEST_E: unqualified rest observation → no feature trigger', async () => {
    const triggerFeatureComputation = jest.fn();
    const trigger = {
      triggerFeatureComputation,
    } as unknown as RestSessionFeatureShadowTriggerService;
    const repository = {
      findActiveRestSession: jest.fn().mockResolvedValue({
        id: 'sess-1',
        organizationId: 'org',
        vehicleId: 'veh',
        anchorAt: new Date('2026-09-21T00:00:00.000Z'),
      }),
      updateRestSession: jest.fn().mockResolvedValue({ id: 'sess-1' }),
      linkObservationToSession: jest.fn(),
    } as unknown as GeneralizedEvidenceRepository;
    const service = new BatteryRestSessionService(repository, undefined, trigger);
    await service.processObservation({
      organizationId: 'org',
      vehicleId: 'veh',
      observation: {
        id: 'obs-rest',
        evidenceClass: BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
        voltageObservedAt: new Date('2026-09-21T08:00:00.000Z'),
        tripId: null,
      } as any,
      fields: restFields(),
      referenceAt: new Date('2026-09-21T08:00:00.000Z'),
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.SKEWED,
    });
    expect(triggerFeatureComputation).not.toHaveBeenCalled();
  });

  it('C4.1: zero-age REST_WAKE (same timestamp as anchor) → no valid count, no C3', async () => {
    const triggerFeatureComputation = jest.fn();
    const trigger = { triggerFeatureComputation } as unknown as RestSessionFeatureShadowTriggerService;
    const updateRestSession = jest.fn().mockResolvedValue({ id: 'sess-1' });
    const anchorAt = new Date('2026-09-21T08:00:00.000Z');
    const repository = {
      findActiveRestSession: jest.fn().mockResolvedValue({
        id: 'sess-1',
        organizationId: 'org',
        vehicleId: 'veh',
        anchorAt,
      }),
      updateRestSession,
      linkObservationToSession: jest.fn(),
    } as unknown as GeneralizedEvidenceRepository;
    const service = new BatteryRestSessionService(repository, undefined, trigger);
    await service.processObservation({
      organizationId: 'org',
      vehicleId: 'veh',
      observation: {
        id: 'obs-zero',
        evidenceClass: BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
        voltageObservedAt: anchorAt,
        tripId: null,
      } as any,
      fields: restFields({ voltageObservedAt: anchorAt }),
      referenceAt: anchorAt,
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
    });
    expect(updateRestSession).toHaveBeenCalledWith(
      'sess-1',
      expect.not.objectContaining({ validRestObservationCount: { increment: 1 } }),
    );
    expect(triggerFeatureComputation).not.toHaveBeenCalled();
  });

  it('C4.1: 1 ms after anchor → valid count + C3 trigger once', async () => {
    const triggerFeatureComputation = jest.fn().mockResolvedValue({ status: 'CREATED' });
    const trigger = { triggerFeatureComputation } as unknown as RestSessionFeatureShadowTriggerService;
    const updateRestSession = jest.fn().mockResolvedValue({ id: 'sess-1' });
    const anchorAt = new Date('2026-09-21T08:00:00.000Z');
    const observedAt = new Date(anchorAt.getTime() + 1);
    const repository = {
      findActiveRestSession: jest.fn().mockResolvedValue({
        id: 'sess-1',
        organizationId: 'org',
        vehicleId: 'veh',
        anchorAt,
      }),
      updateRestSession,
      linkObservationToSession: jest.fn(),
    } as unknown as GeneralizedEvidenceRepository;
    const service = new BatteryRestSessionService(repository, undefined, trigger);
    await service.processObservation({
      organizationId: 'org',
      vehicleId: 'veh',
      observation: {
        id: 'obs-pos',
        evidenceClass: BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
        voltageObservedAt: observedAt,
        tripId: null,
      } as any,
      fields: restFields({ voltageObservedAt: observedAt }),
      referenceAt: observedAt,
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
    });
    expect(updateRestSession).toHaveBeenCalledWith(
      'sess-1',
      expect.objectContaining({ validRestObservationCount: { increment: 1 } }),
    );
    expect(triggerFeatureComputation).toHaveBeenCalledTimes(1);
  });

  it('C4.1: negative rest age (observation before anchor) → no valid count, no C3', async () => {
    const triggerFeatureComputation = jest.fn();
    const trigger = { triggerFeatureComputation } as unknown as RestSessionFeatureShadowTriggerService;
    const updateRestSession = jest.fn().mockResolvedValue({ id: 'sess-1' });
    const anchorAt = new Date('2026-09-21T08:00:00.000Z');
    const observedAt = new Date(anchorAt.getTime() - 60_000);
    const repository = {
      findActiveRestSession: jest.fn().mockResolvedValue({
        id: 'sess-1',
        organizationId: 'org',
        vehicleId: 'veh',
        anchorAt,
      }),
      updateRestSession,
      linkObservationToSession: jest.fn(),
    } as unknown as GeneralizedEvidenceRepository;
    const service = new BatteryRestSessionService(repository, undefined, trigger);
    await service.processObservation({
      organizationId: 'org',
      vehicleId: 'veh',
      observation: {
        id: 'obs-neg',
        evidenceClass: BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
        voltageObservedAt: observedAt,
        tripId: null,
      } as any,
      fields: restFields({ voltageObservedAt: observedAt }),
      referenceAt: observedAt,
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
    });
    expect(updateRestSession).toHaveBeenCalledWith(
      'sess-1',
      expect.not.objectContaining({ validRestObservationCount: { increment: 1 } }),
    );
    expect(triggerFeatureComputation).not.toHaveBeenCalled();
  });

  it('TEST_F: session terminal transition → one terminal trigger', async () => {
    const triggerFeatureComputation = jest.fn().mockResolvedValue({ status: 'CREATED' });
    const trigger = {
      triggerFeatureComputation,
    } as unknown as RestSessionFeatureShadowTriggerService;
    const updateRestSession = jest.fn();
    const repository = {
      findActiveRestSession: jest.fn().mockResolvedValue({
        id: 'sess-1',
        organizationId: 'org',
        vehicleId: 'veh',
        anchorAt: new Date('2026-09-21T00:00:00.000Z'),
      }),
      updateRestSession,
      linkObservationToSession: jest.fn(),
    } as unknown as GeneralizedEvidenceRepository;
    const service = new BatteryRestSessionService(repository, undefined, trigger);
    await service.processObservation({
      organizationId: 'org',
      vehicleId: 'veh',
      observation: {
        id: 'obs-drive',
        evidenceClass: BatteryGeneralizedEvidenceClass.DRIVING_NON_CHARGING,
        voltageObservedAt: new Date('2026-09-21T08:05:00.000Z'),
        tripId: null,
      } as any,
      fields: restFields({ speedKmh: 40, engineRunning: true }),
      referenceAt: new Date('2026-09-21T08:05:00.000Z'),
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
    });
    expect(triggerFeatureComputation).toHaveBeenCalledTimes(1);
    expect(triggerFeatureComputation).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'REST_SESSION_TERMINAL' }),
    );
  });

  it('TEST_G: session timeout → terminal trigger', async () => {
    const triggerFeatureComputation = jest.fn().mockResolvedValue({ status: 'CREATED' });
    const trigger = {
      triggerFeatureComputation,
    } as unknown as RestSessionFeatureShadowTriggerService;
    const repository = {
      findActiveRestSession: jest.fn().mockResolvedValue({
        id: 'sess-1',
        organizationId: 'org',
        vehicleId: 'veh',
        anchorAt: new Date('2020-01-01T00:00:00.000Z'),
      }),
      updateRestSession: jest.fn(),
      linkObservationToSession: jest.fn(),
    } as unknown as GeneralizedEvidenceRepository;
    const service = new BatteryRestSessionService(repository, undefined, trigger);
    await service.processObservation({
      organizationId: 'org',
      vehicleId: 'veh',
      observation: {
        id: 'obs-rest',
        evidenceClass: BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
        voltageObservedAt: new Date('2026-09-21T08:00:00.000Z'),
        tripId: null,
      } as any,
      fields: restFields(),
      referenceAt: new Date('2026-09-21T08:00:00.000Z'),
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
    });
    expect(triggerFeatureComputation).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'REST_SESSION_TERMINAL',
        terminalSubcontext: 'SESSION_TIMEOUT',
      }),
    );
  });

  it('TEST_H: ENGINE_OFF session opening → no C3 trigger', async () => {
    const triggerFeatureComputation = jest.fn();
    const trigger = {
      triggerFeatureComputation,
    } as unknown as RestSessionFeatureShadowTriggerService;
    const repository = {
      findActiveRestSession: jest.fn().mockResolvedValue(null),
      claimOrCreateActiveRestSession: jest
        .fn()
        .mockResolvedValue({ sessionId: 'sess-1', created: true }),
      linkObservationToSession: jest.fn(),
      updateRestSession: jest.fn(),
    } as unknown as GeneralizedEvidenceRepository;
    const service = new BatteryRestSessionService(repository, undefined, trigger);
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
    expect(triggerFeatureComputation).not.toHaveBeenCalled();
  });

  it('REST_SESSION_C3_FAILURE_ISOLATED: primary path succeeds when trigger fails', async () => {
    const trigger = {
      triggerFeatureComputation: jest.fn().mockResolvedValue({
        status: 'FAILED_ISOLATED',
        errorClass: 'Error',
        errorMessage: 'boom',
      }),
    } as unknown as RestSessionFeatureShadowTriggerService;
    const repository = {
      findActiveRestSession: jest.fn().mockResolvedValue({
        id: 'sess-1',
        organizationId: 'org',
        vehicleId: 'veh',
        anchorAt: new Date('2026-09-21T00:00:00.000Z'),
      }),
      updateRestSession: jest.fn().mockResolvedValue({ id: 'sess-1' }),
      linkObservationToSession: jest.fn(),
    } as unknown as GeneralizedEvidenceRepository;
    const service = new BatteryRestSessionService(repository, undefined, trigger);
    const outcome = await service.processObservation({
      organizationId: 'org',
      vehicleId: 'veh',
      observation: {
        id: 'obs-rest',
        evidenceClass: BatteryGeneralizedEvidenceClass.REST_WAKE_VOLTAGE,
        voltageObservedAt: new Date('2026-09-21T08:00:00.000Z'),
        tripId: null,
      } as any,
      fields: restFields({ voltageObservedAt: new Date('2026-09-21T08:00:00.000Z') }),
      referenceAt: new Date('2026-09-21T08:00:00.000Z'),
      stateAlignmentClass: BatteryShutdownStateAlignmentClass.ALIGNED,
    });
    expect(outcome).toBe('session_updated');
  });
});

describe('LateTripAssociationService C4 hook', () => {
  it('TEST_I: late association → trigger after session + GE update', async () => {
    const triggerFeatureComputation = jest.fn().mockResolvedValue({ status: 'CREATED' });
    const trigger = {
      triggerFeatureComputation,
    } as unknown as RestSessionFeatureShadowTriggerService;
    const updateRestSession = jest.fn();
    const prisma = {
      batteryRestSession: {
        findUnique: jest.fn().mockResolvedValue({
          candidateTripId: null,
          organizationId: 'org-from-session',
        }),
      },
      batteryGeneralizedEvidenceObservation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const repository = {
      updateRestSession,
    } as unknown as GeneralizedEvidenceRepository;
    const service = new LateTripAssociationService(prisma as never, repository, undefined, trigger);
    await (service as any).linkSessionToTrip(
      'sess-1',
      'veh-1',
      'trip-1',
      new Date(),
      'CANDIDATE',
    );
    expect(updateRestSession).toHaveBeenCalled();
    expect(prisma.batteryGeneralizedEvidenceObservation.updateMany).toHaveBeenCalled();
    expect(triggerFeatureComputation).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-from-session',
        reason: 'LATE_TRIP_ASSOCIATION',
      }),
    );
  });
});

describe('C4 guardrails', () => {
  it('TEST_O: no direct GE capture hook for feature computation', () => {
    const captureSource = readFileSync(
      join(__dirname, '../generalized-evidence-capture.service.ts'),
      'utf8',
    );
    expect(captureSource).not.toContain('RestSessionFeatureShadowTriggerService');
    expect(captureSource).not.toContain('RestSessionFeatureComputationService');
  });
});
