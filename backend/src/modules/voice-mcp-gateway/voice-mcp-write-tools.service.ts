import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TasksService } from '@modules/tasks/tasks.service';
import { SupportService } from '@modules/support/support.service';
import { CustomerTimelineService } from '@modules/customers/customer-timeline.service';
import { CustomersService } from '@modules/customers/customers.service';
import { BookingDocumentEmailService } from '@modules/outbound-email/booking-document-email.service';
import { GeneratedDocumentsService } from '@modules/documents/generated-documents.service';
import { BookingsService } from '@modules/bookings/bookings.service';
import { voiceConversationTaskDedupKey } from '@modules/tasks/automation/task-automation-rule.util';
import { isEmailSendableDocumentStatus } from '@modules/documents/documents.constants';
import { VoiceMcpEntityResolverService } from './voice-mcp-entity-resolver.service';
import { VoiceMcpError } from './voice-mcp-errors';
import type { VoiceMcpRequestContext } from './voice-mcp-context.types';
import { maskPhoneNumber, toBookingReference, toCustomerReference } from './voice-mcp-privacy.util';
import { sanitizeCustomerNoteText, sanitizeShortText } from './voice-mcp-input-sanitizer.util';

@Injectable()
export class VoiceMcpWriteToolsService {
  constructor(
    private readonly tasksService: TasksService,
    private readonly supportService: SupportService,
    private readonly customerTimelineService: CustomerTimelineService,
    private readonly customersService: CustomersService,
    private readonly bookingsService: BookingsService,
    private readonly bookingDocumentEmailService: BookingDocumentEmailService,
    private readonly generatedDocumentsService: GeneratedDocumentsService,
    private readonly entityResolver: VoiceMcpEntityResolverService,
  ) {}

  async executeDomainAction(
    toolName: string,
    context: VoiceMcpRequestContext,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    switch (toolName) {
      case 'create_callback_request':
        return this.createCallbackRequest(context, args);
      case 'create_support_case':
        return this.createSupportCase(context, args);
      case 'create_task':
        return this.createTask(context, args);
      case 'create_customer_note':
        return this.createCustomerNote(context, args);
      case 'request_booking_change':
        return this.requestBookingChange(context, args);
      case 'request_document_resend':
        return this.requestDocumentResend(context, args);
      default:
        throw new VoiceMcpError('ActionProhibited', `Write tool ${toolName} is not allowed.`);
    }
  }

  private async createCallbackRequest(context: VoiceMcpRequestContext, args: Record<string, unknown>) {
    const phone = sanitizeShortText(args.preferredPhone ?? context.callerPhoneE164, 40);
    const notes = sanitizeShortText(args.notes, 500);
    const customerId = await this.resolveCustomerId(context, args);

    const task = await this.tasksService.createManualTask(
      context.organizationId,
      {
        title: `Callback request${phone ? ` — ${phone}` : ''}`,
        description: notes || 'Caller requested a callback during a voice conversation.',
        type: 'CUSTOMER_FOLLOWUP',
        sourceType: 'SYSTEM',
        source: 'VOICE_CALLBACK',
        priority: 'HIGH',
        customerId: customerId ?? undefined,
        dedupKey: voiceConversationTaskDedupKey(context.conversationId),
        metadata: {
          voiceConversationId: context.conversationId,
          preferredPhone: phone,
          preferredWindow: sanitizeShortText(args.preferredWindow, 120),
        },
      },
      undefined,
    );

    return {
      taskRef: task.id.slice(-8).toUpperCase(),
      status: 'callback_recorded',
      preferredPhone: maskPhoneNumber(phone, { revealForCall: true }),
    };
  }

