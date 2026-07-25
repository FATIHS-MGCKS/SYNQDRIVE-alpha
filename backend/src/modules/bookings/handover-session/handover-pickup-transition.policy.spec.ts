import { HANDOVER_SESSION_ERROR } from './handover-session.errors';
import { evaluatePickupTransitionPolicy } from './handover-pickup-transition.policy';
import { buildHandoverTransitionInput } from './handover-session.fixture';

describe('handover-pickup-transition.policy', () => {
  it('allows START when booking is CONFIRMED and gate is clear', () => {
    const decision = evaluatePickupTransitionPolicy(buildHandoverTransitionInput());
    expect(decision).toEqual({ allowed: true });
  });

  it('denies START when booking is not CONFIRMED', () => {
    const decision = evaluatePickupTransitionPolicy(
      buildHandoverTransitionInput({
        booking: {
          ...buildHandoverTransitionInput().booking,
          status: 'PENDING',
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(HANDOVER_SESSION_ERROR.BOOKING_WRONG_STATUS);
  });

  it('denies when completed protocol already exists', () => {
    const decision = evaluatePickupTransitionPolicy(
      buildHandoverTransitionInput({
        existingCompletedProtocolId: 'protocol-1',
        action: 'START',
      }),
    );
    expect(decision.code).toBe(HANDOVER_SESSION_ERROR.PROTOCOL_ALREADY_EXISTS);
  });

  it('denies vehicle IN_SERVICE pickup', () => {
    const decision = evaluatePickupTransitionPolicy(
      buildHandoverTransitionInput({
        vehicle: {
          status: 'IN_SERVICE',
          rentalBlocked: false,
          blockingReasons: [],
        },
      }),
    );
    expect(decision.code).toBe(HANDOVER_SESSION_ERROR.VEHICLE_BLOCKED);
  });

  it('denies rental_blocked vehicle', () => {
    const decision = evaluatePickupTransitionPolicy(
      buildHandoverTransitionInput({
        vehicle: {
          status: 'AVAILABLE',
          rentalBlocked: true,
          blockingReasons: ['tires critical'],
        },
      }),
    );
    expect(decision.code).toBe(HANDOVER_SESSION_ERROR.VEHICLE_RENTAL_BLOCKED);
  });

  it('denies hard gate blockers', () => {
    const decision = evaluatePickupTransitionPolicy(
      buildHandoverTransitionInput({
        requirements: {
          blockers: [
            {
              code: 'BUNDLE_INCOMPLETE',
              message: 'Documents missing',
              overridable: false,
              category: 'gate',
            },
          ],
          pickupGateOverrideReason: null,
          eligibilityApprovalId: null,
        },
      }),
    );
    expect(decision.code).toBe(HANDOVER_SESSION_ERROR.GATE_BLOCKED);
  });

  it('requires override reason for soft gate blockers', () => {
    const decision = evaluatePickupTransitionPolicy(
      buildHandoverTransitionInput({
        requirements: {
          blockers: [
            {
              code: 'SOFT_BLOCK',
              message: 'Soft block',
              overridable: true,
              category: 'gate',
            },
          ],
          pickupGateOverrideReason: null,
          eligibilityApprovalId: null,
        },
      }),
    );
    expect(decision.code).toBe(HANDOVER_SESSION_ERROR.GATE_OVERRIDE_REQUIRED);
  });

  it('denies soft gate override without permission', () => {
    const decision = evaluatePickupTransitionPolicy(
      buildHandoverTransitionInput({
        requirements: {
          blockers: [
            {
              code: 'SOFT_BLOCK',
              message: 'Soft block',
              overridable: true,
              category: 'gate',
            },
          ],
          pickupGateOverrideReason: 'Customer waived',
          eligibilityApprovalId: null,
        },
        permissions: {
          canWriteBookings: true,
          canOverrideScope: true,
          canOverridePickupGate: false,
          canCompletePickup: true,
          canSupersede: true,
        },
      }),
    );
    expect(decision.code).toBe(HANDOVER_SESSION_ERROR.GATE_OVERRIDE_DENIED);
  });

  it('denies SUBMIT without documents acknowledged', () => {
    const decision = evaluatePickupTransitionPolicy(
      buildHandoverTransitionInput({
        fromStatus: 'IN_PROGRESS',
        toStatus: 'SUBMITTED',
        action: 'SUBMIT',
        payload: {
          ...buildHandoverTransitionInput().payload,
          documentsAcknowledged: false,
        },
      }),
    );
    expect(decision.code).toBe(HANDOVER_SESSION_ERROR.DOCUMENTS_NOT_ACKNOWLEDGED);
  });

  it('denies SUBMIT without signatures', () => {
    const decision = evaluatePickupTransitionPolicy(
      buildHandoverTransitionInput({
        fromStatus: 'IN_PROGRESS',
        toStatus: 'SUBMITTED',
        action: 'SUBMIT',
        payload: {
          ...buildHandoverTransitionInput().payload,
          customerSignatureDataUrl: null,
          customerSignatureName: null,
          staffSignatureDataUrl: null,
          staffSignatureName: null,
        },
      }),
    );
    expect(decision.code).toBe(HANDOVER_SESSION_ERROR.SIGNATURE_REQUIRED);
  });

  it('denies COMPLETE without operator.handover.complete permission', () => {
    const decision = evaluatePickupTransitionPolicy(
      buildHandoverTransitionInput({
        fromStatus: 'SUBMITTED',
        toStatus: 'COMPLETED',
        action: 'COMPLETE',
        currentVersion: 3,
        expectedVersion: 3,
        permissions: {
          canWriteBookings: true,
          canCompletePickup: false,
          canOverrideScope: true,
          canOverridePickupGate: true,
          canSupersede: true,
        },
      }),
    );
    expect(decision.code).toBe(HANDOVER_SESSION_ERROR.PERMISSION_DENIED);
  });

  it('allows COMPLETE from SUBMITTED with permission', () => {
    const decision = evaluatePickupTransitionPolicy(
      buildHandoverTransitionInput({
        fromStatus: 'SUBMITTED',
        toStatus: 'COMPLETED',
        action: 'COMPLETE',
        currentVersion: 3,
        expectedVersion: 3,
      }),
    );
    expect(decision).toEqual({ allowed: true });
  });

  it('denies scope override without reason', () => {
    const decision = evaluatePickupTransitionPolicy(
      buildHandoverTransitionInput({
        scope: { stationWritable: false, actualStationId: 'station-x' },
        scopeOverrideReason: null,
      }),
    );
    expect(decision.code).toBe(HANDOVER_SESSION_ERROR.SCOPE_OVERRIDE_REQUIRED);
  });

  it('denies version conflict', () => {
    const decision = evaluatePickupTransitionPolicy(
      buildHandoverTransitionInput({
        fromStatus: 'DRAFT',
        toStatus: 'IN_PROGRESS',
        action: 'ACQUIRE',
        expectedVersion: 1,
        currentVersion: 2,
      }),
    );
    expect(decision.code).toBe(HANDOVER_SESSION_ERROR.VERSION_CONFLICT);
  });

  it('requires cancel reason for CANCEL', () => {
    const decision = evaluatePickupTransitionPolicy(
      buildHandoverTransitionInput({
        fromStatus: 'IN_PROGRESS',
        toStatus: 'CANCELLED',
        action: 'CANCEL',
        cancelReason: null,
      }),
    );
    expect(decision.code).toBe(HANDOVER_SESSION_ERROR.CANCEL_REASON_REQUIRED);
  });
});
