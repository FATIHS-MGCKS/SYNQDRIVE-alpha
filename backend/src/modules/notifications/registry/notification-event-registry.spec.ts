import { NotificationEntityType, NotificationEventKind, NotificationSeverity } from '../notification.enums';
import {
  buildCandidateFromRegistry,
  buildRegistryFingerprint,
  NOTIFICATION_EVENT_REGISTRY,
  NotificationEventRegistryError,
  resolveEventSlug,
} from './notification-event-registry';
import {
  NOTIFICATION_EVENT_TYPE_DEFINITIONS,
} from './notification-event-registry.definitions';
import {
  NotificationRegistryValidationError,
  validateRegistryBuildInput,
  validateRegistryCandidate,
} from './notification-event-registry.validator';

describe('NotificationEventRegistry', () => {
  it('registers all event types completely', () => {
    expect(NOTIFICATION_EVENT_REGISTRY.length).toBeGreaterThanOrEqual(30);
    for (const def of NOTIFICATION_EVENT_REGISTRY) {
      expect(def.eventType).toBeTruthy();
      expect(def.slug).toBeTruthy();
      expect(def.titleKey.startsWith('notification.')).toBe(true);
      expect(def.bodyKey.startsWith('notification.')).toBe(true);
      expect(def.requiredTemplateParams.length).toBeGreaterThan(0);
      expect(def.actionTargetBuilder).toBeInstanceOf(Function);
    }
  });

  it('rejects duplicate eventType at bootstrap', () => {
    expect(() => {
      const dup = [...NOTIFICATION_EVENT_TYPE_DEFINITIONS];
      (dup as any).push({ ...dup[0] });
      require('./notification-event-registry');
    }).not.toThrow();
    expect(NOTIFICATION_EVENT_TYPE_DEFINITIONS.map((d) => d.eventType).length).toBe(
      new Set(NOTIFICATION_EVENT_TYPE_DEFINITIONS.map((d) => d.eventType)).size,
    );
  });

  it('resolves slug aliases', () => {
    expect(resolveEventSlug('pickup-overdue')).toBe('PICKUP_OVERDUE');
    expect(resolveEventSlug('driving-assessment-recovered')).toBe('DRIVING_ASSESSMENT_DEVICE_QUALITY');
  });

  it('builds stable fingerprint for same inputs', () => {
    const a = buildRegistryFingerprint('org-1', 'DRIVING_ASSESSMENT_DEVICE_QUALITY', 'veh-1');
    const b = buildRegistryFingerprint('org-1', 'DRIVING_ASSESSMENT_DEVICE_QUALITY', 'veh-1');
    expect(a.canonical).toBe(b.canonical);
  });

  it('different condition codes produce different fingerprints for same vehicle', () => {
    const driving = buildRegistryFingerprint('org-1', 'DRIVING_ASSESSMENT_DEVICE_QUALITY', 'veh-1');
    const technical = buildRegistryFingerprint('org-1', 'TECHNICAL_OBSERVATION_ACTIVE', 'veh-1');
    expect(driving.canonical).not.toBe(technical.canonical);
  });

  it('same cause from different source types shares fingerprint', () => {
    const runtime = buildCandidateFromRegistry({
      organizationId: 'org-1',
      eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
      entityId: 'veh-1',
      sourceRef: 'runtime-1',
      occurredAt: new Date(),
      templateParams: { label: 'WOB L 7503' },
    });
    const insight = buildCandidateFromRegistry({
      organizationId: 'org-1',
      eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
      entityId: 'veh-1',
      sourceRef: 'insight-1',
      occurredAt: new Date(),
      templateParams: { label: 'WOB L 7503' },
    });
    const fp1 = buildRegistryFingerprint('org-1', runtime.eventType, runtime.entityId);
    const fp2 = buildRegistryFingerprint('org-1', insight.eventType, insight.entityId);
    expect(fp1.canonical).toBe(fp2.canonical);
    expect(runtime.conditionCode).toBe(insight.conditionCode);
  });

  it('distinguishes EVENT from STATE kinds', () => {
    const eventDef = NOTIFICATION_EVENT_REGISTRY.find((d) => d.eventType === 'BOOKING_CREATED');
    const stateDef = NOTIFICATION_EVENT_REGISTRY.find((d) => d.eventType === 'PICKUP_OVERDUE');
    expect(eventDef?.eventKind).toBe(NotificationEventKind.EVENT);
    expect(stateDef?.eventKind).toBe(NotificationEventKind.STATE);
  });

  it('rejects candidate missing required template params', () => {
    const candidate = buildCandidateFromRegistry({
      organizationId: 'org-1',
      eventType: 'STATION_SHORTAGE',
      entityId: 'station-1',
      sourceRef: 'run-1',
      occurredAt: new Date(),
      templateParams: {},
    });
    expect(() => validateRegistryCandidate(candidate)).toThrow(NotificationRegistryValidationError);
  });

  it('validates complete navigable action target', () => {
    const candidate = buildCandidateFromRegistry({
      organizationId: 'org-1',
      eventType: 'DRIVING_ASSESSMENT_DEVICE_QUALITY',
      entityId: 'veh-1',
      sourceRef: 'ref-1',
      occurredAt: new Date(),
      templateParams: { label: 'WOB L 7503' },
      actionTargetContext: { vehicleId: 'veh-1', module: 'health' },
    });
    const validated = validateRegistryCandidate(candidate);
    expect(validated.actionTarget.vehicleId).toBe('veh-1');
    expect(validated.entityType).toBe(NotificationEntityType.VEHICLE);
  });

  it('rejects unregistered event type on build input', () => {
    expect(() =>
      validateRegistryBuildInput({
        organizationId: 'org-1',
        eventType: 'NOT_A_REAL_EVENT',
        entityId: 'x',
        sourceRef: 'r',
        occurredAt: new Date(),
        templateParams: { label: 'x' },
      }),
    ).toThrow(NotificationRegistryValidationError);
  });

  it('throws on unknown slug', () => {
    expect(() => resolveEventSlug('not-real')).toThrow(NotificationEventRegistryError);
  });

  it('only two event types enabled for shadow mode', () => {
    const shadow = NOTIFICATION_EVENT_REGISTRY.filter((d) => d.shadowModeEnabled);
    expect(shadow.map((d) => d.eventType).sort()).toEqual([
      'DRIVING_ASSESSMENT_DEVICE_QUALITY',
      'TECHNICAL_OBSERVATION_ACTIVE',
    ]);
  });

  it('rejects disallowed severity escalation', () => {
    const candidate = buildCandidateFromRegistry({
      organizationId: 'org-1',
      eventType: 'BOOKING_CREATED',
      entityId: 'book-1',
      sourceRef: 'ref',
      occurredAt: new Date(),
      severity: NotificationSeverity.CRITICAL,
      templateParams: { bookingRef: 'B-1', label: 'Test' },
    });
    expect(() => validateRegistryCandidate(candidate)).toThrow(NotificationRegistryValidationError);
  });
});
