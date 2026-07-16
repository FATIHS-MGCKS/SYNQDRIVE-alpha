import { MisuseCaseType } from '@prisma/client';
import { evaluateContextAnchors } from './context-misuse-rules';
import type { ContextAnchor } from './misuse-case.types';
import type {
  ContextSignalStats,
  EventContextAssessment,
} from '../event-context/event-context-assessment.types';
import type {
  ContextClassification,
  ContextReasonCode,
  EngineContextSignal,
  EvidenceGrade,
} from '../event-context/event-context.types';
import { HF_REQUESTED_INTERVAL } from '../event-context/event-context-quality';

function minimalContextQuality(
  overrides: Partial<EventContextAssessment['contextQuality']> = {},
): EventContextAssessment['contextQuality'] {
  return {
    requestedInterval: HF_REQUESTED_INTERVAL,
    effectiveMedianCadenceMs: 1000,
    effectiveP95CadenceMs: 2000,
    sampleCount: 12,
    coverageBeforeAnchor: 6,
    coverageAfterAnchor: 6,
    providerDelayMs: 0,
    availableSignals: ['speed', 'rpm'],
    missingSignals: [],
    contextConfidence: 'MEDIUM',
    capabilityVersion: 'cap-probe-v1',
    qualityReasons: ['NATIVE_EVENT_ANCHOR_PRESERVED', 'CONTEXT_SIGNALS_EXPLAIN_ONLY'],
    ...overrides,
  };
}

function signal(
  s: EngineContextSignal,
  overrides: Partial<ContextSignalStats> = {},
): ContextSignalStats {
  return {
    signal: s,
    count: 10,
    nonNullCount: 8,
    firstValue: null,
    lastValue: null,
    min: null,
    max: null,
    avg: null,
    nearestValueToAnchor: null,
    nearestSampleDistanceMs: 0,
    valueBeforeAnchor: null,
    valueAfterAnchor: null,
    medianIntervalMs: 1000,
    p95IntervalMs: 2000,
    maxGapMs: 3000,
    gapsOver2s: 0,
    gapsOver5s: 0,
    gapsOver10s: 0,
    coverageQuality: 'GOOD',
    ...overrides,
  };
}

function mkAssessment(
  overrides: {
    status?: EventContextAssessment['status'];
    engineSignalsApplicable?: boolean;
    evidenceGrade?: EvidenceGrade;
    confidence?: EventContextAssessment['confidence'];
    classifications?: ContextClassification[];
    reasonCodes?: ContextReasonCode[];
    speed?: Partial<ContextSignalStats>;
    rpm?: Partial<ContextSignalStats>;
    throttle?: Partial<ContextSignalStats>;
    engineLoad?: Partial<ContextSignalStats>;
    coolant?: Partial<ContextSignalStats>;
    sampleCount?: number;
    anchorType?: EventContextAssessment['anchorType'];
  } = {},
): EventContextAssessment {
  return {
    version: 2,
    contextModelVersion: '2026-07-16.1',
    status: overrides.status ?? 'SUCCESS',
    anchorType: overrides.anchorType ?? 'DIMO_NATIVE_BEHAVIOR_EVENT',
    anchorEvent: null,
    anchorTimestamp: '2026-06-01T10:10:00.000Z',
    windowStart: '2026-06-01T10:09:30.000Z',
    windowEnd: '2026-06-01T10:11:30.000Z',
    engineSignalsApplicable: overrides.engineSignalsApplicable ?? true,
    engineOnHint: true,
    dataQuality: {
      sampleCount: overrides.sampleCount ?? 12,
      medianIntervalMs: 1000,
      p95IntervalMs: 2000,
      maxGapMs: 3000,
      nearestSampleToAnchorMs: 0,
      coverage: [],
    },
    signalCoverage: [
      { signal: 'speed', nonNullCount: 8, quality: 'GOOD' },
      { signal: 'rpm', nonNullCount: 8, quality: 'GOOD' },
      { signal: 'throttle', nonNullCount: 8, quality: 'GOOD' },
      { signal: 'engineLoad', nonNullCount: 6, quality: 'SPARSE' },
      { signal: 'coolant', nonNullCount: 4, quality: 'SPARSE' },
    ],
    speedContext: signal('speed', overrides.speed),
    rpmContext: signal('rpm', overrides.rpm),
    throttleContext: signal('throttle', overrides.throttle),
    engineLoadContext: signal('engineLoad', overrides.engineLoad),
    coolantContext: signal('coolant', overrides.coolant),
    reasonCodes: overrides.reasonCodes ?? ['NATIVE_EVENT_ANCHOR', 'HIGH_RPM'],
    preliminaryClassifications: overrides.classifications ?? [],
    classifications: overrides.classifications ?? [],
    confidence: overrides.confidence ?? 'MEDIUM',
    evidenceGrade: overrides.evidenceGrade ?? 'B',
    usedSignals: ['speed', 'rpm'],
    missingSignals: [],
    contextQuality: minimalContextQuality(),
    generatedAt: '2026-06-01T10:12:00.000Z',
    error: null,
  };
}

