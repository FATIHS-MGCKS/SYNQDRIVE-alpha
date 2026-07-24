import { QUEUE_NAMES } from '@workers/queues/queue-names';

export const REVOCATION_QUEUE_CATEGORY = {
  TELEMETRY_INGEST: 'telemetry_ingest',
  TRIP_ANALYTICS: 'trip_analytics',
  HEALTH_DERIVE: 'health_derive',
  NOTIFICATION: 'notification',
  EXPORT: 'export',
  AI_JOB: 'ai_job',
  PARTNER_WEBHOOK: 'partner_webhook',
  DOCUMENT: 'document',
  PROVIDER_SYNC: 'provider_sync',
  BATCH_ANALYTICS: 'batch_analytics',
  TASK_AUTOMATION: 'task_automation',
  CONNECTIVITY: 'connectivity',
} as const;

export type RevocationQueueCategory =
  (typeof REVOCATION_QUEUE_CATEGORY)[keyof typeof REVOCATION_QUEUE_CATEGORY];

export interface RevocationQueueCatalogEntry {
  queueName: string;
  category: RevocationQueueCategory;
  /** BullMQ states scanned during revocation (never active wipe). */
  cancellableStates: readonly ('waiting' | 'delayed' | 'paused')[];
  /** Active/retry jobs rely on worker checkpoint instead of removal. */
  checkpointStates: readonly ('active' | 'waiting-children')[];
  extractScope: (data: Record<string, unknown>) => RevocationJobScope | null;
}

export interface RevocationJobScope {
  organizationId: string;
  vehicleId?: string | null;
  processingActivityId?: string | null;
  enforcementPolicyId?: string | null;
  bookingId?: string | null;
  customerId?: string | null;
}

