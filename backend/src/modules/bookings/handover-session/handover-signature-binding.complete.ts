import { ConflictException } from '@nestjs/common';
import { HandoverCompletionAuditEventType, Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import type { HandoverActorContext } from '../booking-pickup-gate/booking-pickup-gate.types';
import type { CreateHandoverProtocolPayload } from '../handover.types';
import type { HandoverCompletionCanonicalContext } from './handover-completion-payload.canonical';
import { HANDOVER_SIGNATURE_BINDING_ERROR } from './handover-signature-binding.errors';
import type { HandoverSignatureBindingInput } from './handover-signature-binding.types';
import { HANDOVER_SIGNATURE_TARGET_REF_TYPE } from './handover-signature-binding.types';
import {
  validateHandoverSignatureBindings,
  type SignatureUploadRow,
} from './handover-signature-binding.validation';

export interface FinalizeHandoverSignatureBindingsInput {
  organizationId: string;
  bookingId: string;
  handoverSessionId: string;
  draftVersion: number;
  stationId: string | null;
  payload: CreateHandoverProtocolPayload;
  actor: HandoverActorContext;
  canonicalContext: HandoverCompletionCanonicalContext;
}

export async function finalizeHandoverSignatureBindings(
  prisma: PrismaService,
  input: FinalizeHandoverSignatureBindingsInput,
): Promise<HandoverSignatureBindingInput[]> {
  const clientUploadIds = (input.payload.signatureBindings ?? [])
    .map((binding) => binding.storageClientUploadId)
    .filter((id): id is string => Boolean(id?.trim()));

  const uploads =
    clientUploadIds.length > 0
      ? await prisma.operatorUpload.findMany({
          where: {
            organizationId: input.organizationId,
            clientUploadId: { in: clientUploadIds },
          },
          select: {
            clientUploadId: true,
            kind: true,
            status: true,
            bookingId: true,
            handoverSessionId: true,
            contentSha256: true,
            organizationId: true,
          },
        })
      : [];

  const uploadsByClientId = new Map<string, SignatureUploadRow>(
    uploads.map((row) => [row.clientUploadId, row]),
  );

  const bindings = validateHandoverSignatureBindings(
    input.payload,
    input.payload.signatureBindings,
    {
      organizationId: input.organizationId,
      bookingId: input.bookingId,
      handoverSessionId: input.handoverSessionId,
      draftVersion: input.draftVersion,
      stationId: input.stationId,
      capturedBy: input.actor.userId,
      canonicalContext: input.canonicalContext,
    },
    uploadsByClientId,
  );

  for (const binding of bindings) {
    if (!binding.storageClientUploadId) continue;
    await prisma.operatorUpload.updateMany({
      where: {
        organizationId: input.organizationId,
        clientUploadId: binding.storageClientUploadId,
        targetRefId: null,
      },
      data: {
        targetRefType: HANDOVER_SIGNATURE_TARGET_REF_TYPE,
        targetRefId: `${input.handoverSessionId}:${binding.signerRole}`,
      },
    });
  }

  return bindings;
}

export async function assertOperatorSessionSignatureBindings(
  prisma: PrismaService,
  input: FinalizeHandoverSignatureBindingsInput,
): Promise<HandoverSignatureBindingInput[]> {
  if (!input.payload.signatureBindings?.length) {
    throw new ConflictException({
      code: HANDOVER_SIGNATURE_BINDING_ERROR.REQUIRED,
      message: 'Signature bindings are required for operator handover completion',
    });
  }
  return finalizeHandoverSignatureBindings(prisma, input);
}

export async function recordSignatureBindingAuditEvents(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    bookingId: string;
    kind: 'PICKUP' | 'RETURN';
    completionRecordId: string;
    bindings: HandoverSignatureBindingInput[];
    signableContentHash: string;
    actor: HandoverActorContext;
  },
): Promise<void> {
  for (const binding of input.bindings) {
    await tx.bookingHandoverCompletionAuditEvent.create({
      data: {
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        kind: input.kind,
        eventType: HandoverCompletionAuditEventType.SIGNATURE_BOUND,
        completionRecordId: input.completionRecordId,
        newCompletionRecordId: input.completionRecordId,
        actorUserId: input.actor.userId,
        actorDisplayName: input.actor.displayName,
        payloadHash: binding.signableContentHash,
        signedContentHash: binding.imageContentSha256,
        correctionReason: `signerRole=${binding.signerRole};session=${binding.handoverSessionId};draftVersion=${binding.draftVersion};signableHash=${input.signableContentHash}`,
      },
    });
  }
}
