import { HANDOVER_SESSION_ERROR } from './handover-session.errors';
import { evaluateReturnTransitionPolicy } from './return-transition.policy';
import { buildHandoverTransitionInput } from './handover-session.fixture';

describe('return-transition.policy', () => {
  const baseReturn = () =>
    buildHandoverTransitionInput({
      kind: 'RETURN',
      fromStatus: 'DRAFT',
      toStatus: 'DRAFT',
      action: 'START',
      booking: {
        status: 'ACTIVE',
        vehicleId: 'vehicle-1',
        pickupStationId: 'station-1',
        returnStationId: 'station-1',
        hasPickupProtocol: true,
        hasReturnProtocol: false,
      },
    });

  it('allows START when booking is ACTIVE and pickup protocol exists', () => {
    expect(evaluateReturnTransitionPolicy(baseReturn())).toEqual({ allowed: true });
  });

  it('denies when pickup protocol is missing', () => {
    const decision = evaluateReturnTransitionPolicy(
      buildHandoverTransitionInput({
        ...baseReturn(),
        booking: {
          ...baseReturn().booking,
          hasPickupProtocol: false,
        },
      }),
    );
    expect(decision.code).toBe(HANDOVER_SESSION_ERROR.PICKUP_PROTOCOL_REQUIRED);
  });

  it('denies when booking is not ACTIVE', () => {
    const decision = evaluateReturnTransitionPolicy(
      buildHandoverTransitionInput({
        ...baseReturn(),
        booking: {
          ...baseReturn().booking,
          status: 'CONFIRMED',
        },
      }),
    );
    expect(decision.code).toBe(HANDOVER_SESSION_ERROR.BOOKING_WRONG_STATUS);
  });

  it('denies SUBMIT without signatures', () => {
    const decision = evaluateReturnTransitionPolicy(
      buildHandoverTransitionInput({
        ...baseReturn(),
        fromStatus: 'AWAITING_SIGNATURE',
        toStatus: 'SUBMITTED',
        action: 'SUBMIT',
        payload: {
          ...baseReturn().payload,
          customerSignatureDataUrl: null,
          customerSignatureName: null,
          staffSignatureDataUrl: null,
          staffSignatureName: null,
        },
      }),
    );
    expect(decision.code).toBe(HANDOVER_SESSION_ERROR.SIGNATURE_REQUIRED);
  });

  it('denies SUBMIT without odometer', () => {
    const decision = evaluateReturnTransitionPolicy(
      buildHandoverTransitionInput({
        ...baseReturn(),
        fromStatus: 'IN_PROGRESS',
        toStatus: 'SUBMITTED',
        action: 'SUBMIT',
        payload: {
          ...baseReturn().payload,
          odometerKm: null,
        },
      }),
    );
    expect(decision.code).toBe(HANDOVER_SESSION_ERROR.TRANSITION_FORBIDDEN);
  });

  it('requires supersede reason', () => {
    const decision = evaluateReturnTransitionPolicy(
      buildHandoverTransitionInput({
        ...baseReturn(),
        fromStatus: 'COMPLETED',
        toStatus: 'SUPERSEDED',
        action: 'SUPERSEDE',
        supersedeReason: null,
        existingCompletedProtocolId: 'protocol-return',
      }),
    );
    expect(decision.code).toBe(HANDOVER_SESSION_ERROR.SUPERSEDE_REASON_REQUIRED);
  });

  it('denies forbidden matrix transition from terminal cancelled', () => {
    const decision = evaluateReturnTransitionPolicy(
      buildHandoverTransitionInput({
        ...baseReturn(),
        fromStatus: 'CANCELLED',
        toStatus: 'DRAFT',
        action: 'START',
      }),
    );
    expect(decision.code).toBe(HANDOVER_SESSION_ERROR.TRANSITION_FORBIDDEN);
  });
});
