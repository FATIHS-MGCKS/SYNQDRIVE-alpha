import {
  KS_MS_661_FIXTURE_ORGANIZATION_ID,
  KS_MS_661_FIXTURE_VEHICLE_ID,
  KS_MS_661_OBSERVED_ABSOLUTE_FUEL_SAMPLES,
  KS_MS_661_OBSERVED_DETECTION_WINDOW,
  KS_MS_661_OBSERVED_RFRF_EXPECTED,
} from '@modules/dimo/fixtures/ks-ms-661-2026-09-06-refuel-observed.fixture';
import { canRawRefuelFallbackAuthorizeVehicleEnergyEventPromotion } from '@config/raw-fuel-refuel-fallback.config';
import {
  ABSOLUTE_SIGNAL_TRUST_AUTHORITY_AVAILABLE,
  resolveRawFuelSignalTrust,
} from './raw-fuel-signal-trust.resolver';
import { detectRawFuelRises } from '../raw-fuel-rise-detector/raw-fuel-rise-detector';
import type { RawFuelRiseHeldOrRejected } from '../raw-fuel-rise-detector/raw-fuel-rise-detector.types';
import {
  buildDetectionContext,
  buildDetectorPhysicsContext,
  buildRuntimeDetectionContextFromTrust,
  linearRiseSamples,
  sampleAt,
  stablePlateauSamples,
} from '../raw-fuel-rise-detector/testing/raw-fuel-rise-detector-test.util';

const ks661Samples = KS_MS_661_OBSERVED_ABSOLUTE_FUEL_SAMPLES.map((row) => ({
  timestamp: new Date(row.timestamp),
  absoluteLiters: row.absoluteLiters,
  relativePercent: row.relativePercent,
}));

const ks661TrustInput = {
  samples: ks661Samples,
  scanWindowStart: new Date(KS_MS_661_OBSERVED_DETECTION_WINDOW.from),
  scanWindowEnd: new Date(KS_MS_661_OBSERVED_DETECTION_WINDOW.to),
};

