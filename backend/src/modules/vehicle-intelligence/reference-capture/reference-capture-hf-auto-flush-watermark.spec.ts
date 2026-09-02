import { ReferenceCaptureObservationKind } from '@prisma/client';
import { ReferenceCaptureAcquisitionService, ReferenceCaptureLegacySessionIdentityError } from './reference-capture-acquisition.service';
import { REFERENCE_CAPTURE_ENVELOPE_VERSION } from './reference-capture.constants';
import { buildRawIdentity } from './reference-capture.contract';
import { buildPhysicalSampleFingerprint } from './reference-capture-physical-sample-identity.util';
import { ReferenceCaptureObservationWriterService } from './reference-capture-observation-writer.service';
import type { ReferenceCapturePreflightResult } from './reference-capture.types';

function makePreflight(fields: string[]): ReferenceCapturePreflightResult {
  return {
    availableSignals: fields,
    broadObservationFieldCount: fields.length,
    broadObservationFields: fields.map((providerField) => ({
      providerField,
      canonicalKey: providerField === 'speed' ? 'CAN_VEHICLE_SPEED' : providerField === 'obdEngineLoad' ? 'OBD_ENGINE_LOAD' : null,
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

describe('reference-capture HF auto-flush watermark accounting', () => {
  const sessionId = 'sess-autoflush';
  const orgId = 'org-1';
  const vehicleId = 'veh-1';
  const sessionStartedAt = new Date('2026-09-01T19:00:43.252Z');

  function buildHarness(batchSize: number, rows: Array<Record<string, unknown>>) {
    const dbRows = new Map<string, { fingerprint: string; value: unknown }>();
    const stateStore = {
      acquisitionStateJson: {
        cycleCount: 0,
        seenEventFingerprints: [] as string[],
        lastSequenceNumber: 0,
        hfWatermarkByField: {} as Record<string, string>,
        hfQueryCoverageByField: {} as Record<string, string>,
        hfPhysicalIdentityVersion: 'AGGREGATE_BUCKET_V2' as const,
      },
      eventWatermarkAt: null as Date | null,
      startedAt: sessionStartedAt,
    };

    const observationRepository = {
      findPhysicalSamplesByFingerprints: jest.fn(async (_sid: string, fps: string[]) => {
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
      findExistingProviderEventFingerprints: jest.fn(async () => new Set<string>()),
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
      countPhysicalSampleFingerprints: jest.fn(async (_sid: string, fps: string[]) =>
        fps.filter((fp) => dbRows.has(fp)).length,
      ),
    };

    const config = { getBatchSize: () => batchSize, getMaxPendingObservations: () => 100 };
    const observationWriter = new ReferenceCaptureObservationWriterService(
      config as never,
      observationRepository as never,
    );

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
      releaseCycleLockAndUpdateState: jest.fn(async (_o: string, _s: string, _j: string, next: unknown) => {
        stateStore.acquisitionStateJson = next as typeof stateStore.acquisitionStateJson;
        return true;
      }),
    };

    const dimoTelemetry = {
      queryGraphQLWithIngressTiming: jest.fn(async () => ({
        result: { data: { signals: rows } },
        timing: {
          synqReceivedAt: new Date('2026-09-01T19:12:27.741Z'),
          acquisitionRequestedAt: new Date('2026-09-01T19:12:27.500Z'),
          httpRequestStartedAt: new Date('2026-09-01T19:12:27.500Z'),
          httpResponseReceivedAt: new Date('2026-09-01T19:12:32.500Z'),
          processingCompletedAt: new Date('2026-09-01T19:12:32.500Z'),
        },
        requestStartedAt: new Date('2026-09-01T19:12:27.500Z'),
        requestCompletedAt: new Date('2026-09-01T19:12:32.500Z'),
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
      observationWriter,
      observationRepository as never,
      sessionRepo as never,
    );

    return { service, stateStore, dbRows, observationWriter };
  }

  it('AUTO_FLUSH_DURABLES_INCLUDED_IN_SAME_CYCLE_WATERMARK: exact batch divisible auto-flush advances watermark', async () => {
    const timestamps = [
      '2026-09-01T19:12:20.252Z',
      '2026-09-01T19:12:21.252Z',
      '2026-09-01T19:12:22.252Z',
      '2026-09-01T19:12:23.252Z',
    ];
    const rows = timestamps.map((timestamp) => ({ timestamp, speed: 42 }));
    const { service, stateStore, observationWriter } = buildHarness(2, rows);

    await service.executeAcquisitionCycle({
      organizationId: orgId,
      vehicleId,
      sessionId,
      cycleJobId: 'job-exact-batch',
      preflight: makePreflight(['speed']),
      manifestVersion: '1.1.0',
      powertrainProfile: 'ICE_GASOLINE',
      cycleIntervalMs: 5000,
      slowCycleEvery: 6,
    });

    expect(observationWriter.getPendingCount(sessionId)).toBe(0);
    expect(stateStore.acquisitionStateJson.hfWatermarkByField.speed).toBe('2026-09-01T19:12:23.252Z');
  });

  it('SPARSE_FIELD_AUTO_FLUSH_WATERMARK_CORRECT: sparse field in early batch advances same-cycle watermark', async () => {
    const rows = [
      { timestamp: '2026-09-01T19:12:20.252Z', speed: 40, obdEngineLoad: 1 },
      { timestamp: '2026-09-01T19:12:21.252Z', speed: 41 },
      { timestamp: '2026-09-01T19:12:22.252Z', speed: 42 },
    ];
    const { service, stateStore } = buildHarness(2, rows);

    await service.executeAcquisitionCycle({
      organizationId: orgId,
      vehicleId,
      sessionId: 'sess-sparse',
      cycleJobId: 'job-sparse',
      preflight: makePreflight(['speed', 'obdEngineLoad']),
      manifestVersion: '1.1.0',
      powertrainProfile: 'ICE_GASOLINE',
      cycleIntervalMs: 5000,
      slowCycleEvery: 6,
    });

    expect(stateStore.acquisitionStateJson.hfWatermarkByField.speed).toBe('2026-09-01T19:12:22.252Z');
    expect(stateStore.acquisitionStateJson.hfWatermarkByField.obdEngineLoad).toBe('2026-09-01T19:12:20.252Z');
  });

  it('ACTUAL_QUERY_TO used for coverage not HTTP completion (5s latency)', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-01T19:12:27.500Z'));
    const rows = [{ timestamp: '2026-09-01T19:12:20.252Z', speed: 42 }];
    const { service, stateStore } = buildHarness(10, rows);

    await service.executeAcquisitionCycle({
      organizationId: orgId,
      vehicleId,
      sessionId: 'sess-latency',
      cycleJobId: 'job-latency',
      preflight: makePreflight(['speed']),
      manifestVersion: '1.1.0',
      powertrainProfile: 'ICE_GASOLINE',
      cycleIntervalMs: 5000,
      slowCycleEvery: 6,
    });

    expect(stateStore.acquisitionStateJson.hfQueryCoverageByField.speed).toBe('2026-09-01T19:12:27.500Z');
    expect(stateStore.acquisitionStateJson.hfQueryCoverageByField.speed).not.toBe('2026-09-01T19:12:32.500Z');
    jest.useRealTimers();
  });

  it('ACTIVE_LEGACY_SESSION_UPGRADE_POLICY: fail closed on legacy identity session', async () => {
    const { service } = buildHarness(2, []);
    const sessionRepo = (service as unknown as { sessionRepository: { tryAcquireCycleLock: jest.Mock } }).sessionRepository;
    sessionRepo.tryAcquireCycleLock.mockResolvedValueOnce({
      acquired: true,
      state: {
        cycleCount: 5,
        seenPhysicalSampleFingerprints: ['legacy-fp'],
        hfWatermarkByField: {},
        hfQueryCoverageByField: {},
        seenEventFingerprints: [],
        lastSequenceNumber: 0,
      },
    });

    await expect(
      service.executeAcquisitionCycle({
        organizationId: orgId,
        vehicleId,
        sessionId: 'sess-legacy',
        cycleJobId: 'job-legacy',
        preflight: makePreflight(['speed']),
        manifestVersion: '1.1.0',
        powertrainProfile: 'ICE_GASOLINE',
        cycleIntervalMs: 5000,
        slowCycleEvery: 6,
      }),
    ).rejects.toThrow(ReferenceCaptureLegacySessionIdentityError);
  });
});