  private async createSupportCase(context: VoiceMcpRequestContext, args: Record<string, unknown>) {
    const subject = sanitizeShortText(args.subject, 160) ?? 'Voice support request';
    const description = sanitizeShortText(args.description, 2000) ?? 'Support case opened from voice conversation.';
    const reporterEmail = sanitizeShortText(args.reporterEmail, 160) ?? 'voice-caller@unknown.local';
    const reporterName = sanitizeShortText(args.reporterName, 120);
    const bookingId = await this.resolveBookingId(context, args);
    const customerId = await this.resolveCustomerId(context, args);

    const ticket = await this.supportService.create({
      organizationId: context.organizationId,
      reporterEmail,
      reporterName: reporterName ?? undefined,
      subject,
      description,
      category: 'OTHER',
      priority: 'NORMAL',
      relatedEntityType: bookingId ? 'BOOKING' : customerId ? 'CUSTOMER' : undefined,
      relatedEntityId: bookingId ?? customerId ?? undefined,
      sourcePage: 'voice-mcp',
      metadata: {
        voiceConversationId: context.conversationId,
      },
    });

    return {
      ticketNumber: (ticket as { ticketNumber: number }).ticketNumber,
      ticketCode: (ticket as { ticketCode?: string }).ticketCode ?? null,
      status: (ticket as { status: string }).status,
      subject: (ticket as { subject: string }).subject,
    };
  }

