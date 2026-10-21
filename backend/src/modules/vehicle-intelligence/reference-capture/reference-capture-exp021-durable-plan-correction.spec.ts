/**
 * EXP-021 durable plan authority + slot/settlement geometry + scientific-status correction.
 */
import {
  applyPendingCalibrationPhaseAtBoundary,
  buildInitialPhaseCounters,
  emptyPhaseCounters,
  finalizePhaseSummary,
  reanchorPhysicalCalibrationPhaseAtT0,
  recomputePhaseSummaryDerivedFields,
  resolveExp021CalibrationPlanForSeries,
  switchHfCalibrationPhase,
} from './reference-capture-hf-calibration-phase.policy';
import {
  classifyPhaseScientificStatus,
  EXP021_CANDIDATE_BRACKET_V3,
  Exp021CalibrationPlanAuthorityConflictError,
  Exp021CalibrationPlanAuthorityInvalidError,
  EXP021_LOWER_BOUND_V1,
  EXP021_UPPER_BOUND_V2,
  findPhaseSpecByCadence,
  resolveExp021CalibrationPlanFromAuthority,
  resolveExp021CalibrationPlanFromSources,
  resolveNominalPhaseDurationMs,
} from './reference-capture-exp021-calibration-plan.lib';
import { countIntendedSlotsForCadence } from './reference-capture-exp021-request-slots.lib';
import { parseHfRecoveryPolicyV2ConfigFromEnv } from './reference-capture-hf-recovery-v2.policy';
import {
  buildFullPhaseOverlappingSettlementProbesForPhase,
  computeExp021SettlementQueryBudget,
  countFullPhaseOverlappingTilesForNominalPhase,
} from './reference-capture-settlement-shadow.policy';

