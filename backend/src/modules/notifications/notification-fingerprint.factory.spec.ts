import {
  buildNotificationFingerprint,
  fingerprintPartsFromInsightDedupeKey,
  fingerprintPartsFromSemanticKey,
  parseNotificationFingerprint,
  serializeNotificationFingerprint,
  NotificationFingerprintError,
} from './notification-fingerprint.factory';
import {
  wobDrivingAssessmentFingerprint,
  wobTechnicalObservationFingerprint,
  WOB_L7503_ORG_ID,
  WOB_L7503_VEHICLE_ID,
} from './notification-fingerprint.registry';
import { NotificationEntityType } from './notification.enums';

describe('notification-fingerprint.factory', () => {
  const baseParts = {
    organizationId: 'org-1',
    eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
    entityType: NotificationEntityType.VEHICLE,
    entityId: 'veh-1',
    conditionCode: 'driving_assessment_device_quality',
    scopeVersion: 1,
  };

  it('builds stable canonical fingerprint', () => {
    const a = buildNotificationFingerprint(baseParts);
    const b = buildNotificationFingerprint(baseParts);
    expect(a.canonical).toBe(b.canonical);
    expect(a.canonical).toBe(
      'org-1|DRIVING_ASSESSMENT_DEVICE_QUALITY|VEHICLE|veh-1|driving_assessment_device_quality|v1',
    );
  });

  it('differs when entityId changes', () => {
    const a = buildNotificationFingerprint(baseParts);
    const b = buildNotificationFingerprint({ ...baseParts, entityId: 'veh-2' });
    expect(a.canonical).not.toBe(b.canonical);
  });

  it('differs when conditionCode changes', () => {
    const a = buildNotificationFingerprint(baseParts);
    const b = buildNotificationFingerprint({
      ...baseParts,
      conditionCode: 'technical_observation_active',
      eventType: 'TECHNICAL_OBSERVATION_ACTIVE',
    });
    expect(a.canonical).not.toBe(b.canonical);
  });

  it('is locale-independent — no localized text in canonical', () => {
    const fp = buildNotificationFingerprint(baseParts);
    expect(fp.canonical).not.toMatch(/Fahrbewertung|Warnung|überfällig/i);
    expect(fp.canonical).not.toMatch(/ago|vor \d+/i);
  });

  it('round-trips through parse', () => {
    const built = buildNotificationFingerprint(baseParts);
    const parsed = parseNotificationFingerprint(built.canonical);
    expect(parsed).toEqual(built.parts);
  });

  it('rejects forbidden relative-time patterns in parts', () => {
    expect(() =>
      serializeNotificationFingerprint({
        ...baseParts,
        conditionCode: 'vor 22 min',
      }),
    ).toThrow(NotificationFingerprintError);
  });

  it('maps insight dedupeKey without locale', () => {
    const parts = fingerprintPartsFromInsightDedupeKey(
      'org-1',
      'driving_assessment_device_quality:veh-wob',
    );
    expect(parts.conditionCode).toBe('driving_assessment_device_quality');
    expect(parts.entityId).toBe('veh-wob');
    expect(parts.eventType).toBe('DRIVING_ASSESSMENT_DEVICE_QUALITY');
  });

  it('maps frontend semanticKey format', () => {
    const parts = fingerprintPartsFromSemanticKey(
      'org-1',
      'vehicle:veh-1:vehicle_health:technical_observation_active',
      'TECHNICAL_OBSERVATION_ACTIVE',
    );
    expect(parts.entityType).toBe(NotificationEntityType.VEHICLE);
    expect(parts.conditionCode).toBe('technical_observation_active');
  });

  describe('WOB L 7503', () => {
    it('driving assessment and technical observation are distinct fingerprints', () => {
      const driving = wobDrivingAssessmentFingerprint();
      const observation = wobTechnicalObservationFingerprint();
      expect(driving.canonical).not.toBe(observation.canonical);
      expect(driving.parts.entityId).toBe(WOB_L7503_VEHICLE_ID);
      expect(observation.parts.entityId).toBe(WOB_L7503_VEHICLE_ID);
      expect(driving.parts.organizationId).toBe(WOB_L7503_ORG_ID);
    });

    it('same vehicle + different condition → different identity', () => {
      const driving = wobDrivingAssessmentFingerprint();
      const rebuilt = buildNotificationFingerprint({
        organizationId: WOB_L7503_ORG_ID,
        eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
        entityType: NotificationEntityType.VEHICLE,
        entityId: WOB_L7503_VEHICLE_ID,
        conditionCode: 'driving_assessment_device_quality',
        scopeVersion: 1,
      });
      expect(driving.canonical).toBe(rebuilt.canonical);
    });
  });
});
