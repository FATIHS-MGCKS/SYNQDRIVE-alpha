import type { WorkflowLegacyEventAdapter } from './workflow-domain-event-registry.types';

/**
 * Explicit legacy event adapters — no silent semantic remapping.
 *
 * Removed wrong mapping (Phase 4 Prompt 14):
 *   `fine_created` → `customer.complaint.created`  ❌
 * Traffic fines are financial documents, not customer complaints.
 * Migrate producers to `invoice.created` with `invoiceKind: 'fine'`.
 */
export const WORKFLOW_LEGACY_EVENT_ADAPTERS: readonly WorkflowLegacyEventAdapter[] = [
  {
    legacyKey: 'vehicle_returned',
    canonicalEventType: 'booking.returned',
    migrationNotes: 'UI trigger key from MVP workflow builder.',
    deprecated: true,
  },
  {
    legacyKey: 'manual',
    canonicalEventType: 'manual.test',
    migrationNotes: 'MVP manual test trigger.',
    deprecated: true,
  },
  {
    legacyKey: 'invoice_overdue',
    canonicalEventType: 'invoice.overdue',
    migrationNotes: 'Snake-case UI key.',
    deprecated: true,
  },
  {
    legacyKey: 'health_threshold',
    canonicalEventType: 'vehicle.health.warning',
    migrationNotes: 'Generic health threshold trigger — specify warning vs critical in new producers.',
    deprecated: true,
  },
  {
    legacyKey: 'vehicle.dtc.critical',
    canonicalEventType: 'vehicle.dtc.detected',
    migrationNotes: 'Renamed to neutral past-tense `detected`; pass severity in payload.',
    deprecated: true,
    adapt: (payload) => ({
      ...payload,
      severity: payload.severity ?? 'critical',
    }),
  },
  {
    legacyKey: 'booking.completed',
    canonicalEventType: 'booking.returned',
    migrationNotes: 'Prefer `booking.returned` for handover; `booking.completed` retained as registered alias.',
    deprecated: true,
  },
  {
    legacyKey: 'fine_created',
    canonicalEventType: 'invoice.created',
    migrationNotes:
      'Traffic fine invoice created. Replaces incorrect mapping to customer.complaint.created. ' +
      'Emit invoice.created with invoiceKind=fine and link bookingId/vehicleId when known.',
    deprecated: true,
    replacedWrongMapping: 'customer.complaint.created',
    adapt: (payload) => ({
      ...payload,
      invoiceKind: payload.invoiceKind ?? 'fine',
    }),
  },
];

/** Lookup map built at module load. */
export const WORKFLOW_LEGACY_EVENT_ADAPTER_MAP: Readonly<Record<string, WorkflowLegacyEventAdapter>> =
  Object.freeze(
    WORKFLOW_LEGACY_EVENT_ADAPTERS.reduce<Record<string, WorkflowLegacyEventAdapter>>((acc, adapter) => {
      if (acc[adapter.legacyKey]) {
        throw new Error(`Duplicate workflow legacy adapter key: ${adapter.legacyKey}`);
      }
      acc[adapter.legacyKey] = adapter;
      return acc;
    }, {}),
  );

/**
 * @deprecated Use WORKFLOW_LEGACY_EVENT_ADAPTER_MAP — kept for validator backward compat.
 * Intentionally excludes fine_created → customer.complaint.created.
 */
export const LEGACY_TRIGGER_TO_EVENT: Record<string, string> = Object.freeze(
  WORKFLOW_LEGACY_EVENT_ADAPTERS.reduce<Record<string, string>>((acc, a) => {
    acc[a.legacyKey] = a.canonicalEventType;
    return acc;
  }, {}),
);
