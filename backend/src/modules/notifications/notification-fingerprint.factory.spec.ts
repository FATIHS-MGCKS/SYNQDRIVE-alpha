import {
  buildNotificationFingerprint,
  fingerprintPartsFromInsightDedupeKey,
  fingerprintPartsFromSemanticKey,
  hashFingerprintCanonical,
  parseNotificationFingerprint,
  serializeNotificationFingerprint,
  NotificationFingerprintError,
} from './notification-fingerprint.factory';
import { NotificationFingerprintNormalizationError } from './notification-fingerprint.normalizer';
import {
  wobDrivingAssessmentFingerprint,
  wobTechnicalObservationFingerprint,
  WOB_L7503_ORG_ID,
  WOB_L7503_VEHICLE_ID,
} from './notification-fingerprint.registry';
import { NotificationEntityType, NotificationSeverity } from './notification.enums';
import type { NotificationCandidate } from './notification.types';
import { fingerprintFromCandidate } from './notification-candidate.validator';
import { buildCandidateFromRegistry } from './registry/notification-event-registry';

describe('notification-fingerprint.factory', () => {
  const baseParts = {
    organizationId: 'org-1',
    eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
    entityType: NotificationEntityType.VEHICLE,
    entityId: 'veh-1',
    conditionCode: 'driving_assessment_device_quality',
    scopeVersion: 1,
  };

  it('builds stable canonical fingerprint and digest for identical inputs', () => {
    const a = buildNotificationFingerprint(baseParts);
    const b = buildNotificationFingerprint(baseParts);
    expect(a.canonical).toBe(b.canonical);
    expect(a.digest).toBe(b.digest);
    expect(a.canonical).toBe(
      'org-1|DRIVING_ASSESSMENT_DEVICE_QUALITY|VEHICLE|veh-1|driving_assessment_device_quality|v1',
    );
    expect(a.digest).toBe(hashFingerprintCanonical(a.canonical));
  });

  it('differs when organizationId changes', () => {
    const a = buildNotificationFingerprint(baseParts);
    const b = buildNotificationFingerprint({ ...baseParts, organizationId: 'org-2' });
    expect(a.canonical).not.toBe(b.canonical);
    expect(a.digest).not.toBe(b.digest);
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

  it('differs when schemaVersion changes', () => {
    const v1 = buildNotificationFingerprint(baseParts);
    const v2 = buildNotificationFingerprint({ ...baseParts, schemaVersion: 2, scopeVersion: 2 });
    expect(v1.canonical).not.toBe(v2.canonical);
    expect(v2.canonical.endsWith('|v2')).toBe(true);
  });

  it('is insensitive to eventType casing and surrounding whitespace', () => {
    const upper = buildNotificationFingerprint(baseParts);
    const messy = buildNotificationFingerprint({
      ...baseParts,
      eventType: '  driving_assessment_device_quality  ',
    });
    expect(upper.canonical).toBe(messy.canonical);
  });

  it('normalizes UUID entityId to lowercase', () => {
    const uuid = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
    const fp = buildNotificationFingerprint({
      ...baseParts,
      entityId: uuid,
    });
    expect(fp.parts.entityId).toBe(uuid.toLowerCase());
    expect(fp.canonical).toContain(uuid.toLowerCase());
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
    ).toThrow(NotificationFingerprintNormalizationError);
  });

  it('rejects empty organizationId', () => {
    expect(() =>
      buildNotificationFingerprint({
        ...baseParts,
        organizationId: '',
      }),
    ).toThrow(NotificationFingerprintNormalizationError);
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

  it('throws on invalid canonical segment count', () => {
    expect(() => parseNotificationFingerprint('a|b|c')).toThrow(NotificationFingerprintError);
  });

  describe('candidate identity isolation', () => {
    const candidate = (): NotificationCandidate =>
      buildCandidateFromRegistry({
        organizationId: 'org-1',
        eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
        entityId: 'veh-1',
        sourceEventId: 'evt-1',
        sourceRef: 'evt-1',
        occurredAt: new Date('2026-07-10T11:32:00.000Z'),
        templateParams: { plate: 'WOB L 7503', label: 'WOB L 7503' },
      });

    it('severity change does not alter fingerprint', () => {
      const warning = fingerprintFromCandidate(candidate());
      const critical = fingerprintFromCandidate({
        ...candidate(),
        severity: NotificationSeverity.CRITICAL,
      });
      expect(warning.canonical).toBe(critical.canonical);
    });

    it('title/body/template text changes do not alter fingerprint', () => {
      const base = fingerprintFromCandidate(candidate());
      const localized = fingerprintFromCandidate({
        ...candidate(),
        titleKey: 'notification.title.drivingAssessmentDegraded',
        bodyKey: 'notification.body.drivingAssessmentDegraded',
        templateParams: { plate: 'Localized plate text', label: 'Localized plate text' },
      });
      expect(base.canonical).toBe(localized.canonical);
    });

    it('occurredAt change does not alter fingerprint', () => {
      const a = fingerprintFromCandidate(candidate());
      const b = fingerprintFromCandidate({
        ...candidate(),
        occurredAt: new Date('2027-01-01T00:00:00.000Z'),
        observedAt: new Date('2027-01-01T00:00:01.000Z'),
      });
      expect(a.canonical).toBe(b.canonical);
    });
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
