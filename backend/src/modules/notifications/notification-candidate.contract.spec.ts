import {
  NotificationActionType,
  NotificationDomain,
  NotificationEntityType,
  NotificationEventKind,
  NotificationSeverity,
  NotificationSourceType,
} from './notification.enums';
import {
  NOTIFICATION_CANDIDATE_SCHEMA_VERSION,
  NotificationCandidateRecoveryState,
  normalizeNotificationCandidate,
  sanitizeCandidateMetadata,
} from './notification-candidate.contract';

describe('notification-candidate.contract', () => {
  it('normalizes legacy aliases into canonical contract fields', () => {
    const normalized = normalizeNotificationCandidate({
      organizationId: 'org-1',
      eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
      eventKind: NotificationEventKind.STATE,
      domain: NotificationDomain.DRIVING_ANALYSIS,
      severity: NotificationSeverity.WARNING,
      entityType: NotificationEntityType.VEHICLE,
      entityId: 'veh-1',
      conditionCode: 'driving_assessment_device_quality',
      sourceType: NotificationSourceType.DASHBOARD_INSIGHT,
      sourceRef: 'run-abc',
      occurredAt: new Date('2026-07-08T08:00:00.000Z'),
      titleKey: 'notification.title.drivingAssessmentDegraded',
      bodyKey: 'notification.body.drivingAssessmentDegraded',
      templateParams: { label: 'WOB L 7503' },
      actionType: NotificationActionType.OPEN_VEHICLE,
      actionTarget: { type: NotificationActionType.OPEN_VEHICLE, vehicleId: 'veh-1' },
      resolutionPolicy: {
        eventKind: NotificationEventKind.STATE,
        autoResolveWhenConditionClears: true,
      },
    });

    expect(normalized.schemaVersion).toBe(NOTIFICATION_CANDIDATE_SCHEMA_VERSION);
    expect(normalized.sourceSystem).toBe(NotificationSourceType.DASHBOARD_INSIGHT);
    expect(normalized.sourceEventId).toBe('run-abc');
    expect(normalized.conditionKey).toBe('driving_assessment_device_quality');
    expect(normalized.templateKey).toBe('notification.title.drivingAssessmentDegraded');
    expect(normalized.observedAt).toEqual(normalized.occurredAt);
    expect(normalized.recoveryState).toBe(NotificationCandidateRecoveryState.ACTIVE);
    expect(normalized.vehicleId).toBe('veh-1');
  });

  it('prefers legacy sourceRef override over stale sourceEventId', () => {
    const normalized = normalizeNotificationCandidate({
      organizationId: 'org-1',
      eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
      eventKind: NotificationEventKind.STATE,
      domain: NotificationDomain.DRIVING_ANALYSIS,
      severity: NotificationSeverity.WARNING,
      entityType: NotificationEntityType.VEHICLE,
      entityId: 'veh-1',
      conditionCode: 'driving_assessment_device_quality',
      sourceType: NotificationSourceType.DASHBOARD_INSIGHT,
      sourceEventId: 'stale-id',
      sourceRef: 'fresh-id',
      occurredAt: new Date('2026-07-08T08:00:00.000Z'),
      titleKey: 'notification.title.drivingAssessmentDegraded',
      bodyKey: 'notification.body.drivingAssessmentDegraded',
      templateParams: { label: 'WOB L 7503' },
      actionType: NotificationActionType.OPEN_VEHICLE,
      actionTarget: { type: NotificationActionType.OPEN_VEHICLE, vehicleId: 'veh-1' },
      resolutionPolicy: {
        eventKind: NotificationEventKind.STATE,
        autoResolveWhenConditionClears: true,
      },
    });

    expect(normalized.sourceEventId).toBe('fresh-id');
    expect(normalized.sourceRef).toBe('fresh-id');
  });

  it('rejects PII in metadata', () => {
    expect(() =>
      sanitizeCandidateMetadata({ email: 'secret@example.com' }),
    ).toThrow(/PII metadata key/);
  });

  it('rejects unknown metadata keys', () => {
    expect(() =>
      sanitizeCandidateMetadata({ arbitraryField: 'x' }),
    ).toThrow(/Unknown metadata key/);
  });
});
