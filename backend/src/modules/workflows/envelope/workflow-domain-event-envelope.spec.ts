import {
  createWorkflowDomainEventEnvelope,
  deserializeWorkflowDomainEventEnvelope,
  serializeWorkflowDomainEventEnvelope,
  toSafeLogEnvelope,
  toSafeLogString,
  classifyPiiKeys,
  InMemoryWorkflowEventIdStore,
  FIXTURE_EVENT_ID,
  FIXTURE_ORG_ID,
  FIXTURE_CORRELATION_ID,
  FIXTURE_VEHICLE_ID,
  validBookingReturnedInput,
} from './index';

describe('WorkflowDomainEventEnvelope', () => {
  let eventIdStore: InMemoryWorkflowEventIdStore;

  beforeEach(() => {
    eventIdStore = new InMemoryWorkflowEventIdStore();
  });

  it('creates a valid immutable envelope with all required fields', () => {
    const result = createWorkflowDomainEventEnvelope(validBookingReturnedInput(), {
      eventIdStore,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { envelope } = result;
    expect(envelope.eventId).toBe(FIXTURE_EVENT_ID);
    expect(envelope.eventType).toBe('booking.returned');
    expect(envelope.eventVersion).toBe('1.0.0');
    expect(envelope.organizationId).toBe(FIXTURE_ORG_ID);
    expect(envelope.occurredAt).toBe('2026-07-25T10:00:00.000Z');
    expect(envelope.receivedAt).toBe('2026-07-25T10:00:01.000Z');
    expect(envelope.entityType).toBe('booking');
    expect(envelope.entityId).toBe(validBookingReturnedInput().payload.bookingId);
    expect(envelope.correlationId).toBe(FIXTURE_CORRELATION_ID);
    expect(envelope.causationId).toBe(validBookingReturnedInput().causationId);
    expect(envelope.source).toBe('bookings');
    expect(envelope.schemaVersion).toBe('1.0.0');
    expect(envelope.payload.bookingId).toBe(validBookingReturnedInput().payload.bookingId);
    expect(envelope.metadata.traceId).toBe('trace-abc');

    expect(() => {
      (envelope as { eventType: string }).eventType = 'mutated';
    }).toThrow();
    expect(() => {
      (envelope.payload as Record<string, unknown>).bookingId = 'mutated';
    }).toThrow();
  });

  it('rejects missing organizationId with dead-letter rejection', () => {
    const input = { ...validBookingReturnedInput(), organizationId: '' };
    const result = createWorkflowDomainEventEnvelope(input);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reason).toBe('MISSING_ORGANIZATION_ID');
    expect(result.rejection.deadLetter).toBe(true);
    expect(result.rejection.field).toBe('organizationId');
  });

  it('rejects unsupported event version', () => {
    const result = createWorkflowDomainEventEnvelope({
      ...validBookingReturnedInput(),
      eventVersion: '99.0.0',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reason).toBe('UNSUPPORTED_EVENT_VERSION');
    expect(result.rejection.field).toBe('eventVersion');
  });

  it('rejects unknown event type', () => {
    const result = createWorkflowDomainEventEnvelope({
      ...validBookingReturnedInput(),
      eventType: 'unknown.event.type',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reason).toBe('UNKNOWN_EVENT_TYPE');
  });

  it('rejects invalid payload (missing required bookingId)', () => {
    const result = createWorkflowDomainEventEnvelope({
      ...validBookingReturnedInput(),
      payload: { vehicleId: 'v-1' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reason).toBe('INVALID_PAYLOAD');
    expect(result.rejection.field).toBe('payload.bookingId');
  });

  it('enforces UTC timestamps with Z suffix', () => {
    const result = createWorkflowDomainEventEnvelope({
      ...validBookingReturnedInput(),
      occurredAt: '2026-07-25T10:00:00+02:00',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reason).toBe('INVALID_TIMESTAMP');
    expect(result.rejection.field).toBe('occurredAt');
  });

  it('rejects receivedAt before occurredAt', () => {
    const result = createWorkflowDomainEventEnvelope({
      ...validBookingReturnedInput(),
      occurredAt: '2026-07-25T10:00:05.000Z',
      receivedAt: '2026-07-25T10:00:01.000Z',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reason).toBe('INVALID_TIMESTAMP');
  });

  it('preserves correlation chain across causationId', () => {
    const parent = createWorkflowDomainEventEnvelope({
      ...validBookingReturnedInput(),
      eventId: 'evt-parent-0001-0001-0001-0001-000000000001',
      causationId: null,
    });
    expect(parent.ok).toBe(true);
    if (!parent.ok) return;

    const child = createWorkflowDomainEventEnvelope({
      ...validBookingReturnedInput(),
      eventId: 'evt-child-0001-0001-0001-0001-000000000001',
      correlationId: parent.envelope.correlationId,
      causationId: parent.envelope.eventId,
    });
    expect(child.ok).toBe(true);
    if (!child.ok) return;

    expect(child.envelope.correlationId).toBe(parent.envelope.correlationId);
    expect(child.envelope.causationId).toBe(parent.envelope.eventId);
  });

  it('produces safe log output without secrets in metadata', () => {
    const validResult = createWorkflowDomainEventEnvelope({
      ...validBookingReturnedInput(),
      metadata: { traceId: 't-1', recipientRef: 'ref-opaque' },
    });
    expect(validResult.ok).toBe(true);
    if (!validResult.ok) return;

    const safe = toSafeLogEnvelope(validResult.envelope);
    const safeStr = toSafeLogString(validResult.envelope);
    expect(safeStr).not.toContain('apiKey');
    expect(safe.eventId).toBe(validResult.envelope.eventId);

    const pii = classifyPiiKeys(validResult.envelope.metadata);
    expect(pii.indirect).toContain('recipientRef');
  });

  it('rejects cross-tenant organizationId in metadata', () => {
    const result = createWorkflowDomainEventEnvelope({
      ...validBookingReturnedInput(),
      metadata: { organizationId: 'org-other-tenant' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reason).toBe('CROSS_TENANT_VIOLATION');
    expect(result.rejection.deadLetter).toBe(true);
  });

  it('rejects consumer processing event from different tenant', () => {
    const result = createWorkflowDomainEventEnvelope(validBookingReturnedInput(), {
      consumerOrganizationId: 'org-consumer-different',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reason).toBe('CROSS_TENANT_VIOLATION');
  });

  it('rejects duplicate eventId via eventIdStore', () => {
    const input = validBookingReturnedInput();
    const first = createWorkflowDomainEventEnvelope(input, { eventIdStore });
    expect(first.ok).toBe(true);

    const second = createWorkflowDomainEventEnvelope(input, { eventIdStore });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.rejection.reason).toBe('DUPLICATE_EVENT_ID');
    expect(second.rejection.eventId).toBe(FIXTURE_EVENT_ID);
  });

  it('serializes and deserializes for queue/DB round-trip', () => {
    const created = createWorkflowDomainEventEnvelope(validBookingReturnedInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const json = serializeWorkflowDomainEventEnvelope(created.envelope);
    expect(typeof json).toBe('string');

    const parsed = deserializeWorkflowDomainEventEnvelope(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.envelope.eventId).toBe(created.envelope.eventId);
    expect(parsed.envelope.eventType).toBe('booking.returned');
    expect(parsed.envelope.occurredAt).toMatch(/Z$/);
  });

  it('normalizes legacy vehicle_returned to booking.returned', () => {
    const result = createWorkflowDomainEventEnvelope({
      organizationId: FIXTURE_ORG_ID,
      eventType: 'vehicle_returned',
      source: 'bookings',
      payload: {
        bookingId: validBookingReturnedInput().payload.bookingId,
        vehicleId: FIXTURE_VEHICLE_ID,
      },
      occurredAt: '2026-07-25T10:00:00.000Z',
      receivedAt: '2026-07-25T10:00:01.000Z',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.eventType).toBe('booking.returned');
    expect(result.envelope.legacySourceKey).toBe('vehicle_returned');
  });

  it('rejects metadata containing secrets', () => {
    const result = createWorkflowDomainEventEnvelope({
      ...validBookingReturnedInput(),
      metadata: { apiKey: 'sk-live-secret' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rejection.reason).toBe('METADATA_SECRET_VIOLATION');
  });
});