  private async createTask(context: VoiceMcpRequestContext, args: Record<string, unknown>) {
    const title = sanitizeShortText(args.title, 160);
    if (!title) {
      throw new VoiceMcpError('DataUnavailable', 'A task title is required.');
    }

    const task = await this.tasksService.createManualTask(
      context.organizationId,
      {
        title,
        description: sanitizeShortText(args.description, 2000),
        type: 'CUSTOM',
        sourceType: 'SYSTEM',
        source: 'VOICE_MCP',
        priority: (sanitizeShortText(args.priority, 20)?.toUpperCase() as 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL') ?? 'NORMAL',
        customerId: (await this.resolveCustomerId(context, args)) ?? undefined,
        bookingId: (await this.resolveBookingId(context, args)) ?? undefined,
        dedupKey:
          sanitizeShortText(args.dedupKey, 120) ??
          voiceConversationTaskDedupKey(context.conversationId),
        metadata: {
          voiceConversationId: context.conversationId,
        },
      },
      undefined,
    );

    return { taskRef: task.id.slice(-8).toUpperCase(), title: task.title, status: task.status };
  }

  private async createCustomerNote(context: VoiceMcpRequestContext, args: Record<string, unknown>) {
    const customerId = await this.resolveCustomerId(context, args);
    if (!customerId) {
      throw new VoiceMcpError('CustomerNotFound', 'A matching customer is required to add a note.');
    }

    const note = sanitizeCustomerNoteText(args.note);
    if (!note) {
      throw new VoiceMcpError('DataUnavailable', 'A note body is required.');
    }

    const title = sanitizeShortText(args.title, 120) ?? 'Voice conversation note';
    await this.customerTimelineService.addEvent(
      context.organizationId,
      customerId,
      'NOTE_ADDED',
      title,
      {
        source: 'voice-mcp',
        voiceConversationId: context.conversationId,
        notePreview: note.slice(0, 160),
      } satisfies Prisma.InputJsonValue,
      undefined,
      note,
    );

    return {
      customerRef: toCustomerReference(customerId),
      title,
      status: 'note_recorded',
    };
  }

  private async requestBookingChange(context: VoiceMcpRequestContext, args: Record<string, unknown>) {
    const bookingId = await this.resolveBookingId(context, args);
    if (!bookingId) {
      throw new VoiceMcpError('DataUnavailable', 'A matching booking is required for a change request.');
    }

    const booking = await this.bookingsService.findById(context.organizationId, bookingId);
    const changeDetails = sanitizeShortText(args.changeDetails, 2000) ?? 'Booking change requested during voice call.';

    const task = await this.tasksService.createManualTask(
      context.organizationId,
      {
        title: `Booking change request — ${toBookingReference(bookingId)}`,
        description: changeDetails,
        type: 'BOOKING_PREPARATION',
        category: 'booking',
        sourceType: 'SYSTEM',
        source: 'VOICE_BOOKING_CHANGE',
        priority: 'HIGH',
        bookingId,
        customerId: booking?.customerId ?? undefined,
        dedupKey: `voice:booking-change:${context.conversationId}:${toBookingReference(bookingId)}`,
        metadata: {
          voiceConversationId: context.conversationId,
          requestedChanges: sanitizeShortText(args.requestedChanges, 1000),
        },
      },
      undefined,
    );

    return {
      bookingRef: toBookingReference(bookingId),
      taskRef: task.id.slice(-8).toUpperCase(),
      status: 'change_request_recorded',
    };
  }

  private async requestDocumentResend(context: VoiceMcpRequestContext, args: Record<string, unknown>) {
    const bookingId = await this.resolveBookingId(context, args);
    if (!bookingId) {
      throw new VoiceMcpError('DataUnavailable', 'A matching booking is required to resend documents.');
    }

    const booking = await this.bookingsService.findById(context.organizationId, bookingId);
    const customer = booking?.customerId
      ? await this.customersService.findById(context.organizationId, booking.customerId)
      : null;
    const resolvedEmail =
      sanitizeShortText(args.toEmail, 160) ??
      sanitizeShortText((customer as { email?: string } | null)?.email, 160);

    if (!resolvedEmail?.includes('@')) {
      throw new VoiceMcpError('DataUnavailable', 'A recipient email address is required to resend documents.');
    }

    const docs = await this.generatedDocumentsService.listForBooking(context.organizationId, bookingId);
    const sendable = docs.filter((doc) => isEmailSendableDocumentStatus(doc.status));
    if (!sendable.length) {
      throw new VoiceMcpError('DataUnavailable', 'No sendable booking documents are available.');
    }

    const bookingRef = toBookingReference(bookingId);
    await this.bookingDocumentEmailService.sendBookingDocuments(
      context.organizationId,
      bookingId,
      null,
      {
        toEmail: resolvedEmail,
        subject: sanitizeShortText(args.subject, 160) ?? `Your booking documents — ${bookingRef}`,
        documentIds: sendable.map((doc) => doc.id),
      },
    );

    return {
      bookingRef,
      documentCount: sendable.length,
      recipientEmail: `${resolvedEmail.slice(0, 2)}***@${resolvedEmail.split('@')[1]}`,
      status: 'documents_queued',
    };
  }

  private async resolveCustomerId(context: VoiceMcpRequestContext, args: Record<string, unknown>) {
    const customerRef = sanitizeShortText(args.customerRef, 20);
    if (customerRef) {
      return this.entityResolver.resolveCustomerIdByRef(context.organizationId, customerRef);
    }
    const search = sanitizeShortText(args.phone ?? args.email ?? args.name, 120);
    if (!search) {
      return null;
    }
    const result = await this.customersService.findAll(context.organizationId, {
      search,
      page: 1,
      limit: 2,
    } as never);
    if (result.data.length !== 1) {
      return null;
    }
    return String((result.data[0] as { id: string }).id);
  }

  private async resolveBookingId(context: VoiceMcpRequestContext, args: Record<string, unknown>) {
    const bookingRef = sanitizeShortText(args.bookingRef, 20);
    if (bookingRef) {
      return this.entityResolver.resolveBookingIdByRef(context.organizationId, bookingRef);
    }
    const search = sanitizeShortText(args.search, 120);
    if (!search) {
      return null;
    }
    const result = await this.bookingsService.findAll(context.organizationId, {
      search,
      page: 1,
      limit: 2,
    } as never);
    const rows = Array.isArray(result.data) ? result.data : [];
    if (rows.length !== 1) {
      return null;
    }
    return String((rows[0] as { id: string }).id);
  }
}
