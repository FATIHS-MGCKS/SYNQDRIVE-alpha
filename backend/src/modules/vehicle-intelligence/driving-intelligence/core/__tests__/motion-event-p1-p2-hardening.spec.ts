import {
  applyMotionEventUniversalPlausibility,
  assessMotionEventUniversalPlausibility,
  detectMotionManoeuvreEvents,
  MOTION_CORE_EVENT_GUARDS_V0_1_DEV,
  MOTION_EVENT_HF_THRESHOLDS_V1,
  MOTION_EVENT_V0_2_CANDIDATE_OPTIONS,
  MOTION_EVENT_V0_3_CANDIDATE_OPTIONS,
  type MotionCoreSpeedSample,
  type MotionManoeuvreEvent,
} from '../index';

function sample(label: string, valueKmh: number, quality: MotionCoreSpeedSample['quality'] = 'OK'): MotionCoreSpeedSample {
  return {
    label,
    valueKmh,
    quality,
    estimator: 'TEST',
    supportLabels: [],
    supportSpanS: null,
    flags: [],
  };
}

function baseEvent(overrides: Partial<MotionManoeuvreEvent>): MotionManoeuvreEvent {
  return {
    trip: 0,
    kind: 'ACCELERATION',
    startLabel: 'a',
    endLabel: 'b',
    startUncertaintyS: '',
    endUncertaintyS: '',
    startSpeedKmh: 50,
    endSpeedKmh: 80,
    deltaKmh: 30,
    meanAccelMps2: 2.5,
    peakAccel1sMps2: 2.8,
    peakAccel2sMps2: 2.6,
    durationS: 3.33,
    steps: 3,
    coverageRatio: 0.9,
    quality: 'OK',
    source: 'TEST',
    algorithmVersion: 'TEST',
    flags: [],
    ...overrides,
  };
}

describe('motion event P1 spike bracket (V0.3)', () => {
  it('marks dip→spike→baseline acceleration when start sample is the dip (TES16 03:50:20 pattern)', () => {
    const s: MotionCoreSpeedSample[] = [
      sample('2026-10-16T03:50:18Z', 129.8),
      sample('2026-10-16T03:50:19Z', 129.4),
      sample('2026-10-16T03:50:20Z', 113.1, 'SPARSE_SUPPORT'),
      sample('2026-10-16T03:50:22Z', 128.2, 'JITTER_SUSPECT'),
      sample('2026-10-16T03:50:23Z', 148.3, 'JITTER_SUSPECT'),
      sample('2026-10-16T03:50:24Z', 126.5),
    ];
    const v2 = detectMotionManoeuvreEvents(0, s, 'TEST', MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities, MOTION_EVENT_V0_2_CANDIDATE_OPTIONS);
    const v3 = detectMotionManoeuvreEvents(0, s, 'TEST', MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities, MOTION_EVENT_V0_3_CANDIDATE_OPTIONS);
    const target = (evs: MotionManoeuvreEvent[]) =>
      evs.find((e) => e.startLabel === '2026-10-16T03:50:20Z' && e.endLabel === '2026-10-16T03:50:23Z');
    expect(target(v2)?.quality).toBe('DEGRADED');
    expect(target(v3)?.quality).toBe('ARTEFACT_SUSPECT');
    expect(target(v3)?.flags.some((f) => f.startsWith('SPIKE_BRACKET_PRE='))).toBe(true);
  });

  it('does not change events when spikeBracketCheck is off (V0.2 parity)', () => {
    const s: MotionCoreSpeedSample[] = [
      sample('2026-10-16T03:50:18Z', 129.8),
      sample('2026-10-16T03:50:19Z', 129.4),
      sample('2026-10-16T03:50:20Z', 113.1, 'SPARSE_SUPPORT'),
      sample('2026-10-16T03:50:22Z', 128.2, 'JITTER_SUSPECT'),
      sample('2026-10-16T03:50:23Z', 148.3, 'JITTER_SUSPECT'),
      sample('2026-10-16T03:50:24Z', 126.5),
    ];
    const base = detectMotionManoeuvreEvents(0, s, 'TEST', MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities, MOTION_EVENT_V0_2_CANDIDATE_OPTIONS);
    const again = detectMotionManoeuvreEvents(0, s, 'TEST', MOTION_CORE_EVENT_GUARDS_V0_1_DEV.usableQualities, {
      spikeReversionCheck: true,
      spikeBracketCheck: false,
    });
    expect(again.map((e) => ({ start: e.startLabel, q: e.quality }))).toEqual(
      base.map((e) => ({ start: e.startLabel, q: e.quality })),
    );
  });
});

