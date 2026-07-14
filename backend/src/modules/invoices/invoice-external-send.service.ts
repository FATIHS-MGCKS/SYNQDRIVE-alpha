import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityAction,
  ActivityEntity,
  InvoiceExternalSendChannel,
  OrgInvoiceStatus,
} from '@prisma/client';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { PrismaService } from '@shared/database/prisma.service';
import type { RecordExternalSendDto } from './dto/record-external-send.dto';
import {
  buildExternalSendTimelineDescription,
  mapInvoiceExternalSendEntry,
} from './invoice-external-send.mapper';
import { INVOICE_SEND_SOURCE_EXTERNAL } from './invoice-external-send-channel.util';
import {
  assertInvoiceStatusTransition,
  validateRecordExternalSend,
} from './invoice-status.transitions';
import type { InvoiceExternalSendEntryDto } from './invoice-detail.types';

export interface RecordExternalSendInput extends RecordExternalSendDto {
  correlationId?: string;
}

export interface RecordExternalSendResponseDto {
  externalSend: InvoiceExternalSendEntryDto;
  invoice: {
    id: string;
    status: OrgInvoiceStatus;
    sentAt: string | null;
  };
  idempotentReplay: boolean;
}

@Injectable()
export class InvoiceExternalSendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async recordExternalSend(
    orgId: string,
    invoiceId: string,
    userId: string | null,
    input: RecordExternalSendInput,
  ): Promise<RecordExternalSendResponseDto> {
    if (input.idempotencyKey?.trim()) {
      const prior = await this.prisma.orgInvoiceExternalSend.findFirst({
        where: {
          organizationId: orgId,
          idempotencyKey: input.idempotencyKey.trim(),
        },
        include: {},
      });
      if (prior) {
        if (prior.invoiceId !== invoiceId) {
          throw new BadRequestException(
            'Idempotency key already used for another invoice',
          );
        }
        const invoice = await this.requireInvoice(invoiceId, orgId);
        const actor = await this.loadActor(prior.recordedByUserId);
        return {
          externalSend: mapInvoiceExternalSendEntry({ ...prior, recordedByUser: actor }),
          invoice: {
            id: invoice.id,
            status: invoice.status,
            sentAt: invoice.sentAt?.toISOString() ?? null,
          },
          idempotentReplay: true,
        };
      }
    }

    const invoice = await this.requireInvoice(invoiceId, orgId);
    const sentAt = new Date(input.sentAt);
    const validation = validateRecordExternalSend({
      type: invoice.type,
      status: invoice.status,
      sequenceNumber: invoice.sequenceNumber,
      issuedAt: invoice.issuedAt,
      sentAt,
    });
    if (!validation.ok) {
      throw new BadRequestException(validation.message);
    }

    const recipient = input.recipient?.trim() || null;
    const duplicateOf = await this.findDuplicateCandidate(orgId, invoiceId, {
      channel: input.channel,
      sentAt,
      recipient,
    });

    const externalSend = await this.prisma.$transaction(async (tx) => {
      const created = await tx.orgInvoiceExternalSend.create({
        data: {
          organizationId: orgId,
          invoiceId,
          channel: input.channel,
          sentAt,
          recipient,
          note: input.note?.trim() || null,
          externalReference: input.externalReference?.trim() || null,
          idempotencyKey: input.idempotencyKey?.trim() || null,
          duplicateOfId: duplicateOf?.id ?? null,
          recordedByUserId: userId,
          correlationId: input.correlationId?.trim() || null,
        },
        include: {},
      });

      const nextStatus = OrgInvoiceStatus.SENT;
      if (invoice.status !== nextStatus) {
        assertInvoiceStatusTransition(invoice.status, nextStatus);
      }

      const invoiceSentAt =
        invoice.sentAt == null
          ? sentAt
          : new Date(Math.min(invoice.sentAt.getTime(), sentAt.getTime()));

      await tx.orgInvoice.update({
        where: { id: invoiceId },
        data: {
          status: nextStatus,
          sentAt: invoiceSentAt,
        },
      });

      return created;
    });

    const possibleDuplicate = externalSend.duplicateOfId != null;
    await this.activityLog.log({
      organizationId: orgId,
      userId: userId ?? undefined,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.INVOICE,
      entityId: invoiceId,
      description: buildExternalSendTimelineDescription(
        input.channel,
        recipient,
        possibleDuplicate,
      ),
      metaJson: {
        externalSendId: externalSend.id,
        channel: input.channel,
        sentAt: sentAt.toISOString(),
        recipient,
        externalReference: externalSend.externalReference,
        source: INVOICE_SEND_SOURCE_EXTERNAL,
        possibleDuplicate,
        duplicateOfId: externalSend.duplicateOfId,
      },
    });

    const updatedInvoice = await this.prisma.orgInvoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
      select: { id: true, status: true, sentAt: true },
    });

    const actor = await this.loadActor(externalSend.recordedByUserId);
    return {
      externalSend: mapInvoiceExternalSendEntry({
        ...externalSend,
        recordedByUser: actor,
      }),
      invoice: {
        id: updatedInvoice!.id,
        status: updatedInvoice!.status,
        sentAt: updatedInvoice!.sentAt?.toISOString() ?? null,
      },
      idempotentReplay: false,
    };
  }

  /** Legacy mark-sent — records OTHER channel at now with deprecation note. */
  async recordLegacyMarkSent(
    orgId: string,
    invoiceId: string,
    userId: string | null,
  ): Promise<RecordExternalSendResponseDto> {
    return this.recordExternalSend(orgId, invoiceId, userId, {
      channel: InvoiceExternalSendChannel.OTHER,
      sentAt: new Date().toISOString(),
      note: 'Legacy mark-sent API (deprecated — use record-external-send)',
      idempotencyKey: undefined,
    });
  }

  private async requireInvoice(invoiceId: string, orgId: string) {
    const invoice = await this.prisma.orgInvoice.findFirst({
      where: { id: invoiceId, organizationId: orgId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  private async findDuplicateCandidate(
    orgId: string,
    invoiceId: string,
    match: {
      channel: InvoiceExternalSendChannel;
      sentAt: Date;
      recipient: string | null;
    },
  ) {
    return this.prisma.orgInvoiceExternalSend.findFirst({
      where: {
        organizationId: orgId,
        invoiceId,
        channel: match.channel,
        sentAt: match.sentAt,
        recipient: match.recipient,
        duplicateOfId: null,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async loadActor(userId: string | null) {
    if (!userId) return null;
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
      },
    });
  }
}
