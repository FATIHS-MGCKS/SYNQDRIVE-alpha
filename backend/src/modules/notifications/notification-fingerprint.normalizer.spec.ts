import { NotificationEntityType } from './notification.enums';
import {
  FINGERPRINT_DELIMITER,
  FINGERPRINT_FIELD_ORDER,
  FINGERPRINT_HASH_ALGORITHM,
  NotificationFingerprintNormalizationError,
  normalizeConditionKey,
  normalizeEntityId,
  normalizeEventType,
  normalizeFingerprintIdentity,
  normalizeFingerprintSchemaVersion,
  normalizeOrganizationId,
  normalizeUnicode,
  serializeFingerprintIdentity,
} from './notification-fingerprint.normalizer';
import { hashFingerprintCanonical } from './notification-fingerprint.factory';

describe('notification-fingerprint.normalizer', () => {
  const baseInput = {
    organizationId: 'org-1',
    eventType: 'driving_assessment_device_quality',
    entityType: NotificationEntityType.VEHICLE,
    entityId: 'veh-1',
    conditionKey: 'driving_assessment_device_quality',
    schemaVersion: 1,
  };

  describe('normalizeUnicode', () => {
    it('trims surrounding whitespace', () => {
      expect(normalizeUnicode('  org-1  ')).toBe('org-1');
    });

    it('applies NFC normalization for composed vs decomposed unicode', () => {
      const composed = 'café';
      const decomposed = 'café'.normalize('NFD');
      expect(normalizeUnicode(decomposed)).toBe(normalizeUnicode(composed));
    });
  });

  describe('normalizeOrganizationId', () => {
    it('rejects null and empty string', () => {
      expect(() => normalizeOrganizationId('')).toThrow(NotificationFingerprintNormalizationError);
      expect(() => normalizeOrganizationId('   ')).toThrow(NotificationFingerprintNormalizationError);
    });
  });

  describe('normalizeEventType', () => {
    it('uppercases event type', () => {
      expect(normalizeEventType('active_dtc')).toBe('ACTIVE_DTC');
    });

    it('rejects whitespace in event type', () => {
      expect(() => normalizeEventType('ACTIVE DTC')).toThrow(NotificationFingerprintNormalizationError);
    });
  });

  describe('normalizeEntityId', () => {
    it('lowercases UUID entity ids', () => {
      const upper = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
      expect(normalizeEntityId(upper)).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    it('preserves non-uuid opaque ids with trim only', () => {
      expect(normalizeEntityId('  veh-wob-l-7503  ')).toBe('veh-wob-l-7503');
    });
  });

  describe('normalizeConditionKey', () => {
    it('lowercases base condition key', () => {
      expect(normalizeConditionKey('ACTIVE_DTC')).toBe('active_dtc');
    });

    it('preserves variant casing after colon', () => {
      expect(normalizeConditionKey('active_dtc:P0420')).toBe('active_dtc:P0420');
    });

    it('rejects empty variant', () => {
      expect(() => normalizeConditionKey('active_dtc:')).toThrow(
        NotificationFingerprintNormalizationError,
      );
    });
  });

  describe('normalizeFingerprintSchemaVersion', () => {
    it('defaults null/undefined to 1', () => {
      expect(normalizeFingerprintSchemaVersion(undefined)).toBe(1);
      expect(normalizeFingerprintSchemaVersion(null)).toBe(1);
    });

    it('rejects non-positive versions', () => {
      expect(() => normalizeFingerprintSchemaVersion(0)).toThrow(
        NotificationFingerprintNormalizationError,
      );
    });
  });

  describe('normalizeFingerprintIdentity', () => {
    it('uses fixed field order in serialization', () => {
      const identity = normalizeFingerprintIdentity(baseInput);
      const serialized = serializeFingerprintIdentity(identity);
      const segments = serialized.split(FINGERPRINT_DELIMITER);
      expect(segments).toHaveLength(FINGERPRINT_FIELD_ORDER.length);
      expect(segments[0]).toBe('org-1');
      expect(segments[1]).toBe('DRIVING_ASSESSMENT_DEVICE_QUALITY');
      expect(segments[2]).toBe('VEHICLE');
      expect(segments[3]).toBe('veh-1');
      expect(segments[4]).toBe('driving_assessment_device_quality');
      expect(segments[5]).toBe('v1');
    });

    it('accepts legacy conditionCode alias', () => {
      const identity = normalizeFingerprintIdentity({
        ...baseInput,
        conditionKey: undefined,
        conditionCode: 'technical_observation_active',
      });
      expect(identity.conditionKey).toBe('technical_observation_active');
    });

    it('accepts legacy scopeVersion alias', () => {
      const identity = normalizeFingerprintIdentity({
        ...baseInput,
        schemaVersion: undefined,
        scopeVersion: 2,
      });
      expect(identity.schemaVersion).toBe(2);
    });

    it('rejects delimiter in identity parts', () => {
      expect(() =>
        normalizeFingerprintIdentity({
          ...baseInput,
          entityId: 'veh|bad',
        }),
      ).toThrow(NotificationFingerprintNormalizationError);
    });

    it('rejects forbidden route patterns', () => {
      expect(() =>
        normalizeFingerprintIdentity({
          ...baseInput,
          conditionKey: '/dashboard/vehicles/123',
        }),
      ).toThrow(NotificationFingerprintNormalizationError);
    });

    it('rejects i18n key patterns in identity fields', () => {
      expect(() =>
        normalizeFingerprintIdentity({
          ...baseInput,
          eventType: 'notification.title.drivingAssessment',
        }),
      ).toThrow(NotificationFingerprintNormalizationError);
    });
  });

  describe('digest stability', () => {
    it(`uses ${FINGERPRINT_HASH_ALGORITHM} over canonical serialization`, () => {
      const identity = normalizeFingerprintIdentity(baseInput);
      const canonical = serializeFingerprintIdentity(identity);
      const digest = hashFingerprintCanonical(canonical);
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
      expect(hashFingerprintCanonical(canonical)).toBe(digest);
    });
  });
});
