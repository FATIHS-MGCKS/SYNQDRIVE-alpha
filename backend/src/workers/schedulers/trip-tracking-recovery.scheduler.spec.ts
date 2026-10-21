import {
  isPossibleEndRecoveryEligible,
  resolvePossibleEndFsmDwellAnchor,
} from '../../modules/vehicle-intelligence/trips/trip-fsm-clock-contract';

const STUCK_POSSIBLE_END_THRESHOLD_MS = 30 * 60_000;

describe('TripTrackingRecoveryScheduler — legacy POSSIBLE_END recovery age', () => {
  it('legacy row with null possibleEndEnteredAt uses possibleEndAt for stuck check', () => {
    const T0 = new Date('2026-09-06T10:00:00.000Z');
    const now = new Date(T0.getTime() + 31 * 60_000);
    const legacyRow = {
      possibleEndAt: T0,
      possibleEndEnteredAt: null,
      updatedAt: now,
      activeTripId: 'trip-legacy',
    };

    expect(resolvePossibleEndFsmDwellAnchor(legacyRow, now)).toEqual(T0);
    expect(
      isPossibleEndRecoveryEligible(
        legacyRow,
        now,
        STUCK_POSSIBLE_END_THRESHOLD_MS,
      ),
    ).toBe(true);
  });

  it('legacy row not yet stuck when possibleEndAt is recent', () => {
    const T0 = new Date('2026-09-06T10:00:00.000Z');
    const now = new Date(T0.getTime() + 5 * 60_000);
    expect(
      isPossibleEndRecoveryEligible(
        {
          possibleEndAt: T0,
          possibleEndEnteredAt: null,
          updatedAt: now,
          activeTripId: 'trip-legacy',
        },
        now,
        STUCK_POSSIBLE_END_THRESHOLD_MS,
      ),
    ).toBe(false);
  });
});
