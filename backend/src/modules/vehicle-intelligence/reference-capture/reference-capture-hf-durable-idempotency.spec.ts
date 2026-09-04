import { ReferenceCaptureObservationKind } from '@prisma/client';
import { ReferenceCaptureAcquisitionService } from './reference-capture-acquisition.service';
import { createLegacyHfRecoveryConfigMock } from './reference-capture-hf-recovery-v2.test-util';
import { REFERENCE_CAPTURE_ENVELOPE_VERSION } from './reference-capture.constants';
import { buildRawIdentity } from './reference-capture.contract';
import { buildPhysicalSampleFingerprint } from './reference-capture-physical-sample-identity.util';
import type { ReferenceCapturePreflightResult } from './reference-capture.types';

function makePreflight(fields: string[]): ReferenceCapturePreflightResult {
  return {
    availableSignals: fields,
    broadObservationFieldCount: fields.length,
    broadObservationFields: fields.map((providerField) => ({
      providerField,
      canonicalKey: providerField === 'speed' ? 'CAN_VEHICLE_SPEED' : null,
      rawIdentity: buildRawIdentity(providerField),
      temporalClass: 'POWERTRAIN_DYNAMIC',
      acquisitionTier: 'T5',
      capabilityState: 'LISTED_AVAILABLE',
    })),
    manifestId: 'DIMO_LTE_R1_REFERENCE_MANIFEST',
    manifestVersion: '1.1.0',
    connectionProfile: 'DIMO_LTE_R1',
    powertrainProfile: 'ICE_GASOLINE',
    hardwareProfile: 'LTE_R1',
    checkedAt: new Date().toISOString(),
  };
}

