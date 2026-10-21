import type { BusinessAuditOutbox, Prisma } from '@prisma/client';
import {
  BUSINESS_AUDIT_ENTITY_TYPE,
  BusinessAuditAction,
} from '@modules/business-audit/business-audit.constants';
import type { BusinessAuditOutboxRepository } from '@modules/business-audit/business-audit-outbox.repository';
import type { VehicleOffboardReasonCode } from '../contracts/vehicle-offboard-reason.v1';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

export type ExpectedOffboardAuditSemantics = {
  vehicleId: string;
  organizationId: string;
  reason: VehicleOffboardReasonCode;
  actorUserId: string;
  note?: string;
};

export function buildExpectedOffboardAuditSemantics(
  input: Pick<
    ExpectedOffboardAuditSemantics,
    'vehicleId' | 'organizationId' | 'reason' | 'actorUserId' | 'note'
  >,
): ExpectedOffboardAuditSemantics {
  return {
    vehicleId: input.vehicleId,
    organizationId: input.organizationId,
    reason: input.reason,
    actorUserId: input.actorUserId,
    ...(input.note !== undefined ? { note: input.note } : {}),
  };
}

export function offboardAuditIdempotencyKey(idempotencyKey: string): string {
  return `vehicle-onboarding:offboard-audit:v1:${idempotencyKey}`;
}

type OffboardAuditPayload = {
  description: string;
  metadata: {
    vehicleId: string;
    organizationId: string;
    reason: VehicleOffboardReasonCode;
    actorUserId: string;
    offboardedAt: string;
    note?: string;
  };
};

function parseOffboardAuditPayload(payload: unknown): OffboardAuditPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.description !== 'string') return null;
  const metadata = record.metadata;
  if (!metadata || typeof metadata !== 'object') return null;
  const meta = metadata as Record<string, unknown>;
  if (
    typeof meta.vehicleId !== 'string' ||
    typeof meta.organizationId !== 'string' ||
    typeof meta.reason !== 'string' ||
    typeof meta.actorUserId !== 'string' ||
    typeof meta.offboardedAt !== 'string'
  ) {
    return null;
  }
  return {
    description: record.description,
    metadata: {
      vehicleId: meta.vehicleId,
      organizationId: meta.organizationId,
      reason: meta.reason as VehicleOffboardReasonCode,
      actorUserId: meta.actorUserId,
      offboardedAt: meta.offboardedAt,
      ...(typeof meta.note === 'string' ? { note: meta.note } : {}),
    },
  };
}

export function offboardAuditSemanticMatch(
  existing: Pick<BusinessAuditOutbox, 'entityId' | 'organizationId' | 'action' | 'payload'>,
  expected: ExpectedOffboardAuditSemantics,
): boolean {
  if (
    existing.action !== BusinessAuditAction.VEHICLE_REGISTRY_OFFBOARDED ||
    existing.entityId !== expected.vehicleId ||
    existing.organizationId !== expected.organizationId
  ) {
    return false;
  }
  const parsed = parseOffboardAuditPayload(existing.payload);
  if (!parsed) return false;
  const noteMatches =
    (parsed.metadata.note ?? undefined) === (expected.note ?? undefined);
  // Actor is recorded on first write; idempotency semantics align with billing outbox (reason/vehicle/org/note).
  return (
    parsed.metadata.vehicleId === expected.vehicleId &&
    parsed.metadata.organizationId === expected.organizationId &&
    parsed.metadata.reason === expected.reason &&
    noteMatches
  );
}

export function assertOffboardAuditSemanticMatch(
  existing: Pick<BusinessAuditOutbox, 'entityId' | 'organizationId' | 'action' | 'payload'>,
  expected: ExpectedOffboardAuditSemantics,
): void {
  if (!offboardAuditSemanticMatch(existing, expected)) {
    throw new VehicleOnboardingError(
      'OUTBOX_IDEMPOTENCY_CONFLICT',
      'Offboard audit idempotency key belongs to a different offboarding',
    );
  }
}

export async function ensureOffboardAuditRecord(
  tx: Prisma.TransactionClient,
  repo: BusinessAuditOutboxRepository,
  input: {
    organizationId: string;
    vehicleId: string;
    reason: VehicleOffboardReasonCode;
    actorUserId: string;
    idempotencyKey: string;
    offboardedAt: Date;
    note?: string;
    expectedSemantics: ExpectedOffboardAuditSemantics;
  },
): Promise<void> {
  const auditKey = offboardAuditIdempotencyKey(input.idempotencyKey);
  const existing = await tx.businessAuditOutbox.findUnique({
    where: { idempotencyKey: auditKey },
  });
  if (existing) {
    assertOffboardAuditSemanticMatch(existing, input.expectedSemantics);
    return;
  }

  try {
    await repo.enqueueInTransaction(tx, {
      organizationId: input.organizationId,
      idempotencyKey: auditKey,
      action: BusinessAuditAction.VEHICLE_REGISTRY_OFFBOARDED,
      actorUserId: input.actorUserId,
      entityType: BUSINESS_AUDIT_ENTITY_TYPE.VEHICLE,
      entityId: input.vehicleId,
      changeReason: input.reason,
      outcome: 'SUCCESS',
      description: 'Vehicle registry offboarded',
      before: { registryLifecycle: 'ACTIVE' },
      after: { registryLifecycle: 'OFFBOARDED' },
      metadata: {
        vehicleId: input.vehicleId,
        organizationId: input.organizationId,
        reason: input.reason,
        actorUserId: input.actorUserId,
        offboardedAt: input.offboardedAt.toISOString(),
        ...(input.note ? { note: input.note } : {}),
      },
      occurredAt: input.offboardedAt,
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === 'P2002') {
      const raced = await tx.businessAuditOutbox.findUnique({
        where: { idempotencyKey: auditKey },
      });
      if (raced) {
        assertOffboardAuditSemanticMatch(raced, input.expectedSemantics);
        return;
      }
    }
    throw error;
  }
}

export async function assertOffboardAuditReplaySemantics(
  prisma: { businessAuditOutbox: Prisma.BusinessAuditOutboxDelegate },
  input: {
    idempotencyKey: string;
    expectedSemantics: ExpectedOffboardAuditSemantics;
  },
): Promise<void> {
  const auditKey = offboardAuditIdempotencyKey(input.idempotencyKey);
  const existing = await prisma.businessAuditOutbox.findUnique({
    where: { idempotencyKey: auditKey },
  });
  if (!existing) {
    return;
  }
  assertOffboardAuditSemanticMatch(existing, input.expectedSemantics);
}
