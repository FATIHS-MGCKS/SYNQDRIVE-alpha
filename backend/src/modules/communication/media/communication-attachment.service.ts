import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  CommunicationAttachmentMediaType,
  CommunicationAttachmentState,
  Prisma,
} from '@prisma/client';
import {
  DOCUMENTS_STORAGE,
  DocumentStoragePort,
} from '@modules/documents/storage/document-storage.interface';
import { PrismaService } from '@shared/database/prisma.service';
import { COMMUNICATION_ATTACHMENT_STORAGE_DOCUMENT_TYPE } from './communication-attachment.constants';
import { CommunicationAttachmentError } from './communication-attachment.errors';
import {
  assertAttachmentSize,
  assertBufferMatchesMime,
  detectMediaKindFromMime,
  sanitizeAttachmentFileName,
  sha256Hex,
} from './communication-attachment-validation';
import { CommunicationWriteScopeService } from '../write/communication-write-scope.service';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import type { CommunicationAttachmentDto } from './dto/communication-attachment.dto';

@Injectable()
export class CommunicationAttachmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readRepository: CommunicationReadRepository,
    private readonly scope: CommunicationWriteScopeService,
    @Inject(DOCUMENTS_STORAGE) private readonly storage: DocumentStoragePort,
  ) {}

  async uploadConversationAttachment(
    organizationId: string,
    conversationId: string,
    actorUserId: string,
    input: { buffer: Buffer; mimeType: string; originalName: string },
  ): Promise<CommunicationAttachmentDto> {
    const mediaKind = detectMediaKindFromMime(input.mimeType);
    if (!mediaKind) {
      throw CommunicationAttachmentError.unsupportedType();
    }

    assertAttachmentSize(mediaKind, input.buffer.length);
    assertBufferMatchesMime(input.buffer, input.mimeType);

    const row = await this.readRepository.findConversationById(organizationId, conversationId);
    if (!row) {
      throw CommunicationAttachmentError.notFound();
    }
    await this.scope.assertConversationMutable(actorUserId, organizationId, row);

    const safeName = sanitizeAttachmentFileName(input.originalName);
    const contentHash = sha256Hex(input.buffer);
    const validatedMimeType = input.mimeType;

    const stored = await this.storage.putObject({
      organizationId,
      bookingId: conversationId,
      documentType: COMMUNICATION_ATTACHMENT_STORAGE_DOCUMENT_TYPE,
      originalName: safeName,
      buffer: input.buffer,
      mimeType: validatedMimeType,
    });

    const attachment = await this.prisma.communicationAttachment.create({
      data: {
        organizationId,
        conversationId,
        mediaType:
          mediaKind === 'IMAGE'
            ? CommunicationAttachmentMediaType.IMAGE
            : CommunicationAttachmentMediaType.DOCUMENT,
        state: CommunicationAttachmentState.READY,
        fileName: safeName,
        mimeType: validatedMimeType,
        sizeBytes: stored.sizeBytes,
        contentHash,
        objectKey: stored.objectKey,
        storageProvider: stored.storageProvider,
        uploaderUserId: actorUserId,
      },
    });

    return this.mapAttachment(attachment);
  }

  async assertAttachmentAvailableForReply(
    tx: Prisma.TransactionClient,
    organizationId: string,
    conversationId: string,
    attachmentId: string,
  ) {
    const attachment = await tx.communicationAttachment.findFirst({
      where: { id: attachmentId, organizationId },
    });
    if (!attachment) {
      throw CommunicationAttachmentError.notFound();
    }
    if (attachment.conversationId !== conversationId) {
      throw CommunicationAttachmentError.conversationMismatch();
    }
    if (attachment.state === CommunicationAttachmentState.PURGED) {
      throw CommunicationAttachmentError.purged();
    }
    if (attachment.state !== CommunicationAttachmentState.READY) {
      throw CommunicationAttachmentError.notReady();
    }
    if (attachment.sealedAt) {
      throw CommunicationAttachmentError.sealed();
    }
    if (attachment.reservedCommandId) {
      throw CommunicationAttachmentError.sealed();
    }
    return attachment;
  }

  async reserveAttachmentForReply(
    tx: Prisma.TransactionClient,
    organizationId: string,
    conversationId: string,
    attachmentId: string,
    commandId: string,
  ) {
    const attachment = await tx.communicationAttachment.findFirst({
      where: { id: attachmentId, organizationId },
    });
    if (!attachment) {
      throw CommunicationAttachmentError.notFound();
    }
    if (attachment.conversationId !== conversationId) {
      throw CommunicationAttachmentError.conversationMismatch();
    }
    if (attachment.state === CommunicationAttachmentState.PURGED) {
      throw CommunicationAttachmentError.purged();
    }
    if (attachment.state !== CommunicationAttachmentState.READY) {
      throw CommunicationAttachmentError.notReady();
    }
    if (attachment.sealedAt) {
      throw CommunicationAttachmentError.sealed();
    }
    if (attachment.reservedCommandId && attachment.reservedCommandId !== commandId) {
      throw CommunicationAttachmentError.sealed();
    }

    const reserved = await tx.communicationAttachment.updateMany({
      where: {
        id: attachmentId,
        organizationId,
        conversationId,
        state: CommunicationAttachmentState.READY,
        sealedAt: null,
        OR: [{ reservedCommandId: null }, { reservedCommandId: commandId }],
      },
      data: { reservedCommandId: commandId },
    });

    if (reserved.count === 0) {
      throw CommunicationAttachmentError.sealed();
    }

    return attachment;
  }

  async requireReadyAttachmentForReply(
    tx: Prisma.TransactionClient,
    organizationId: string,
    conversationId: string,
    attachmentId: string,
    commandId?: string,
  ) {
    const attachment = await tx.communicationAttachment.findFirst({
      where: { id: attachmentId, organizationId },
    });
    if (!attachment) {
      throw CommunicationAttachmentError.notFound();
    }
    if (attachment.conversationId !== conversationId) {
      throw CommunicationAttachmentError.conversationMismatch();
    }
    if (attachment.state === CommunicationAttachmentState.PURGED) {
      throw CommunicationAttachmentError.purged();
    }
    if (attachment.state !== CommunicationAttachmentState.READY) {
      throw CommunicationAttachmentError.notReady();
    }
    if (attachment.sealedAt) {
      throw CommunicationAttachmentError.sealed();
    }
    if (
      attachment.reservedCommandId
      && commandId
      && attachment.reservedCommandId !== commandId
    ) {
      throw CommunicationAttachmentError.sealed();
    }
    return attachment;
  }

  async sealAttachment(
    tx: Prisma.TransactionClient,
    attachmentId: string,
    nativeMessageId: string,
  ): Promise<void> {
    await tx.communicationAttachment.update({
      where: { id: attachmentId },
      data: { sealedAt: new Date(), nativeMessageId },
    });
  }

  async getAttachmentForRead(
    organizationId: string,
    attachmentId: string,
    actorUserId: string,
  ) {
    const attachment = await this.prisma.communicationAttachment.findFirst({
      where: { id: attachmentId, organizationId },
    });
    if (!attachment) {
      throw CommunicationAttachmentError.notFound();
    }
    if (attachment.state === CommunicationAttachmentState.PURGED) {
      throw CommunicationAttachmentError.purged();
    }

    const row = await this.readRepository.findConversationById(
      organizationId,
      attachment.conversationId,
    );
    if (!row) {
      throw CommunicationAttachmentError.notFound();
    }
    await this.scope.assertConversationReadable(actorUserId, organizationId, row);

    return attachment;
  }

  async streamAttachmentContent(
    organizationId: string,
    attachmentId: string,
    actorUserId: string,
  ) {
    const attachment = await this.getAttachmentForRead(organizationId, attachmentId, actorUserId);
    const stream = await this.storage.getObjectStream(attachment.objectKey);
    return { attachment, stream };
  }

  async getAttachmentBuffer(attachment: { objectKey: string }): Promise<Buffer> {
    return this.storage.getObject(attachment.objectKey);
  }

  async ingestInboundProviderMedia(input: {
    organizationId: string;
    conversationId: string;
    nativeMessageId: string;
    buffer: Buffer;
    mimeType: string;
    originalName: string;
    mediaKind: 'IMAGE' | 'DOCUMENT';
  }): Promise<CommunicationAttachmentDto> {
    const detectedKind = detectMediaKindFromMime(input.mimeType);
    if (!detectedKind) {
      throw CommunicationAttachmentError.unsupportedType();
    }

    assertAttachmentSize(detectedKind, input.buffer.length);
    assertBufferMatchesMime(input.buffer, input.mimeType);

    const safeName = sanitizeAttachmentFileName(input.originalName);
    const contentHash = sha256Hex(input.buffer);
    const validatedMimeType = input.mimeType;

    const stored = await this.storage.putObject({
      organizationId: input.organizationId,
      bookingId: input.conversationId,
      documentType: COMMUNICATION_ATTACHMENT_STORAGE_DOCUMENT_TYPE,
      originalName: safeName,
      buffer: input.buffer,
      mimeType: validatedMimeType,
    });

    const attachment = await this.prisma.communicationAttachment.create({
      data: {
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        mediaType:
          input.mediaKind === 'IMAGE'
            ? CommunicationAttachmentMediaType.IMAGE
            : CommunicationAttachmentMediaType.DOCUMENT,
        state: CommunicationAttachmentState.READY,
        fileName: safeName,
        mimeType: validatedMimeType,
        sizeBytes: stored.sizeBytes,
        contentHash,
        objectKey: stored.objectKey,
        storageProvider: stored.storageProvider,
        nativeMessageId: input.nativeMessageId,
        sealedAt: new Date(),
      },
    });

    return this.mapAttachment(attachment);
  }

  async listAttachmentsByNativeMessageIds(
    organizationId: string,
    nativeMessageIds: string[],
  ) {
    if (nativeMessageIds.length === 0) return [];
    return this.prisma.communicationAttachment.findMany({
      where: {
        organizationId,
        nativeMessageId: { in: nativeMessageIds },
        state: CommunicationAttachmentState.READY,
      },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        mediaType: true,
        state: true,
        nativeMessageId: true,
      },
    });
  }

  mapAttachment(attachment: {
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    mediaType: CommunicationAttachmentMediaType;
    state: CommunicationAttachmentState;
  }): CommunicationAttachmentDto {
    return {
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      mediaType: attachment.mediaType,
      state: attachment.state,
    };
  }
}
