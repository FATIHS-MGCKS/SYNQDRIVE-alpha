import { InsightEntityScope, InsightSeverity, InsightType } from '@prisma/client';
import type { InsightCandidate } from '../business-insights/insight.types';
import {
  NotificationActionType,
  NotificationDomain,
  NotificationEntityType,
  NotificationEventKind,
  NotificationSeverity,
  NotificationSourceType,
} from './notification.enums';
import {
  fingerprintFromCandidate,
  NotificationCandidateValidationError,
  validateNotificationCandidate,
} from './notification-candidate.validator';
import { notificationCandidateFromInsight } from './insight-candidate.mapper';

function validCandidate() {
  return {
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
    bodyKey: 'notification.body.insightDefault',
    templateParams: { label: 'WOB L 7503', plate: 'WOB L 7503' },
    actionType: NotificationActionType.OPEN_VEHICLE,
    actionTarget: { type: NotificationActionType.OPEN_VEHICLE, vehicleId: 'veh-1' },
    resolutionPolicy: {
      eventKind: NotificationEventKind.STATE,
      autoResolveWhenConditionClears: true,
    },
  };
}

describe('notification-candidate.validator', () => {
  it('validates a complete candidate', () => {
    const result = validateNotificationCandidate(validCandidate());
    expect(result.organizationId).toBe('org-1');
    expect(result.scopeVersion).toBe(1);
  });

  it('rejects missing organizationId', () => {
    expect(() =>
      validateNotificationCandidate({ ...validCandidate(), organizationId: '' }),
    ).toThrow(NotificationCandidateValidationError);
  });

  it('rejects non-i18n titleKey', () => {
    expect(() =>
      validateNotificationCandidate({ ...validCandidate(), titleKey: 'Fahrbewertung eingeschränkt' }),
    ).toThrow(NotificationCandidateValidationError);
  });

  it('builds fingerprint from candidate independent of templateParams locale', () => {
    const de = fingerprintFromCandidate(validCandidate());
    const en = fingerprintFromCandidate({
      ...validCandidate(),
      templateParams: { label: 'WOB L 7503', plate: 'WOB L 7503' },
      titleKey: 'notification.title.drivingAssessmentDegraded',
    });
    expect(de.canonical).toBe(en.canonical);
  });
});

describe('insight-candidate.mapper', () => {
  const insight: InsightCandidate = {
    type: InsightType.DRIVING_ASSESSMENT_DEVICE_QUALITY,
    severity: InsightSeverity.WARNING,
    priority: 55,
    title: 'Fahrbewertung eingeschränkt — WOB L 7503',
    message: 'LTE noise',
    actionLabel: 'Fahrzeug öffnen',
    actionType: 'OPEN_VEHICLE',
    entityScope: InsightEntityScope.VEHICLE,
    entityIds: ['veh-wob-l-7503'],
    metrics: { vehicleStatus: 'DEGRADED', degradedSince: '2026-07-08T08:00:00.000Z' },
    reasons: ['event density'],
    confidence: 0.9,
    dedupeKey: 'driving_assessment_device_quality:veh-wob-l-7503',
  };

  it('maps insight to candidate with i18n keys not insight title', () => {
    const candidate = notificationCandidateFromInsight(insight, {
      organizationId: 'org-wob',
      sourceRef: 'insight-1',
      occurredAt: new Date('2026-07-10T11:32:00.000Z'),
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.titleKey).toBe('notification.title.drivingAssessmentDegraded');
    expect(candidate!.titleKey).not.toContain('Fahrbewertung');
    expect(candidate!.severity).toBe(NotificationSeverity.WARNING);
  });

  it('maps RECOVERING insight to SUCCESS severity', () => {
    const recovering = notificationCandidateFromInsight(
      {
        ...insight,
        severity: InsightSeverity.INFO,
        metrics: { vehicleStatus: 'RECOVERING' },
      },
      {
        organizationId: 'org-wob',
        sourceRef: 'insight-2',
        occurredAt: new Date('2026-07-10T12:00:00.000Z'),
      },
    );
    expect(recovering!.severity).toBe(NotificationSeverity.SUCCESS);
    expect(recovering!.titleKey).toBe('notification.title.drivingAssessmentRecovering');
  });

  it('produces same fingerprint family as dedupeKey for same vehicle condition', () => {
    const candidate = notificationCandidateFromInsight(insight, {
      organizationId: 'org-wob',
      sourceRef: 'insight-1',
      occurredAt: new Date('2026-07-10T11:32:00.000Z'),
    })!;
    const fp = fingerprintFromCandidate(candidate);
    expect(fp.parts.conditionCode).toBe('driving_assessment_device_quality');
    expect(fp.parts.entityId).toBe('veh-wob-l-7503');
  });
});
