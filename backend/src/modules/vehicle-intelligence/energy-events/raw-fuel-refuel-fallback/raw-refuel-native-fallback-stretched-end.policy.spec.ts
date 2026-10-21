import type { RawRefuelCandidate } from '@prisma/client';
import {
  classifyPhysicalRefuelSibling,
  type RefuelRowForMatcher,
} from '../physical-refuel-identity.matcher';
import { evaluateRawRefuelNativeFallbackConvergence } from './raw-refuel-native-fallback-convergence.evaluator';
import {
  classifyFallbackAgainstAuthoritativeNativeRefuel,
  hasFallbackTelemetryStretchEvidence,
  isNativeEpisodeBracketedWithinCandidatePhysicalEvidence,
  RFRF_DETECTOR_MAX_NORMAL_SAMPLE_GAP_SECONDS,
} from './raw-refuel-native-fallback-stretched-end.policy';
import { rawRefuelCandidateToRefuelRowForMatcher } from './raw-refuel-native-overlap.advisory';
import { ABSOLUTE_SIGNAL_TRUST_AUTHORITY_AVAILABLE } from './raw-fuel-signal-trust.resolver';
import {
  buildKsMx20240916NativeRow,
  buildKsMx20240916StaleBaselineCandidate,
  buildWob20260919AuthoritativeNativeRow,
  buildWob20260919StretchedEndCandidate,
  buildWob20260927EventBCandidate,
  WOB_2026_09_19_AUTHORITATIVE_NATIVE_EVENT_ID,
  WOB_2026_09_19_STRETCHED_END_CANDIDATE_ID,
  WOB_VEHICLE_ID,
} from './testing/wob-2026-09-19-stretched-end.fixture';