describe('RFRF F4.1 — signal trust × F3 detection boundary', () => {
  describe('KS MS 661 runtime trust reproduction', () => {
    it('runtime trust resolver keeps promotion trust UNKNOWN with absolute-only observed samples', () => {
      const trust = resolveRawFuelSignalTrust(ks661TrustInput);
      expect(trust.absoluteSignalTrust).toBe('UNKNOWN');
      expect(trust.relativeSignalAvailable).toBe(false);
      expect(trust.absoluteDetectionAdmissibility).toBe('ADMISSIBLE');
      expect(ABSOLUTE_SIGNAL_TRUST_AUTHORITY_AVAILABLE).toBe(false);
    });

    it('F4.1 closure: KS MS 661 observed absolute-only +24 L stages candidate under runtime trust', () => {
      const context = buildRuntimeDetectionContextFromTrust(ks661TrustInput, {
        organizationId: KS_MS_661_FIXTURE_ORGANIZATION_ID,
        vehicleId: KS_MS_661_FIXTURE_VEHICLE_ID,
      });

      expect(context.absoluteSignalTrust).toBe('UNKNOWN');
      expect(context.absoluteDetectionAdmissibility).toBe('ADMISSIBLE');

      const result = detectRawFuelRises({ context, samples: ks661Samples });

      expect(
        result.rejectedOrHeld.some(
          (r: RawFuelRiseHeldOrRejected) => r.reason === 'no_trusted_channel',
        ),
      ).toBe(false);
      expect(result.candidates.length).toBeGreaterThanOrEqual(1);
      expect(result.candidates[0]?.signalChannel).toBe('ABSOLUTE_LITERS');
      expect(result.candidates[0]?.absoluteSignalTrust).toBe('UNKNOWN');
      expect(result.candidates[0]?.qualityMeta?.absoluteDetectionAdmissibility).toBe('ADMISSIBLE');
      expect(result.candidates[0]?.deltaAbsoluteLiters).toBeGreaterThanOrEqual(
        KS_MS_661_OBSERVED_RFRF_EXPECTED.deltaLiters - 1,
      );
    });

    it('UNKNOWN promotion trust never authorizes fallback VEE promotion', () => {
      expect(canRawRefuelFallbackAuthorizeVehicleEnergyEventPromotion()).toBe(false);
    });
  });

  describe('negative safety matrix (detection admissibility vs promotion trust)', () => {
    it('1 KS MS 661 observed absolute-only +24 L — covered in runtime trust block above', () => {
      expect(true).toBe(true);
    });

    it('2 sparse absolute noise — no candidate', () => {
      const samples = [sampleAt('2026-09-06T08:00:00.000Z', 10)];
      const context = buildRuntimeDetectionContextFromTrust({
        samples,
        scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
        scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
      });
      const result = detectRawFuelRises({ context, samples });
      expect(result.candidates).toHaveLength(0);
    });

    it('3 one-sample absolute spike rejected', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        sampleAt('2026-09-06T08:16:00.000Z', 30),
        sampleAt('2026-09-06T08:18:00.000Z', 10),
      ];
      const result = detectRawFuelRises({
        context: buildDetectorPhysicsContext(),
        samples,
      });
      expect(result.candidates).toHaveLength(0);
    });

    it('4 spike-to-baseline — no candidate under runtime admissibility', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        sampleAt('2026-09-06T08:16:00.000Z', 20),
        sampleAt('2026-09-06T08:18:00.000Z', 10),
      ];
      const context = buildRuntimeDetectionContextFromTrust({
        samples,
        scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
        scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
      });
      expect(detectRawFuelRises({ context, samples }).candidates).toHaveLength(0);
    });

    it('5 repeated strong wobble — fail closed to non-READY', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        sampleAt('2026-09-06T08:16:00.000Z', 18),
        sampleAt('2026-09-06T08:18:00.000Z', 12),
        sampleAt('2026-09-06T08:20:00.000Z', 19),
        sampleAt('2026-09-06T08:22:00.000Z', 11),
      ];
      const context = buildRuntimeDetectionContextFromTrust({
        samples,
        scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
        scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
      });
      const result = detectRawFuelRises({ context, samples });
      expect(result.candidates.every((c) => c.lifecycleState !== 'READY_FOR_PERSIST')).toBe(true);
    });

    it('6 long consumption drift — no candidate', () => {
      const samples = linearRiseSamples(
        '2026-09-06T08:00:00.000Z',
        [40, 38, 36, 34, 32, 30],
        600,
      );
      const context = buildRuntimeDetectionContextFromTrust({
        samples,
        scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
        scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
      });
      expect(detectRawFuelRises({ context, samples }).candidates).toHaveLength(0);
    });

    it('7 relative-only valid rise uses relative channel under runtime trust', () => {
      const samples = [
        sampleAt('2026-09-06T08:00:00.000Z', null, 20),
        sampleAt('2026-09-06T08:05:00.000Z', null, 20),
        sampleAt('2026-09-06T08:10:00.000Z', null, 20),
        sampleAt('2026-09-06T08:16:00.000Z', null, 26),
        sampleAt('2026-09-06T08:18:00.000Z', null, 30),
        sampleAt('2026-09-06T08:20:00.000Z', null, 33),
        sampleAt('2026-09-06T08:22:00.000Z', null, 36),
        sampleAt('2026-09-06T08:24:00.000Z', null, 36),
      ];
      const context = buildRuntimeDetectionContextFromTrust({
        samples,
        scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
        scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
      });
      const result = detectRawFuelRises({ context, samples });
      expect(result.diagnostics.primaryChannel).toBe('RELATIVE_PERCENT');
      expect(result.candidates.length).toBeGreaterThanOrEqual(1);
    });

    it('8 absolute + relative agreeing — absolute primary under runtime admissibility', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
        ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
      ].map((s) => ({
        ...s,
        relativePercent: s.absoluteLiters != null ? (s.absoluteLiters / 60) * 100 : null,
      }));
      const context = buildRuntimeDetectionContextFromTrust({
        samples,
        scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
        scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
      });
      const result = detectRawFuelRises({ context, samples });
      expect(result.diagnostics.primaryChannel).toBe('ABSOLUTE_LITERS');
      expect(result.candidates.length).toBeGreaterThanOrEqual(1);
      expect(result.candidates[0]?.absoluteSignalTrust).toBe('UNKNOWN');
    });

    it('9 absolute + relative conflicting — absolute channel still admissible', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
        ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
      ].map((s) => ({
        ...s,
        relativePercent: s.absoluteLiters != null ? 5 : 5,
      }));
      const context = buildRuntimeDetectionContextFromTrust({
        samples,
        scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
        scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
      });
      const result = detectRawFuelRises({ context, samples });
      expect(result.diagnostics.primaryChannel).toBe('ABSOLUTE_LITERS');
      expect(result.candidates.length).toBeGreaterThanOrEqual(1);
    });

    it('10 non-finite absolute values are INADMISSIBLE at resolver', () => {
      const trust = resolveRawFuelSignalTrust({
        samples: [{ timestamp: new Date('2026-09-06T08:00:00.000Z'), absoluteLiters: Number.NaN }],
        scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
        scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
      });
      expect(trust.absoluteDetectionAdmissibility).toBe('INADMISSIBLE');
      expect(trust.absoluteSignalTrust).toBe('UNKNOWN');
    });

    it('11 INADMISSIBLE absolute blocks channel even with valid-looking samples', () => {
      const samples = stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300);
      const result = detectRawFuelRises({
        context: buildDetectionContext({
          absoluteDetectionAdmissibility: 'INADMISSIBLE',
          relativeSignalAvailable: false,
        }),
        samples,
      });
      expect(result.rejectedOrHeld[0]?.reason).toBe('no_trusted_channel');
    });

    it('12 absolute out-of-physical-range — no tank-range authority; negative values INADMISSIBLE', () => {
      const trust = resolveRawFuelSignalTrust({
        samples: [{ timestamp: new Date('2026-09-06T08:00:00.000Z'), absoluteLiters: -5 }],
        scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
        scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
      });
      expect(trust.absoluteDetectionAdmissibility).toBe('INADMISSIBLE');
    });

    it('13 ELECTRIC / NON_FUEL_CAPABLE — F4 capability gate (not F3 detector); documented deferral', () => {
      expect(true).toBe(true);
    });

    it('14 UNKNOWN fuel capability — F4 capability gate (not F3 detector); documented deferral', () => {
      expect(true).toBe(true);
    });

    it('15 delayed absolute telemetry — hold not READY under runtime admissibility', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        sampleAt('2026-09-06T08:20:00.000Z', 20),
        sampleAt('2026-09-06T08:50:00.000Z', 30),
        sampleAt('2026-09-06T08:54:00.000Z', 30),
        sampleAt('2026-09-06T08:58:00.000Z', 30),
      ];
      const context = buildRuntimeDetectionContextFromTrust({
        samples,
        scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
        scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
      });
      const result = detectRawFuelRises({ context, samples });
      if (result.candidates.length > 0) {
        expect(result.candidates[0].lifecycleState).not.toBe('READY_FOR_PERSIST');
      }
    });

    it('16 two distinct refuels preserved under runtime admissibility', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
        ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
        ...stablePlateauSamples('2026-09-06T10:00:00.000Z', 20, 3, 300),
        ...linearRiseSamples('2026-09-06T10:16:00.000Z', [25, 32, 38, 40], 120),
        ...stablePlateauSamples('2026-09-06T10:28:00.000Z', 40, 4, 120),
      ];
      const context = buildRuntimeDetectionContextFromTrust({
        samples,
        scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
        scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
      });
      const result = detectRawFuelRises({ context, samples });
      expect(result.candidates).toHaveLength(2);
    });

    it('17 stepped single refuel — one candidate under runtime admissibility', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        ...linearRiseSamples('2026-09-06T08:16:00.000Z', [16, 16, 16, 30], 120),
        ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
      ];
      const context = buildRuntimeDetectionContextFromTrust({
        samples,
        scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
        scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
      });
      expect(detectRawFuelRises({ context, samples }).candidates).toHaveLength(1);
    });

    it('18 ADMISSIBLE detection does not upgrade promotion trust to TRUSTED', () => {
      const trust = resolveRawFuelSignalTrust({
        samples: [{ timestamp: new Date('2026-09-06T08:00:00.000Z'), absoluteLiters: 42.5 }],
        scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
        scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
      });
      expect(trust.absoluteDetectionAdmissibility).toBe('ADMISSIBLE');
      expect(trust.absoluteSignalTrust).toBe('UNKNOWN');
    });
  });
});