function anchor(
  source: ContextAnchor['source'],
  id: string,
  assessment: EventContextAssessment,
  occurredAt = new Date('2026-06-01T10:10:00Z'),
): ContextAnchor {
  return { source, anchorId: id, occurredAt, assessment };
}

describe('evaluateContextAnchors', () => {
  it('ColdEngineKickdown context => ColdEngineAbuse MisuseCase', () => {
    const a = anchor(
      'DRIVING_EVENT',
      'de-1',
      mkAssessment({
        classifications: ['COLD_ENGINE_KICKDOWN'],
        reasonCodes: ['NATIVE_EVENT_ANCHOR', 'COLD_ENGINE', 'HIGH_RPM', 'HIGH_THROTTLE'],
        coolant: { nearestValueToAnchor: 35, min: 30, max: 40 },
        rpm: { max: 4200 },
        throttle: { max: 95 },
        evidenceGrade: 'A',
      }),
    );
    const cases = evaluateContextAnchors([a]);
    const cold = cases.find((c) => c.type === MisuseCaseType.COLD_ENGINE_ABUSE);
    expect(cold).toBeDefined();
    expect(cold?.severity).toBe('SEVERE');
    const summary = cold?.evidenceSummary?.contextEvidence as Record<string, unknown>;
    expect((summary.sourceAnchors as any).drivingEventIds).toContain('de-1');
    expect((summary.keyValues as any).maxRpm).toBe(4200);
  });

  it('InsufficientContext => kein MisuseCase', () => {
    const a = anchor(
      'DRIVING_EVENT',
      'de-2',
      mkAssessment({
        status: 'INSUFFICIENT_CADENCE',
        classifications: ['INSUFFICIENT_CONTEXT'],
        evidenceGrade: 'D',
      }),
    );
    expect(evaluateContextAnchors([a])).toHaveLength(0);
  });

  it('grade C never creates a hard misuse case', () => {
    const a = anchor(
      'DRIVING_EVENT',
      'de-3',
      mkAssessment({
        classifications: ['COLD_ENGINE_ACCELERATION'],
        reasonCodes: ['COLD_ENGINE', 'HIGH_RPM'],
        coolant: { nearestValueToAnchor: 30, min: 28, max: 35 },
        rpm: { max: 4000 },
        evidenceGrade: 'C',
      }),
    );
    expect(evaluateContextAnchors([a])).toHaveLength(0);
  });

  it('warm engine overtaking likely => kein ColdEngineAbuse', () => {
    const a = anchor(
      'DRIVING_EVENT',
      'de-4',
      mkAssessment({
        classifications: ['OVERTAKING_LIKELY'],
        reasonCodes: ['WARM_ENGINE', 'HIGH_RPM'],
        coolant: { nearestValueToAnchor: 90, min: 88, max: 92 },
        rpm: { max: 4000 },
      }),
    );
    const cases = evaluateContextAnchors([a]);
    expect(cases.find((c) => c.type === MisuseCaseType.COLD_ENGINE_ABUSE)).toBeUndefined();
  });

  it('EV/Tesla context skipped => keine ICE Misuse Cases', () => {
    const a = anchor(
      'DRIVING_EVENT',
      'de-5',
      mkAssessment({
        status: 'UNSUPPORTED',
        engineSignalsApplicable: false,
        classifications: [],
        reasonCodes: ['NOT_APPLICABLE_POWERTRAIN'],
      }),
    );
    expect(evaluateContextAnchors([a])).toHaveLength(0);
  });

  it('LaunchLikeStart from standstill => LaunchAbusePattern', () => {
    const a = anchor(
      'DRIVING_EVENT',
      'de-6',
      mkAssessment({
        classifications: ['LAUNCH_LIKE_START'],
        reasonCodes: ['NATIVE_EVENT_ANCHOR', 'HIGH_RPM', 'HIGH_THROTTLE', 'STANDSTILL_BEFORE_EVENT'],
        speed: { valueBeforeAnchor: 1, valueAfterAnchor: 45 },
        rpm: { max: 5200 },
        throttle: { max: 99 },
        evidenceGrade: 'A',
      }),
    );
    const cases = evaluateContextAnchors([a]);
    expect(cases.find((c) => c.type === MisuseCaseType.LAUNCH_ABUSE_PATTERN)).toBeDefined();
  });

  it('OverheatingRisk with high coolant => OverheatingDamageRisk', () => {
    const a = anchor(
      'DRIVING_EVENT',
      'de-7',
      mkAssessment({
        classifications: ['OVERHEATING_RISK'],
        reasonCodes: ['HIGH_ENGINE_LOAD', 'HIGH_RPM'],
        coolant: { nearestValueToAnchor: 118, min: 100, max: 120 },
        rpm: { max: 4500 },
        engineLoad: { max: 95 },
      }),
    );
    const cases = evaluateContextAnchors([a]);
    const oh = cases.find((c) => c.type === MisuseCaseType.OVERHEATING_DAMAGE_RISK);
    expect(oh).toBeDefined();
    expect(oh?.category).toBe('TECHNICAL_RISK');
  });

  it('mild cold context (59 °C, 1151 rpm, 15 % throttle) => kein ColdEngineAbuse', () => {
    const a = anchor(
      'DRIVING_EVENT',
      'de-mild',
      mkAssessment({
        classifications: ['COLD_ENGINE_ACCELERATION'],
        reasonCodes: ['NATIVE_EVENT_ANCHOR', 'COLD_ENGINE'],
        coolant: { nearestValueToAnchor: 59, min: 55, max: 60 },
        rpm: { nearestValueToAnchor: 1151, max: 1151 },
        throttle: { nearestValueToAnchor: 15, max: 15 },
        engineLoad: { nearestValueToAnchor: 20, max: 25 },
        confidence: 'HIGH',
        evidenceGrade: 'A',
      }),
    );
    expect(evaluateContextAnchors([a]).find((c) => c.type === MisuseCaseType.COLD_ENGINE_ABUSE)).toBeUndefined();
  });

  it('cold coolant 45 °C + rpm 4200 => ColdEngineAbuse', () => {
    const a = anchor(
      'DRIVING_EVENT',
      'de-rpm',
      mkAssessment({
        classifications: ['COLD_ENGINE_HIGH_RPM'],
        reasonCodes: ['NATIVE_EVENT_ANCHOR', 'COLD_ENGINE', 'HIGH_RPM'],
        coolant: { nearestValueToAnchor: 45, min: 42, max: 48 },
        rpm: { nearestValueToAnchor: 4200, max: 4200 },
        throttle: { nearestValueToAnchor: 30, max: 35 },
        confidence: 'MEDIUM',
        evidenceGrade: 'B',
      }),
    );
    const cold = evaluateContextAnchors([a]).find((c) => c.type === MisuseCaseType.COLD_ENGINE_ABUSE);
    expect(cold).toBeDefined();
    expect(cold?.severity).toBe('SEVERE');
  });

  it('cold coolant 45 °C + throttle 90 % => ColdEngineAbuse', () => {
    const a = anchor(
      'DRIVING_EVENT',
      'de-throttle',
      mkAssessment({
        classifications: ['COLD_ENGINE_KICKDOWN'],
        reasonCodes: ['NATIVE_EVENT_ANCHOR', 'COLD_ENGINE', 'HIGH_THROTTLE'],
        coolant: { nearestValueToAnchor: 45, min: 42, max: 48 },
        rpm: { nearestValueToAnchor: 2000, max: 2200 },
        throttle: { nearestValueToAnchor: 90, max: 95 },
        confidence: 'MEDIUM',
        evidenceGrade: 'B',
      }),
    );
    expect(
      evaluateContextAnchors([a]).find((c) => c.type === MisuseCaseType.COLD_ENGINE_ABUSE),
    ).toBeDefined();
  });

  it('cold coolant 45 °C + engineLoad 85 % => ColdEngineAbuse', () => {
    const a = anchor(
      'DRIVING_EVENT',
      'de-load',
      mkAssessment({
        classifications: ['COLD_ENGINE_ACCELERATION'],
        reasonCodes: ['NATIVE_EVENT_ANCHOR', 'COLD_ENGINE', 'HIGH_ENGINE_LOAD'],
        coolant: { nearestValueToAnchor: 45, min: 42, max: 48 },
        rpm: { nearestValueToAnchor: 1800, max: 2000 },
        engineLoad: { nearestValueToAnchor: 85, max: 88 },
        confidence: 'MEDIUM',
        evidenceGrade: 'B',
      }),
    );
    expect(
      evaluateContextAnchors([a]).find((c) => c.type === MisuseCaseType.COLD_ENGINE_ABUSE),
    ).toBeDefined();
  });

  it('repeated cold high-load events => severe ColdEngineAbuse', () => {
    const mk = (id: string) =>
      anchor(
        'DRIVING_EVENT',
        id,
        mkAssessment({
          classifications: ['COLD_ENGINE_ACCELERATION'],
          reasonCodes: ['NATIVE_EVENT_ANCHOR', 'COLD_ENGINE', 'HIGH_RPM'],
          coolant: { nearestValueToAnchor: 48, min: 45, max: 52 },
          rpm: { nearestValueToAnchor: 2800, max: 3000 },
          throttle: { nearestValueToAnchor: 55, max: 60 },
          confidence: 'MEDIUM',
          evidenceGrade: 'B',
        }),
        new Date(`2026-06-01T10:${id === 'a' ? '10' : '20'}:00Z`),
      );
    const cold = evaluateContextAnchors([mk('a'), mk('b')]).find(
      (c) => c.type === MisuseCaseType.COLD_ENGINE_ABUSE,
    );
    expect(cold?.severity).toBe('SEVERE');
    expect(cold?.confidence).toBe('HIGH');
  });

  it('single cold high-load with only LOW confidence => kein ColdEngineAbuse', () => {
    const a = anchor(
      'DRIVING_EVENT',
      'de-low-conf',
      mkAssessment({
        classifications: ['COLD_ENGINE_ACCELERATION'],
        reasonCodes: ['NATIVE_EVENT_ANCHOR', 'COLD_ENGINE', 'HIGH_RPM'],
        coolant: { nearestValueToAnchor: 45, min: 42, max: 48 },
        rpm: { nearestValueToAnchor: 4200, max: 4200 },
        confidence: 'LOW',
        evidenceGrade: 'B',
      }),
    );
    expect(evaluateContextAnchors([a]).find((c) => c.type === MisuseCaseType.COLD_ENGINE_ABUSE)).toBeUndefined();
  });
});