describe('motion event P2 universal plausibility (vehicle-independent)', () => {
  const fleetContexts = [
    { label: 'Audi A4 (unknown class)' },
    { label: 'VW Arteon' },
    { label: 'unlisted OEM' },
    { label: 'strong BEV' },
    { label: 'ordinary ICE' },
  ];

  it('does not flag kinematically consistent high acceleration for any fleet context', () => {
    const ev = baseEvent({
      startSpeedKmh: 52.3,
      endSpeedKmh: 142.1,
      deltaKmh: 89.8,
      meanAccelMps2: 8.313,
      peakAccel1sMps2: 10.849,
      durationS: 3,
      quality: 'DEGRADED',
      flags: ['MIN_SUPPORT_3_POINTS'],
    });
    for (const ctx of fleetContexts) {
      const copy = { ...ev, flags: [...ev.flags] };
      applyMotionEventUniversalPlausibility([copy]);
      expect(copy.quality).toBe('DEGRADED');
      expect(assessMotionEventUniversalPlausibility(copy)).toBeNull();
    }
  });

  it('flags internal mean vs Δv/t contradiction (same for all contexts)', () => {
    const ev = baseEvent({
      deltaKmh: 30,
      meanAccelMps2: 9,
      durationS: 3,
      quality: 'LIMITED',
    });
    for (const _ctx of fleetContexts) {
      const copy = { ...ev };
      applyMotionEventUniversalPlausibility([copy]);
      expect(copy.quality).toBe('ARTEFACT_SUSPECT');
      expect(copy.flags.some((f) => f.includes('kinematic_mean_mismatch'))).toBe(true);
    }
  });

  it('flags non-positive delta magnitude (detector contract)', () => {
    const ev = baseEvent({ kind: 'ACCELERATION', deltaKmh: -5 });
    applyMotionEventUniversalPlausibility([ev]);
    expect(ev.quality).toBe('ARTEFACT_SUSPECT');
    expect(ev.flags.some((f) => f.includes('kind_delta_sign_mismatch'))).toBe(true);
  });

  it('skips already ARTEFACT_SUSPECT (P1 precedence)', () => {
    const ev = baseEvent({
      quality: 'ARTEFACT_SUSPECT',
      meanAccelMps2: 99,
      flags: ['SPIKE_BRACKET_PRE=1'],
    });
    applyMotionEventUniversalPlausibility([ev]);
    expect(ev.flags.filter((f) => f.startsWith('MOTION_PLAUSIBILITY_VIOLATION='))).toHaveLength(0);
  });

  it('does not flag TIG22-like consistent implausible intensity (documented non-effect of universal P2)', () => {
    const ev = baseEvent({
      startSpeedKmh: 5.5,
      endSpeedKmh: 100.1,
      deltaKmh: 94.6,
      meanAccelMps2: 6.567,
      peakAccel1sMps2: 6.738,
      durationS: 4,
      steps: 2,
      quality: 'LIMITED',
      flags: ['L3_SUPPORT_MISSING_FALLBACK_ROBUST', 'MIN_SUPPORT_3_POINTS'],
    });
    applyMotionEventUniversalPlausibility([ev]);
    expect(ev.quality).toBe('LIMITED');
  });
});

describe('motion event detector thresholds unchanged', () => {
  it('keeps HF entry threshold at 1.5 m/s²', () => {
    expect(MOTION_EVENT_HF_THRESHOLDS_V1.entryMps2).toBe(1.5);
  });
});
