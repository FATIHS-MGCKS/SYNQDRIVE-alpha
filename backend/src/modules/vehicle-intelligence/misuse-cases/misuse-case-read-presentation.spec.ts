import {
  MisuseAttributionScope,
  MisuseCaseCategory,
  MisuseCaseConfidence,
  MisuseCaseSeverity,
  MisuseCaseStatus,
  MisuseCaseType,
  MisuseEvidenceSourceType,
} from '@prisma/client';
import { presentMisuseCaseForRead } from './misuse-case-read-presentation';

const T0 = new Date('2026-09-01T10:00:00.000Z');

function persistedSevereR1OnlyCase() {
  return {
    id: 'case-1',
    organizationId: 'org-1',
    vehicleId: 'vehicle-r1',
    tripId: 'trip-1',
    type: MisuseCaseType.BRAKE_ABUSE_PATTERN,
    category: MisuseCaseCategory.MISUSE_SUSPICION,
    severity: MisuseCaseSeverity.SEVERE,
    confidence: MisuseCaseConfidence.HIGH,
    status: MisuseCaseStatus.REVIEW_REQUIRED,
    attributionScope: MisuseAttributionScope.BOOKING_CUSTOMER,
    attributionConfidence: 'HIGH',
    modelVersion: 'test-v1',
    evidenceSummary: {
      evidenceCase: { evidenceLevel: 'DAMAGE_RISK', title: 't', explanation: 'e' },
    },
    evidence: [
      {
        id: 'ev-1',
        misuseCaseId: 'case-1',
        organizationId: 'org-1',
        vehicleId: 'vehicle-r1',
        tripId: 'trip-1',
        sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
        sourceId: 'b1',
        eventType: 'FULL_BRAKING',
        occurredAt: T0,
        snapshotJson: { classification: 'SEVERE' },
        bookingId: null,
        customerId: null,
        createdAt: T0,
      },
      {
        id: 'ev-2',
        misuseCaseId: 'case-1',
        organizationId: 'org-1',
        vehicleId: 'vehicle-r1',
        tripId: 'trip-1',
        sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
        sourceId: 'b2',
        eventType: 'FULL_BRAKING',
        occurredAt: new Date(T0.getTime() + 60_000),
        snapshotJson: { classification: 'SEVERE' },
        bookingId: null,
        customerId: null,
        createdAt: T0,
      },
    ],
  } as any;
}

describe('misuse-case-read-presentation (EXP-021 C0.3B)', () => {
  it('caps an existing persisted SEVERE R1-only case at read time without mutating stored fields in the row object', () => {
    const row = persistedSevereR1OnlyCase();
    const storedSeverity = row.severity;
    const storedConfidence = row.confidence;

    const presentation = presentMisuseCaseForRead({
      row,
      telemetrySourceFamily: 'RUPTELA_R1',
    });

    expect(row.severity).toBe(storedSeverity);
    expect(row.confidence).toBe(storedConfidence);
    expect(presentation.severity).toBe(MisuseCaseSeverity.WARNING);
    expect(presentation.confidence).not.toBe(MisuseCaseConfidence.HIGH);
    expect(presentation.status).toBe(MisuseCaseStatus.REVIEW_REQUIRED);
    expect(presentation.temporalPresentationContainment).toMatchObject({
      storedSeverity: MisuseCaseSeverity.SEVERE,
      presentedSeverity: MisuseCaseSeverity.WARNING,
      temporallyUncertainOnly: true,
    });
  });

  it('is idempotent on repeated read presentation', () => {
    const row = persistedSevereR1OnlyCase();
    const first = presentMisuseCaseForRead({ row, telemetrySourceFamily: 'RUPTELA_R1' });
    const second = presentMisuseCaseForRead({ row, telemetrySourceFamily: 'RUPTELA_R1' });
    expect(second).toEqual(first);
  });

  it('leaves Tesla (API synthetic) persisted SEVERE presentation unchanged', () => {
    const row = persistedSevereR1OnlyCase();
    const presentation = presentMisuseCaseForRead({
      row,
      telemetrySourceFamily: 'API_SYNTHETIC',
    });
    expect(presentation.severity).toBe(MisuseCaseSeverity.SEVERE);
    expect(presentation.temporalPresentationContainment).toBeNull();
  });

  it('keeps independent native braking evidence supporting SEVERE on R1', () => {
    const row = persistedSevereR1OnlyCase();
    row.evidence.push({
      id: 'ev-3',
      misuseCaseId: 'case-1',
      organizationId: 'org-1',
      vehicleId: 'vehicle-r1',
      tripId: 'trip-1',
      sourceType: MisuseEvidenceSourceType.DRIVING_EVENT,
      sourceId: 'd1',
      eventType: 'EXTREME_BRAKING',
      occurredAt: new Date(T0.getTime() + 120_000),
      snapshotJson: { severity: 3 },
      bookingId: null,
      customerId: null,
      createdAt: T0,
    });
    for (let i = 0; i < 3; i++) {
      row.evidence.push({
        ...row.evidence[2],
        id: `ev-${4 + i}`,
        sourceId: `d${2 + i}`,
      });
    }
    const presentation = presentMisuseCaseForRead({
      row,
      telemetrySourceFamily: 'RUPTELA_R1',
    });
    expect(presentation.severity).toBe(MisuseCaseSeverity.SEVERE);
  });
});
