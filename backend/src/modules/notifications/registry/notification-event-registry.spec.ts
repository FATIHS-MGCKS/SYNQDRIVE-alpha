import { NotificationEntityType, NotificationEventKind, NotificationSeverity } from '../notification.enums';
import {
  buildCandidateFromRegistry,
  buildRegistryFingerprint,
  getNotificationAttentionScope,
  getNotificationDefinitionsByAttentionScope,
  getNotificationEventTypesByAttentionScope,
  isNotificationAttentionScope,
  NOTIFICATION_EVENT_REGISTRY,
  NotificationEventRegistryError,
  requireEventTypeDefinition,
  requireNotificationAttentionScope,
  resolveEventSlug,
} from './notification-event-registry';
import {
  NOTIFICATION_EVENT_TYPE_DEFINITIONS,
} from './notification-event-registry.definitions';
import { NOTIFICATION_ATTENTION_SCOPES } from './notification-event-registry.types';
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

  it('two event types enabled for shadow mode (phase 1 producers)', () => {
    const shadow = NOTIFICATION_EVENT_REGISTRY.filter((d) => d.shadowModeEnabled);
    expect(shadow.map((d) => d.eventType).sort()).toEqual([
      'DRIVING_ASSESSMENT_DEVICE_QUALITY',
      'STATION_SHORTAGE',
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

  describe('attentionScope', () => {
    const FLEET_READINESS_EVENT_TYPES = [
      'ACTIVE_DTC',
      'AUTHORIZATION_REQUIRED',
      'BATTERY_CRITICAL',
      'BLOCKED_VEHICLE',
      'BOKRAFT_OVERDUE',
      'BRAKE_CRITICAL',
      'COMPLIANCE_EXPIRED',
      'CONNECTIVITY_STATE_UNKNOWN',
      'DATA_COVERAGE_INSUFFICIENT',
      'DATA_SOURCE_DISCONNECTED',
      'DEVICE_BINDING_CHANGED',
      'DEVICE_RECONNECTED',
      'DEVICE_UNPLUGGED',
      'HM_SERVICE_NO_TRACKING',
      'MAINTENANCE_REQUIRED',
      'SERVICE_OVERDUE',
      'SERVICE_WINDOW',
      'TECHNICAL_OBSERVATION_ACTIVE',
      'TELEMETRY_OFFLINE',
      'TELEMETRY_SOFT_OFFLINE',
      'TIRE_CRITICAL',
      'TUV_OVERDUE',
      'VEHICLE_NOT_READY',
      'VEHICLE_READINESS_UNEVALUABLE',
      'VEHICLE_DAMAGE_BLOCKING',
      'LIMP_MODE_ACTIVE',
      'ENGINE_OIL_LEVEL_LOW',
      'ENGINE_OIL_LEVEL_HIGH',
    ] as const;

    it('assigns a valid attentionScope to every registered event type', () => {
      for (const def of NOTIFICATION_EVENT_REGISTRY) {
        expect(NOTIFICATION_ATTENTION_SCOPES).toContain(def.attentionScope);
      }
    });

    it('assigns exactly one attentionScope per event type', () => {
      const scopesByEventType = new Map(
        NOTIFICATION_EVENT_REGISTRY.map((def) => [def.eventType, def.attentionScope]),
      );
      expect(scopesByEventType.size).toBe(NOTIFICATION_EVENT_REGISTRY.length);
      for (const def of NOTIFICATION_EVENT_REGISTRY) {
        expect(scopesByEventType.get(def.eventType)).toBe(def.attentionScope);
      }
    });

    it('partitions all registered events into OPERATIONS and FLEET_READINESS', () => {
      const operations = getNotificationEventTypesByAttentionScope('OPERATIONS');
      const fleet = getNotificationEventTypesByAttentionScope('FLEET_READINESS');
      expect(operations.length + fleet.length).toBe(NOTIFICATION_EVENT_REGISTRY.length);
      expect(new Set([...operations, ...fleet]).size).toBe(NOTIFICATION_EVENT_REGISTRY.length);
    });

    it('returns only FLEET_READINESS event types for fleet lookup', () => {
      const fleet = getNotificationEventTypesByAttentionScope('FLEET_READINESS').sort();
      expect(fleet).toEqual([...FLEET_READINESS_EVENT_TYPES].sort());
      for (const eventType of fleet) {
        expect(requireNotificationAttentionScope(eventType)).toBe('FLEET_READINESS');
      }
    });

    it('returns the OPERATIONS complement for operations lookup', () => {
      const operations = new Set(getNotificationEventTypesByAttentionScope('OPERATIONS'));
      for (const eventType of FLEET_READINESS_EVENT_TYPES) {
        expect(operations.has(eventType)).toBe(false);
      }
      for (const def of NOTIFICATION_EVENT_REGISTRY) {
        if (!FLEET_READINESS_EVENT_TYPES.includes(def.eventType as (typeof FLEET_READINESS_EVENT_TYPES)[number])) {
          expect(operations.has(def.eventType)).toBe(true);
        }
      }
    });

    it('exposes definition lookup by attention scope', () => {
      const fleetDefs = getNotificationDefinitionsByAttentionScope('FLEET_READINESS');
      expect(fleetDefs.every((def) => def.attentionScope === 'FLEET_READINESS')).toBe(true);
      expect(fleetDefs.map((def) => def.eventType).sort()).toEqual(
        [...FLEET_READINESS_EVENT_TYPES].sort(),
      );
    });

    it('looks up attention scope for a single event type', () => {
      expect(getNotificationAttentionScope('VEHICLE_NOT_READY')).toBe('FLEET_READINESS');
      expect(getNotificationAttentionScope('LOW_UTILIZATION')).toBe('OPERATIONS');
      expect(getNotificationAttentionScope('NOT_A_REAL_EVENT')).toBeUndefined();
      expect(() => requireNotificationAttentionScope('NOT_A_REAL_EVENT')).toThrow(
        NotificationEventRegistryError,
      );
    });

    it('validates attention scope literals', () => {
      expect(isNotificationAttentionScope('OPERATIONS')).toBe(true);
      expect(isNotificationAttentionScope('FLEET_READINESS')).toBe(true);
      expect(isNotificationAttentionScope('UNKNOWN')).toBe(false);
    });

    it('keeps registry bootstrap deterministic across repeated lookups', () => {
      const first = getNotificationEventTypesByAttentionScope('FLEET_READINESS');
      const second = getNotificationEventTypesByAttentionScope('FLEET_READINESS');
      expect(first).toEqual(second);
    });

    const GOLDEN_FINGERPRINT_ORG_ID = 'org-golden';
    const GOLDEN_VEHICLE_ENTITY_ID = 'veh-golden-1';
    const GOLDEN_ORG_ENTITY_ID = 'org-golden';

    const FINGERPRINT_GOLDEN_BASELINES: ReadonlyArray<{
      eventType: string;
      entityId: string;
      canonical: string;
      attentionScope: 'OPERATIONS' | 'FLEET_READINESS';
    }> = [
      {
        eventType: 'VEHICLE_NOT_READY',
        entityId: GOLDEN_VEHICLE_ENTITY_ID,
        canonical: 'org-golden|VEHICLE_NOT_READY|VEHICLE|veh-golden-1|vehicle_not_ready|v1',
        attentionScope: 'FLEET_READINESS',
      },
      {
        eventType: 'BLOCKED_VEHICLE',
        entityId: GOLDEN_VEHICLE_ENTITY_ID,
        canonical: 'org-golden|BLOCKED_VEHICLE|VEHICLE|veh-golden-1|blocked_vehicle|v1',
        attentionScope: 'FLEET_READINESS',
      },
      {
        eventType: 'ACTIVE_DTC',
        entityId: GOLDEN_VEHICLE_ENTITY_ID,
        canonical: 'org-golden|ACTIVE_DTC|VEHICLE|veh-golden-1|active_dtc|v1',
        attentionScope: 'FLEET_READINESS',
      },
      {
        eventType: 'LIMP_MODE_ACTIVE',
        entityId: GOLDEN_VEHICLE_ENTITY_ID,
        canonical: 'org-golden|LIMP_MODE_ACTIVE|VEHICLE|veh-golden-1|limp_mode_active|v1',
        attentionScope: 'FLEET_READINESS',
      },
      {
        eventType: 'ENGINE_OIL_LEVEL_LOW',
        entityId: GOLDEN_VEHICLE_ENTITY_ID,
        canonical:
          'org-golden|ENGINE_OIL_LEVEL_LOW|VEHICLE|veh-golden-1|engine_oil_level_low|v1',
        attentionScope: 'FLEET_READINESS',
      },
      {
        eventType: 'ENGINE_OIL_LEVEL_HIGH',
        entityId: GOLDEN_VEHICLE_ENTITY_ID,
        canonical:
          'org-golden|ENGINE_OIL_LEVEL_HIGH|VEHICLE|veh-golden-1|engine_oil_level_high|v1',
        attentionScope: 'FLEET_READINESS',
      },
      {
        eventType: 'TELEMETRY_OFFLINE',
        entityId: GOLDEN_VEHICLE_ENTITY_ID,
        canonical: 'org-golden|TELEMETRY_OFFLINE|VEHICLE|veh-golden-1|telemetry_offline|v1',
        attentionScope: 'FLEET_READINESS',
      },
      {
        eventType: 'LOW_UTILIZATION',
        entityId: GOLDEN_VEHICLE_ENTITY_ID,
        canonical: 'org-golden|LOW_UTILIZATION|VEHICLE|veh-golden-1|low_utilization|v1',
        attentionScope: 'OPERATIONS',
      },
      {
        eventType: 'INTEGRATION_DISCONNECTED',
        entityId: GOLDEN_ORG_ENTITY_ID,
        canonical:
          'org-golden|INTEGRATION_DISCONNECTED|ORGANIZATION|org-golden|integration_disconnected|v1',
        attentionScope: 'OPERATIONS',
      },
    ];

    it('matches stable golden fingerprint baselines and excludes attentionScope from canonical output', () => {
      for (const baseline of FINGERPRINT_GOLDEN_BASELINES) {
        const def = requireEventTypeDefinition(baseline.eventType);
        expect(def.attentionScope).toBe(baseline.attentionScope);

        const fingerprint = buildRegistryFingerprint(
          GOLDEN_FINGERPRINT_ORG_ID,
          baseline.eventType,
          baseline.entityId,
          def.defaultEntityType,
        );

        expect(fingerprint.canonical).toBe(baseline.canonical);
        expect(fingerprint.canonical).not.toContain('FLEET_READINESS');
        expect(fingerprint.canonical).not.toContain('OPERATIONS');
        expect(fingerprint.canonical).not.toContain('attentionScope');
      }
    });

    it('matches golden fingerprint for per-damage VEHICLE_DAMAGE_BLOCKING variant', () => {
      const { vehicleDamageBlockingSourceFingerprint } = require('../adapters/vehicle-damage-notification.projector');
      expect(
        vehicleDamageBlockingSourceFingerprint(GOLDEN_FINGERPRINT_ORG_ID, {
          vehicleId: GOLDEN_VEHICLE_ENTITY_ID,
          damageId: 'dmg-golden-1',
        }),
      ).toBe(
        'org-golden|VEHICLE_DAMAGE_BLOCKING|VEHICLE|veh-golden-1|vehicle_damage_blocking:dmg-golden-1|v1',
      );
    });

    it('covers explicit boundary cases', () => {
      expect(requireNotificationAttentionScope('VEHICLE_NOT_READY')).toBe('FLEET_READINESS');
      expect(requireNotificationAttentionScope('BLOCKED_VEHICLE')).toBe('FLEET_READINESS');
      expect(requireNotificationAttentionScope('ACTIVE_DTC')).toBe('FLEET_READINESS');
      expect(requireNotificationAttentionScope('LOW_UTILIZATION')).toBe('OPERATIONS');
      expect(requireNotificationAttentionScope('SERVICE_BEFORE_BOOKING')).toBe('OPERATIONS');
      expect(requireNotificationAttentionScope('INTEGRATION_DISCONNECTED')).toBe('OPERATIONS');
    });

    it('does not include attentionScope in candidate output', () => {
      const candidate = buildCandidateFromRegistry({
        organizationId: 'org-1',
        eventType: 'BLOCKED_VEHICLE',
        entityId: 'veh-1',
        sourceRef: 'ref',
        occurredAt: new Date(),
        templateParams: { label: 'WOB L 7503' },
      });
      expect(candidate).not.toHaveProperty('attentionScope');
    });

    it('VEHICLE_NOT_READY producerModule reflects OPERATIONS domain taxonomy (fingerprint unchanged)', () => {
      const def = requireEventTypeDefinition('VEHICLE_NOT_READY');
      expect(def.producerModule).toBe('operations');
      expect(def.conditionCode).toBe('vehicle_not_ready');
      expect(def.fingerprintVersion).toBe(1);
      expect(buildRegistryFingerprint('org-golden', 'VEHICLE_NOT_READY', 'veh-golden-1').canonical).toBe(
        'org-golden|VEHICLE_NOT_READY|VEHICLE|veh-golden-1|vehicle_not_ready|v1',
      );
    });
  });
});
