import {
  MisuseCaseCategory,
  MisuseCaseConfidence,
  MisuseCaseSeverity,
  MisuseCaseType,
  MisuseEvidenceSourceType,
} from '@prisma/client';
import type { CaseCandidate } from '../misuse-cases/misuse-case.types';
import {
  buildEvidenceCase,
  enrichCaseWithEvidence,
  maxEvidenceLevelFromCases,
  resolveEvidenceLevel,
  resolveEvidenceLevelForAbuseEventType,
  tripAssessmentStatusFromEvidenceLevel,
} from './trip-evidence-case.builder';

function candidate(
  partial: Partial<CaseCandidate> & Pick<CaseCandidate, 'type' | 'category'>,
): CaseCandidate {
  return {
    severity: MisuseCaseSeverity.WARNING,
    confidence: MisuseCaseConfidence.MEDIUM,
    title: 'Test case',
    description: 'Test description',
    evidence: [],
    eventCount: 1,
    firstDetectedAt: new Date('2026-06-01T10:00:00Z'),
    lastDetectedAt: new Date('2026-06-01T10:05:00Z'),
    ...partial,
  };
}

describe('trip-evidence-case.builder', () => {
  it('two strong accelerations without further evidence => CHECK_RECOMMENDED max', () => {
    const c = candidate({
      type: MisuseCaseType.AGGRESSIVE_DRIVING_PATTERN,
      category: MisuseCaseCategory.USAGE_ANOMALY,
      title: 'Auffälliges Beschleunigungsmuster',
      description: 'Prüfung empfohlen — kein automatisierter Vorwurf.',
      eventCount: 2,
      evidence: [
        {
          sourceType: MisuseEvidenceSourceType.DRIVING_EVENT,
          sourceId: 'd1',
          eventType: 'HARSH_ACCELERATION',
          occurredAt: new Date('2026-06-01T10:01:00Z'),
        },
        {
          sourceType: MisuseEvidenceSourceType.DRIVING_EVENT,
          sourceId: 'd2',
          eventType: 'HARSH_ACCELERATION',
          occurredAt: new Date('2026-06-01T10:02:00Z'),
        },
      ],
    });

    const evidenceCase = buildEvidenceCase(c);
    expect(evidenceCase.evidenceLevel).toBe('CHECK_RECOMMENDED');
    expect(evidenceCase.chargeable).toBe(false);
    expect(evidenceCase.requiresHumanReview).toBe(true);
    expect(evidenceCase.title).toBe('Auffälliges Fahrmuster');
  });

  it('kickdown + high rpm + high load + good coverage => MISUSE_SUSPECTED or CHECK_RECOMMENDED, no damage', () => {
    const c = candidate({
      type: MisuseCaseType.AGGRESSIVE_DRIVING_PATTERN,
      category: MisuseCaseCategory.MISUSE_SUSPICION,
      confidence: MisuseCaseConfidence.HIGH,
      eventCount: 3,
      evidenceSummary: {
        contextEvidence: {
          evidenceGrade: 'A',
          confidence: 'HIGH',
          usedSignals: ['rpm', 'throttle', 'engineLoad', 'coolant'],
          reasonCodes: ['KICKDOWN_LIKELY', 'HIGH_RPM', 'HIGH_ENGINE_LOAD'],
          keyValues: { maxRpm: 4351, maxThrottle: 85, maxEngineLoad: 96, coolantAtEvent: 88 },
          dataQuality: { sampleCount: 12, medianIntervalMs: 1000, p95IntervalMs: 2000 },
        },
      },
      evidence: [
        {
          sourceType: MisuseEvidenceSourceType.EVENT_CONTEXT_ASSESSMENT,
          sourceId: 'a1',
          eventType: 'KICKDOWN_LIKELY',
          occurredAt: new Date('2026-06-01T10:10:00Z'),
        },
      ],
    });

    const level = resolveEvidenceLevel(c);
    expect(['CHECK_RECOMMENDED', 'MISUSE_SUSPECTED']).toContain(level);
    expect(level).not.toBe('DAMAGE_RISK');
    expect(level).not.toBe('CRITICAL_DAMAGE_RISK');

    const evidenceCase = buildEvidenceCase(c);
    expect(evidenceCase.measurements.rpm).toBe(4351);
    expect(evidenceCase.measurements.throttle).toBe(85);
    expect(evidenceCase.measurements.engineLoad).toBe(96);
    expect(evidenceCase.measurements.coolant).toBe(88);
    expect(evidenceCase.chargeable).toBe(false);
  });

  it('possible impact => DAMAGE_RISK or CRITICAL_DAMAGE_RISK', () => {
    const damage = buildEvidenceCase(
      candidate({
        type: MisuseCaseType.POSSIBLE_COLLISION_OR_IMPACT,
        category: MisuseCaseCategory.DAMAGE_SUSPICION,
        severity: MisuseCaseSeverity.SEVERE,
        evidence: [
          {
            sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
            sourceId: 'p1',
            eventType: 'POSSIBLE_IMPACT',
            occurredAt: new Date('2026-06-01T10:20:00Z'),
            snapshotJson: { peakDecelMs2: 12.5 },
          },
        ],
      }),
    );
    expect(['DAMAGE_RISK', 'CRITICAL_DAMAGE_RISK']).toContain(damage.evidenceLevel);

    const critical = buildEvidenceCase(
      candidate({
        type: MisuseCaseType.POSSIBLE_COLLISION_OR_IMPACT,
        category: MisuseCaseCategory.DAMAGE_SUSPICION,
        severity: MisuseCaseSeverity.CRITICAL,
        evidence: [
          {
            sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
            sourceId: 'p2',
            eventType: 'POSSIBLE_IMPACT',
            occurredAt: new Date('2026-06-01T10:21:00Z'),
            snapshotJson: { peakDecelMs2: 15.2 },
          },
        ],
      }),
    );
    expect(critical.evidenceLevel).toBe('CRITICAL_DAMAGE_RISK');
    expect(tripAssessmentStatusFromEvidenceLevel(critical.evidenceLevel)).toBe('KRITISCH');
  });

  it('overheating engine => DAMAGE_RISK', () => {
    const evidenceCase = buildEvidenceCase(
      candidate({
        type: MisuseCaseType.OVERHEATING_DAMAGE_RISK,
        category: MisuseCaseCategory.TECHNICAL_RISK,
        severity: MisuseCaseSeverity.SEVERE,
        confidence: MisuseCaseConfidence.HIGH,
        evidence: [
          {
            sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
            sourceId: 'o1',
            eventType: 'OVERHEATING_ENGINE',
            occurredAt: new Date('2026-06-01T10:30:00Z'),
          },
        ],
      }),
    );
    expect(evidenceCase.evidenceLevel).toBe('DAMAGE_RISK');
    expect(evidenceCase.title).toBe('Schadenverdacht');
  });

  it('long idle => INFO or CHECK_RECOMMENDED, never damage suspicion', () => {
    const shortIdle = resolveEvidenceLevelForAbuseEventType('LONG_IDLE', {
      durationMs: 200_000,
    });
    expect(shortIdle).toBe('INFO');

    const longIdle = resolveEvidenceLevelForAbuseEventType('LONG_IDLE', {
      durationMs: 700_000,
    });
    expect(longIdle).toBe('CHECK_RECOMMENDED');
    expect(longIdle).not.toBe('DAMAGE_RISK');
  });

  it('sparse HF data => LOW/MEDIUM confidence and no hard escalation', () => {
    const c = candidate({
      type: MisuseCaseType.AGGRESSIVE_DRIVING_PATTERN,
      category: MisuseCaseCategory.MISUSE_SUSPICION,
      confidence: MisuseCaseConfidence.HIGH,
      eventCount: 4,
      evidenceSummary: {
        contextEvidence: {
          evidenceGrade: 'C',
          confidence: 'LOW',
          usedSignals: ['rpm'],
          missingSignals: ['throttle', 'engineLoad'],
          dataQuality: { sampleCount: 3, p95IntervalMs: 18_000 },
        },
      },
      evidence: [
        {
          sourceType: MisuseEvidenceSourceType.EVENT_CONTEXT_ASSESSMENT,
          sourceId: 'sparse-1',
          eventType: 'KICKDOWN_LIKELY',
          occurredAt: new Date('2026-06-01T10:10:00Z'),
        },
      ],
    });

    const evidenceCase = buildEvidenceCase(c);
    expect(evidenceCase.evidenceLevel).toBe('CHECK_RECOMMENDED');
    expect(['LOW', 'MEDIUM']).toContain(evidenceCase.confidence);
    expect(evidenceCase.explanation).toMatch(/Prüfung empfohlen/i);
    expect(evidenceCase.chargeable).toBe(false);
  });

  it('enrichCaseWithEvidence stores evidenceCase on candidate summary', () => {
    const enriched = enrichCaseWithEvidence(
      candidate({
        type: MisuseCaseType.BRAKE_ABUSE_PATTERN,
        category: MisuseCaseCategory.MISUSE_SUSPICION,
        eventCount: 3,
        severity: MisuseCaseSeverity.SEVERE,
      }),
    );
    const summary = enriched.evidenceSummary as Record<string, unknown>;
    expect(summary.evidenceCase).toBeDefined();
    expect((summary.evidenceCase as { chargeable: boolean }).chargeable).toBe(false);
  });

  it('maxEvidenceLevelFromCases picks highest tier', () => {
    expect(
      maxEvidenceLevelFromCases(['CHECK_RECOMMENDED', 'DAMAGE_RISK', 'INFO']),
    ).toBe('DAMAGE_RISK');
  });
});
