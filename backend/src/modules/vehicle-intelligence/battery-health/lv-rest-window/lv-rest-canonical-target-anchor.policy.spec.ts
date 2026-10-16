import { resolveLvRestCanonicalTargetAnchor } from './lv-rest-canonical-target-anchor.policy';

const ORG = 'org-aaaaaaaaaaaaaaaaaaaaaaaa';
const VEH = 'veh-bbbbbbbbbbbbbbbbbbbbbbbb';
const OTHER_ORG = 'org-cccccccccccccccccccccccc';
const OTHER_VEH = 'veh-dddddddddddddddddddddddd';

describe('resolveLvRestCanonicalTargetAnchor', () => {
  const sessionAnchor = new Date('2026-10-13T17:29:42.000Z');
  const canonicalAnchor = new Date('2026-10-13T17:06:40.000Z');

  it('J: rejects cross-tenant and cross-vehicle candidates', () => {
    const result = resolveLvRestCanonicalTargetAnchor({
      organizationId: ORG,
      vehicleId: VEH,
      measurementSessionStartedAt: sessionAnchor,
      candidates: [
        {
          id: 'rest-wrong-org',
          organizationId: OTHER_ORG,
          vehicleId: VEH,
          anchorAt: canonicalAnchor,
        },
        {
          id: 'rest-wrong-vehicle',
          organizationId: ORG,
          vehicleId: OTHER_VEH,
          anchorAt: canonicalAnchor,
        },
      ],
    });
    expect(result.kind).toBe('SESSION_ANCHOR');
    expect(result.restWindowStartedAt).toEqual(sessionAnchor);
  });

  it('binds canonical anchor via linked trip when measurement session anchor diverges', () => {
    const tripId = '588f50ad-trip-edfdd3df';
    const result = resolveLvRestCanonicalTargetAnchor({
      organizationId: ORG,
      vehicleId: VEH,
      measurementSessionStartedAt: sessionAnchor,
      linkedTripId: tripId,
      candidates: [
        {
          id: 'rest-canonical-edfdd3df',
          organizationId: ORG,
          vehicleId: VEH,
          anchorAt: canonicalAnchor,
          confirmedTripId: tripId,
        },
      ],
    });
    expect(result).toMatchObject({
      kind: 'CANONICAL_REST_SESSION',
      restSessionId: 'rest-canonical-edfdd3df',
      restWindowStartedAt: canonicalAnchor,
      measurementSessionStartedAt: sessionAnchor,
    });
  });

  it('F: deterministic tie-break by rest session id', () => {
    const deltaAnchor = new Date(sessionAnchor.getTime() - 30_000);
    const result = resolveLvRestCanonicalTargetAnchor({
      organizationId: ORG,
      vehicleId: VEH,
      measurementSessionStartedAt: sessionAnchor,
      candidates: [
        {
          id: 'rest-b',
          organizationId: ORG,
          vehicleId: VEH,
          anchorAt: deltaAnchor,
        },
        {
          id: 'rest-a',
          organizationId: ORG,
          vehicleId: VEH,
          anchorAt: new Date(sessionAnchor.getTime() + 60_000),
        },
      ],
    });
    expect(result.kind).toBe('CANONICAL_REST_SESSION');
    if (result.kind === 'CANONICAL_REST_SESSION') {
      expect(result.restSessionId).toBe('rest-b');
    }
  });
});
