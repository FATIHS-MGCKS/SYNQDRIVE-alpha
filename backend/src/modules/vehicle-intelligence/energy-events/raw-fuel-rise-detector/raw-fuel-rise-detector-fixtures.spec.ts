import {
  KS_MS_661_FIXTURE_ORGANIZATION_ID,
  KS_MS_661_FIXTURE_VEHICLE_ID,
  KS_MS_661_OBSERVED_ABSOLUTE_FUEL_SAMPLES,
  KS_MS_661_OBSERVED_DETECTION_WINDOW,
  KS_MS_661_OBSERVED_RFRF_EXPECTED,
} from '@modules/dimo/fixtures/ks-ms-661-2026-09-06-refuel-observed.fixture';
import {
  KS_MS_661_SYNTHETIC_ABSOLUTE_FUEL_SAMPLES,
  KS_MS_661_SYNTHETIC_RFRF_EXPECTED,
} from '@modules/dimo/fixtures/ks-ms-661-2026-09-06-refuel-synthetic.fixture';
import { detectRawFuelRises } from './raw-fuel-rise-detector';
import {
  buildDetectorPhysicsContext,
  buildRuntimeDetectionContextFromTrust,
  linearRiseSamples,
  sampleAt,
  stablePlateauSamples,
} from './testing/raw-fuel-rise-detector-test.util';

describe('raw-fuel-rise-detector fixtures', () => {
  it('KS MS 661 observed — material local rise detected without native DIMO', () => {
    const samples = KS_MS_661_OBSERVED_ABSOLUTE_FUEL_SAMPLES.map((s) => ({
      timestamp: new Date(s.timestamp),
      absoluteLiters: s.absoluteLiters,
      relativePercent: s.relativePercent,
    }));
    const context = buildRuntimeDetectionContextFromTrust(
      {
        samples,
        scanWindowStart: new Date(KS_MS_661_OBSERVED_DETECTION_WINDOW.from),
        scanWindowEnd: new Date(KS_MS_661_OBSERVED_DETECTION_WINDOW.to),
      },
      {
        organizationId: KS_MS_661_FIXTURE_ORGANIZATION_ID,
        vehicleId: KS_MS_661_FIXTURE_VEHICLE_ID,
      },
    );
    const result = detectRawFuelRises({ context, samples });

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.signalChannel).toBe('ABSOLUTE_LITERS');
    expect(candidate.preFuelAbsoluteLiters).toBe(
      KS_MS_661_OBSERVED_RFRF_EXPECTED.preFuelAbsoluteLiters,
    );
    expect(candidate.postFuelAbsoluteLiters).toBe(
      KS_MS_661_OBSERVED_RFRF_EXPECTED.postFuelAbsoluteLiters,
    );
    expect(candidate.deltaAbsoluteLiters).toBe(
      KS_MS_661_OBSERVED_RFRF_EXPECTED.deltaLiters,
    );
    expect(['OBSERVED', 'SETTLING']).toContain(candidate.lifecycleState);
    expect(candidate.lifecycleState).not.toBe('READY_FOR_PERSIST');
  });

  it('KS MS 661 synthetic — full lifecycle READY_FOR_PERSIST', () => {
    const context = buildDetectorPhysicsContext({
      organizationId: KS_MS_661_FIXTURE_ORGANIZATION_ID,
      vehicleId: KS_MS_661_FIXTURE_VEHICLE_ID,
      scanWindowStart: new Date(KS_MS_661_OBSERVED_DETECTION_WINDOW.from),
      scanWindowEnd: new Date(KS_MS_661_OBSERVED_DETECTION_WINDOW.to),
    });
    const result = detectRawFuelRises({
      context,
      samples: KS_MS_661_SYNTHETIC_ABSOLUTE_FUEL_SAMPLES.map((s) => ({
        timestamp: new Date(s.timestamp),
        absoluteLiters: s.absoluteLiters,
        relativePercent: s.relativePercent,
      })),
    });

    expect(result.candidates).toHaveLength(1);
    const candidate = result.candidates[0];
    expect(candidate.lifecycleState).toBe(
      KS_MS_661_SYNTHETIC_RFRF_EXPECTED.lifecycleState,
    );
    expect(candidate.deltaAbsoluteLiters).toBe(
      KS_MS_661_SYNTHETIC_RFRF_EXPECTED.deltaLiters,
    );
  });

  it('two separate refuels in one large window', () => {
    const context = buildDetectorPhysicsContext({
      scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
      scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
    });
    const samples = [
      ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
      ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
      ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
      ...stablePlateauSamples('2026-09-06T10:00:00.000Z', 20, 3, 300),
      ...linearRiseSamples('2026-09-06T10:16:00.000Z', [25, 32, 38, 40], 120),
      ...stablePlateauSamples('2026-09-06T10:28:00.000Z', 40, 4, 120),
    ];
    const result = detectRawFuelRises({ context, samples });
    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result.candidates[0].deltaAbsoluteLiters).toBeGreaterThanOrEqual(5);
    expect(result.candidates[1].deltaAbsoluteLiters).toBeGreaterThanOrEqual(5);
  });

  it('refuel followed by hours of consumption retains detected plateau', () => {
    const context = buildDetectorPhysicsContext();
    const samples = [
      ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 20, 3, 300),
      ...linearRiseSamples('2026-09-06T08:16:00.000Z', [25, 32, 38, 40], 120),
      ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 40, 4, 120),
      sampleAt('2026-09-06T12:00:00.000Z', 34),
      sampleAt('2026-09-06T13:00:00.000Z', 30),
    ];
    const result = detectRawFuelRises({ context, samples });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].postFuelAbsoluteLiters).toBe(40);
    expect(result.candidates[0].preFuelAbsoluteLiters).toBe(20);
  });
});
