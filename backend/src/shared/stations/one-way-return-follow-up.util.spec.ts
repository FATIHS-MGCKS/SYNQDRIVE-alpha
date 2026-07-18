import {
  OneWayReturnFollowUpRecommendation,
  OneWayReturnFollowUpReasonCode,
  type OneWayReturnFollowUpEvaluationInput,
} from './one-way-return-follow-up.contract';
import { evaluateOneWayReturnFollowUp } from './one-way-return-follow-up.util';

const EVALUATED_AT = '2026-07-18T12:00:00.000Z';
const BOOKING_ID = 'booking-1';
const HOME = 'station-home';
const PICKUP = 'station-pickup';
const RETURN = 'station-return';
const NEXT = 'station-next';

function baseInput(
  overrides: Partial<OneWayReturnFollowUpEvaluationInput> = {},
): OneWayReturnFollowUpEvaluationInput {
  return {
    evaluatedAt: EVALUATED_AT,
    bookingId: BOOKING_ID,
    isOneWayRental: true,
    pickupStationId: PICKUP,
    plannedReturnStationId: RETURN,
    actualReturnStationId: RETURN,
    homeStationId: HOME,
    currentStationId: RETURN,
    expectedStationId: null,
    expectedStationSource: null,
    nextBooking: null,
    activeTransfer: null,
    ...overrides,
  };
}

describe('evaluateOneWayReturnFollowUp', () => {
  it('returns NO_ACTION for round-trip bookings', () => {
    const result = evaluateOneWayReturnFollowUp(
      baseInput({ isOneWayRental: false, pickupStationId: HOME, plannedReturnStationId: HOME }),
    );

    expect(result.recommendation).toBe(OneWayReturnFollowUpRecommendation.NO_ACTION);
    expect(result.reasons[0]?.code).toBe(OneWayReturnFollowUpReasonCode.NOT_ONE_WAY);
    expect(result.transferSuggestion).toBeNull();
  });

  it('returns NO_ACTION when one-way vehicle is already at home after return', () => {
    const result = evaluateOneWayReturnFollowUp(
      baseInput({
        pickupStationId: PICKUP,
        plannedReturnStationId: HOME,
        actualReturnStationId: HOME,
        currentStationId: HOME,
        homeStationId: HOME,
      }),
    );

    expect(result.recommendation).toBe(OneWayReturnFollowUpRecommendation.NO_ACTION);
    expect(result.checks.repositioningRequired).toBe(false);
  });

  it('returns SUGGEST_TRANSFER_HOME when home differs from return and no next booking exists', () => {
    const result = evaluateOneWayReturnFollowUp(baseInput());

    expect(result.recommendation).toBe(
      OneWayReturnFollowUpRecommendation.SUGGEST_TRANSFER_HOME,
    );
    expect(result.transferSuggestion).toEqual({
      kind: 'HOME',
      fromStationId: RETURN,
      toStationId: HOME,
    });
    expect(result.noAutomaticTransfer).toBe(true);
    expect(result.homeUnchanged).toBe(true);
    expect(result.expectedUnchanged).toBe(true);
  });

  it('returns KEEP_AT_RETURN_STATION when next booking pickup is at return station', () => {
    const result = evaluateOneWayReturnFollowUp(
      baseInput({
        nextBooking: {
          id: 'next-booking',
          pickupStationId: RETURN,
          startDate: '2026-07-20T08:00:00.000Z',
        },
      }),
    );

    expect(result.recommendation).toBe(
      OneWayReturnFollowUpRecommendation.KEEP_AT_RETURN_STATION,
    );
    expect(result.transferSuggestion).toBeNull();
  });

  it('returns SUGGEST_TRANSFER_HOME when next booking pickup is at home station', () => {
    const result = evaluateOneWayReturnFollowUp(
      baseInput({
        nextBooking: {
          id: 'next-booking',
          pickupStationId: HOME,
          startDate: '2026-07-20T08:00:00.000Z',
        },
      }),
    );

    expect(result.recommendation).toBe(
      OneWayReturnFollowUpRecommendation.SUGGEST_TRANSFER_HOME,
    );
    expect(result.transferSuggestion).toEqual({
      kind: 'HOME',
      fromStationId: RETURN,
      toStationId: HOME,
      sourceBookingId: 'next-booking',
    });
  });

  it('returns SUGGEST_TRANSFER_TO_NEXT_BOOKING when next booking is at another station', () => {
    const result = evaluateOneWayReturnFollowUp(
      baseInput({
        nextBooking: {
          id: 'next-booking',
          pickupStationId: NEXT,
          startDate: '2026-07-20T08:00:00.000Z',
        },
      }),
    );

    expect(result.recommendation).toBe(
      OneWayReturnFollowUpRecommendation.SUGGEST_TRANSFER_TO_NEXT_BOOKING,
    );
    expect(result.transferSuggestion).toEqual({
      kind: 'NEXT_BOOKING',
      fromStationId: RETURN,
      toStationId: NEXT,
      sourceBookingId: 'next-booking',
    });
  });

  it('returns MANUAL_REVIEW when current station does not match actual return', () => {
    const result = evaluateOneWayReturnFollowUp(
      baseInput({ currentStationId: PICKUP, actualReturnStationId: RETURN }),
    );

    expect(result.recommendation).toBe(OneWayReturnFollowUpRecommendation.MANUAL_REVIEW);
    expect(result.reasons[0]?.code).toBe(OneWayReturnFollowUpReasonCode.CURRENT_MISMATCH);
  });

  it('returns MANUAL_REVIEW when an active transfer already exists', () => {
    const result = evaluateOneWayReturnFollowUp(
      baseInput({
        activeTransfer: {
          id: 'transfer-1',
          fromStationId: RETURN,
          toStationId: HOME,
          status: 'PLANNED',
        },
      }),
    );

    expect(result.recommendation).toBe(OneWayReturnFollowUpRecommendation.MANUAL_REVIEW);
    expect(result.reasons[0]?.code).toBe(
      OneWayReturnFollowUpReasonCode.ACTIVE_TRANSFER_EXISTS,
    );
  });

  it('returns MANUAL_REVIEW when stale expected position remains after return', () => {
    const result = evaluateOneWayReturnFollowUp(
      baseInput({
        expectedStationId: HOME,
        expectedStationSource: 'ONE_WAY_BOOKING',
      }),
    );

    expect(result.recommendation).toBe(OneWayReturnFollowUpRecommendation.MANUAL_REVIEW);
    expect(result.reasons[0]?.code).toBe(
      OneWayReturnFollowUpReasonCode.STALE_EXPECTED_POSITION,
    );
  });

  it('returns MANUAL_REVIEW when repositioning is required but home station is missing', () => {
    const result = evaluateOneWayReturnFollowUp(
      baseInput({ homeStationId: null }),
    );

    expect(result.recommendation).toBe(OneWayReturnFollowUpRecommendation.MANUAL_REVIEW);
    expect(result.reasons[0]?.code).toBe(OneWayReturnFollowUpReasonCode.HOME_STATION_MISSING);
  });
});
