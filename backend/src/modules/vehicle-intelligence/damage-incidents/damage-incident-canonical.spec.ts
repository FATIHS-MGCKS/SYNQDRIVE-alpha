import {
  MisuseAttributionScope,
  MisuseCaseCategory,
  MisuseCaseConfidence,
  MisuseCaseType,
  TripAssignmentStatus,
} from '@prisma/client';
import type { DrivingEvent, TripBehaviorEvent } from '@prisma/client';
import {
  buildCanonicalDamageIncidents,
  buildDamageInspectionRecommendation,
  canonicalIncidentsToCaseCandidates,
  collectPossibleImpactProxyEvidence,
  collectProviderCollisionEvidence,
  DAMAGE_EVIDENCE_KIND,
  evaluateCanonicalDamageIncidents,
  isCustomerAttributionEligible,
  resolveDamageIncidentPrivacy,
} from './damage-incident-canonical';
import type { AttributionFields } from '../misuse-cases/misuse-case.types';
import type { TripEvaluationContext } from '../misuse-cases/misuse-case.types';

const TRIP_ID = 'trip-1';
const T0 = new Date('2026-06-01T10:20:00.000Z');

function attribution(overrides: Partial<AttributionFields> = {}): AttributionFields {
  return {
    attributionScope: MisuseAttributionScope.BOOKING_CUSTOMER,
    bookingId: 'book-1',
    customerId: 'cust-1',
    assignmentStatusSnapshot: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
    assignmentSubjectTypeSnapshot: null,
    assignmentSubjectIdSnapshot: 'cust-1',
    assignedBookingIdSnapshot: 'book-1',
    isPrivateTripSnapshot: false,
    ...overrides,
  };
}

function drivingCollision(id: string, at: Date): DrivingEvent {
  return {
    id,
    eventType: 'SAFETY_COLLISION',
    recordedAt: at,
    latitude: 48.1,
    longitude: 11.5,
    metadataJson: { dimoEventName: 'safety.collision', classification: 'EXTREME' },
    provider: 'DIMO',
    providerFingerprint: `fp-${id}`,
  } as unknown as DrivingEvent;
}

function impactProxy(id: string, at: Date): TripBehaviorEvent {
  return {
    id,
    eventCategory: 'ABUSE',
    eventType: 'POSSIBLE_IMPACT',
    classification: 'CRITICAL',
    startedAt: at,
    metadataJson: { peakDecelMs2: 13 },
  } as unknown as TripBehaviorEvent;
}

describe('collectProviderCollisionEvidence', () => {
  it('prefers persisted SAFETY_COLLISION over duplicate DIMO fetch', () => {
    const at = T0;
    const persisted = [drivingCollision('de-1', at)];
    const dimoFetch = [
      {
        timestamp: at.toISOString(),
        name: 'safety.collision',
        source: '0xabc',
        durationNs: 0,
        metadata: null,
      },
    ];
    const result = collectProviderCollisionEvidence(persisted, dimoFetch);
    expect(result).toHaveLength(1);
    expect(result[0].sourceId).toBe('de-1');
    expect(result[0].kind).toBe(DAMAGE_EVIDENCE_KIND.PROVIDER_COLLISION);
  });

  it('falls back to DIMO safety fetch when no persisted collision row exists', () => {
    const result = collectProviderCollisionEvidence(
      [],
      [
        {
          timestamp: T0.toISOString(),
          name: 'safety.collision',
          source: '0xabc',
          durationNs: 0,
          metadata: null,
        },
      ],
    );
    expect(result).toHaveLength(1);
    expect(result[0].snapshotJson.ingestPath).toBe('DIMO_SAFETY_FETCH');
  });
});

describe('collectPossibleImpactProxyEvidence', () => {
  it('tags HF POSSIBLE_IMPACT as proxy evidence only', () => {
    const result = collectPossibleImpactProxyEvidence([impactProxy('p1', T0)]);
    expect(result[0].kind).toBe(DAMAGE_EVIDENCE_KIND.POSSIBLE_IMPACT_PROXY);
    expect(result[0].snapshotJson.evidenceKind).toBe(DAMAGE_EVIDENCE_KIND.POSSIBLE_IMPACT_PROXY);
  });
});

describe('buildCanonicalDamageIncidents', () => {
  it('merges provider collision and proxy in the same window (semantic dedupe)', () => {
    const provider = collectProviderCollisionEvidence([drivingCollision('de-1', T0)], []);
    const proxy = collectPossibleImpactProxyEvidence([
      impactProxy('p1', new Date(T0.getTime() + 5_000)),
    ]);
    const incidents = buildCanonicalDamageIncidents(TRIP_ID, provider, proxy, attribution());

    expect(incidents).toHaveLength(1);
    expect(incidents[0].primaryKind).toBe(DAMAGE_EVIDENCE_KIND.PROVIDER_COLLISION);
    expect(incidents[0].corroborated).toBe(true);
    expect(incidents[0].possibleImpactProxy).not.toBeNull();
    expect(incidents[0].inspectionRecommendation.damageConfirmed).toBe(false);
    expect(incidents[0].inspectionRecommendation.code).toBe('SCHADENS_INSPEKTION');
  });

  it('keeps proxy-only incident when no provider collision exists', () => {
    const proxy = collectPossibleImpactProxyEvidence([impactProxy('p1', T0)]);
    const incidents = buildCanonicalDamageIncidents(TRIP_ID, [], proxy, attribution());

    expect(incidents).toHaveLength(1);
    expect(incidents[0].primaryKind).toBe(DAMAGE_EVIDENCE_KIND.POSSIBLE_IMPACT_PROXY);
    expect(incidents[0].inspectionRecommendation.code).toBe('FAHRZEUGPRUEFUNG');
  });
});

