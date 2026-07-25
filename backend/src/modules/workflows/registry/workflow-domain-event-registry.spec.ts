import {
  WORKFLOW_DOMAIN_EVENT_DEFINITIONS,
  WORKFLOW_DOMAIN_EVENT_REGISTRY,
  WORKFLOW_LEGACY_EVENT_ADAPTERS,
  adaptLegacyWorkflowEvent,
  getSupportedEventVersions,
  listWorkflowEventTypes,
  resolveCanonicalEventType,
  resolveEventVersion,
  WorkflowDomainEventRegistryError,
} from './workflow-domain-event-registry';
import {
  validateAndNormalizeWorkflowEvent,
  validateWorkflowEventPayload,
  WorkflowDomainEventValidationError,
} from './workflow-domain-event-registry.validator';

describe('WorkflowDomainEventRegistry', () => {
  const REQUIRED_MINIMUM_EVENTS = [
    'booking.created',
    'booking.confirmed',
    'booking.pickup_due',
    'booking.pickup_overdue',
    'booking.picked_up',
    'booking.return_due',
    'booking.return_overdue',
    'booking.returned',
    'booking.cancelled',
    'vehicle.health.warning',
    'vehicle.health.critical',
    'vehicle.dtc.detected',
    'vehicle.telemetry.soft_offline',
    'vehicle.telemetry.offline',
    'vehicle.geofence.entered',
    'vehicle.geofence.exited',
    'invoice.created',
    'invoice.due',
    'invoice.overdue',
    'payment.failed',
    'customer.document.expiring',
    'customer.verification.failed',
    'damage.reported',
    'service.due',
    'task.overdue',
  ];

  it('registers all minimum required events', () => {
    const registered = new Set(listWorkflowEventTypes());
    for (const eventType of REQUIRED_MINIMUM_EVENTS) {
      expect(registered.has(eventType)).toBe(true);
    }
  });

  it('registers complete definitions for every event type', () => {
    expect(WORKFLOW_DOMAIN_EVENT_REGISTRY.length).toBe(WORKFLOW_DOMAIN_EVENT_DEFINITIONS.length);
    for (const def of WORKFLOW_DOMAIN_EVENT_REGISTRY) {
      expect(def.eventType).toMatch(/^[a-z][a-z0-9_.]+$/);
      expect(def.defaultVersion).toBeTruthy();
      expect(def.versions[def.defaultVersion]).toBeDefined();
      expect(def.producerModule).toBeTruthy();
      expect(def.description.length).toBeGreaterThan(10);
    }
  });

  it('has no duplicate event types', () => {
    const types = WORKFLOW_DOMAIN_EVENT_DEFINITIONS.map((d) => d.eventType);
    expect(types.length).toBe(new Set(types).size);
  });

  it('rejects unknown event versions', () => {
    expect(() => resolveEventVersion('booking.returned', '9.9.9')).toThrow(
      WorkflowDomainEventRegistryError,
    );
  });

  it('accepts default event version when omitted', () => {
    expect(resolveEventVersion('booking.returned')).toBe('1.0.0');
    expect(getSupportedEventVersions('booking.returned')).toEqual(['1.0.0']);
  });

  it('resolves legacy trigger keys via explicit adapters', () => {
    expect(resolveCanonicalEventType('vehicle_returned')).toBe('booking.returned');
    expect(resolveCanonicalEventType('invoice_overdue')).toBe('invoice.overdue');
    expect(resolveCanonicalEventType('health_threshold')).toBe('vehicle.health.warning');
  });

  it('does not map fine_created to customer.complaint.created', () => {
    const fineAdapter = WORKFLOW_LEGACY_EVENT_ADAPTERS.find((a) => a.legacyKey === 'fine_created');
    expect(fineAdapter).toBeDefined();
    expect(fineAdapter?.canonicalEventType).toBe('invoice.created');
    expect(fineAdapter?.replacedWrongMapping).toBe('customer.complaint.created');
    expect(resolveCanonicalEventType('fine_created')).not.toBe('customer.complaint.created');
  });

  it('adapts fine_created payload with invoiceKind fine', () => {
    const adapted = adaptLegacyWorkflowEvent({
      type: 'fine_created',
      payload: { invoiceId: 'inv-1' },
    });
    expect(adapted.type).toBe('invoice.created');
    expect(adapted.payload.invoiceKind).toBe('fine');
    expect(adapted.legacySourceKey).toBe('fine_created');
  });

  it('adapts vehicle.dtc.critical to vehicle.dtc.detected with severity', () => {
    const adapted = adaptLegacyWorkflowEvent({
      type: 'vehicle.dtc.critical',
      payload: { vehicleId: 'v-1', dtcCode: 'P0420' },
    });
    expect(adapted.type).toBe('vehicle.dtc.detected');
    expect(adapted.payload.severity).toBe('critical');
  });

  it('validates required payload fields', () => {
    expect(() =>
      validateWorkflowEventPayload('booking.returned', '1.0.0', {}),
    ).toThrow(WorkflowDomainEventValidationError);
  });

  it('rejects forbidden PII in payload', () => {
    expect(() =>
      validateWorkflowEventPayload('booking.returned', '1.0.0', {
        bookingId: 'b-1',
        email: 'user@example.com',
      }),
    ).toThrow(WorkflowDomainEventValidationError);
  });

  it('rejects unexpected payload keys', () => {
    expect(() =>
      validateWorkflowEventPayload('booking.returned', '1.0.0', {
        bookingId: 'b-1',
        unknownField: true,
      }),
    ).toThrow(WorkflowDomainEventValidationError);
  });

  it('normalizes and validates a complete booking.returned event', () => {
    const normalized = validateAndNormalizeWorkflowEvent({
      organizationId: 'org-1',
      type: 'booking.returned',
      payload: { bookingId: 'b-1', vehicleId: 'v-1' },
    });
    expect(normalized.type).toBe('booking.returned');
    expect(normalized.eventVersion).toBe('1.0.0');
    expect(normalized.entityType).toBe('booking');
    expect(normalized.entityId).toBe('b-1');
  });

  it('rejects unregistered event types', () => {
    expect(() =>
      validateAndNormalizeWorkflowEvent({
        organizationId: 'org-1',
        type: 'unknown.event',
        payload: {},
      }),
    ).toThrow(WorkflowDomainEventValidationError);
  });

  it('keeps customer.complaint.created as a distinct valid event', () => {
    const normalized = validateAndNormalizeWorkflowEvent({
      organizationId: 'org-1',
      type: 'customer.complaint.created',
      payload: { customerId: 'c-1', complaintId: 'cmp-1' },
    });
    expect(normalized.type).toBe('customer.complaint.created');
  });

  it('uses past-tense occurred kind for discrete facts', () => {
    const occurred = WORKFLOW_DOMAIN_EVENT_REGISTRY.filter((d) => d.kind === 'occurred');
    const pastTensePatterns = [
      'created',
      'confirmed',
      'picked_up',
      'returned',
      'cancelled',
      'detected',
      'entered',
      'exited',
      'reported',
      'failed',
      'delivered',
      'restored',
      'completed',
      'escalated',
    ];
    for (const def of occurred) {
      const tail = def.eventType.split('.').pop() ?? '';
      const matchesPastTense = pastTensePatterns.some((p) => tail.includes(p)) || tail === 'test';
      expect(matchesPastTense).toBe(true);
    }
  });
});