describe('EXP-021 durable plan authority correction', () => {
  const t0Ms = Date.parse('2026-09-12T04:36:36.000Z');
  const HF_POLICY = parseHfRecoveryPolicyV2ConfigFromEnv({
    HF_RECOVERY_POLICY_V2_ENABLED: 'true',
    HF_HISTORICAL_POLL_INTERVAL_MS: '120000',
    HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
  });

  const v3Plan = EXP021_CANDIDATE_BRACKET_V3;

  function buildEffectiveConfig(phaseId: string, cadenceMs: number, sequence: number) {
    return {
      calibrationSeriesId: 'series-v3',
      calibrationPhaseId: phaseId,
      phaseSequence: sequence,
      vehicleId: 'vehicle',
      tokenId: 187361,
      effectivePollIntervalMs: cadenceMs,
      settlementDelayMs: 8000,
      recoveryOverlapMs: 6000,
      policyVersion: 'HF_RECOVERY_V2_2026-09-04',
      policyMode: 'V2' as const,
      effectiveAt: new Date(t0Ms).toISOString(),
    };
  }

  describe('false DEGRADED_LOW_MOVEMENT regression (120s KS MS 661 case)', () => {
    const wallDurationMs = 612_400;
    const validMovementDurationMs = 454_698;
    const providerSuccessCount = 5;
    const phaseSpec = findPhaseSpecByCadence(v3Plan, 120_000)!;
    const minMovementMs = Math.min(wallDurationMs * 0.25, phaseSpec.targetDurationMs * 0.25);

    it('stage A: seals with null scientificStatus when movement authority is unknown', () => {
      const counters = {
        ...emptyPhaseCounters('phase-120'),
        nativeFastLoopRequestCount: 5,
        nativeFastLoopProviderSuccessCount: providerSuccessCount,
      };
      const summary = finalizePhaseSummary({
        phase: {
          calibrationPhaseId: 'phase-120',
          phaseSequence: 1,
          effectivePollIntervalMs: 120_000,
          phaseStartedAt: new Date(t0Ms).toISOString(),
          phaseEndedAt: new Date(t0Ms + wallDurationMs).toISOString(),
          phaseProvenance: 'PHYSICAL_T0',
          canonicalT0At: new Date(t0Ms).toISOString(),
          effectiveConfig: buildEffectiveConfig('phase-120', 120_000, 1),
        },
        counters,
        phaseEndedAtMs: t0Ms + wallDurationMs,
        calibrationPlan: v3Plan,
      });
      expect(minMovementMs).toBe(150_000);
      expect(validMovementDurationMs).toBeGreaterThan(minMovementMs);
      expect(summary.validMovementDurationMs).toBeNull();
      expect(summary.scientificStatus).toBeNull();
      expect(summary.scientificStatus).not.toBe('DEGRADED_LOW_MOVEMENT');
    });

    it('stage B: late movement patch recomputes VALID with durable V3 plan', () => {
      const counters = {
        ...emptyPhaseCounters('phase-120'),
        nativeFastLoopRequestCount: 5,
        nativeFastLoopProviderSuccessCount: providerSuccessCount,
      };
      const initial = finalizePhaseSummary({
        phase: {
          calibrationPhaseId: 'phase-120',
          phaseSequence: 1,
          effectivePollIntervalMs: 120_000,
          phaseStartedAt: new Date(t0Ms).toISOString(),
          phaseEndedAt: new Date(t0Ms + wallDurationMs).toISOString(),
          phaseProvenance: 'PHYSICAL_T0',
          canonicalT0At: new Date(t0Ms).toISOString(),
          effectiveConfig: buildEffectiveConfig('phase-120', 120_000, 1),
        },
        counters,
        phaseEndedAtMs: t0Ms + wallDurationMs,
        calibrationPlan: v3Plan,
      });
      const patched = recomputePhaseSummaryDerivedFields({
        summary: initial,
        validMovementDurationMs,
        calibrationPlan: v3Plan,
      });
      expect(patched.validMovementDurationMs).toBe(validMovementDurationMs);
      expect(patched.scientificStatus).toBe('VALID');
      expect(patched.calibrationPlanVersion).toBe('EXP021_CANDIDATE_BRACKET_V3');
      expect(
        classifyPhaseScientificStatus({
          plan: v3Plan,
          phaseSpec,
          providerSuccessCount,
          validMovementDurationMs,
          wallDurationMs,
        }),
      ).toBe('VALID');
    });

    it('stage C post-transition: recompute uses summary evidence, not active 90s counters', () => {
      const counters120 = {
        ...emptyPhaseCounters('phase-120'),
        nativeFastLoopRequestCount: 5,
        nativeFastLoopProviderSuccessCount: providerSuccessCount,
      };
      const initial = finalizePhaseSummary({
        phase: {
          calibrationPhaseId: 'phase-120',
          phaseSequence: 1,
          effectivePollIntervalMs: 120_000,
          phaseStartedAt: new Date(t0Ms).toISOString(),
          phaseEndedAt: new Date(t0Ms + wallDurationMs).toISOString(),
          phaseProvenance: 'PHYSICAL_T0',
          canonicalT0At: new Date(t0Ms).toISOString(),
          effectiveConfig: buildEffectiveConfig('phase-120', 120_000, 1),
        },
        counters: counters120,
        phaseEndedAtMs: t0Ms + wallDurationMs,
        calibrationPlan: v3Plan,
      });
      expect(initial.providerRequestCount).toBe(5);
      expect(initial.providerSuccessCount).toBe(5);

      const patched = recomputePhaseSummaryDerivedFields({
        summary: initial,
        validMovementDurationMs,
        calibrationPlan: v3Plan,
      });
      expect(patched.providerRequestCount).toBe(5);
      expect(patched.providerSuccessCount).toBe(5);
      expect(patched.scientificStatus).toBe('VALID');
      expect(patched.scientificStatus).not.toBe('DEGRADED_INSUFFICIENT_REQUESTS');
    });

    it('late movement patch preserves non-movement summary evidence', () => {
      const counters = {
        ...emptyPhaseCounters('phase-120'),
        nativeFastLoopRequestCount: 5,
        nativeFastLoopProviderSuccessCount: 5,
        nativeFastLoopProviderZeroResultCount: 1,
        nativeFastLoopProviderErrorCount: 0,
        nativeFastLoopProviderBucketCount: 57,
      };
      const initial = finalizePhaseSummary({
        phase: {
          calibrationPhaseId: 'phase-120',
          phaseSequence: 1,
          effectivePollIntervalMs: 120_000,
          phaseStartedAt: new Date(t0Ms).toISOString(),
          phaseEndedAt: new Date(t0Ms + wallDurationMs).toISOString(),
          phaseProvenance: 'PHYSICAL_T0',
          canonicalT0At: new Date(t0Ms).toISOString(),
          effectiveConfig: buildEffectiveConfig('phase-120', 120_000, 1),
        },
        counters,
        phaseEndedAtMs: t0Ms + wallDurationMs,
        calibrationPlan: v3Plan,
      });
      const patched = recomputePhaseSummaryDerivedFields({
        summary: initial,
        validMovementDurationMs,
        calibrationPlan: v3Plan,
      });
      expect(patched.providerRequestCount).toBe(initial.providerRequestCount);
      expect(patched.providerSuccessCount).toBe(initial.providerSuccessCount);
      expect(patched.providerZeroResultCount).toBe(initial.providerZeroResultCount);
      expect(patched.providerErrorCount).toBe(initial.providerErrorCount);
      expect(patched.providerBucketCount).toBe(initial.providerBucketCount);
      expect(patched.exp021RequestSlots).toEqual(initial.exp021RequestSlots);
      expect(patched.nativeTemporalEvidence).toEqual(initial.nativeTemporalEvidence);
    });
  });

  describe('full V3 slot and settlement geometry', () => {
    it('initializes 5/7/10 request slots from durable V3 plan', () => {
      const slotCounts = v3Plan.phases.map((phase) => {
        const counters = buildInitialPhaseCounters({
          calibrationPhaseId: `phase-${phase.cadenceMs}`,
          phaseEffectiveStartMs: t0Ms,
          cadenceMs: phase.cadenceMs,
          phaseProvenance: 'PHYSICAL_T0',
          calibrationPlan: v3Plan,
        });
        return counters.exp021RequestSlots?.length ?? 0;
      });
      expect(slotCounts).toEqual([5, 7, 10]);
      expect(slotCounts.reduce((a, b) => a + b, 0)).toBe(22);
    });

    it('does not use UPPER_BOUND_V2 5-minute geometry for 90s/60s V3 phases', () => {
      for (const cadenceMs of [90_000, 60_000]) {
        const v3Duration = resolveNominalPhaseDurationMs(cadenceMs, v3Plan);
        const wrongDuration = resolveNominalPhaseDurationMs(cadenceMs, EXP021_UPPER_BOUND_V2);
        expect(v3Duration).toBe(10 * 60_000);
        expect(wrongDuration).toBe(5 * 60_000);
        expect(countIntendedSlotsForCadence(cadenceMs, v3Plan)).toBeGreaterThan(
          countIntendedSlotsForCadence(cadenceMs, EXP021_UPPER_BOUND_V2),
        );
      }
    });

    it('schedules 19/19/19 settlement windows (342 observations)', () => {
      let phaseStartMs = t0Ms;
      const windowCounts: number[] = [];
      for (const phase of v3Plan.phases) {
        const durationMs = resolveNominalPhaseDurationMs(phase.cadenceMs, v3Plan);
        const probes = buildFullPhaseOverlappingSettlementProbesForPhase({
          phasePollIntervalMs: phase.cadenceMs,
          phaseStartedAtMs: phaseStartMs,
          phaseEndMs: phaseStartMs + durationMs,
        });
        windowCounts.push(probes.length);
        expect(
          countFullPhaseOverlappingTilesForNominalPhase({ nominalPhaseDurationMs: durationMs }),
        ).toBe(19);
        phaseStartMs += durationMs;
      }
      expect(windowCounts).toEqual([19, 19, 19]);
      const budget = computeExp021SettlementQueryBudget(v3Plan);
      expect(budget.fullPhaseTileCount).toBe(57);
      expect(budget.expectedSettlementQueryCount).toBe(342);
    });

    it('simulates 120→90→60 phase transitions with consistent V3 plan versions', () => {
      const reanchored = reanchorPhysicalCalibrationPhaseAtT0({
        existing: null,
        vehicleId: 'vehicle',
        tokenId: 187361,
        canonicalT0Ms: t0Ms,
        effectivePollIntervalMs: 120_000,
        hfPolicy: HF_POLICY,
        nowMs: t0Ms,
        calibrationPlan: v3Plan,
      });
      expect(reanchored.series.calibrationPlanId).toBe('candidate_bracket_v3');
      expect(reanchored.series.calibrationPlanVersion).toBe('EXP021_CANDIDATE_BRACKET_V3');

      let series = reanchored.series;
      let counters: ReturnType<typeof buildInitialPhaseCounters> = buildInitialPhaseCounters({
        calibrationPhaseId: reanchored.activePhase.calibrationPhaseId,
        phaseEffectiveStartMs: t0Ms,
        cadenceMs: 120_000,
        phaseProvenance: 'PHYSICAL_T0',
        calibrationPlan: v3Plan,
      });
      const summaries: string[] = [];

      for (let i = 1; i < v3Plan.phases.length; i++) {
        const nextCadence = v3Plan.phases[i].cadenceMs;
        const boundaryMs = t0Ms + i * 10 * 60_000;
        const applied = applyPendingCalibrationPhaseAtBoundary({
          series: {
            ...series,
            pendingPhaseRequest: {
              requestId: `req-${nextCadence}`,
              requestedAt: new Date(boundaryMs).toISOString(),
              effectivePollIntervalMs: nextCadence,
              phaseProvenance: 'PHYSICAL_TRANSITION',
            },
          },
          pending: {
            requestId: `req-${nextCadence}`,
            requestedAt: new Date(boundaryMs).toISOString(),
            effectivePollIntervalMs: nextCadence,
            phaseProvenance: 'PHYSICAL_TRANSITION',
          },
          counters,
          hfPolicy: HF_POLICY,
          effectiveAtMs: boundaryMs,
        });
        expect(applied.applied).toBe(true);
        series = applied.series!;
        counters = applied.activePhaseCounters ?? counters;
        const lastSummary = series.completedPhaseSummaries.at(-1);
        if (lastSummary?.calibrationPlanVersion) {
          summaries.push(lastSummary.calibrationPlanVersion);
        }
      }
      expect(summaries.every((v) => v === 'EXP021_CANDIDATE_BRACKET_V3')).toBe(true);
      expect(
        counters?.exp021RequestSlots?.length ??
          buildInitialPhaseCounters({
            calibrationPhaseId: 'x',
            phaseEffectiveStartMs: t0Ms + 20 * 60_000,
            cadenceMs: 60_000,
            phaseProvenance: 'PHYSICAL_TRANSITION',
            calibrationPlan: v3Plan,
          }).exp021RequestSlots?.length,
      ).toBe(10);
    });
  });

  describe('restart recovery without V3 env', () => {
    it('recovers candidate_bracket_v3 from durable series authority', () => {
      const series = reanchorPhysicalCalibrationPhaseAtT0({
        existing: null,
        vehicleId: 'vehicle',
        tokenId: 187361,
        canonicalT0Ms: t0Ms,
        effectivePollIntervalMs: 120_000,
        hfPolicy: HF_POLICY,
        nowMs: t0Ms,
        calibrationPlan: v3Plan,
      }).series;

      const recovered = resolveExp021CalibrationPlanForSeries(series, {
        EXP021_CALIBRATION_PLAN: 'UPPER_BOUND_V2',
      });
      expect(recovered.planId).toBe('candidate_bracket_v3');
      expect(recovered.planVersion).toBe('EXP021_CANDIDATE_BRACKET_V3');

      const slot90 = buildInitialPhaseCounters({
        calibrationPhaseId: 'phase-90',
        phaseEffectiveStartMs: t0Ms + 10 * 60_000,
        cadenceMs: 90_000,
        phaseProvenance: 'PHYSICAL_TRANSITION',
        calibrationPlan: recovered,
      });
      expect(slot90.exp021RequestSlots?.length).toBe(7);
      expect(
        resolveNominalPhaseDurationMs(60_000, recovered),
      ).toBe(10 * 60_000);
    });

    it('recovers from experiment metadata when series plan fields are absent', () => {
      const recovered = resolveExp021CalibrationPlanFromAuthority({
        calibrationPlanId: 'candidate_bracket_v3',
        calibrationPlanVersion: 'EXP021_CANDIDATE_BRACKET_V3',
        env: { EXP021_CALIBRATION_PLAN: 'UPPER_BOUND_V2' },
      });
      expect(recovered).toBe(v3Plan);
    });
  });

  describe('fail-closed durable plan authority', () => {
    it('resolves matching planId and planVersion to V3', () => {
      expect(
        resolveExp021CalibrationPlanFromAuthority({
          calibrationPlanId: 'candidate_bracket_v3',
          calibrationPlanVersion: 'EXP021_CANDIDATE_BRACKET_V3',
        }),
      ).toBe(EXP021_CANDIDATE_BRACKET_V3);
    });

    it('throws on conflicting planId and planVersion', () => {
      expect(() =>
        resolveExp021CalibrationPlanFromAuthority({
          calibrationPlanId: 'candidate_bracket_v3',
          calibrationPlanVersion: 'EXP021_UPPER_BOUND_V2',
        }),
      ).toThrow(Exp021CalibrationPlanAuthorityConflictError);
    });

    it('throws on unknown planId with env present', () => {
      expect(() =>
        resolveExp021CalibrationPlanFromAuthority({
          calibrationPlanId: 'unknown_plan',
          calibrationPlanVersion: null,
          env: { EXP021_CALIBRATION_PLAN: 'UPPER_BOUND_V2' },
        }),
      ).toThrow(Exp021CalibrationPlanAuthorityInvalidError);
    });

    it('throws on unknown planVersion with env present', () => {
      expect(() =>
        resolveExp021CalibrationPlanFromAuthority({
          calibrationPlanId: null,
          calibrationPlanVersion: 'UNKNOWN_VERSION',
          env: { EXP021_CALIBRATION_PLAN: 'UPPER_BOUND_V2' },
        }),
      ).toThrow(Exp021CalibrationPlanAuthorityInvalidError);
    });

    it('allows env fallback only when both authority fields are absent', () => {
      expect(
        resolveExp021CalibrationPlanFromAuthority({
          calibrationPlanId: null,
          calibrationPlanVersion: null,
          env: { EXP021_CALIBRATION_PLAN: 'UPPER_BOUND_V2' },
        }),
      ).toBe(EXP021_UPPER_BOUND_V2);
    });

    it('VALID_ID_UNKNOWN_VERSION_FAILS_CLOSED: asymmetric corruption throws invalid', () => {
      expect(() =>
        resolveExp021CalibrationPlanFromAuthority({
          calibrationPlanId: 'candidate_bracket_v3',
          calibrationPlanVersion: 'UNKNOWN_VERSION',
        }),
      ).toThrow(Exp021CalibrationPlanAuthorityInvalidError);
    });

    it('UNKNOWN_ID_VALID_VERSION_FAILS_CLOSED: asymmetric corruption throws invalid', () => {
      expect(() =>
        resolveExp021CalibrationPlanFromAuthority({
          calibrationPlanId: 'unknown_plan',
          calibrationPlanVersion: 'EXP021_CANDIDATE_BRACKET_V3',
        }),
      ).toThrow(Exp021CalibrationPlanAuthorityInvalidError);
    });

    it('UNKNOWN_ID_UNKNOWN_VERSION_FAILS_CLOSED: both fields unrecognized throws invalid', () => {
      expect(() =>
        resolveExp021CalibrationPlanFromAuthority({
          calibrationPlanId: 'unknown_plan',
          calibrationPlanVersion: 'UNKNOWN_VERSION',
        }),
      ).toThrow(Exp021CalibrationPlanAuthorityInvalidError);
    });

    it('MATCHING_ID_VERSION_RESOLVES: both fields present and consistent', () => {
      expect(
        resolveExp021CalibrationPlanFromAuthority({
          calibrationPlanId: 'candidate_bracket_v3',
          calibrationPlanVersion: 'EXP021_CANDIDATE_BRACKET_V3',
        }),
      ).toBe(EXP021_CANDIDATE_BRACKET_V3);
    });
  });

  describe('settlement plan authority precedence', () => {
    it('SERIES_AUTHORITY_ABSENT_METADATA_V3_ENV_WRONG: metadata V3 wins over env', () => {
      expect(
        resolveExp021CalibrationPlanFromSources({
          seriesPlanId: null,
          seriesPlanVersion: null,
          metadataPlanId: 'candidate_bracket_v3',
          metadataPlanVersion: 'EXP021_CANDIDATE_BRACKET_V3',
          env: { EXP021_CALIBRATION_PLAN: 'UPPER_BOUND_V2' },
        }),
      ).toBe(EXP021_CANDIDATE_BRACKET_V3);
    });

    it('SERIES_AUTHORITY_ABSENT_METADATA_INVALID: corrupt metadata fails closed', () => {
      expect(() =>
        resolveExp021CalibrationPlanFromSources({
          seriesPlanId: null,
          seriesPlanVersion: null,
          metadataPlanId: 'unknown_plan',
          metadataPlanVersion: null,
          env: { EXP021_CALIBRATION_PLAN: 'UPPER_BOUND_V2' },
        }),
      ).toThrow(Exp021CalibrationPlanAuthorityInvalidError);
    });

    it('series authority takes precedence over metadata when both present', () => {
      expect(
        resolveExp021CalibrationPlanFromSources({
          seriesPlanId: 'candidate_bracket_v3',
          seriesPlanVersion: 'EXP021_CANDIDATE_BRACKET_V3',
          metadataPlanId: 'upper_bound_v2',
          metadataPlanVersion: 'EXP021_UPPER_BOUND_V2',
          env: { EXP021_CALIBRATION_PLAN: 'LOWER_BOUND_V1' },
        }),
      ).toBe(EXP021_CANDIDATE_BRACKET_V3);
    });

    it('env fallback only when series and metadata authority are both absent', () => {
      expect(
        resolveExp021CalibrationPlanFromSources({
          seriesPlanId: null,
          seriesPlanVersion: null,
          metadataPlanId: null,
          metadataPlanVersion: null,
          env: { EXP021_CALIBRATION_PLAN: 'UPPER_BOUND_V2' },
        }),
      ).toBe(EXP021_UPPER_BOUND_V2);
    });
  });

  describe('historical plan regression', () => {
    it('UPPER_BOUND_V2 slot geometry unchanged', () => {
      expect(countIntendedSlotsForCadence(180_000, EXP021_UPPER_BOUND_V2)).toBe(5);
      expect(countIntendedSlotsForCadence(120_000, EXP021_UPPER_BOUND_V2)).toBe(5);
      expect(countIntendedSlotsForCadence(60_000, EXP021_UPPER_BOUND_V2)).toBe(5);
      expect(resolveNominalPhaseDurationMs(180_000, EXP021_UPPER_BOUND_V2)).toBe(15 * 60_000);
      expect(resolveNominalPhaseDurationMs(60_000, EXP021_UPPER_BOUND_V2)).toBe(5 * 60_000);
    });

    it('LOWER_BOUND_V1 slot geometry unchanged', () => {
      const expectedSlots: Record<number, number> = {
        60_000: 5,
        30_000: 10,
        20_000: 15,
        10_000: 30,
      };
      for (const [cadenceMs, slotCount] of Object.entries(expectedSlots)) {
        const cadence = Number(cadenceMs);
        expect(countIntendedSlotsForCadence(cadence, EXP021_LOWER_BOUND_V1)).toBe(slotCount);
        expect(resolveNominalPhaseDurationMs(cadence, EXP021_LOWER_BOUND_V1)).toBe(300_000);
      }
    });

    it('default env remains UPPER_BOUND_V2 for new experiments without durable authority', () => {
      const plan = resolveExp021CalibrationPlanFromAuthority({
        calibrationPlanId: null,
        calibrationPlanVersion: null,
        env: {},
      });
      expect(plan).toBe(EXP021_UPPER_BOUND_V2);
    });
  });
});