describe('canonicalIncidentsToCaseCandidates', () => {
  it('emits one DIMO_COLLISION_REPORTED case for corroborated evidence (no duplicate impact case)', () => {
    const provider = collectProviderCollisionEvidence([drivingCollision('de-1', T0)], []);
    const proxy = collectPossibleImpactProxyEvidence([impactProxy('p1', T0)]);
    const incidents = buildCanonicalDamageIncidents(TRIP_ID, provider, proxy, attribution());
    const cases = canonicalIncidentsToCaseCandidates(incidents);

    expect(cases).toHaveLength(1);
    expect(cases[0].type).toBe(MisuseCaseType.DIMO_COLLISION_REPORTED);
    expect(cases[0].category).toBe(MisuseCaseCategory.DAMAGE_SUSPICION);
    expect(cases[0].confidence).toBe(MisuseCaseConfidence.HIGH);
    expect(cases[0].evidence).toHaveLength(2);
    expect(cases[0].description).toContain('Kein bestätigter Schaden');
  });

  it('emits POSSIBLE_COLLISION_OR_IMPACT for proxy-only path', () => {
    const proxy = collectPossibleImpactProxyEvidence([impactProxy('p1', T0)]);
    const incidents = buildCanonicalDamageIncidents(TRIP_ID, [], proxy, attribution());
    const cases = canonicalIncidentsToCaseCandidates(incidents);

    expect(cases).toHaveLength(1);
    expect(cases[0].type).toBe(MisuseCaseType.POSSIBLE_COLLISION_OR_IMPACT);
    expect(cases[0].description).toContain('Proxy');
  });
});

describe('privacy and customer attribution gates', () => {
  it('redacts time and location for private trips', () => {
    const privacy = resolveDamageIncidentPrivacy(
      attribution({
        attributionScope: MisuseAttributionScope.PRIVATE_UNASSIGNED,
        isPrivateTripSnapshot: true,
      }),
      MisuseCaseConfidence.HIGH,
      true,
    );
    expect(privacy.showExactTime).toBe(false);
    expect(privacy.showLocation).toBe(false);
  });

  it('does not enable customer attribution for proxy-only at MEDIUM confidence', () => {
    const eligible = isCustomerAttributionEligible(
      attribution(),
      MisuseCaseConfidence.MEDIUM,
      DAMAGE_EVIDENCE_KIND.POSSIBLE_IMPACT_PROXY,
    );
    expect(eligible).toBe(false);
  });

  it('enables customer attribution for provider collision with booking assignment', () => {
    const rec = buildDamageInspectionRecommendation({
      primaryKind: DAMAGE_EVIDENCE_KIND.PROVIDER_COLLISION,
      corroborated: false,
      confidence: MisuseCaseConfidence.MEDIUM,
      attribution: attribution(),
    });
    expect(rec.customerAttributionEligible).toBe(true);
    expect(rec.damageConfirmed).toBe(false);
  });
});

describe('evaluateCanonicalDamageIncidents', () => {
  it('integrates collision, proxy, and combined evidence end-to-end', () => {
    const context: TripEvaluationContext = {
      trip: {
        id: TRIP_ID,
        vehicleId: 'veh-1',
        organizationId: 'org-1',
        startTime: new Date('2026-06-01T09:00:00Z'),
        endTime: new Date('2026-06-01T11:00:00Z'),
        assignmentStatus: TripAssignmentStatus.ASSIGNED_BOOKING_CUSTOMER,
        assignmentSubjectType: null,
        assignmentSubjectId: 'cust-1',
        assignedBookingId: 'book-1',
        isPrivateTrip: false,
        kickdownCount: 0,
        possibleImpactCount: 1,
        coldEngineAbuseCount: 0,
        hardAccelerationCount: 0,
        hardBrakingCount: 0,
        fullBrakingCount: 0,
        abuseEvents: 1,
      },
      behaviorEvents: [impactProxy('p1', T0)],
      drivingEvents: [drivingCollision('de-1', T0)],
      dimoSafetyEvents: [],
      dtcEvents: [],
    };

    const cases = evaluateCanonicalDamageIncidents(context, attribution());
    expect(cases).toHaveLength(1);
    expect(cases[0].type).toBe(MisuseCaseType.DIMO_COLLISION_REPORTED);
    expect(cases[0].evidenceSummary?.damageIncident).toBeDefined();
  });
});
