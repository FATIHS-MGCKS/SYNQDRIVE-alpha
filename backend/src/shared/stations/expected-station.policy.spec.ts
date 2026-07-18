import {
  evaluateClearExpectedStationPolicy,
  evaluateHomeMutationExpectedInvariant,
  evaluateSetExpectedStationPolicy,
  evaluateStaleExpectedStationReconciliation,
  ExpectedStationClearReason,
  ExpectedStationOrigin,
  ExpectedStationPolicyIssueCode,
  ExpectedStationRequestChannel,
  ExpectedStationTransferStatus,
  getExpectedStationOriginPriority,
  isActiveTransferExpectedContext,
  shouldRejectStaleExpectedAutoClear,
} from './expected-station.policy';

const STATION_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STATION_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW = '2026-07-18T12:00:00.000Z';

describe('expected-station.policy', () => {
  describe('getExpectedStationOriginPriority', () => {
    it('orders planned transfer above one-way return and operational goal', () => {
      expect(
        getExpectedStationOriginPriority(ExpectedStationOrigin.PLANNED_TRANSFER),
      ).toBeGreaterThan(
        getExpectedStationOriginPriority(ExpectedStationOrigin.CONFIRMED_ONE_WAY_RETURN),
      );
      expect(
        getExpectedStationOriginPriority(ExpectedStationOrigin.CONFIRMED_ONE_WAY_RETURN),
      ).toBeGreaterThan(
        getExpectedStationOriginPriority(ExpectedStationOrigin.PLANNED_REPOSITIONING),
      );
      expect(
        getExpectedStationOriginPriority(ExpectedStationOrigin.PLANNED_REPOSITIONING),
      ).toBeGreaterThan(
        getExpectedStationOriginPriority(ExpectedStationOrigin.OPERATIONAL_GOAL),
      );
    });
  });

  describe('evaluateSetExpectedStationPolicy', () => {
  const baseInput = {
    targetStationId: STATION_B,
    origin: ExpectedStationOrigin.PLANNED_TRANSFER,
    sourceSetAt: NOW,
    context: { transferId: 'transfer-1' },
    targetStationStatus: 'ACTIVE' as const,
    requestChannel: ExpectedStationRequestChannel.COMMAND,
  };

    it('requires origin and valid timestamp', () => {
      expect(
        evaluateSetExpectedStationPolicy({
          ...baseInput,
          origin: '' as never,
        }).blockingReasons.map((r) => r.code),
      ).toContain(ExpectedStationPolicyIssueCode.SOURCE_REQUIRED);

      expect(
        evaluateSetExpectedStationPolicy({
          ...baseInput,
          sourceSetAt: 'invalid',
        }).blockingReasons.map((r) => r.code),
      ).toContain(ExpectedStationPolicyIssueCode.TIMESTAMP_REQUIRED);
    });

    it('rejects arbitrary UI field edits', () => {
      const result = evaluateSetExpectedStationPolicy({
        ...baseInput,
        requestChannel: ExpectedStationRequestChannel.UI_DIRECT_FIELD,
      });

      expect(result.allowed).toBe(false);
      expect(result.blockingReasons[0]?.code).toBe(
        ExpectedStationPolicyIssueCode.UI_DIRECT_FIELD_FORBIDDEN,
      );
    });

    it('requires origin-specific context', () => {
      expect(
        evaluateSetExpectedStationPolicy({
          ...baseInput,
          context: {},
        }).blockingReasons[0]?.code,
      ).toBe(ExpectedStationPolicyIssueCode.CONTEXT_REQUIRED);

      expect(
        evaluateSetExpectedStationPolicy({
          ...baseInput,
          origin: ExpectedStationOrigin.CONFIRMED_ONE_WAY_RETURN,
          context: { bookingId: 'booking-1' },
        }).allowed,
      ).toBe(true);

      expect(
        evaluateSetExpectedStationPolicy({
          ...baseInput,
          origin: ExpectedStationOrigin.OPERATIONAL_GOAL,
          context: { reasonCode: 'OPS_REBALANCE' },
        }).allowed,
      ).toBe(true);
    });

    it('blocks archived and inactive target stations', () => {
      expect(
        evaluateSetExpectedStationPolicy({
          ...baseInput,
          targetStationStatus: 'ARCHIVED',
        }).blockingReasons[0]?.code,
      ).toBe(ExpectedStationPolicyIssueCode.TARGET_STATION_ARCHIVED);

      expect(
        evaluateSetExpectedStationPolicy({
          ...baseInput,
          targetStationStatus: 'INACTIVE',
        }).blockingReasons[0]?.code,
      ).toBe(ExpectedStationPolicyIssueCode.TARGET_STATION_INACTIVE);
    });

    it('is idempotent when assignment is unchanged', () => {
      const result = evaluateSetExpectedStationPolicy({
        ...baseInput,
        existing: {
          expectedStationId: STATION_B,
          expectedStationSource: ExpectedStationOrigin.PLANNED_TRANSFER,
          expectedStationSetAt: NOW,
        },
      });

      expect(result).toEqual({
        allowed: true,
        idempotent: true,
        blockingReasons: [],
        warnings: [],
      });
    });

    it('blocks lower-priority origins when an active transfer expected exists', () => {
      const result = evaluateSetExpectedStationPolicy({
        ...baseInput,
        origin: ExpectedStationOrigin.OPERATIONAL_GOAL,
        context: { reasonCode: 'OPS_GOAL' },
        existing: {
          expectedStationId: STATION_A,
          expectedStationSource: ExpectedStationOrigin.PLANNED_TRANSFER,
          expectedStationSetAt: NOW,
          context: { transferStatus: ExpectedStationTransferStatus.IN_TRANSIT },
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.blockingReasons[0]?.code).toBe(
        ExpectedStationPolicyIssueCode.ACTIVE_TRANSFER_PRIORITY,
      );
    });

    it('blocks lower-priority conflicts even without active transfer', () => {
      const result = evaluateSetExpectedStationPolicy({
        ...baseInput,
        origin: ExpectedStationOrigin.PLANNED_REPOSITIONING,
        context: { reasonCode: 'REPOSITION' },
        existing: {
          expectedStationId: STATION_A,
          expectedStationSource: ExpectedStationOrigin.CONFIRMED_ONE_WAY_RETURN,
          expectedStationSetAt: NOW,
          context: { bookingId: 'booking-1' },
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.blockingReasons[0]?.code).toBe(
        ExpectedStationPolicyIssueCode.LOWER_PRIORITY_CONFLICT,
      );
    });

    it('allows equal or higher priority to replace existing expected', () => {
      const result = evaluateSetExpectedStationPolicy({
        ...baseInput,
        origin: ExpectedStationOrigin.PLANNED_TRANSFER,
        existing: {
          expectedStationId: STATION_A,
          expectedStationSource: ExpectedStationOrigin.OPERATIONAL_GOAL,
          expectedStationSetAt: NOW,
          context: { reasonCode: 'OPS' },
        },
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('evaluateHomeMutationExpectedInvariant', () => {
    it('allows home mutations that do not touch expected fields', () => {
      expect(evaluateHomeMutationExpectedInvariant({})).toEqual({
        allowed: true,
        idempotent: false,
        blockingReasons: [],
        warnings: [],
      });
    });

    it('rejects home mutations that modify expected fields', () => {
      const result = evaluateHomeMutationExpectedInvariant({
        touchesExpectedStationId: true,
      });

      expect(result.allowed).toBe(false);
      expect(result.blockingReasons[0]?.code).toBe(
        ExpectedStationPolicyIssueCode.HOME_MUTATION_MUST_NOT_TOUCH_EXPECTED,
      );
    });
  });

  describe('evaluateClearExpectedStationPolicy', () => {
    it('rejects UI direct clears and missing reasons', () => {
      expect(
        evaluateClearExpectedStationPolicy({
          clearReason: ExpectedStationClearReason.DESTINATION_REACHED,
          clearedAt: NOW,
          expectedStationId: STATION_B,
          actualArrivalStationId: STATION_B,
          requestChannel: ExpectedStationRequestChannel.UI_DIRECT_FIELD,
        }).blockingReasons[0]?.code,
      ).toBe(ExpectedStationPolicyIssueCode.UI_DIRECT_FIELD_FORBIDDEN);

      expect(
        evaluateClearExpectedStationPolicy({
          clearReason: '' as never,
          clearedAt: NOW,
          expectedStationId: STATION_B,
        }).blockingReasons[0]?.code,
      ).toBe(ExpectedStationPolicyIssueCode.CLEAR_REASON_REQUIRED);
    });

    it('clears only when destination is reached', () => {
      expect(
        evaluateClearExpectedStationPolicy({
          clearReason: ExpectedStationClearReason.DESTINATION_REACHED,
          clearedAt: NOW,
          expectedStationId: STATION_B,
          actualArrivalStationId: STATION_B,
        }).allowed,
      ).toBe(true);

      expect(
        evaluateClearExpectedStationPolicy({
          clearReason: ExpectedStationClearReason.DESTINATION_REACHED,
          clearedAt: NOW,
          expectedStationId: STATION_B,
          actualArrivalStationId: STATION_A,
        }).blockingReasons[0]?.code,
      ).toBe(ExpectedStationPolicyIssueCode.DESTINATION_NOT_FULFILLED);
    });

    it('is idempotent when expected is already empty', () => {
      expect(
        evaluateClearExpectedStationPolicy({
          clearReason: ExpectedStationClearReason.TRANSFER_CANCELLED,
          clearedAt: NOW,
          expectedStationId: null,
        }),
      ).toEqual({
        allowed: true,
        idempotent: true,
        blockingReasons: [],
        warnings: [],
      });
    });
  });

  describe('evaluateStaleExpectedStationReconciliation', () => {
    it('marks stale expected without valid context for reconciliation only', () => {
      const reconciliation = evaluateStaleExpectedStationReconciliation({
        snapshot: {
          expectedStationId: STATION_B,
          expectedStationSource: ExpectedStationOrigin.PLANNED_TRANSFER,
          expectedStationSetAt: NOW,
        },
        contextStillValid: false,
      });

      expect(reconciliation).toEqual({
        stale: true,
        recommendedAction: 'MARK_FOR_RECONCILIATION',
        blockingReasons: [
          expect.objectContaining({
            code: ExpectedStationPolicyIssueCode.STALE_CONTEXT_RECONCILIATION_ONLY,
          }),
        ],
      });
      expect(shouldRejectStaleExpectedAutoClear(reconciliation)).toBe(true);
    });

    it('does not mark expected when context is still valid', () => {
      expect(
        evaluateStaleExpectedStationReconciliation({
          snapshot: {
            expectedStationId: STATION_B,
            expectedStationSource: ExpectedStationOrigin.PLANNED_TRANSFER,
            expectedStationSetAt: NOW,
          },
          contextStillValid: true,
        }).recommendedAction,
      ).toBe('NONE');
    });
  });

  describe('isActiveTransferExpectedContext', () => {
    it('is true only for planned or in-transit transfer origins', () => {
      expect(
        isActiveTransferExpectedContext({
          origin: ExpectedStationOrigin.PLANNED_TRANSFER,
          transferStatus: ExpectedStationTransferStatus.PLANNED,
        }),
      ).toBe(true);

      expect(
        isActiveTransferExpectedContext({
          origin: ExpectedStationOrigin.PLANNED_TRANSFER,
          transferStatus: ExpectedStationTransferStatus.COMPLETED,
        }),
      ).toBe(false);

      expect(
        isActiveTransferExpectedContext({
          origin: ExpectedStationOrigin.OPERATIONAL_GOAL,
          transferStatus: ExpectedStationTransferStatus.IN_TRANSIT,
        }),
      ).toBe(false);
    });
  });
});
