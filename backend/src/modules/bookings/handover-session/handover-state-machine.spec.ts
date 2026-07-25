import { HANDOVER_SESSION_ERROR } from './handover-session.errors';
import { HandoverStateMachine } from './handover-state-machine';
import { buildHandoverTransitionInput } from './handover-session.fixture';

describe('HandoverStateMachine', () => {
  const machine = new HandoverStateMachine();

  it('routes PICKUP kind to pickup policy', () => {
    const decision = machine.evaluate(
      buildHandoverTransitionInput({
        booking: {
          ...buildHandoverTransitionInput().booking,
          status: 'PENDING',
        },
      }),
    );
    expect(decision.code).toBe(HANDOVER_SESSION_ERROR.BOOKING_WRONG_STATUS);
  });

  it('routes RETURN kind to return policy', () => {
    const decision = machine.evaluate(
      buildHandoverTransitionInput({
        kind: 'RETURN',
        booking: {
          status: 'ACTIVE',
          vehicleId: 'vehicle-1',
          pickupStationId: 'station-1',
          returnStationId: 'station-1',
          hasPickupProtocol: false,
          hasReturnProtocol: false,
        },
      }),
    );
    expect(decision.code).toBe(HANDOVER_SESSION_ERROR.PICKUP_PROTOCOL_REQUIRED);
  });

  it('resolves target status from action', () => {
    expect(machine.resolveTargetStatus('ACQUIRE')).toBe('IN_PROGRESS');
    expect(machine.resolveTargetStatus('SUBMIT')).toBe('SUBMITTED');
    expect(machine.resolveTargetStatus('CANCEL')).toBe('CANCELLED');
  });
});
