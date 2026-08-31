import {
  buildReferenceCaptureCycleJobId,
  buildReferenceCaptureSessionRunnerKey,
} from './reference-capture-queue.util';
import { isBullMqCompatibleJobId } from '@shared/queue/bullmq-job-id.sanitizer';
import {
  classifyAcquisitionError,
  computeTransientBackoffMs,
} from './reference-capture-acquisition-failure.util';
import {
  buildPhysicalSampleFingerprint,
  collapseToUniquePhysicalSamples,
} from './reference-capture-physical-sample-identity.util';
import { resolveDimoSignalSchemaEntry } from './reference-capture-signal-schema.registry';
import { planReferenceCaptureQuery } from './reference-capture-query-builder';
import { ReferenceCaptureRunnerService } from './reference-capture-runner.service';
import { ReferenceCaptureProcessor } from '../../../workers/processors/reference-capture.processor';
import { ReferenceCaptureSessionStatus } from '@prisma/client';
import { ReferenceCapturePersistenceError } from './reference-capture-observation-writer.service';

describe('Reference Capture correction 2', () => {
  describe('H — BullMQ job identity', () => {
    it('uses colon-free compatible job IDs for session and cycle', () => {
      const sessionKey = buildReferenceCaptureSessionRunnerKey('sess-1');
      const cycleJobId = buildReferenceCaptureCycleJobId('sess-1', 2, 'uuid-abc');
      expect(sessionKey.includes(':')).toBe(false);
      expect(cycleJobId.includes(':')).toBe(false);
      expect(isBullMqCompatibleJobId(sessionKey)).toBe(true);
      expect(isBullMqCompatibleJobId(cycleJobId)).toBe(true);
    });

    it('generates unique cycle job IDs per cycle number/uuid', () => {
      const a = buildReferenceCaptureCycleJobId('s1', 1, 'aaa');
      const b = buildReferenceCaptureCycleJobId('s1', 2, 'aaa');
      const c = buildReferenceCaptureCycleJobId('s1', 1, 'bbb');
      expect(a).not.toBe(b);
      expect(a).not.toBe(c);
    });

    it('enqueueCycleJob stores pending cycle job id separately from runner key', async () => {
      const queue = { add: jest.fn().mockResolvedValue({ id: 'job' }) };
      const sessionRepo = {
        updatePendingCycleJobId: jest.fn().mockResolvedValue({}),
        updateRunnerJobId: jest.fn().mockResolvedValue({}),
      };
      const config = {
        isEnabled: () => true,
        getCycleIntervalMs: () => 100,
      };
      const runner = new ReferenceCaptureRunnerService(
        queue as never,
        config as never,
        sessionRepo as never,
      );

      const jobId = await runner.enqueueCycleJob(
        {
          organizationId: 'org',
          vehicleId: 'veh',
          sessionId: 's1',
          manifestVersion: '1.1.0',
          powertrainProfile: null,
          cycleNumber: 1,
          cycleUuid: 'uuid-1',
        },
        { delayMs: 0 },
      );

      expect(queue.add).toHaveBeenCalledWith(
        'reference-capture-cycle',
        expect.any(Object),
        expect.objectContaining({ jobId, delay: 0 }),
      );
      expect(sessionRepo.updatePendingCycleJobId).toHaveBeenCalledWith('org', 's1', jobId);
    });
  });

  describe('I/J — transient failure policy', () => {
    it('classifies network errors as retryable transient failures', () => {
      const assessment = classifyAcquisitionError(new Error('ETIMEDOUT calling DIMO'));
      expect(assessment.failureClass).toBe('TRANSIENT_PROVIDER_FAILURE');
      expect(assessment.retryable).toBe(true);
    });

    it('classifies persistence errors as terminal', () => {
      const assessment = classifyAcquisitionError(
        new ReferenceCapturePersistenceError('db write failed'),
      );
      expect(assessment.failureClass).toBe('PERSISTENCE_FAILURE');
      expect(assessment.retryable).toBe(false);
    });

    it('applies exponential backoff for retries', () => {
      expect(computeTransientBackoffMs(1, 2000)).toBe(2000);
      expect(computeTransientBackoffMs(3, 2000)).toBe(8000);
    });
  });

  describe('O/P — unknown schema field isolation', () => {
    it('quarantines unknown fields as latest-only without historical AVG', () => {
      const entry = resolveDimoSignalSchemaEntry('unknownFutureProviderSignal');
      expect(entry.resolutionState).toBe('SCHEMA_UNKNOWN_QUARANTINED');
      expect(entry.historicalSupported).toBe(false);
      expect(entry.schemaAuthority).toBe('SCHEMA_UNKNOWN_QUARANTINED');
    });

    it('does not include quarantined fields in historical query plan', () => {
      const plan = planReferenceCaptureQuery(['speed', 'unknownFutureProviderSignal']);
      expect(plan.providerFields).toContain('unknownFutureProviderSignal');
      expect(plan.quarantinedFields).toContain('unknownFutureProviderSignal');
      expect(plan.historicalSelectionLines.some((l) => l.includes('unknownFutureProviderSignal'))).toBe(
        false,
      );
    });
  });

  describe('Q — HF overlap physical sample identity', () => {
    it('collapses overlapping retrievals to unique physical samples', () => {
      const mk = (field: string, ts: string, value: number) => {
        const physicalSampleFingerprint = buildPhysicalSampleFingerprint({
          providerField: field,
          providerTimestamp: ts,
          normalizedValue: value,
        });
        return {
          physicalSampleFingerprint,
          provenance: { duplicateRetrieval: false },
        };
      };

      const cycle1 = [mk('speed', '2026-08-31T10:00:01.000Z', 10), mk('speed', '2026-08-31T10:00:02.000Z', 11), mk('speed', '2026-08-31T10:00:03.000Z', 12)];
      const cycle2 = [mk('speed', '2026-08-31T10:00:02.000Z', 11), mk('speed', '2026-08-31T10:00:03.000Z', 12), mk('speed', '2026-08-31T10:00:04.000Z', 13)];

      const all = [...cycle1, ...cycle2];
      expect(all).toHaveLength(6);
      expect(collapseToUniquePhysicalSamples(all)).toHaveLength(4);
    });
  });

  describe('J — retry exhaustion marks session FAILED', () => {
    it('terminates runner chain after max transient retries', async () => {
      const config = {
        isEnabled: () => true,
        getCycleIntervalMs: () => 100,
        getSlowCycleEvery: () => 6,
        getMaxTransientRetries: () => 2,
        getTransientRetryBaseDelayMs: () => 10,
      };
      const sessionRepo = {
        findById: jest.fn().mockResolvedValue({
          status: ReferenceCaptureSessionStatus.RECORDING,
          startedAt: new Date(),
          preflightJson: { broadObservationFields: [], connectionProfile: 'DIMO_LTE_R1' },
          acquisitionStateJson: { cycleCount: 1 },
        }),
        updateStatus: jest.fn().mockResolvedValue({}),
      };
      const acquisition = {
        executeAcquisitionCycle: jest.fn().mockRejectedValue(new Error('ETIMEDOUT calling DIMO')),
      };
      const runner = {
        shouldContinueRecording: jest.fn().mockResolvedValue(true),
        scheduleNextCycle: jest.fn(),
        stopRunner: jest.fn(),
        cancelPendingCycleJob: jest.fn(),
        cycleJobId: () => 'job',
      };
      const writer = {
        clearSession: jest.fn(),
        enqueueAndMaybeFlush: jest.fn(),
        flush: jest.fn(),
      };

      const processor = new ReferenceCaptureProcessor(
        config as never,
        sessionRepo as never,
        acquisition as never,
        runner as never,
        writer as never,
      );

      await processor.process({
        id: buildReferenceCaptureCycleJobId('s1', 1, 'uuid'),
        data: {
          organizationId: 'org',
          vehicleId: 'veh',
          sessionId: 's1',
          manifestVersion: '1.1.0',
          powertrainProfile: null,
          cycleNumber: 1,
          cycleUuid: 'uuid',
          transientRetryCount: 1,
        },
      } as never);

      expect(sessionRepo.updateStatus).toHaveBeenCalledWith(
        'org',
        's1',
        ReferenceCaptureSessionStatus.FAILED,
        expect.objectContaining({ failureReason: expect.stringContaining('transient_retry_exhausted') }),
      );
      expect(runner.stopRunner).toHaveBeenCalledWith('org', 's1');
      expect(runner.scheduleNextCycle).not.toHaveBeenCalled();
    });
  });

  describe('L — stop race safety', () => {
    it('does not schedule next cycle when session left RECORDING during processing', async () => {
      const config = {
        isEnabled: () => true,
        getCycleIntervalMs: () => 100,
        getSlowCycleEvery: () => 6,
        getMaxTransientRetries: () => 5,
        getTransientRetryBaseDelayMs: () => 1000,
      };
      const sessionRepo = {
        findById: jest
          .fn()
          .mockResolvedValueOnce({
            status: ReferenceCaptureSessionStatus.RECORDING,
            startedAt: new Date(),
            preflightJson: { broadObservationFields: [] },
            acquisitionStateJson: { cycleCount: 1 },
          })
          .mockResolvedValueOnce({
            status: ReferenceCaptureSessionStatus.STOPPING,
            startedAt: new Date(),
            preflightJson: { broadObservationFields: [] },
            acquisitionStateJson: { cycleCount: 2 },
          }),
        updateStatus: jest.fn(),
      };
      const acquisition = {
        executeAcquisitionCycle: jest.fn().mockResolvedValue({
          skippedConcurrentCycle: false,
          cycleNumber: 2,
        }),
      };
      const runner = {
        shouldContinueRecording: jest.fn().mockResolvedValue(true),
        scheduleNextCycle: jest.fn(),
        cancelPendingCycleJob: jest.fn(),
        cycleJobId: () => 'job',
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
        id: buildReferenceCaptureCycleJobId('s1', 2, 'uuid'),
        data: {
          organizationId: 'org',
          vehicleId: 'veh',
          sessionId: 's1',
          manifestVersion: '1.1.0',
          powertrainProfile: null,
          cycleNumber: 2,
          cycleUuid: 'uuid',
        },
      } as never);

      expect(runner.scheduleNextCycle).not.toHaveBeenCalled();
      expect(runner.cancelPendingCycleJob).toHaveBeenCalledWith('org', 's1');
    });
  });

  describe('M/N — readiness runtime blockers', () => {
    it('blocks deployment preflight on manifest version mismatch', async () => {
      const { ReferenceCaptureReadinessService } = await import(
        './reference-capture-readiness.service'
      );
      const prisma = {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue({
            hardwareType: 'LTE_R1',
            dimoVehicle: { tokenId: 1 },
          }),
        },
      };
      const config = { isEnabled: () => true };
      const runner = { isQueueReachable: jest.fn().mockResolvedValue(true) };
      const runtimeHealth = {
        assessRuntimeHealth: jest.fn().mockResolvedValue({
          queueReachable: true,
          storageReadable: true,
          storageWritable: true,
          timestampInstrumentationVerified: true,
          workerQueueRegistered: true,
        }),
      };
      const readiness = new ReferenceCaptureReadinessService(
        prisma as never,
        config as never,
        runner as never,
        runtimeHealth as never,
      );

      const report = await readiness.assessSessionReadiness({
        organizationId: 'org',
        vehicleId: 'veh',
        preflight: {
          manifestVersion: '9.9.9',
          connectionProfile: 'DIMO_LTE_R1',
          broadObservationFieldCount: 5,
          broadObservationFields: [{ providerField: 'speed' }],
        } as never,
        massBinding: { effectiveMassKg: 1500 } as never,
      });

      expect(report.deploymentPreflightReady).toBe(false);
      expect(report.blockers).toContain('manifest_version_mismatch');
    });

    it('blocks deployment preflight when queue or storage health fails', async () => {
      const { ReferenceCaptureReadinessService } = await import(
        './reference-capture-readiness.service'
      );
      const prisma = {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue({
            hardwareType: 'LTE_R1',
            dimoVehicle: { tokenId: 1 },
          }),
        },
      };
      const config = { isEnabled: () => true };
      const runner = { isQueueReachable: jest.fn().mockResolvedValue(false) };
      const runtimeHealth = {
        assessRuntimeHealth: jest.fn().mockResolvedValue({
          queueReachable: false,
          storageReadable: false,
          storageWritable: false,
          timestampInstrumentationVerified: false,
          workerQueueRegistered: false,
        }),
      };
      const readiness = new ReferenceCaptureReadinessService(
        prisma as never,
        config as never,
        runner as never,
        runtimeHealth as never,
      );

      const report = await readiness.assessSessionReadiness({
        organizationId: 'org',
        vehicleId: 'veh',
        preflight: {
          manifestVersion: '1.1.0',
          connectionProfile: 'DIMO_LTE_R1',
          broadObservationFieldCount: 5,
          broadObservationFields: [{ providerField: 'speed' }],
        } as never,
        massBinding: { effectiveMassKg: 1500 } as never,
      });

      expect(report.deploymentPreflightReady).toBe(false);
      expect(report.blockers).toEqual(
        expect.arrayContaining([
          'redis_queue_unreachable',
          'postgres_storage_unreadable',
          'postgres_storage_unwritable',
          'timestamp_instrumentation_unavailable',
          'reference_capture_queue_not_registered',
          'runner_queue_producer_unhealthy',
        ]),
      );
    });
  });

  describe('R — per-session acquisition serialization', () => {
    it('processor skips scheduling when acquisition reports concurrent cycle skip', async () => {
      const config = { isEnabled: () => true, getCycleIntervalMs: () => 100, getSlowCycleEvery: () => 6, getMaxTransientRetries: () => 5, getTransientRetryBaseDelayMs: () => 1000 };
      const sessionRepo = {
        findById: jest.fn().mockResolvedValue({
          status: ReferenceCaptureSessionStatus.RECORDING,
          startedAt: new Date(),
          preflightJson: { broadObservationFields: [] },
          acquisitionStateJson: { cycleCount: 1 },
        }),
      };
      const acquisition = {
        executeAcquisitionCycle: jest.fn().mockResolvedValue({
          skippedConcurrentCycle: true,
          cycleNumber: 1,
        }),
      };
      const runner = {
        shouldContinueRecording: jest.fn().mockResolvedValue(true),
        scheduleNextCycle: jest.fn(),
        cancelPendingCycleJob: jest.fn(),
        cycleJobId: () => 'job',
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
        id: buildReferenceCaptureCycleJobId('s1', 2, 'uuid'),
        data: {
          organizationId: 'org',
          vehicleId: 'veh',
          sessionId: 's1',
          manifestVersion: '1.1.0',
          powertrainProfile: null,
          cycleNumber: 2,
          cycleUuid: 'uuid',
        },
      } as never);

      expect(runner.scheduleNextCycle).not.toHaveBeenCalled();
    });
  });
});
