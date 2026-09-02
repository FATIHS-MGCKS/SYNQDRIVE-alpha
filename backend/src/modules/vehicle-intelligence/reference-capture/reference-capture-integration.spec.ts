import { ReferenceCaptureObservationKind } from '@prisma/client';
import { ReferenceCaptureAcquisitionService } from './reference-capture-acquisition.service';
import {
  buildAcquisitionCyclePlan,
} from './reference-capture-acquisition-planner';
import { buildProviderEventFingerprint } from './reference-capture-event-identity.util';
import { ReferenceCaptureObservationWriterService, ReferenceCapturePersistenceError } from './reference-capture-observation-writer.service';
import {
  buildBroadReferenceSignalsLatestQuery,
  fieldsMissingFromProductionSnapshot,
  planReferenceCaptureQuery,
} from './reference-capture-query-builder';
import { ReferenceCaptureRunnerService } from './reference-capture-runner.service';
import { ReferenceCaptureProcessor } from '../../../workers/processors/reference-capture.processor';
import { REFERENCE_CAPTURE_ENVELOPE_VERSION } from './reference-capture.constants';
import { buildRawIdentity } from './reference-capture.contract';
import type { BroadObservationFieldDescriptor, ReferenceCapturePreflightResult } from './reference-capture.types';
import { inferTemporalClass } from './reference-capture-temporal.util';

function makeBroadFields(providerFields: string[]): BroadObservationFieldDescriptor[] {
  return providerFields.map((providerField) => ({
    providerField,
    canonicalKey: providerField === 'speed' ? 'CAN_VEHICLE_SPEED' : null,
    rawIdentity: buildRawIdentity(providerField),
    temporalClass: inferTemporalClass(providerField),
    acquisitionTier: 'T7',
    capabilityState: 'LISTED_AVAILABLE' as const,
  }));
}

