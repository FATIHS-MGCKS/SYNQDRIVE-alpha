import type { Prisma } from '@prisma/client';
import type { WorkflowEventOutboxEnqueueInput } from './workflow-event-outbox.types';
import type { WorkflowEventOutboxRecord } from './workflow-event-outbox.types';

export type WorkflowEventEmitGroup =
  | 'bookingLifecycle'
  | 'bookingTiming'
  | 'vehicleHealth'
  | 'vehicleDtc'
  | 'vehicleTelemetry'
  | 'billing'
  | 'customer'
  | 'damage'
  | 'service'
  | 'task';

export interface WorkflowEventEmitInput extends WorkflowEventOutboxEnqueueInput {
  group: WorkflowEventEmitGroup;
  /** Stable occurrence id for recurring findings — folded into idempotencyKey when set. */
  occurrenceId?: string;
  causationId?: string | null;
}

export type WorkflowEventEmitResult = WorkflowEventOutboxRecord | null;

export type WorkflowTx = Prisma.TransactionClient;
