import {
  applyMotionEventPhysicsEnvelope,
  detectMotionManoeuvreEvents,
  MOTION_CORE_EVENT_GUARDS_V0_1_DEV,
  MOTION_EVENT_HF_THRESHOLDS_V1,
  MOTION_EVENT_V0_2_CANDIDATE_OPTIONS,
  MOTION_EVENT_V0_3_CANDIDATE_OPTIONS,
  motionEventPhysicsEnvelopeForEvent,
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

describe('motion event P2 physics envelope', () => {
  it('uses Tiguan launch limit for low-speed impossible mean acceleration', () => {
    const ev: MotionManoeuvreEvent = {
      trip: 0,
      kind: 'ACCELERATION',
      startLabel: 'a',
      endLabel: 'b',
      startUncertaintyS: '',
      endUncertaintyS: '',
      startSpeedKmh: 5.5,
      endSpeedKmh: 100.1,
      deltaKmh: 94.6,
      meanAccelMps2: 6.567,
      peakAccel1sMps2: 6.7,
      peakAccel2sMps2: 6.5,
      durationS: 4,
      steps: 2,
      coverageRatio: 0.6,
      quality: 'LIMITED',
      source: 'TEST',
      algorithmVersion: 'TEST',
      flags: [],
    };
    const env = motionEventPhysicsEnvelopeForEvent(ev, 'TIGUAN');
    expect(env.boundMps2).toBe(4.5);
    expect(env.basis).toBe('launch_limit');
    applyMotionEventPhysicsEnvelope([ev], 'TIGUAN');
    expect(ev.quality).toBe('ARTEFACT_SUSPECT');
    expect(ev.flags.some((f) => f.startsWith('PHYSICS_ENVELOPE_VIOLATION='))).toBe(true);
  });

  it('does not mark Tesla-class envelope for TES16-like mean at highway speed', () => {
    const ev: MotionManoeuvreEvent = {
      trip: 0,
      kind: 'ACCELERATION',
      startLabel: 'a',
      endLabel: 'b',
      startUncertaintyS: '',
      endUncertaintyS: '',
      startSpeedKmh: 113.1,
      endSpeedKmh: 148.3,
      deltaKmh: 35.2,
      meanAccelMps2: 3.258,
      peakAccel1sMps2: 5.5,
      peakAccel2sMps2: 3.2,
      durationS: 3,
      steps: 2,
      coverageRatio: 0.67,
      quality: 'DEGRADED',
      source: 'TEST',
      algorithmVersion: 'TEST',
      flags: [],
    };
    applyMotionEventPhysicsEnvelope([ev], 'TESLA');
    expect(ev.quality).toBe('DEGRADED');
  });

  it('skips events shorter than 2 s', () => {
    const ev: MotionManoeuvreEvent = {
      trip: 0,
      kind: 'ACCELERATION',
      startLabel: 'a',
      endLabel: 'b',
      startUncertaintyS: '',
      endUncertaintyS: '',
      startSpeedKmh: 5.5,
      endSpeedKmh: 100.1,
      deltaKmh: 94.6,
      meanAccelMps2: 20,
      peakAccel1sMps2: 20,
      peakAccel2sMps2: null,
      durationS: 1,
      steps: 1,
      coverageRatio: 1,
      quality: 'OK',
      source: 'TEST',
      algorithmVersion: 'TEST',
      flags: [],
    };
    applyMotionEventPhysicsEnvelope([ev], 'TIGUAN');
    expect(ev.quality).toBe('OK');
  });
});

describe('motion event detector thresholds unchanged', () => {
  it('keeps HF entry threshold at 1.5 m/s²', () => {
    expect(MOTION_EVENT_HF_THRESHOLDS_V1.entryMps2).toBe(1.5);
  });
});
