import {
  RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV,
  RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV,
} from '@config/raw-fuel-refuel-fallback.config';
import { FuelType } from '@prisma/client';
import { RawFuelRefuelFallbackRuntimeService } from './raw-fuel-refuel-fallback-runtime.service';
import {
  buildRuntimeDetectionContextFromTrust,
  linearRiseSamples,
  sampleAt,
  stablePlateauSamples,
} from '../raw-fuel-rise-detector/testing/raw-fuel-rise-detector-test.util';

describe('RawFuelRefuelFallbackRuntimeService', () => {
  const baseInput = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    tokenId: 123,
    windowFrom: new Date('2026-09-06T07:00:00.000Z'),
    windowTo: new Date('2026-09-06T12:00:00.000Z'),
    fuelType: FuelType.GASOLINE,
    requestContext: { organizationId: 'org-1', vehicleId: 'veh-1', tokenId: 123 },
  };

  const riseSamples = [
    ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
    ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
    ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
  ];

  function createService(overrides: {
    fetchFuelLevelSamplesWithOutcome?: jest.Mock;
    resolveOrCreateCandidate?: jest.Mock;
    config?: { masterEnabled: boolean; persistEnabled: boolean };
  } = {}) {
    const fetchFuelLevelSamplesWithOutcome =
      overrides.fetchFuelLevelSamplesWithOutcome ??
      jest.fn().mockResolvedValue({
        status: 'SUCCESS',
        samples: riseSamples.map((s) => ({
          timestamp: s.timestamp,
          absoluteLiters: s.absoluteLiters ?? null,
          relativePercent: s.relativePercent ?? null,
        })),
      });
    const dimoSegments = { fetchFuelLevelSamplesWithOutcome };
    const rawRefuelCandidateService = {
      resolveOrCreateCandidate:
        overrides.resolveOrCreateCandidate ??
        jest.fn().mockResolvedValue({
          candidateId: 'cand-1',
          created: true,
          candidateIdentityKey: 'key-1',
          evidenceRevisionFingerprint: 'fp-1',
        }),
    };
    const config = overrides.config ?? { masterEnabled: true, persistEnabled: true };
    const service = new RawFuelRefuelFallbackRuntimeService(
      dimoSegments as never,
      rawRefuelCandidateService as never,
      undefined,
      undefined,
      undefined,
    ).withConfigLoader(() => ({ ...config, cutoverAt: null }));
    return { service, dimoSegments, rawRefuelCandidateService };
  }

  it('master=false skips scan', async () => {
    const { service, dimoSegments } = createService({
      config: { masterEnabled: false, persistEnabled: false },
    });
    const result = await service.scanIfEnabled(baseInput);
    expect(result.skipReason).toBe('master_disabled');
    expect(dimoSegments.fetchFuelLevelSamplesWithOutcome).not.toHaveBeenCalled();
  });

  it('master=false persist=true fails closed', async () => {
    const { service, dimoSegments } = createService({
      config: { masterEnabled: false, persistEnabled: true },
    });
    const result = await service.scanIfEnabled(baseInput);
    expect(result.skipReason).toBe('persist_without_master');
    expect(dimoSegments.fetchFuelLevelSamplesWithOutcome).not.toHaveBeenCalled();
  });

  it('master=true persist=false detects but does not persist', async () => {
    const { service, rawRefuelCandidateService } = createService({
      config: { masterEnabled: true, persistEnabled: false },
    });
    const result = await service.scanIfEnabled(baseInput);
    expect(result.observationsEmitted).toBe(1);
    expect(result.persistSkippedBecauseFlagOff).toBe(1);
    expect(rawRefuelCandidateService.resolveOrCreateCandidate).not.toHaveBeenCalled();
  });

  it('capability UNKNOWN fails closed', async () => {
    const { service, dimoSegments } = createService();
    const result = await service.scanIfEnabled({
      ...baseInput,
      fuelType: FuelType.OTHER,
    });
    expect(result.skipReason).toBe('capability_unknown');
    expect(dimoSegments.fetchFuelLevelSamplesWithOutcome).not.toHaveBeenCalled();
  });

  it('preserves F4.1 UNKNOWN promotion trust with ADMISSIBLE detection', async () => {
    const { service } = createService();
    const result = await service.scanIfEnabled(baseInput);
    expect(result.observationsEmitted).toBe(1);
    const trustInput = {
      samples: riseSamples,
      scanWindowStart: baseInput.windowFrom,
      scanWindowEnd: baseInput.windowTo,
    };
    const ctx = buildRuntimeDetectionContextFromTrust(trustInput, {
      organizationId: baseInput.organizationId,
      vehicleId: baseInput.vehicleId,
    });
    expect(ctx.absoluteSignalTrust).toBe('UNKNOWN');
    expect(ctx.absoluteDetectionAdmissibility).toBe('ADMISSIBLE');
    expect(result.candidatesCreated).toBe(1);
  });

  it('SUCCESS empty telemetry => no_samples', async () => {
    const { service } = createService({
      fetchFuelLevelSamplesWithOutcome: jest.fn().mockResolvedValue({
        status: 'SUCCESS',
        samples: [],
      }),
    });
    const result = await service.scanIfEnabled(baseInput);
    expect(result.skipReason).toBe('no_samples');
    expect(result.fetchErrorClass).toBeUndefined();
  });

  it('PROVIDER error outcome => sample_fetch_failed without throwing', async () => {
    const { service } = createService({
      fetchFuelLevelSamplesWithOutcome: jest.fn().mockResolvedValue({
        status: 'ERROR',
        samples: [],
        errorClass: 'PROVIDER_QUERY_FAILED',
        message: 'fetch boom',
      }),
    });
    const result = await service.scanIfEnabled(baseInput);
    expect(result.skipReason).toBe('sample_fetch_failed');
    expect(result.fetchErrorClass).toBe('PROVIDER_QUERY_FAILED');
    expect(result.branchError).toBeUndefined();
  });

  it('isolates per-candidate persist failure', async () => {
    const resolveOrCreateCandidate = jest
      .fn()
      .mockRejectedValueOnce(new Error('persist boom'))
      .mockResolvedValueOnce({
        candidateId: 'cand-2',
        created: true,
        candidateIdentityKey: 'key-2',
        evidenceRevisionFingerprint: 'fp-2',
      });
    const twoRefuelSamples = [
      ...riseSamples,
      ...stablePlateauSamples('2026-09-06T10:00:00.000Z', 20, 3, 300),
      ...linearRiseSamples('2026-09-06T10:16:00.000Z', [25, 32, 38, 40], 120),
      ...stablePlateauSamples('2026-09-06T10:28:00.000Z', 40, 4, 120),
    ];
    const svc = new RawFuelRefuelFallbackRuntimeService(
      {
        fetchFuelLevelSamplesWithOutcome: jest.fn().mockResolvedValue({
          status: 'SUCCESS',
          samples: twoRefuelSamples.map((s) => ({
            timestamp: s.timestamp,
            absoluteLiters: s.absoluteLiters ?? null,
            relativePercent: s.relativePercent ?? null,
          })),
        }),
      } as never,
      { resolveOrCreateCandidate } as never,
      undefined,
      undefined,
      undefined,
    ).withConfigLoader(() => ({ masterEnabled: true, persistEnabled: true, cutoverAt: null }));
    const result = await svc.scanIfEnabled(baseInput);
    expect(result.observationsEmitted).toBe(2);
    expect(result.candidateOutcomes.some((o) => o.error)).toBe(true);
    expect(result.candidatesCreated).toBe(1);
  });

  it('F10.6.6-A.1 — strict-gap rise emits rejectedOrHeld only and does not persist', async () => {
    const strictGapSamples = [
      ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
      sampleAt('2026-09-06T08:16:00.000Z', 20),
      sampleAt('2026-09-06T08:24:00.000Z', 26),
      sampleAt('2026-09-06T08:32:00.000Z', 30),
    ];
    const resolveOrCreateCandidate = jest.fn();
    const { service } = createService({
      fetchFuelLevelSamplesWithOutcome: jest.fn().mockResolvedValue({
        status: 'SUCCESS',
        samples: strictGapSamples.map((s) => ({
          timestamp: s.timestamp,
          absoluteLiters: s.absoluteLiters ?? null,
          relativePercent: s.relativePercent ?? null,
        })),
      }),
      resolveOrCreateCandidate,
    });
    const result = await service.scanIfEnabled(baseInput);
    expect(result.observationsEmitted).toBe(0);
    expect(result.persistAttempted).toBe(0);
    expect(resolveOrCreateCandidate).not.toHaveBeenCalled();
  });

  it('F10.6.6-A.1 — prior persist path unchanged when later scan is strict-gap rejectedOrHeld only', async () => {
    const resolveOrCreateCandidate = jest
      .fn()
      .mockResolvedValueOnce({
        candidateId: 'cand-partial',
        created: true,
        updated: false,
        lifecycleState: 'OBSERVED',
        candidateIdentityKey: 'key-partial',
        evidenceRevisionFingerprint: 'fp-1',
      });
    const partialSamples = [
      ...stablePlateauSamples('2026-09-19T15:40:26.000Z', 5, 5, 120),
      sampleAt('2026-09-19T16:11:24.000Z', 16),
      sampleAt('2026-09-19T16:13:26.000Z', 17),
      sampleAt('2026-09-19T16:15:27.000Z', 18),
    ];
    const strictGapSamples = [
      ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
      sampleAt('2026-09-06T08:16:00.000Z', 20),
      sampleAt('2026-09-06T08:24:00.000Z', 26),
      sampleAt('2026-09-06T08:32:00.000Z', 30),
    ];
    let call = 0;
    const fetchFuelLevelSamplesWithOutcome = jest.fn().mockImplementation(async () => {
      call += 1;
      const samples = call === 1 ? partialSamples : strictGapSamples;
      return {
        status: 'SUCCESS',
        samples: samples.map((s) => ({
          timestamp: s.timestamp,
          absoluteLiters: s.absoluteLiters ?? null,
          relativePercent: s.relativePercent ?? null,
        })),
      };
    });
    const service = new RawFuelRefuelFallbackRuntimeService(
      { fetchFuelLevelSamplesWithOutcome } as never,
      { resolveOrCreateCandidate } as never,
      undefined,
      undefined,
      undefined,
    ).withConfigLoader(() => ({ masterEnabled: true, persistEnabled: true, cutoverAt: null }));

    const partialInput = {
      ...baseInput,
      windowFrom: new Date('2026-09-19T15:00:00.000Z'),
      windowTo: new Date('2026-09-19T18:00:00.000Z'),
    };
    await service.scanIfEnabled(partialInput);
    await service.scanIfEnabled(baseInput);
    expect(resolveOrCreateCandidate).toHaveBeenCalledTimes(1);
  });
});

describe('RawFuelRefuelFallbackRuntimeService env flags default false', () => {
  it('defaults master and persist to false when env unset', async () => {
    const env = { ...process.env };
    delete env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV];
    delete env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV];
    const service = new RawFuelRefuelFallbackRuntimeService({} as never, {} as never);
    const result = await service.scanIfEnabled(
      {
        organizationId: 'org',
        vehicleId: 'veh',
        tokenId: 1,
        windowFrom: new Date(),
        windowTo: new Date(),
        fuelType: FuelType.GASOLINE,
        requestContext: { organizationId: 'org', vehicleId: 'veh', tokenId: 1 },
      },
      env,
    );
    expect(result.masterEnabled).toBe(false);
    expect(result.persistEnabled).toBe(false);
  });
});