describe('reference-capture HF durable idempotency', () => {
  const sessionId = 'sess-crash-1';
  const orgId = 'org-1';
  const vehicleId = 'veh-1';
  const sessionStartedAt = new Date('2026-09-01T19:00:43.252Z');

  function buildHarness() {
    const dbRows = new Map<string, { fingerprint: string; value: unknown }>();
    const stateStore: {
      acquisitionStateJson: {
        cycleCount: number;
        seenEventFingerprints: string[];
        lastSequenceNumber: number;
        hfWatermarkByField: Record<string, string>;
        hfQueryCoverageByField: Record<string, string>;
      };
      eventWatermarkAt: Date | null;
      startedAt: Date;
    } = {
      acquisitionStateJson: {
        cycleCount: 0,
        seenEventFingerprints: [],
        lastSequenceNumber: 0,
        hfWatermarkByField: {},
        hfQueryCoverageByField: {},
      },
      eventWatermarkAt: null,
      startedAt: sessionStartedAt,
    };

    const observationRepository = {
      findPhysicalSamplesByFingerprints: jest.fn(async (_sessionId: string, fingerprints: string[]) => {
        const map = new Map();
        for (const fp of fingerprints) {
          const row = dbRows.get(fp);
          if (row) {
            map.set(fp, {
              physicalSampleFingerprint: fp,
              normalizedValueJson: row.value,
              providerField: 'speed',
              providerTimestamp: new Date('2026-09-01T19:12:24.252Z'),
            });
          }
        }
        return map;
      }),
      appendManyIdempotent: jest.fn(async (observations: Array<{ physicalSampleFingerprint?: string | null; normalizedValue?: unknown }>) => {
        let insertedCount = 0;
        const durablyRepresentedFingerprints: string[] = [];
        for (const obs of observations) {
          const fp = obs.physicalSampleFingerprint;
          if (!fp) continue;
          if (!dbRows.has(fp)) {
            dbRows.set(fp, { fingerprint: fp, value: obs.normalizedValue });
            insertedCount += 1;
          }
          durablyRepresentedFingerprints.push(fp);
        }
        return { insertedCount, durablyRepresentedFingerprints: [...new Set(durablyRepresentedFingerprints)] };
      }),
      countPhysicalSampleFingerprints: jest.fn(async (_sessionId: string, fingerprints: string[]) => {
        return fingerprints.filter((fp) => dbRows.has(fp)).length;
      }),
    };

    const pending: unknown[] = [];
    const flushIdempotent = jest.fn(async () => {
      const batch = pending.splice(0, pending.length) as Array<{
        physicalSampleFingerprint?: string | null;
        normalizedValue?: unknown;
      }>;
      if (!batch.length) {
        return { attempted: 0, inserted: 0, durablyRepresentedFingerprints: [] };
      }
      const result = await observationRepository.appendManyIdempotent(
        batch.map((b) => ({ sessionId, ...b })),
      );
      return {
        attempted: batch.length,
        inserted: result.insertedCount,
        durablyRepresentedFingerprints: result.durablyRepresentedFingerprints,
      };
    });
    const observationWriter = {
      createCaptureCycleId: () => 'cycle-1',
      createRequestCorrelationId: () => 'req-1',
      enqueueAndMaybeFlush: jest.fn(async (_s: string, _o: string, _v: string, envelope: unknown) => {
        pending.push(envelope);
        if (pending.length >= 1) {
          await flushIdempotent();
        }
        return { flushed: pending.length, pending: 0, inserted: pending.length, durablyRepresentedFingerprints: [] };
      }),
      flushIdempotent,
    };

    const sessionRepo = {
      findById: jest.fn(async () => ({
        startedAt: stateStore.startedAt,
        eventWatermarkAt: stateStore.eventWatermarkAt,
        acquisitionStateJson: stateStore.acquisitionStateJson,
      })),
      tryAcquireCycleLock: jest.fn(async () => ({
        acquired: true,
        state: stateStore.acquisitionStateJson,
      })),
      releaseCycleLockAndUpdateState: jest.fn(async (_org: string, _sid: string, _job: string, nextState: unknown) => {
        stateStore.acquisitionStateJson = nextState as typeof stateStore.acquisitionStateJson;
        return true;
      }),
    };

    const dimoTelemetry = {
      queryGraphQLWithIngressTiming: jest.fn(async () => ({
        result: {
          data: {
            signals: [
              {
                timestamp: '2026-09-01T19:12:24.252Z',
                speed: 42,
              },
            ],
          },
        },
        timing: {
          synqReceivedAt: new Date('2026-09-01T19:12:27.741Z'),
          acquisitionRequestedAt: new Date('2026-09-01T19:12:27.500Z'),
          httpRequestStartedAt: new Date('2026-09-01T19:12:27.500Z'),
          httpResponseReceivedAt: new Date('2026-09-01T19:12:27.741Z'),
          processingCompletedAt: new Date('2026-09-01T19:12:27.741Z'),
        },
        requestStartedAt: new Date('2026-09-01T19:12:27.500Z'),
        requestCompletedAt: new Date('2026-09-01T19:12:27.741Z'),
      })),
    };

    const service = new ReferenceCaptureAcquisitionService(
      {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue({ dimoVehicle: { tokenId: 123 } }),
        },
      } as never,
      { getVehicleJwt: jest.fn().mockResolvedValue('jwt') } as never,
      dimoTelemetry as never,
      observationWriter as never,
      observationRepository as never,
      sessionRepo as never,
      createLegacyHfRecoveryConfigMock() as never,
    );

    const fp = buildPhysicalSampleFingerprint({
      providerField: 'speed',
      providerTimestamp: '2026-09-01T19:12:24.252Z',
      normalizedValue: 42,
      interval: '1s',
      aggregation: 'AVG',
    });

    return { service, dbRows, stateStore, observationRepository, fp, sessionRepo };
  }

  it('POST_PERSIST_PRE_STATE_CRASH_RETRY: one physical row after crash before state commit', async () => {
    const { service, dbRows, stateStore, fp, sessionRepo } = buildHarness();
    const input = {
      organizationId: orgId,
      vehicleId,
      sessionId,
      cycleJobId: 'job-1',
      preflight: makePreflight(['speed']),
      manifestVersion: '1.1.0',
      powertrainProfile: 'ICE_GASOLINE',
      cycleIntervalMs: 5000,
      slowCycleEvery: 6,
    };

    sessionRepo.releaseCycleLockAndUpdateState.mockImplementationOnce(async () => {
      throw new Error('simulated state commit failure');
    });

    await expect(service.executeAcquisitionCycle(input)).rejects.toThrow('simulated state commit failure');
    expect(dbRows.size).toBe(1);
    expect(dbRows.has(fp)).toBe(true);
    expect(stateStore.acquisitionStateJson.hfWatermarkByField?.speed).toBeUndefined();

    await service.executeAcquisitionCycle({ ...input, cycleJobId: 'job-2' });
    expect(dbRows.size).toBe(1);
    expect(stateStore.acquisitionStateJson.hfWatermarkByField?.speed).toBe('2026-09-01T19:12:24.252Z');
  });

  it('STATE_COMMIT_FAILURE_RETRY: DB cardinality unchanged, state catches up on retry', async () => {
    const { service, dbRows, fp, sessionRepo } = buildHarness();
    const input = {
      organizationId: orgId,
      vehicleId,
      sessionId,
      cycleJobId: 'job-a',
      preflight: makePreflight(['speed']),
      manifestVersion: '1.1.0',
      powertrainProfile: 'ICE_GASOLINE',
      cycleIntervalMs: 5000,
      slowCycleEvery: 6,
    };

    sessionRepo.releaseCycleLockAndUpdateState.mockRejectedValueOnce(new Error('state commit failed'));
    await expect(service.executeAcquisitionCycle(input)).rejects.toThrow('state commit failed');
    const countAfterCrash = dbRows.size;

    await service.executeAcquisitionCycle({ ...input, cycleJobId: 'job-b' });
    expect(dbRows.size).toBe(countAfterCrash);
    expect(dbRows.has(fp)).toBe(true);
  });

  it('PARTIAL_BATCH_FAILURE_RETRY: batches 1-2 durable, batch 3 fails then full cycle retry is idempotent', async () => {
    const timestamps = [
      '2026-09-01T19:12:22.252Z',
      '2026-09-01T19:12:23.252Z',
      '2026-09-01T19:12:24.252Z',
    ];
    const fingerprints = timestamps.map((ts) =>
      buildPhysicalSampleFingerprint({
        providerField: 'speed',
        providerTimestamp: ts,
        normalizedValue: 42,
        interval: '1s',
        aggregation: 'AVG',
      }),
    );

    const dbRows = new Map<string, { fingerprint: string; value: unknown }>();
    const stateStore: {
      acquisitionStateJson: {
        cycleCount: number;
        seenEventFingerprints: string[];
        lastSequenceNumber: number;
        hfWatermarkByField: Record<string, string>;
        hfQueryCoverageByField: Record<string, string>;
      };
      eventWatermarkAt: Date | null;
      startedAt: Date;
    } = {
      acquisitionStateJson: {
        cycleCount: 0,
        seenEventFingerprints: [],
        lastSequenceNumber: 0,
        hfWatermarkByField: {},
        hfQueryCoverageByField: {},
      },
      eventWatermarkAt: null,
      startedAt: sessionStartedAt,
    };

    const observationRepository = {
      findPhysicalSamplesByFingerprints: jest.fn(async (_sessionId: string, fps: string[]) => {
        const map = new Map();
        for (const fp of fps) {
          const row = dbRows.get(fp);
          if (row) {
            map.set(fp, {
              physicalSampleFingerprint: fp,
              normalizedValueJson: row.value,
              providerField: 'speed',
              providerTimestamp: new Date('2026-09-01T19:12:24.252Z'),
            });
          }
        }
        return map;
      }),
      appendManyIdempotent: jest.fn(async (observations: Array<{ physicalSampleFingerprint?: string | null; normalizedValue?: unknown }>) => {
        let insertedCount = 0;
        const durablyRepresentedFingerprints: string[] = [];
        for (const obs of observations) {
          const fp = obs.physicalSampleFingerprint;
          if (!fp) continue;
          if (!dbRows.has(fp)) {
            dbRows.set(fp, { fingerprint: fp, value: obs.normalizedValue });
            insertedCount += 1;
          }
          durablyRepresentedFingerprints.push(fp);
        }
        return { insertedCount, durablyRepresentedFingerprints: [...new Set(durablyRepresentedFingerprints)] };
      }),
      countPhysicalSampleFingerprints: jest.fn(async (_sessionId: string, fps: string[]) => {
        return fps.filter((fp) => dbRows.has(fp)).length;
      }),
    };

    const pending: unknown[] = [];
    let appendCallCount = 0;
    const flushIdempotent = jest.fn(async () => {
      if (!pending.length) {
        return { attempted: 0, inserted: 0, durablyRepresentedFingerprints: [] };
      }
      const batch = pending.splice(0, pending.length) as Array<{
        physicalSampleFingerprint?: string | null;
        normalizedValue?: unknown;
      }>;
      const durablyRepresentedFingerprints: string[] = [];
      let inserted = 0;
      for (let i = 0; i < batch.length; i += 1) {
        appendCallCount += 1;
        if (appendCallCount === 3) {
          pending.unshift(...batch.slice(i));
          throw new Error('batch 3 transient failure');
        }
        const result = await observationRepository.appendManyIdempotent([
          { sessionId, ...(batch[i] as object) },
        ] as never);
        inserted += result.insertedCount;
        durablyRepresentedFingerprints.push(...result.durablyRepresentedFingerprints);
      }
      return {
        attempted: batch.length,
        inserted,
        durablyRepresentedFingerprints: [...new Set(durablyRepresentedFingerprints)],
      };
    });
    const observationWriter = {
      createCaptureCycleId: () => 'cycle-partial',
      createRequestCorrelationId: () => 'req-partial',
      enqueueAndMaybeFlush: jest.fn(async (_s: string, _o: string, _v: string, envelope: unknown) => {
        pending.push(envelope);
        return { flushed: 0, pending: pending.length, inserted: 0, durablyRepresentedFingerprints: [] };
      }),
      flushIdempotent,
    };

    const sessionRepo = {
      findById: jest.fn(async () => ({
        startedAt: stateStore.startedAt,
        eventWatermarkAt: stateStore.eventWatermarkAt,
        acquisitionStateJson: stateStore.acquisitionStateJson,
      })),
      tryAcquireCycleLock: jest.fn(async () => ({
        acquired: true,
        state: stateStore.acquisitionStateJson,
      })),
      releaseCycleLockAndUpdateState: jest.fn(async (_org: string, _sid: string, _job: string, nextState: unknown) => {
        stateStore.acquisitionStateJson = nextState as typeof stateStore.acquisitionStateJson;
        return true;
      }),
    };

    const dimoTelemetry = {
      queryGraphQLWithIngressTiming: jest.fn(async () => ({
        result: {
          data: {
            signals: timestamps.map((timestamp) => ({ timestamp, speed: 42 })),
          },
        },
        timing: {
          synqReceivedAt: new Date('2026-09-01T19:12:27.741Z'),
          acquisitionRequestedAt: new Date('2026-09-01T19:12:27.500Z'),
          httpRequestStartedAt: new Date('2026-09-01T19:12:27.500Z'),
          httpResponseReceivedAt: new Date('2026-09-01T19:12:27.741Z'),
          processingCompletedAt: new Date('2026-09-01T19:12:27.741Z'),
        },
        requestStartedAt: new Date('2026-09-01T19:12:27.500Z'),
        requestCompletedAt: new Date('2026-09-01T19:12:27.741Z'),
      })),
    };

    const service = new ReferenceCaptureAcquisitionService(
      {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue({ dimoVehicle: { tokenId: 123 } }),
        },
      } as never,
      { getVehicleJwt: jest.fn().mockResolvedValue('jwt') } as never,
      dimoTelemetry as never,
      observationWriter as never,
      observationRepository as never,
      sessionRepo as never,
      createLegacyHfRecoveryConfigMock() as never,
    );

    const input = {
      organizationId: orgId,
      vehicleId,
      sessionId,
      cycleJobId: 'job-partial-1',
      preflight: makePreflight(['speed']),
      manifestVersion: '1.1.0',
      powertrainProfile: 'ICE_GASOLINE',
      cycleIntervalMs: 5000,
      slowCycleEvery: 6,
    };

    await expect(service.executeAcquisitionCycle(input)).rejects.toThrow('batch 3 transient failure');
    expect(dbRows.size).toBe(2);
    expect(stateStore.acquisitionStateJson.hfWatermarkByField?.speed).toBeUndefined();

    await service.executeAcquisitionCycle({ ...input, cycleJobId: 'job-partial-2' });
    expect(dbRows.size).toBe(3);
    for (const fp of fingerprints) {
      expect(dbRows.has(fp)).toBe(true);
    }
    expect(stateStore.acquisitionStateJson.hfWatermarkByField?.speed).toBe('2026-09-01T19:12:24.252Z');
  });
});