function orgFromData(data: Record<string, unknown>): string | null {
  const candidates = [
    data.organizationId,
    data.orgId,
    data.tenantId,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

function baseScope(data: Record<string, unknown>): RevocationJobScope | null {
  const organizationId = orgFromData(data);
  if (!organizationId) return null;
  return {
    organizationId,
    vehicleId: typeof data.vehicleId === 'string' ? data.vehicleId : null,
    processingActivityId:
      typeof data.processingActivityId === 'string' ? data.processingActivityId : null,
    enforcementPolicyId:
      typeof data.enforcementPolicyId === 'string' ? data.enforcementPolicyId : null,
    bookingId: typeof data.bookingId === 'string' ? data.bookingId : null,
    customerId: typeof data.customerId === 'string' ? data.customerId : null,
  };
}

/** Vehicle-only jobs — org resolved at worker checkpoint via vehicle lookup. */
function vehicleScope(data: Record<string, unknown>): RevocationJobScope | null {
  if (typeof data.vehicleId !== 'string') return null;
  const organizationId = orgFromData(data);
  if (!organizationId) {
    return { organizationId: '__vehicle_lookup__', vehicleId: data.vehicleId };
  }
  return { organizationId, vehicleId: data.vehicleId };
}

const STANDARD_CANCEL_STATES = ['waiting', 'delayed', 'paused'] as const;
const STANDARD_CHECKPOINT_STATES = ['active'] as const;

/**
 * Central catalog of BullMQ queues affected by revocation.
 * No blanket queue flush — each job is matched by organization + optional scope refs.
 */
export const REVOCATION_QUEUE_CATALOG: readonly RevocationQueueCatalogEntry[] = [
  {
    queueName: QUEUE_NAMES.DIMO_SNAPSHOT,
    category: REVOCATION_QUEUE_CATEGORY.TELEMETRY_INGEST,
    cancellableStates: STANDARD_CANCEL_STATES,
    checkpointStates: STANDARD_CHECKPOINT_STATES,
    extractScope: vehicleScope,
  },
  {
    queueName: QUEUE_NAMES.DTC_POLL,
    category: REVOCATION_QUEUE_CATEGORY.TELEMETRY_INGEST,
    cancellableStates: STANDARD_CANCEL_STATES,
    checkpointStates: STANDARD_CHECKPOINT_STATES,
    extractScope: vehicleScope,
  },
  {
    queueName: QUEUE_NAMES.DIMO_VEHICLE_SYNC,
    category: REVOCATION_QUEUE_CATEGORY.PROVIDER_SYNC,
    cancellableStates: STANDARD_CANCEL_STATES,
    checkpointStates: STANDARD_CHECKPOINT_STATES,
    extractScope: baseScope,
  },
  {
    queueName: QUEUE_NAMES.TRIP_TRACKING,
    category: REVOCATION_QUEUE_CATEGORY.TRIP_ANALYTICS,
    cancellableStates: STANDARD_CANCEL_STATES,
    checkpointStates: STANDARD_CHECKPOINT_STATES,
    extractScope: vehicleScope,
  },
  {
    queueName: QUEUE_NAMES.TRIP_BEHAVIOR_ENRICHMENT,
    category: REVOCATION_QUEUE_CATEGORY.BATCH_ANALYTICS,
    cancellableStates: STANDARD_CANCEL_STATES,
    checkpointStates: STANDARD_CHECKPOINT_STATES,
    extractScope: baseScope,
  },
  {
    queueName: QUEUE_NAMES.DRIVING_IMPACT_COMPUTE,
    category: REVOCATION_QUEUE_CATEGORY.BATCH_ANALYTICS,
    cancellableStates: STANDARD_CANCEL_STATES,
    checkpointStates: STANDARD_CHECKPOINT_STATES,
    extractScope: baseScope,
  },
  {
    queueName: QUEUE_NAMES.DRIVING_INTELLIGENCE,
    category: REVOCATION_QUEUE_CATEGORY.BATCH_ANALYTICS,
    cancellableStates: STANDARD_CANCEL_STATES,
    checkpointStates: STANDARD_CHECKPOINT_STATES,
    extractScope: baseScope,
  },
  {
    queueName: QUEUE_NAMES.TIRE_RECALCULATION,
    category: REVOCATION_QUEUE_CATEGORY.HEALTH_DERIVE,
    cancellableStates: STANDARD_CANCEL_STATES,
    checkpointStates: STANDARD_CHECKPOINT_STATES,
    extractScope: vehicleScope,
  },
  {
    queueName: QUEUE_NAMES.BRAKE_RECALCULATION,
    category: REVOCATION_QUEUE_CATEGORY.HEALTH_DERIVE,
    cancellableStates: STANDARD_CANCEL_STATES,
    checkpointStates: STANDARD_CHECKPOINT_STATES,
    extractScope: vehicleScope,
  },
  {
    queueName: QUEUE_NAMES.BATTERY_V2,
    category: REVOCATION_QUEUE_CATEGORY.HEALTH_DERIVE,
    cancellableStates: STANDARD_CANCEL_STATES,
    checkpointStates: STANDARD_CHECKPOINT_STATES,
    extractScope: vehicleScope,
  },
  {
    queueName: QUEUE_NAMES.DTC_KNOWLEDGE_ENRICHMENT,
    category: REVOCATION_QUEUE_CATEGORY.AI_JOB,
    cancellableStates: STANDARD_CANCEL_STATES,
    checkpointStates: STANDARD_CHECKPOINT_STATES,
    extractScope: baseScope,
  },
  {
    queueName: QUEUE_NAMES.DOCUMENT_EXTRACTION,
    category: REVOCATION_QUEUE_CATEGORY.AI_JOB,
    cancellableStates: STANDARD_CANCEL_STATES,
    checkpointStates: STANDARD_CHECKPOINT_STATES,
    extractScope: baseScope,
  },
  {
    queueName: QUEUE_NAMES.BOOKING_DOCUMENT_GENERATION,
    category: REVOCATION_QUEUE_CATEGORY.DOCUMENT,
    cancellableStates: STANDARD_CANCEL_STATES,
    checkpointStates: STANDARD_CHECKPOINT_STATES,
    extractScope: baseScope,
  },
  {
    queueName: QUEUE_NAMES.NOTIFICATION_EVALUATION,
    category: REVOCATION_QUEUE_CATEGORY.NOTIFICATION,
    cancellableStates: STANDARD_CANCEL_STATES,
    checkpointStates: STANDARD_CHECKPOINT_STATES,
    extractScope: baseScope,
  },
  {
    queueName: QUEUE_NAMES.NOTIFICATION_DELIVERY,
    category: REVOCATION_QUEUE_CATEGORY.NOTIFICATION,
    cancellableStates: STANDARD_CANCEL_STATES,
    checkpointStates: STANDARD_CHECKPOINT_STATES,
    extractScope: baseScope,
  },
  {
    queueName: QUEUE_NAMES.PAYMENT_EMAIL,
    category: REVOCATION_QUEUE_CATEGORY.EXPORT,
    cancellableStates: STANDARD_CANCEL_STATES,
    checkpointStates: STANDARD_CHECKPOINT_STATES,
    extractScope: baseScope,
  },
  {
    queueName: QUEUE_NAMES.TASK_AUTOMATION,
    category: REVOCATION_QUEUE_CATEGORY.TASK_AUTOMATION,
    cancellableStates: STANDARD_CANCEL_STATES,
    checkpointStates: STANDARD_CHECKPOINT_STATES,
    extractScope: baseScope,
  },
  {
    queueName: QUEUE_NAMES.VOICE_WEBHOOK_PROCESS,
    category: REVOCATION_QUEUE_CATEGORY.PARTNER_WEBHOOK,
    cancellableStates: STANDARD_CANCEL_STATES,
    checkpointStates: STANDARD_CHECKPOINT_STATES,
    extractScope: baseScope,
  },
  {
    queueName: QUEUE_NAMES.CONNECTIVITY_WEBHOOK_PROCESS,
    category: REVOCATION_QUEUE_CATEGORY.CONNECTIVITY,
    cancellableStates: STANDARD_CANCEL_STATES,
    checkpointStates: STANDARD_CHECKPOINT_STATES,
    extractScope: baseScope,
  },
];

export const REVOCATION_SCHEDULER_KEYS = [
  'dimo-snapshot.scheduler',
  'dimo-dtc.scheduler',
  'dimo-vehicle-sync.scheduler',
  'trip-tracking-recovery.scheduler',
  'tire-recalculation.scheduler',
  'brake-recalculation.scheduler',
  'battery-v2-reconciliation.scheduler',
  'document-extraction-recovery.scheduler',
  'notification-delivery.scheduler',
  'notification-evaluation.scheduler',
  'payment-email.scheduler',
  'task-automation-outbox.scheduler',
] as const;

export type RevocationSchedulerKey = (typeof REVOCATION_SCHEDULER_KEYS)[number];

export function getRevocationQueueCatalogEntry(
  queueName: string,
): RevocationQueueCatalogEntry | undefined {
  return REVOCATION_QUEUE_CATALOG.find((e) => e.queueName === queueName);
}
