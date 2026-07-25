import { ConflictException } from '@nestjs/common';
import {
  HandoverCompletionAuditEventType,
  HandoverKind,
  Prisma,
} from '@prisma/client';
import type { HandoverActorContext } from '../booking-pickup-gate/booking-pickup-gate.types';
import type { CreateHandoverProtocolPayload } from '../handover.types';
import {
  buildHandoverCompletionCanonicalPayload,
  hashHandoverCompletionPayload,
  hashHandoverSignedContent,
} from './handover-completion-payload.canonical';

export interface CreateHandoverCompletionRecordInput {
  orgId: string;
  bookingId: string;
  vehicleId: string;
  customerId: string | null;
  stationId: string | null;
  protocolId: string;
  kind: HandoverKind;
  protocolVersion: number;
  documentVersion: number;
  performedAt: Date;
  payload: CreateHandoverProtocolPayload;
  actor: HandoverActorContext;
  previousVersionId?: string | null;
  correctionReason?: string | null;
  overrideUserId?: string | null;
}

export interface HandoverCompletionRecordResult {
  id: string;
  version: number;
  documentVersion: number;
  payloadHash: string;
  signedContentHash: string;
  protocolId: string;
}

export async function createHandoverCompletionRecordInTransaction(
  tx: Prisma.TransactionClient,
  input: CreateHandoverCompletionRecordInput,
): Promise<HandoverCompletionRecordResult> {
  const canonical = buildHandoverCompletionCanonicalPayload(input.payload, {
    organizationId: input.orgId,
    bookingId: input.bookingId,
    vehicleId: input.vehicleId,
    customerId: input.customerId,
    stationId: input.stationId,
    kind: input.kind,
    documentVersion: input.documentVersion,
    protocolVersion: input.protocolVersion,
    performedAt: input.performedAt.toISOString(),
  });

  const payloadHash = hashHandoverCompletionPayload(canonical);
  const signedContentHash = hashHandoverSignedContent(canonical);

  const previousVersion = input.previousVersionId
    ? await tx.bookingHandoverCompletionRecord.findFirst({
        where: {
          id: input.previousVersionId,
          organizationId: input.orgId,
          bookingId: input.bookingId,
          kind: input.kind,
        },
        select: { id: true, version: true },
      })
    : await tx.bookingHandoverCompletionRecord.findFirst({
        where: {
          organizationId: input.orgId,
          bookingId: input.bookingId,
          kind: input.kind,
          isCurrent: true,
        },
        select: { id: true, version: true },
      });

  const version = previousVersion ? previousVersion.version + 1 : 1;

  if (previousVersion) {
    const superseded = await tx.bookingHandoverCompletionRecord.updateMany({
      where: {
        id: previousVersion.id,
        organizationId: input.orgId,
        isCurrent: true,
      },
      data: {
        isCurrent: false,
        supersededAt: new Date(),
      },
    });
    if (superseded.count === 0) {
      throw new ConflictException({
        code: 'HANDOVER_COMPLETION_ALREADY_SUPERSEDED',
        message: 'Previous completion record was already superseded',
      });
    }
  }

  const record = await tx.bookingHandoverCompletionRecord.create({
    data: {
      organizationId: input.orgId,
      bookingId: input.bookingId,
      vehicleId: input.vehicleId,
      customerId: input.customerId,
      stationId: input.stationId,
      protocolId: input.protocolId,
      kind: input.kind,
      documentVersion: input.documentVersion,
      version,
      payloadCanonical: canonical as object,
      payloadHash,
      signedContentHash,
      completedAt: input.performedAt,
      completedByUserId: input.actor.userId,
      completedByName: input.actor.displayName,
      previousVersionId: previousVersion?.id ?? null,
      correctionReason: input.correctionReason?.trim() || null,
      overrideUserId: input.overrideUserId ?? input.actor.userId,
      isCurrent: true,
    },
  });

  if (previousVersion) {
    await tx.bookingHandoverCompletionRecord.update({
      where: { id: previousVersion.id },
      data: { supersededById: record.id },
    });
  }

  await tx.bookingHandoverCompletionAuditEvent.create({
    data: {
      organizationId: input.orgId,
      bookingId: input.bookingId,
      kind: input.kind,
      eventType: previousVersion
        ? HandoverCompletionAuditEventType.CORRECTED
        : HandoverCompletionAuditEventType.CREATED,
      completionRecordId: record.id,
      previousCompletionRecordId: previousVersion?.id ?? null,
      newCompletionRecordId: record.id,
      actorUserId: input.actor.userId,
      actorDisplayName: input.actor.displayName,
      correctionReason: input.correctionReason?.trim() || null,
      payloadHash,
      signedContentHash,
    },
  });

  if (previousVersion) {
    await tx.bookingHandoverCompletionAuditEvent.create({
      data: {
        organizationId: input.orgId,
        bookingId: input.bookingId,
        kind: input.kind,
        eventType: HandoverCompletionAuditEventType.SUPERSEDED,
        completionRecordId: previousVersion.id,
        previousCompletionRecordId: previousVersion.id,
        newCompletionRecordId: record.id,
        actorUserId: input.actor.userId,
        actorDisplayName: input.actor.displayName,
        correctionReason: input.correctionReason?.trim() || null,
        payloadHash,
        signedContentHash,
      },
    });
  }

  return {
    id: record.id,
    version: record.version,
    documentVersion: record.documentVersion,
    payloadHash: record.payloadHash,
    signedContentHash: record.signedContentHash,
    protocolId: record.protocolId,
  };
}

export async function assertCompletionRecordImmutable(
  tx: Prisma.TransactionClient,
  recordId: string,
  orgId: string,
): Promise<void> {
  const record = await tx.bookingHandoverCompletionRecord.findFirst({
    where: { id: recordId, organizationId: orgId },
    select: { id: true, supersededAt: true },
  });
  if (!record) return;
  if (record.supersededAt) {
    throw new ConflictException({
      code: 'HANDOVER_COMPLETION_RECORD_IMMUTABLE',
      message: 'Completion records cannot be mutated after supersede',
    });
  }
}
