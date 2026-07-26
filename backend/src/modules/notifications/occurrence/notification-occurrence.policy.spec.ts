import { NotificationCandidateRecoveryState } from '../notification-candidate.contract';
import { NotificationSeverity } from '../notification.enums';
import {
  evaluateOccurrenceIngest,
  isStaleActiveSignal,
  maxOccurredAt,
  OCCURRENCE_RETENTION_INDEX_HINTS,
  shouldApplyRecoveryToNotification,
} from './notification-occurrence.policy';

const T10 = new Date('2026-07-11T10:00:00.000Z');
const T12 = new Date('2026-07-11T12:00:00.000Z');
const T15 = new Date('2026-07-11T15:00:00.000Z');

describe('notification-occurrence.policy', () => {
  describe('maxOccurredAt', () => {
    it('keeps the later timestamp', () => {
      expect(maxOccurredAt(T15, T10)).toEqual(T15);
      expect(maxOccurredAt(T10, T15)).toEqual(T15);
    });
  });

  describe('out-of-order active signals', () => {
    it('detects stale active signal by occurredAt', () => {
      expect(isStaleActiveSignal(T10, T15)).toBe(true);
      expect(isStaleActiveSignal(T15, T10)).toBe(false);
    });

    it('records stale WARNING but does not apply lifecycle side-effects', () => {
      const evaluation = evaluateOccurrenceIngest({
        candidate: {
          occurredAt: T10,
          observedAt: T15,
          severity: NotificationSeverity.WARNING,
          recoveryState: NotificationCandidateRecoveryState.ACTIVE,
          sourceEventId: 'evt-stale-warning',
        },
        notificationLastSeenAt: T15,
        isRecovery: false,
        duplicateSourceEvent: false,
      });
      expect(evaluation.action).toBe('STALE_SIGNAL');
      expect(evaluation.recordOccurrence).toBe(true);
      expect(evaluation.applySeverity).toBe(true);
      expect(evaluation.applyLifecycle).toBe(false);
      expect(evaluation.lastSeenAt).toEqual(T15);
    });
  });

  describe('sourceEventId dedupe', () => {
    it('ignores duplicate sourceEventId without recording', () => {
      const evaluation = evaluateOccurrenceIngest({
        candidate: {
          occurredAt: T12,
          observedAt: T12,
          severity: NotificationSeverity.WARNING,
          recoveryState: NotificationCandidateRecoveryState.ACTIVE,
          sourceEventId: 'evt-dup',
        },
        notificationLastSeenAt: T10,
        isRecovery: false,
        duplicateSourceEvent: true,
      });
      expect(evaluation.action).toBe('DUPLICATE_SOURCE_EVENT');
      expect(evaluation.recordOccurrence).toBe(false);
    });

    it('accepts distinct sourceEventId', () => {
      const evaluation = evaluateOccurrenceIngest({
        candidate: {
          occurredAt: T12,
          observedAt: T12,
          severity: NotificationSeverity.WARNING,
          recoveryState: NotificationCandidateRecoveryState.ACTIVE,
          sourceEventId: 'evt-new',
        },
        notificationLastSeenAt: T10,
        isRecovery: false,
        duplicateSourceEvent: false,
      });
      expect(evaluation.action).toBe('ACCEPT');
      expect(evaluation.recordOccurrence).toBe(true);
    });
  });

  describe('recovery ordering', () => {
    it('applies recovery when occurredAt is not older than latest signal', () => {
      expect(shouldApplyRecoveryToNotification(T15, T15)).toBe(true);
      expect(shouldApplyRecoveryToNotification(T15, T10)).toBe(true);
    });

    it('rejects stale recovery when a newer active signal exists', () => {
      expect(shouldApplyRecoveryToNotification(T10, T15)).toBe(false);
      const evaluation = evaluateOccurrenceIngest({
        candidate: {
          occurredAt: T10,
          observedAt: T15,
          severity: NotificationSeverity.SUCCESS,
          recoveryState: NotificationCandidateRecoveryState.RECOVERED,
          sourceEventId: 'evt-stale-recovery',
        },
        notificationLastSeenAt: T15,
        isRecovery: true,
        duplicateSourceEvent: false,
      });
      expect(evaluation.action).toBe('STALE_RECOVERY');
      expect(evaluation.recordOccurrence).toBe(true);
      expect(evaluation.applyRecovery).toBe(false);
    });
  });

  describe('retention preparation', () => {
    it('documents retention-friendly indexes', () => {
      expect(OCCURRENCE_RETENTION_INDEX_HINTS).toEqual(
        expect.arrayContaining([
          'notification_occurrences_org_observed_at_idx',
          'notification_occurrences_created_at_idx',
        ]),
      );
    });
  });
});
