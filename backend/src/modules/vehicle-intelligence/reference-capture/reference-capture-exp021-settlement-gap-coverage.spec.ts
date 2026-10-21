import { EXP021_UPPER_BOUND_V2 } from './reference-capture-exp021-calibration-plan.lib';
import {
  extractNativeTemporalGaps,
  findSettlementProbeCoveringInterval,
  type SettlementProbeRef,
} from './reference-capture-exp021-gap-settlement-analyzer';
import {
  buildFullPhaseOverlappingSettlementProbesForPhase,
  computeUpperBoundV2SettlementQueryBudget,
  EXP021_LEGACY_FIXED_INTERVAL_QUERY_COUNT,
} from './reference-capture-settlement-shadow.policy';

type SyntheticGapScenario = {
  label: string;
  phaseCadenceMs: number;
  phaseDurationMs: number;
  gapStartOffsetMs: number;
  gapDurationMs: number;
};

function buildProbesForPhase(cadenceMs: number, durationMs: number, phaseStartMs: number) {
  const plans = buildFullPhaseOverlappingSettlementProbesForPhase({
    phasePollIntervalMs: cadenceMs,
    phaseStartedAtMs: phaseStartMs,
    phaseEndMs: phaseStartMs + durationMs,
  });
  return plans.map((probe) => ({
    probeId: probe.probeId,
    phaseLabel: probe.phaseLabel,
    sourceIntervalStartIso: new Date(probe.sourceIntervalStartMs).toISOString(),
    sourceIntervalEndIso: new Date(probe.sourceIntervalEndMs).toISOString(),
  }));
}

function assessGapWithProbes(args: {
  phaseStartMs: number;
  gapStartOffsetMs: number;
  gapDurationMs: number;
  probes: SettlementProbeRef[];
}): boolean {
  const gapStartMs = args.phaseStartMs + args.gapStartOffsetMs;
  const gapEndMs = gapStartMs + args.gapDurationMs;
  const gapStartIso = new Date(gapStartMs).toISOString();
  const gapEndIso = new Date(gapEndMs).toISOString();
  const nativeStarts = [gapStartIso, gapEndIso];
  const gaps = extractNativeTemporalGaps({
    phaseLabel: 'test',
    nativeTemporalBucketStarts: nativeStarts,
    minGapMs: 10_000,
  });
  if (gaps.length !== 1) return false;
  const gap = gaps[0];
  const probe = findSettlementProbeCoveringInterval(
    args.probes,
    Date.parse(gap.gapStartIso),
    Date.parse(gap.gapEndIso),
  );
  return probe != null;
}

describe('EXP-021 full-phase overlapping settlement gap coverage', () => {
  const phaseStartMs = Date.parse('2026-09-11T04:37:26.000Z');

  const scenarios: SyntheticGapScenario[] = [];
  for (const phase of EXP021_UPPER_BOUND_V2.phases) {
    const positions = [
      { label: 'phase_start', offset: 5_000, duration: 12_000 },
      { label: 'first_30s', offset: 30_000, duration: 15_000 },
      { label: 'around_120s', offset: 120_000, duration: 20_000 },
      { label: 'middle', offset: Math.floor(phase.targetDurationMs * 0.5), duration: 25_000 },
      { label: 'tile_boundary', offset: 60_000, duration: 35_000 },
      { label: 'cross_two_tiles', offset: 45_000, duration: 40_000 },
      { label: 'last_60s', offset: phase.targetDurationMs - 70_000, duration: 15_000 },
      {
        label: 'before_phase_end',
        offset: phase.targetDurationMs - 25_000,
        duration: 12_000,
      },
    ];
    for (const pos of positions) {
      if (pos.offset + pos.duration < phase.targetDurationMs && pos.offset >= 0) {
        scenarios.push({
          label: `${phase.cadenceMs / 1000}s:${pos.label}`,
          phaseCadenceMs: phase.cadenceMs,
          phaseDurationMs: phase.targetDurationMs,
          gapStartOffsetMs: pos.offset,
          gapDurationMs: pos.duration,
        });
      }
    }
  }

  let assessable = 0;
  for (const scenario of scenarios) {
    const probes = buildProbesForPhase(
      scenario.phaseCadenceMs,
      scenario.phaseDurationMs,
      phaseStartMs,
    );
    const covered = assessGapWithProbes({
      phaseStartMs,
      gapStartOffsetMs: scenario.gapStartOffsetMs,
      gapDurationMs: scenario.gapDurationMs,
      probes,
    });
    if (covered) assessable += 1;
  }

  const total = scenarios.length;
  const pct = total > 0 ? (assessable / total) * 100 : 0;

  it('documents legacy stabilized geometry was only 75.76% nominal minute coverage', () => {
    const budget = computeUpperBoundV2SettlementQueryBudget(EXP021_UPPER_BOUND_V2);
    expect(budget.legacyStabilizedTileCount).toBe(25);
    expect(budget.nominalPhaseMinutes).toBe(33);
    expect(budget.legacyStabilizedCoverageMinutes).toBeCloseTo(25, 1);
    expect((budget.legacyStabilizedCoverageMinutes / budget.nominalPhaseMinutes) * 100).toBeCloseTo(
      75.76,
      1,
    );
    expect(EXP021_LEGACY_FIXED_INTERVAL_QUERY_COUNT).toBe(48);
  });

  it('uses full-phase overlapping tiles with honest query budget', () => {
    const budget = computeUpperBoundV2SettlementQueryBudget(EXP021_UPPER_BOUND_V2);
    expect(budget.fullPhaseTileCount).toBe(62);
    expect(budget.expectedSettlementQueryCount).toBe(372);
    expect(budget.maxSettlementQueryCount).toBe(372);
  });

  it('achieves >=90% synthetic native gap assessability', () => {
    expect(total).toBeGreaterThan(0);
    expect(pct).toBeGreaterThanOrEqual(90);
    expect(assessable).toBeGreaterThanOrEqual(Math.ceil(total * 0.9));
  });

  it('assesses cross-tile boundary gaps', () => {
    const probes = buildProbesForPhase(180_000, 15 * 60_000, phaseStartMs);
    const crossTile = assessGapWithProbes({
      phaseStartMs,
      gapStartOffsetMs: 45_000,
      gapDurationMs: 40_000,
      probes,
    });
    expect(crossTile).toBe(true);
  });
});