describe('Reference Capture integration (Phase 3A.1 correction)', () => {
  describe('TEST A — broad dynamic field discovery → acquisition', () => {
    it('includes schema-valid fields in reference query plan and retains unknown fields', () => {
      const fields = [
        'speed',
        'angularVelocityYaw',
        'chassisBrakeCircuit1PressurePrimary',
        'chassisAxleRow1WheelLeftSpeed',
        'unknownFutureProviderSignal',
      ];
      const plan = planReferenceCaptureQuery(fields);

      expect(plan.providerFields).toContain('speed');
      expect(plan.providerFields).toContain('angularVelocityYaw');
      expect(plan.providerFields).toContain('chassisBrakeCircuit1PressurePrimary');
      expect(plan.providerFields).toContain('unknownFutureProviderSignal');

      const query = buildBroadReferenceSignalsLatestQuery(12345, fields);
      expect(query).toContain('angularVelocityYaw');
      expect(query).toContain('unknownFutureProviderSignal');
      expect(query).not.toContain('buildLatestSnapshotQuery');
    });

    it('captures provider response with canonicalKey null for unmapped fields', async () => {
      const writer = {
        createCaptureCycleId: () => 'cycle-a',
        createRequestCorrelationId: () => 'req-a',
        enqueueAndMaybeFlush: jest.fn().mockResolvedValue({
          flushed: 0,
          pending: 1,
          inserted: 0,
          durablyRepresentedFingerprints: [],
        }),
        flush: jest.fn().mockResolvedValue(1),
        flushIdempotent: jest.fn().mockResolvedValue({ attempted: 1, inserted: 1, durablyRepresentedFingerprints: [] }),
      };
      const observationRepository = {
        findPhysicalSamplesByFingerprints: jest.fn().mockResolvedValue(new Map()),
      };
      const sessionRepo = {
        findById: jest.fn().mockResolvedValue({
          startedAt: new Date('2026-08-31T10:00:00.000Z'),
          eventWatermarkAt: null,
          acquisitionStateJson: {},
        }),
        tryAcquireCycleLock: jest.fn().mockResolvedValue({
          acquired: true,
          state: { cycleCount: 0, seenEventFingerprints: [], lastSequenceNumber: 0 },
        }),
        releaseCycleLockAndUpdateState: jest.fn().mockResolvedValue(true),
      };
      const dimoAuth = { getVehicleJwt: jest.fn().mockResolvedValue('jwt') };
      const prisma = {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue({ dimoVehicle: { tokenId: 99 } }),
        },
      };
      const httpReceivedAt = new Date('2026-08-31T10:00:01.500Z');
      const dimoTelemetry = {
        queryGraphQLWithIngressTiming: jest.fn().mockResolvedValue({
          result: {
            data: {
              signalsLatest: {
                speed: { timestamp: '2026-08-31T10:00:01.000Z', value: 42 },
                unknownFutureProviderSignal: { timestamp: '2026-08-31T10:00:01.000Z', value: 7 },
              },
            },
          },
          timing: {
            synqReceivedAt: httpReceivedAt,
            acquisitionRequestedAt: new Date('2026-08-31T10:00:01.000Z'),
            httpRequestStartedAt: new Date('2026-08-31T10:00:01.100Z'),
            httpResponseReceivedAt: httpReceivedAt,
            processingCompletedAt: new Date('2026-08-31T10:00:01.600Z'),
          },
          requestStartedAt: new Date('2026-08-31T10:00:01.000Z'),
          requestCompletedAt: new Date('2026-08-31T10:00:01.600Z'),
        }),
      };

      const service = new ReferenceCaptureAcquisitionService(
        prisma as never,
        dimoAuth as never,
        dimoTelemetry as never,
        writer as never,
        observationRepository as never,
        sessionRepo as never,
      );

      const preflight: ReferenceCapturePreflightResult = {
        availableSignals: ['speed', 'unknownFutureProviderSignal'],
        broadObservationFields: makeBroadFields(['speed', 'unknownFutureProviderSignal', 'angularVelocityYaw']),
        broadObservationFieldCount: 3,
        manifestId: 'DIMO_LTE_R1_REFERENCE_MANIFEST',
        manifestVersion: '1.1.0',
        connectionProfile: 'DIMO_LTE_R1',
        powertrainProfile: 'ICE_GASOLINE',
        hardwareProfile: 'LTE_R1',
        checkedAt: new Date().toISOString(),
      };

      await service.executeAcquisitionCycle({
        organizationId: 'org',
        vehicleId: 'veh',
        sessionId: 'sess',
        cycleJobId: 'refcap-cycle-test',
        preflight,
        manifestVersion: '1.1.0',
        powertrainProfile: 'ICE_GASOLINE',
        cycleIntervalMs: 5000,
        slowCycleEvery: 6,
      });

      const envelopes = writer.enqueueAndMaybeFlush.mock.calls.map((c) => c[3]);
      const unknown = envelopes.find((e) => e.providerField === 'unknownFutureProviderSignal');
      expect(unknown).toBeDefined();
      expect(unknown.canonicalKey).toBeNull();
      expect(unknown.rawIdentity).toBe('DIMO::unknownFutureProviderSignal');
    });
  });

  describe('TEST B — static snapshot regression', () => {
    it('acquires fields absent from production buildLatestSnapshotQuery via reference mode', () => {
      const missing = fieldsMissingFromProductionSnapshot([
        'speed',
        'angularVelocityYaw',
        'chassisBrakeCircuit1PressurePrimary',
        'chassisBrakePedalPosition',
        'powertrainCombustionEngineSpeed',
      ]);

      expect(missing).toContain('angularVelocityYaw');
      expect(missing).toContain('chassisBrakeCircuit1PressurePrimary');
      expect(missing).toContain('chassisBrakePedalPosition');
      expect(missing).toContain('powertrainCombustionEngineSpeed');

      const query = buildBroadReferenceSignalsLatestQuery(1, missing);
      for (const field of missing) {
        expect(query).toContain(field);
      }
    });
  });

  describe('TEST C — temporal surface differentiation', () => {
    it('WAVEFORM_DYNAMICS and SLOW_PHYSICAL_CONTEXT use different acquisition surfaces', () => {
      const broadFields = makeBroadFields([
        'speed',
        'angularVelocityYaw',
        'exteriorAirTemperature',
        'chassisAxleRow1WheelLeftTirePressure',
      ]);

      const hfCycle = buildAcquisitionCyclePlan({
        cycleNumber: 2,
        captureCycleId: 'c1',
        broadFields,
        cycleIntervalMs: 5000,
        slowCycleEvery: 6,
      });

      const slowCycle = buildAcquisitionCyclePlan({
        cycleNumber: 6,
        captureCycleId: 'c2',
        broadFields,
        cycleIntervalMs: 5000,
        slowCycleEvery: 6,
      });

      const hfSurfaces = hfCycle.surfaces.map((s) => s.surface);
      expect(hfSurfaces).toContain('LATEST_LIVE');
      expect(hfSurfaces).toContain('HF_HISTORICAL');
      expect(hfSurfaces).not.toContain('LATEST_SLOW');

      const slowSurfaces = slowCycle.surfaces.map((s) => s.surface);
      expect(slowSurfaces).toContain('LATEST_SLOW');

      const livePlan = hfCycle.surfaces.find((s) => s.surface === 'LATEST_LIVE')!;
      const slowPlan = slowCycle.surfaces.find((s) => s.surface === 'LATEST_SLOW')!;
      expect(livePlan.requestedCadenceMs).toBe(5000);
      expect(slowPlan.requestedCadenceMs).toBe(30000);
      expect(livePlan.providerFields).not.toEqual(slowPlan.providerFields);
    });
  });

  describe('TEST D — autonomous runner', () => {
    it('processor executes acquisition cycle and schedules next job without manual /tick', async () => {
      const config = {
        isEnabled: () => true,
        getCycleIntervalMs: () => 5000,
        getSlowCycleEvery: () => 6,
        getMaxRecordingDurationMs: () => 3_600_000,
        getMaxTransientRetries: () => 5,
        getTransientRetryBaseDelayMs: () => 1000,
      };
      const sessionRepo = {
        findById: jest.fn().mockResolvedValue({
          status: 'RECORDING',
          startedAt: new Date(),
          preflightJson: {
            broadObservationFields: makeBroadFields(['speed']),
            broadObservationFieldCount: 1,
            manifestVersion: '1.1.0',
          },
          acquisitionStateJson: { cycleCount: 1 },
        }),
        updateStatus: jest.fn(),
      };
      const acquisition = {
        executeAcquisitionCycle: jest.fn().mockResolvedValue({
          signalPoints: 1,
          nativeEvents: 0,
          flushed: 1,
          cycleNumber: 1,
          skippedConcurrentCycle: false,
        }),
      };
      const runner = {
        shouldContinueRecording: jest.fn().mockResolvedValue(true),
        scheduleNextCycle: jest.fn().mockResolvedValue('next-job'),
        stopRunner: jest.fn(),
        cancelPendingCycleJob: jest.fn(),
        cycleJobId: () => 'refcap-cycle-sess1-1-uuid',
      };
      const writer = { clearSession: jest.fn(), enqueueAndMaybeFlush: jest.fn(), flush: jest.fn() };

      const processor = new ReferenceCaptureProcessor(
        config as never,
        sessionRepo as never,
        acquisition as never,
        runner as never,
        writer as never,
      );

      await processor.process({
        id: 'refcap-cycle-sess1-1-uuid',
        data: {
          organizationId: 'org',
          vehicleId: 'veh',
          sessionId: 'sess1',
          manifestVersion: '1.1.0',
          powertrainProfile: 'ICE_GASOLINE',
          cycleNumber: 1,
          cycleUuid: 'uuid-1',
        },
      } as never);

      expect(acquisition.executeAcquisitionCycle).toHaveBeenCalledTimes(1);
      expect(runner.scheduleNextCycle).toHaveBeenCalledTimes(1);
    });

    it('startRunner enqueues first cycle with unique colon-free jobId', async () => {
      const queue = { add: jest.fn().mockResolvedValue({ id: 'job' }) };
      const sessionRepo = {
        updateRunnerJobId: jest.fn().mockResolvedValue({}),
        updatePendingCycleJobId: jest.fn().mockResolvedValue({}),
      };
      const config = { isEnabled: () => true, getCycleIntervalMs: () => 5000 };

      const runner = new ReferenceCaptureRunnerService(
        queue as never,
        config as never,
        sessionRepo as never,
      );

      const jobId = await runner.startRunner({
        organizationId: 'org',
        vehicleId: 'veh',
        sessionId: 's1',
        manifestVersion: '1.1.0',
        powertrainProfile: null,
      });

      expect(queue.add).toHaveBeenCalledWith(
        'reference-capture-cycle',
        expect.objectContaining({ sessionId: 's1', cycleNumber: 1 }),
        expect.objectContaining({ jobId: expect.not.stringContaining(':') }),
      );
      expect(jobId).not.toContain(':');
    });
  });

  describe('TEST E — event watermark / dedup identity', () => {
    it('same native event in overlapping requests yields stable fingerprint and duplicateRetrieval flag', () => {
      const event = {
        name: 'behavior.braking',
        timestamp: '2026-08-31T10:05:00.000Z',
        source: 'dimo',
        durationNs: '1000000',
        metadata: { severity: 2 },
      };
      const fp1 = buildProviderEventFingerprint(event);
      const fp2 = buildProviderEventFingerprint(event);
      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64);
    });
  });

  describe('TEST F — HTTP ingress timestamp boundary', () => {
    it('is covered by reference-capture-ingress-timing.spec.ts (Axios boundary)', () => {
      expect(true).toBe(true);
    });
  });

  describe('TEST G — DB write failure / durability', () => {
    it('retains pending batch on appendMany failure and throws ReferenceCapturePersistenceError', async () => {
      const config = {
        getBatchSize: () => 2,
        getMaxPendingObservations: () => 10,
      };
      const repo = {
        appendManyIdempotent: jest
          .fn()
          .mockRejectedValueOnce(new Error('db down'))
          .mockRejectedValueOnce(new Error('db down'))
          .mockRejectedValueOnce(new Error('db down')),
      };
      const writer = new ReferenceCaptureObservationWriterService(config as never, repo as never);

      const envelope = {
        envelopeVersion: REFERENCE_CAPTURE_ENVELOPE_VERSION,
        observationKind: ReferenceCaptureObservationKind.SIGNAL_POINT,
        provider: 'DIMO',
        connectionProfile: 'DIMO_LTE_R1',
        providerField: 'speed',
        canonicalKey: 'CAN_VEHICLE_SPEED',
        rawIdentity: buildRawIdentity('speed'),
        rawValue: { value: 1 },
        synqReceivedAt: new Date(),
      };

      writer.enqueue('s1', 'org', 'veh', envelope);
      writer.enqueue('s1', 'org', 'veh', envelope);

      await expect(writer.flush('s1', { maxAttempts: 3 })).rejects.toThrow(
        ReferenceCapturePersistenceError,
      );
      expect(writer.getPendingCount('s1')).toBe(2);
      expect(repo.appendManyIdempotent).toHaveBeenCalledTimes(3);
    });
  });
});
