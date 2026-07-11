import { DrivingAssessmentNotificationAdapter } from './driving-assessment-notification.adapter';
import { TechnicalObservationNotificationAdapter } from './technical-observation-notification.adapter';

describe('Notification shadow adapters', () => {
  const driving = new DrivingAssessmentNotificationAdapter();
  const technical = new TechnicalObservationNotificationAdapter();
  const ctx = {
    organizationId: 'org-1',
    sourceRef: 'run-1',
    occurredAt: new Date('2026-07-11T10:00:00.000Z'),
    runId: 'run-1',
  };

  it('driving assessment adapter builds registry-valid candidate', () => {
    const candidate = driving.toCandidate(
      { vehicleId: 'veh-1', label: 'WOB L 7503', degraded: true, sourceRef: 'dq-1' },
      ctx,
    );
    expect(candidate?.eventType).toBe('DRIVING_ASSESSMENT_DEVICE_QUALITY');
    expect(candidate?.titleKey).toBe('notification.title.drivingAssessmentDegraded');
    expect(candidate?.templateParams.label).toBe('WOB L 7503');
  });

  it('technical observation adapter builds registry-valid candidate', () => {
    const candidate = technical.toCandidate(
      { vehicleId: 'veh-1', label: 'WOB L 7503', complaintId: 'cmp-1' },
      ctx,
    );
    expect(candidate?.eventType).toBe('TECHNICAL_OBSERVATION_ACTIVE');
    expect(candidate?.conditionCode).toBe('technical_observation_active:cmp-1');
    expect(candidate?.actionTarget.module).toBe('complaints');
  });

  it('adapters declare shadowModeOnly', () => {
    expect(driving.shadowModeOnly).toBe(true);
    expect(technical.shadowModeOnly).toBe(true);
  });
});
