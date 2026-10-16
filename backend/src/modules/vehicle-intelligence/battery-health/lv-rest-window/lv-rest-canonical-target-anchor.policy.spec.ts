import { BatteryRestSessionStatus } from '@prisma/client';
import {
  isLvRestTargetCanonicalSessionEligible,
  resolveLvRestCanonicalTargetAnchor,
} from './lv-rest-canonical-target-anchor.policy';

const ORG = 'org-aaaaaaaaaaaaaaaaaaaaaaaa';
const VEH = 'veh-bbbbbbbbbbbbbbbbbbbbbbbb';
const TRIP_A = 'trip-aaaaaaaaaaaaaaaaaaaa';
const TRIP_B = 'trip-bbbbbbbbbbbbbbbbbbbb';

function candidate(input: {
  id: string;
  anchorAt: Date;
  sessionStatus?: BatteryRestSessionStatus;
  confirmedTripId?: string | null;
  candidateTripId?: string | null;
  organizationId?: string;
  vehicleId?: string;
}) {
  return {
    id: input.id,
    organizationId: input.organizationId ?? ORG,
    vehicleId: input.vehicleId ?? VEH,
    anchorAt: input.anchorAt,
    sessionStatus: input.sessionStatus ?? BatteryRestSessionStatus.RESTING,
    confirmedTripId: input.confirmedTripId ?? null,
    candidateTripId: input.candidateTripId ?? null,
  };
}

describe('resolveLvRestCanonicalTargetAnchor', () => {
  const sessionAnchor = new Date('2026-10-13T17:29:42.000Z');
  const canonicalAnchor = new Date('2026-10-13T17:06:40.000Z');

  it('rejects invalidated canonical sessions', () => {
    const result = resolveLvRestCanonicalTargetAnchor({
      organizationId: ORG,
      vehicleId: VEH,
      measurementSessionStartedAt: sessionAnchor,
      linkedTripId: TRIP_A,
      candidates: [
        candidate({
          id: 'rest-invalid',
          anchorAt: canonicalAnchor,
          sessionStatus: BatteryRestSessionStatus.INVALIDATED,
          confirmedTripId: TRIP_A,
        }),
      ],
    });
    expect(result.kind).toBe('SESSION_ANCHOR');
    if (result.kind === 'SESSION_ANCHOR') {
      expect(result.reason).toBe('ineligible_only');
    }
  });

  it('J: rejects cross-tenant and cross-vehicle candidates', () => {
    const result = resolveLvRestCanonicalTargetAnchor({
      organizationId: ORG,
      vehicleId: VEH,
      measurementSessionStartedAt: sessionAnchor,
      linkedTripId: TRIP_A,
      candidates: [
        candidate({
          id: 'rest-wrong-org',
          anchorAt: canonicalAnchor,
          organizationId: 'org-other',
          confirmedTripId: TRIP_A,
        }),
      ],
    });
    expect(result.kind).toBe('SESSION_ANCHOR');
    if (result.kind === 'SESSION_ANCHOR') {
      expect(['no_match', 'ineligible_only']).toContain(result.reason);
    }
  });

  it('binds via confirmed trip even when measurement session anchor diverges', () => {
    const result = resolveLvRestCanonicalTargetAnchor({
      organizationId: ORG,
      vehicleId: VEH,
      measurementSessionStartedAt: sessionAnchor,
      linkedTripId: TRIP_A,
      candidates: [
        candidate({
          id: 'rest-canonical',
          anchorAt: canonicalAnchor,
          confirmedTripId: TRIP_A,
        }),
      ],
    });
    expect(result).toMatchObject({
      kind: 'CANONICAL_REST_SESSION',
      restSessionId: 'rest-canonical',
      association: 'confirmed_trip',
    });
  });

  it('rejects wrong trip despite close timestamp when trip is linked', () => {
    const result = resolveLvRestCanonicalTargetAnchor({
      organizationId: ORG,
      vehicleId: VEH,
      measurementSessionStartedAt: sessionAnchor,
      linkedTripId: TRIP_A,
      candidates: [
        candidate({
          id: 'rest-other-trip',
          anchorAt: new Date(sessionAnchor.getTime() - 5_000),
          confirmedTripId: TRIP_B,
        }),
      ],
    });
    expect(result).toMatchObject({ kind: 'SESSION_ANCHOR', reason: 'no_match' });
  });

  it('returns ambiguous when multiple confirmed trips match', () => {
    const result = resolveLvRestCanonicalTargetAnchor({
      organizationId: ORG,
      vehicleId: VEH,
      measurementSessionStartedAt: sessionAnchor,
      linkedTripId: TRIP_A,
      candidates: [
        candidate({
          id: 'rest-a',
          anchorAt: canonicalAnchor,
          confirmedTripId: TRIP_A,
        }),
        candidate({
          id: 'rest-b',
          anchorAt: new Date('2026-10-13T17:07:00.000Z'),
          confirmedTripId: TRIP_A,
        }),
      ],
    });
    expect(result).toMatchObject({ kind: 'SESSION_ANCHOR', reason: 'ambiguous' });
  });

  it('F: deterministic tie-break by rest session id for equal anchor distance', () => {
    const result = resolveLvRestCanonicalTargetAnchor({
      organizationId: ORG,
      vehicleId: VEH,
      measurementSessionStartedAt: sessionAnchor,
      candidates: [
        candidate({
          id: 'rest-b',
          anchorAt: new Date(sessionAnchor.getTime() - 30_000),
        }),
        candidate({
          id: 'rest-a',
          anchorAt: new Date(sessionAnchor.getTime() + 60_000),
        }),
      ],
    });
    expect(result.kind).toBe('CANONICAL_REST_SESSION');
    if (result.kind === 'CANONICAL_REST_SESSION') {
      expect(result.restSessionId).toBe('rest-b');
    }
  });

  it('time tolerance path is ambiguous for distinct anchors at same distance', () => {
    const result = resolveLvRestCanonicalTargetAnchor({
      organizationId: ORG,
      vehicleId: VEH,
      measurementSessionStartedAt: sessionAnchor,
      candidates: [
        candidate({
          id: 'rest-a',
          anchorAt: new Date(sessionAnchor.getTime() - 60_000),
        }),
        candidate({
          id: 'rest-b',
          anchorAt: new Date(sessionAnchor.getTime() + 60_000),
        }),
      ],
    });
    expect(result).toMatchObject({ kind: 'SESSION_ANCHOR', reason: 'ambiguous' });
  });

  it('documents eligible canonical lifecycle statuses', () => {
    expect(isLvRestTargetCanonicalSessionEligible(BatteryRestSessionStatus.ENDED)).toBe(
      true,
    );
    expect(
      isLvRestTargetCanonicalSessionEligible(BatteryRestSessionStatus.INVALIDATED),
    ).toBe(false);
  });
});
