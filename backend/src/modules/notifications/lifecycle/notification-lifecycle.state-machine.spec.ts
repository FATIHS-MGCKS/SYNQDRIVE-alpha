import { MembershipRole, NotificationEventKind } from '@prisma/client';
import { NotificationSeverity, NotificationStatus } from '@prisma/client';
import {
  allowedNotificationStatusTargets,
  applyIngestOccurrenceToLifecycle,
  assertNotificationStatusTransition,
  canAdministrativeArchive,
  canTransitionNotificationStatus,
  isOrgSnoozeExpired,
  NOTIFICATION_ACTIVE_LIFECYCLE_STATUSES,
  NOTIFICATION_LIFECYCLE_STATUSES,
  NOTIFICATION_LIFECYCLE_TRANSITIONS,
  NotificationLifecycleTransitionError,
  recoveryIngestCreatesActiveNotification,
  roleMayTriggerLifecycleTransition,
  shouldWakeFromSnoozeOnEscalation,
} from './notification-lifecycle.state-machine';

const ALL_STATUSES = [...NOTIFICATION_LIFECYCLE_STATUSES];

describe('notification-lifecycle.state-machine', () => {
  describe('transition matrix — allowed', () => {
    const allowedPairs: Array<[NotificationStatus, NotificationStatus, object?]> = [
      [NotificationStatus.OPEN, NotificationStatus.ACKNOWLEDGED],
      [NotificationStatus.OPEN, NotificationStatus.SNOOZED],
      [NotificationStatus.OPEN, NotificationStatus.RESOLVED],
      [NotificationStatus.OPEN, NotificationStatus.ARCHIVED, { administrativeArchive: true }],
      [NotificationStatus.ACKNOWLEDGED, NotificationStatus.SNOOZED],
      [NotificationStatus.ACKNOWLEDGED, NotificationStatus.RESOLVED],
      [NotificationStatus.SNOOZED, NotificationStatus.OPEN],
      [NotificationStatus.SNOOZED, NotificationStatus.RESOLVED],
      [NotificationStatus.RESOLVED, NotificationStatus.OPEN, { reopenAuthorized: true }],
      [NotificationStatus.RESOLVED, NotificationStatus.ARCHIVED, { administrativeArchive: true }],
    ];

    it.each(allowedPairs)('allows %s → %s', (from, to, context = {}) => {
      expect(canTransitionNotificationStatus(from, to, context)).toBe(true);
      expect(() => assertNotificationStatusTransition(from, to, context)).not.toThrow();
    });
  });

  describe('transition matrix — forbidden', () => {
    const forbiddenPairs: Array<[NotificationStatus, NotificationStatus]> = [
      [NotificationStatus.ARCHIVED, NotificationStatus.OPEN],
      [NotificationStatus.ARCHIVED, NotificationStatus.RESOLVED],
      [NotificationStatus.ARCHIVED, NotificationStatus.ACKNOWLEDGED],
      [NotificationStatus.ARCHIVED, NotificationStatus.SNOOZED],
      [NotificationStatus.RESOLVED, NotificationStatus.SNOOZED],
      [NotificationStatus.RESOLVED, NotificationStatus.ACKNOWLEDGED],
      [NotificationStatus.RESOLVED, NotificationStatus.OPEN],
      [NotificationStatus.OPEN, NotificationStatus.ARCHIVED],
      [NotificationStatus.ACKNOWLEDGED, NotificationStatus.OPEN],
      [NotificationStatus.ACKNOWLEDGED, NotificationStatus.ARCHIVED],
      [NotificationStatus.SNOOZED, NotificationStatus.ACKNOWLEDGED],
      [NotificationStatus.SNOOZED, NotificationStatus.ARCHIVED],
    ];

    it.each(forbiddenPairs)('forbids %s → %s', (from, to) => {
      expect(canTransitionNotificationStatus(from, to)).toBe(false);
      expect(() => assertNotificationStatusTransition(from, to)).toThrow(NotificationLifecycleTransitionError);
    });
  });

  it('covers every documented transition in the catalog', () => {
    for (const spec of NOTIFICATION_LIFECYCLE_TRANSITIONS) {
      const context =
        spec.to === NotificationStatus.ARCHIVED
          ? { administrativeArchive: true }
          : spec.from === NotificationStatus.RESOLVED && spec.to === NotificationStatus.OPEN
            ? { reopenAuthorized: true }
            : {};
      expect(canTransitionNotificationStatus(spec.from, spec.to, context)).toBe(true);
    }
  });

  describe('snooze expiry', () => {
    it('detects expired org snooze', () => {
      const past = new Date('2026-07-10T10:00:00.000Z');
      const now = new Date('2026-07-11T10:00:00.000Z');
      expect(isOrgSnoozeExpired(past, now)).toBe(true);
    });

    it('wakes SNOOZED → OPEN when snooze expired on ingest', () => {
      const effect = applyIngestOccurrenceToLifecycle({
        status: NotificationStatus.SNOOZED,
        severity: NotificationSeverity.WARNING,
        snoozedUntil: new Date('2026-07-10T10:00:00.000Z'),
        incomingSeverity: NotificationSeverity.WARNING,
        referenceNow: new Date('2026-07-11T10:00:00.000Z'),
      });
      expect(effect.status).toBe(NotificationStatus.OPEN);
      expect(effect.snoozedUntil).toBeNull();
      expect(effect.snoozeExpired).toBe(true);
    });

    it('wakes SNOOZED on CRITICAL escalation', () => {
      expect(
        shouldWakeFromSnoozeOnEscalation(NotificationSeverity.WARNING, NotificationSeverity.CRITICAL),
      ).toBe(true);
      const effect = applyIngestOccurrenceToLifecycle({
        status: NotificationStatus.SNOOZED,
        severity: NotificationSeverity.WARNING,
        snoozedUntil: new Date('2026-07-12T00:00:00.000Z'),
        incomingSeverity: NotificationSeverity.CRITICAL,
        referenceNow: new Date('2026-07-11T10:00:00.000Z'),
      });
      expect(effect.status).toBe(NotificationStatus.OPEN);
      expect(effect.wakeFromSnooze).toBe(true);
    });

    it('keeps SNOOZED when severity unchanged and snooze active', () => {
      const effect = applyIngestOccurrenceToLifecycle({
        status: NotificationStatus.SNOOZED,
        severity: NotificationSeverity.WARNING,
        snoozedUntil: new Date('2026-07-12T00:00:00.000Z'),
        incomingSeverity: NotificationSeverity.WARNING,
        referenceNow: new Date('2026-07-11T10:00:00.000Z'),
      });
      expect(effect.status).toBe(NotificationStatus.SNOOZED);
      expect(effect.wakeFromSnooze).toBe(false);
    });
  });

  describe('ingest behavior rules', () => {
    it('ACKNOWLEDGED stays acknowledged on new occurrence', () => {
      const effect = applyIngestOccurrenceToLifecycle({
        status: NotificationStatus.ACKNOWLEDGED,
        severity: NotificationSeverity.WARNING,
        snoozedUntil: null,
        incomingSeverity: NotificationSeverity.CRITICAL,
        referenceNow: new Date(),
      });
      expect(effect.status).toBe(NotificationStatus.ACKNOWLEDGED);
    });

    it('recovery never creates a new active SUCCESS notification', () => {
      expect(recoveryIngestCreatesActiveNotification()).toBe(false);
    });
  });

  describe('role rules', () => {
    it('SYSTEM may resolve and reopen', () => {
      expect(
        roleMayTriggerLifecycleTransition(
          'SYSTEM',
          'INGEST_RECOVERY',
          NotificationStatus.OPEN,
          NotificationStatus.RESOLVED,
        ),
      ).toBe(true);
      expect(
        roleMayTriggerLifecycleTransition(
          'SYSTEM',
          'INGEST_REOPEN',
          NotificationStatus.RESOLVED,
          NotificationStatus.OPEN,
        ),
      ).toBe(true);
    });

    it('DRIVER may not archive', () => {
      expect(
        roleMayTriggerLifecycleTransition(
          MembershipRole.DRIVER,
          'MANUAL_ARCHIVE',
          NotificationStatus.RESOLVED,
          NotificationStatus.ARCHIVED,
        ),
      ).toBe(false);
    });

    it('ORG_ADMIN may archive resolved notifications', () => {
      expect(
        roleMayTriggerLifecycleTransition(
          MembershipRole.ORG_ADMIN,
          'MANUAL_ARCHIVE',
          NotificationStatus.RESOLVED,
          NotificationStatus.ARCHIVED,
        ),
      ).toBe(true);
    });
  });

  describe('archive guardrails', () => {
    it('blocks archive of auto-resolve STATE while still open', () => {
      expect(
        canAdministrativeArchive({
          status: NotificationStatus.OPEN,
          eventKind: NotificationEventKind.STATE,
          eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
        }),
      ).toBe(false);
    });

    it('allows archive of resolved notifications', () => {
      expect(
        canAdministrativeArchive({
          status: NotificationStatus.RESOLVED,
          eventKind: NotificationEventKind.STATE,
          eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
        }),
      ).toBe(true);
    });
  });

  it('active lifecycle statuses exclude READ', () => {
    expect(NOTIFICATION_ACTIVE_LIFECYCLE_STATUSES).toEqual([
      NotificationStatus.OPEN,
      NotificationStatus.ACKNOWLEDGED,
      NotificationStatus.SNOOZED,
    ]);
    expect(ALL_STATUSES).not.toContain('READ' as NotificationStatus);
  });

  it('lists OPEN targets without archive by default', () => {
    const targets = allowedNotificationStatusTargets(NotificationStatus.OPEN);
    expect(targets).toEqual(
      expect.arrayContaining([
        NotificationStatus.ACKNOWLEDGED,
        NotificationStatus.SNOOZED,
        NotificationStatus.RESOLVED,
      ]),
    );
    expect(targets).not.toContain(NotificationStatus.ARCHIVED);
  });
});