describe('RFRF OQ-015 stretched-end fallback↔native convergence', () => {
  const wobCandidate = buildWob20260919StretchedEndCandidate();
  const wobNative = buildWob20260919AuthoritativeNativeRow();

  describe('A — reproduce canonical defect (strict matcher only)', () => {
    it('canonical matcher => DISTINCT end_time_mismatch before stretched policy', () => {
      const candidateRow = rawRefuelCandidateToRefuelRowForMatcher(wobCandidate);
      const canonical = classifyPhysicalRefuelSibling(candidateRow, wobNative);
      expect(canonical.classification).toBe('DISTINCT_PHYSICAL_REFUEL');
      expect(canonical.reason).toBe('end_time_mismatch');
    });

    it('pre-fix aggregate => DISTINCT_FROM_NATIVE', () => {
      const withoutPolicy = classifyPhysicalRefuelSibling(
        rawRefuelCandidateToRefuelRowForMatcher(wobCandidate),
        wobNative,
      );
      expect(withoutPolicy.classification).toBe('DISTINCT_PHYSICAL_REFUEL');
      const evaluation = evaluateRawRefuelNativeFallbackConvergence({
        candidate: wobCandidate,
        nativeRefuelRows: [wobNative],
      });
      expect(evaluation.classification).toBe('SAME_NATIVE');
      expect(evaluation.shouldConvergeToNative).toBe(true);
      expect(evaluation.authoritativeSameNativeEventId).toBe(
        WOB_2026_09_19_AUTHORITATIVE_NATIVE_EVENT_ID,
      );
    });
  });

  describe('G — 09-19 regression', () => {
    it('09_19 ground truth converges without duplicate fallback VEE intent', () => {
      const result = classifyFallbackAgainstAuthoritativeNativeRefuel(wobCandidate, wobNative);
      expect(result.classification).toBe('SAME_PHYSICAL_REFUEL');
      expect(result.reason).toMatch(/stretched_end_/);
      expect(wobCandidate.maxSampleGapSeconds).toBe(990);
      expect(hasFallbackTelemetryStretchEvidence(wobCandidate)).toBe(true);
      expect(
        isNativeEpisodeBracketedWithinCandidatePhysicalEvidence(wobCandidate, wobNative),
      ).toBe(true);
    });
  });

  describe('H1–H8 — pre-merge stretch safety matrix', () => {
    const nativeSame: RefuelRowForMatcher = {
      id: 'native-h',
      vehicleId: WOB_VEHICLE_ID,
      kind: 'REFUEL',
      startTime: '2026-09-19T16:09:00.000Z',
      endTime: '2026-09-19T16:54:00.000Z',
      fuelStartLiters: 5,
      fuelEndLiters: 18,
      fuelDeltaLiters: 13,
      dimoSegmentId: 'dimo-h',
    };

    it('H1 normal READY post-plateau extension alone does not authorize stretch', () => {
      const healthyReady = buildWob20260919StretchedEndCandidate({
        maxSampleGapSeconds: 45,
        riseEndAt: new Date('2026-09-19T16:15:27.000Z'),
        physicalEvidenceEnd: new Date('2026-09-19T16:58:31.000Z'),
        postPlateauSampleCount: 5,
      });
      expect(healthyReady.maxSampleGapSeconds!).toBeLessThanOrEqual(
        RFRF_DETECTOR_MAX_NORMAL_SAMPLE_GAP_SECONDS,
      );
      expect(
        healthyReady.physicalEvidenceEnd!.getTime() - healthyReady.riseEndAt!.getTime(),
      ).toBeGreaterThan(60_000);
      expect(hasFallbackTelemetryStretchEvidence(healthyReady)).toBe(false);
      const result = classifyFallbackAgainstAuthoritativeNativeRefuel(healthyReady, nativeSame);
      expect(result.classification).toBe('DISTINCT_PHYSICAL_REFUEL');
      expect(result.reason).toBe('end_time_mismatch');
    });

    it('H2 large gap but native end outside physical envelope => DISTINCT', () => {
      const cand = buildWob20260919StretchedEndCandidate({ maxSampleGapSeconds: 990 });
      const nativeOutside = {
        ...nativeSame,
        endTime: '2026-09-19T17:30:00.000Z',
      };
      expect(hasFallbackTelemetryStretchEvidence(cand)).toBe(true);
      expect(isNativeEpisodeBracketedWithinCandidatePhysicalEvidence(cand, nativeOutside)).toBe(
        false,
      );
      const result = classifyFallbackAgainstAuthoritativeNativeRefuel(cand, nativeOutside);
      expect(result.classification).toBe('DISTINCT_PHYSICAL_REFUEL');
      expect(result.reason).toBe('end_time_mismatch');
    });

    it('H3 large gap + bracketed native + compatible fuel => SAME', () => {
      const result = classifyFallbackAgainstAuthoritativeNativeRefuel(wobCandidate, wobNative);
      expect(result.classification).toBe('SAME_PHYSICAL_REFUEL');
    });

    it('H4 large gap + terminal fuel mismatch => DISTINCT', () => {
      const result = classifyFallbackAgainstAuthoritativeNativeRefuel(wobCandidate, {
        ...wobNative,
        fuelEndLiters: 9,
      });
      expect(result.classification).toBe('DISTINCT_PHYSICAL_REFUEL');
      expect(result.reason).toBe('terminal_fuel_liters_mismatch');
    });

    it('H5 large gap + odometer contradiction => DISTINCT', () => {
      const cand = buildWob20260919StretchedEndCandidate({
        evidenceMeta: { odometerEndKm: 120 },
      });
      const result = classifyFallbackAgainstAuthoritativeNativeRefuel(cand, {
        ...wobNative,
        odometerEndKm: 50,
      });
      expect(result.reason).toBe('odometer_mismatch');
    });

    it('H6 two plausible SAME natives => AMBIGUOUS fail closed', () => {
      const evaluation = evaluateRawRefuelNativeFallbackConvergence({
        candidate: wobCandidate,
        nativeRefuelRows: [
          wobNative,
          { ...wobNative, id: 'second-native-same-episode', dimoSegmentId: 'dimo-2' },
        ],
      });
      expect(evaluation.classification).toBe('AMBIGUOUS');
      expect(evaluation.shouldConvergeToNative).toBe(false);
    });

    it('H7 Event B no native siblings => NO_NATIVE_SIBLINGS', () => {
      const evaluation = evaluateRawRefuelNativeFallbackConvergence({
        candidate: buildWob20260927EventBCandidate(),
        nativeRefuelRows: [],
      });
      expect(evaluation.classification).toBe('NO_NATIVE_SIBLINGS');
    });

    it('H8 KS MX stale baseline stays DISTINCT', () => {
      const evaluation = evaluateRawRefuelNativeFallbackConvergence({
        candidate: buildKsMx20240916StaleBaselineCandidate(),
        nativeRefuelRows: [buildKsMx20240916NativeRow()],
      });
      expect(evaluation.classification).toBe('DISTINCT_FROM_NATIVE');
    });
  });

  describe('H — Event B no-native preserved', () => {
    it('Event B => NO_NATIVE_SIBLINGS', () => {
      const evaluation = evaluateRawRefuelNativeFallbackConvergence({
        candidate: buildWob20260927EventBCandidate(),
        nativeRefuelRows: [],
      });
      expect(evaluation.classification).toBe('NO_NATIVE_SIBLINGS');
      expect(evaluation.shouldConvergeToNative).toBe(false);
    });
  });

  describe('J — KS MX stale baseline not falsely converged', () => {
    it('stale pre-fill baseline stays DISTINCT', () => {
      const evaluation = evaluateRawRefuelNativeFallbackConvergence({
        candidate: buildKsMx20240916StaleBaselineCandidate(),
        nativeRefuelRows: [buildKsMx20240916NativeRow()],
      });
      expect(evaluation.classification).toBe('DISTINCT_FROM_NATIVE');
      expect(evaluation.shouldConvergeToNative).toBe(false);
    });
  });

  describe('R — trust not implemented in this slice', () => {
    it('ABSOLUTE_SIGNAL_TRUST_AUTHORITY_AVAILABLE remains false', () => {
      expect(ABSOLUTE_SIGNAL_TRUST_AUTHORITY_AVAILABLE).toBe(false);
    });
  });

  describe('M — adversarial matrix C1–C12', () => {
    const nativeSame: RefuelRowForMatcher = {
      id: 'native-same',
      vehicleId: 'veh-1',
      kind: 'REFUEL',
      startTime: '2026-09-06T09:35:00.000Z',
      endTime: '2026-09-06T09:47:00.000Z',
      fuelStartLiters: 7,
      fuelEndLiters: 31,
      fuelDeltaLiters: 24,
      dimoSegmentId: 'dimo-same',
    };

    function baseCandidate(overrides: Partial<RawRefuelCandidate> = {}): RawRefuelCandidate {
      return {
        ...wobCandidate,
        id: 'test-cand',
        vehicleId: 'veh-1',
        candidateIdentityKey: 'test-key',
        ...overrides,
      } as RawRefuelCandidate;
    }

    it('C1 existing SAME unchanged', () => {
      const cand = baseCandidate({
        riseOnsetAt: new Date('2026-09-06T09:39:30.000Z'),
        riseEndAt: new Date('2026-09-06T09:47:00.000Z'),
        physicalEvidenceEnd: new Date('2026-09-06T09:47:00.000Z'),
        preFuelAbsoluteLiters: 7,
        postFuelAbsoluteLiters: 31,
        deltaAbsoluteLiters: 24,
        maxSampleGapSeconds: 60,
      });
      const result = classifyFallbackAgainstAuthoritativeNativeRefuel(cand, nativeSame);
      expect(result.classification).toBe('SAME_PHYSICAL_REFUEL');
      expect(result.reason).toBe('suffix_compatible_transition');
    });

    it('C2 hard terminal fuel contradiction stays DISTINCT', () => {
      const result = classifyFallbackAgainstAuthoritativeNativeRefuel(
        wobCandidate,
        { ...wobNative, fuelEndLiters: 10 },
      );
      expect(result.classification).toBe('DISTINCT_PHYSICAL_REFUEL');
      expect(result.reason).toBe('terminal_fuel_liters_mismatch');
    });

    it('C5 stretched end + incompatible terminal fuel => DISTINCT', () => {
      expect(
        classifyFallbackAgainstAuthoritativeNativeRefuel(wobCandidate, {
          ...wobNative,
          fuelEndLiters: 12,
        }).reason,
      ).toBe('terminal_fuel_liters_mismatch');
    });

    it('C7 stretched end without gap evidence => fail closed (no override)', () => {
      const cand = buildWob20260919StretchedEndCandidate({
        maxSampleGapSeconds: 30,
        physicalEvidenceEnd: new Date('2026-09-19T16:15:27.000Z'),
      });
      const result = classifyFallbackAgainstAuthoritativeNativeRefuel(cand, wobNative);
      expect(result.classification).toBe('DISTINCT_PHYSICAL_REFUEL');
      expect(result.reason).toBe('end_time_mismatch');
    });

    it('C8 different vehicle => DISTINCT', () => {
      const result = classifyFallbackAgainstAuthoritativeNativeRefuel(wobCandidate, {
        ...wobNative,
        vehicleId: 'other-vehicle',
      });
      expect(result.reason).toBe('different_vehicle');
    });

    it('C9 odometer contradiction => DISTINCT', () => {
      const cand = buildWob20260919StretchedEndCandidate({
        evidenceMeta: { odometerEndKm: 50 },
      });
      const result = classifyFallbackAgainstAuthoritativeNativeRefuel(cand, {
        ...wobNative,
        odometerEndKm: 100,
      });
      expect(result.classification).toBe('DISTINCT_PHYSICAL_REFUEL');
      expect(result.reason).toBe('odometer_mismatch');
    });

    it('N1 far rise onset => DISTINCT (transition incompatible)', () => {
      const cand = buildWob20260919StretchedEndCandidate({
        riseOnsetAt: new Date('2026-09-19T10:00:00.000Z'),
        riseEndAt: new Date('2026-09-19T10:05:00.000Z'),
      });
      const result = classifyFallbackAgainstAuthoritativeNativeRefuel(cand, wobNative);
      expect(result.classification).toBe('DISTINCT_PHYSICAL_REFUEL');
      expect(['transition_incompatible', 'no_window_overlap', 'end_time_mismatch']).toContain(
        result.reason,
      );
    });
  });
});

describe('WOB 09-19 fixture metadata', () => {
  it('exports production-shaped identifiers', () => {
    expect(WOB_2026_09_19_STRETCHED_END_CANDIDATE_ID.startsWith('e4c7f4bc')).toBe(true);
    expect(WOB_2026_09_19_AUTHORITATIVE_NATIVE_EVENT_ID).toBeTruthy();
  });
});
