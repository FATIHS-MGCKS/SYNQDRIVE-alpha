import { Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BookingsService } from '@modules/bookings/bookings.service';
import { BookingDocumentBundleService } from '@modules/documents/booking-document-bundle.service';
import { DamagesService } from '@modules/vehicle-intelligence/damages/damages.service';
import { WhatsAppConsentService } from './whatsapp-consent.service';
import { normalizePhoneNumber } from './utils/whatsapp-phone.util';
import type {
  WhatsAppConversationContextDto,
  WhatsAppQuickActionDef,
  WhatsAppQuickActionId,
} from './whatsapp-conversation-context.types';

const ACTIVE_BOOKING: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.ACTIVE,
  BookingStatus.PENDING,
];

@Injectable()
export class WhatsAppConversationContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly documentBundle: BookingDocumentBundleService,
    private readonly damages: DamagesService,
    private readonly consent: WhatsAppConsentService,
  ) {}

  async getContext(orgId: string, conversationId: string): Promise<WhatsAppConversationContextDto> {
    const convo = await this.prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, organizationId: orgId },
    });
    if (!convo) throw new NotFoundException('Conversation not found');

    const config = await this.prisma.orgWhatsAppConfig.findUnique({
      where: { organizationId: orgId },
    });

    const phoneNormalized = normalizePhoneNumber(convo.contactPhone);
    const consentRow = phoneNormalized
      ? await this.consent.getConsent(orgId, phoneNormalized)
      : null;
    const customerOptedOut = this.consent.isOptedOut(consentRow);

    let customer: WhatsAppConversationContextDto['customer'] = null;
    if (convo.customerId) {
      const row = await this.prisma.customer.findFirst({
        where: { id: convo.customerId, organizationId: orgId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          status: true,
        },
      });
      if (row) {
        customer = {
          id: row.id,
          displayName:
            convo.contactName ??
            ([row.firstName, row.lastName].filter(Boolean).join(' ') || convo.contactPhone),
          phone: row.phone,
          email: row.email,
          status: row.status,
        };
      }
    }

    let bookingId = convo.bookingId;
    let vehicleId = convo.vehicleId;

    if (customer && !bookingId) {
      const active = await this.prisma.booking.findFirst({
        where: {
          organizationId: orgId,
          customerId: customer.id,
          status: { in: ACTIVE_BOOKING },
        },
        orderBy: { startDate: 'desc' },
        select: { id: true, vehicleId: true },
      });
      if (active) {
        bookingId = active.id;
        vehicleId = active.vehicleId;
      }
    }

    let booking: WhatsAppConversationContextDto['booking'] = null;
    let station: WhatsAppConversationContextDto['station'] = null;
    let payment: WhatsAppConversationContextDto['payment'] = null;
    let documents: WhatsAppConversationContextDto['documents'] = null;
    let tasks: WhatsAppConversationContextDto['tasks'] = null;
    let handover: WhatsAppConversationContextDto['handover'] = null;

    const detail = bookingId ? await this.bookings.findDetail(orgId, bookingId) : null;

    if (detail) {
      booking = {
        id: detail.core.bookingId,
        bookingNumber: detail.core.bookingNumber,
        status: detail.core.status,
        startDate: detail.core.startDate,
        endDate: detail.core.endDate,
        pickupStationName: detail.core.pickupStationName,
        returnStationName: detail.core.returnStationName,
      };
      vehicleId = detail.vehicle?.vehicleId ?? vehicleId;

      if (detail.stations.pickup) {
        station = {
          id: detail.stations.pickup.stationId,
          name: detail.stations.pickup.name,
          address: detail.stations.pickup.address,
          handoverInstructions: detail.stations.pickup.handoverInstructions,
          returnInstructions: detail.stations.pickup.returnInstructions,
        };
      }

      payment = {
        depositStatus: detail.finance.depositStatus,
        paymentStatus: detail.finance.paymentStatus,
        depositAmountCents: detail.finance.depositAmountCents,
        openAmountCents: detail.finance.openAmountCents,
        openInvoiceCount: detail.customer.openInvoiceCount,
      };

      documents = {
        bundleStatus: detail.documents.bundleStatus,
        missingCount: detail.documents.legalMissing.length + detail.documents.slots.filter((s) => s.status === 'missing').length,
        missingLabels: [
          ...detail.documents.legalMissing,
          ...detail.documents.slots.filter((s) => s.status === 'missing').map((s) => s.documentType),
        ],
        warnings: detail.documents.warnings,
      };

      tasks = {
        openCount: detail.tasks.openCount,
        overdueCount: detail.tasks.overdueCount,
        items: detail.tasks.items.slice(0, 5).map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueAt: t.dueAt,
        })),
      };

      const frontendBase = process.env.FRONTEND_URL?.trim()?.replace(/\/$/, '') ?? '';
      handover = {
        pickupCompleted: Boolean(detail.handover.pickup),
        pickupCompletedAt: detail.handover.pickup?.completedAt ?? null,
        returnCompleted: Boolean(detail.handover.return),
        returnCompletedAt: detail.handover.return?.completedAt ?? null,
        operatorBookingUrl: frontendBase
          ? `${frontendBase}/operator/bookings/${detail.core.bookingId}`
          : `/operator/bookings/${detail.core.bookingId}`,
      };
    }

    let vehicle: WhatsAppConversationContextDto['vehicle'] = null;
    if (vehicleId) {
      const v = await this.prisma.vehicle.findFirst({
        where: { id: vehicleId, organizationId: orgId },
        select: {
          id: true,
          make: true,
          model: true,
          licensePlate: true,
          vehicleName: true,
          status: true,
        },
      });
      if (v) {
        vehicle = {
          id: v.id,
          displayName:
            v.vehicleName ??
            ([v.make, v.model].filter(Boolean).join(' ') || v.licensePlate || v.id),
          licensePlate: v.licensePlate,
          status: v.status,
        };
      }
    }

    let damagesSummary: WhatsAppConversationContextDto['damages'] = null;
    if (vehicleId) {
      const open = await this.damages.findActive(vehicleId);
      damagesSummary = { openCount: open.length };
    }

    if (bookingId && !documents) {
      try {
        const bundle = await this.documentBundle.getBundleView(orgId, bookingId);
        documents = {
          bundleStatus: bundle.bundle.status,
          missingCount: bundle.missingLegalDocuments.length,
          missingLabels: bundle.missingLegalDocuments,
          warnings: bundle.warnings,
        };
      } catch {
        documents = null;
      }
    }

    const whatsappReady = Boolean(config?.isConnected && config?.isActive);

    const quickActions = this.buildQuickActions({
      whatsappReady,
      customerOptedOut,
      customer,
      booking,
      vehicle,
      station,
      documents,
      damages: damagesSummary,
      payment,
      conversationStatus: convo.status,
      providerConfigured: Boolean(config?.accessTokenConfigured && config?.phoneNumberId),
    });

    return {
      conversation: {
        id: convo.id,
        status: convo.status,
        contactPhone: convo.contactPhone,
        contactName: convo.contactName,
        customerId: convo.customerId,
        bookingId: convo.bookingId,
        vehicleId: convo.vehicleId,
        assignedTo: convo.assignedTo,
        lastDetectedIntent: convo.lastDetectedIntent,
        unreadCount: convo.unreadCount,
      },
      customer,
      booking,
      vehicle,
      station,
      documents,
      payment,
      damages: damagesSummary,
      tasks,
      handover,
      whatsapp: {
        isConnected: config?.isConnected ?? false,
        isActive: config?.isActive ?? false,
        providerConfigured: Boolean(config?.accessTokenConfigured && config?.phoneNumberId),
        customerOptedOut,
      },
      quickActions,
    };
  }

  private buildQuickActions(input: {
    whatsappReady: boolean;
    customerOptedOut: boolean;
    customer: WhatsAppConversationContextDto['customer'];
    booking: WhatsAppConversationContextDto['booking'];
    vehicle: WhatsAppConversationContextDto['vehicle'];
    station: WhatsAppConversationContextDto['station'];
    documents: WhatsAppConversationContextDto['documents'];
    damages: WhatsAppConversationContextDto['damages'];
    payment: WhatsAppConversationContextDto['payment'];
    conversationStatus: string;
    providerConfigured: boolean;
  }): WhatsAppQuickActionDef[] {
    const sendBlockReason = (): string | undefined => {
      if (input.customerOptedOut) return 'Customer opted out';
      if (!input.whatsappReady) return 'WhatsApp not connected or inactive';
      if (!input.providerConfigured) return 'WhatsApp provider not configured';
      return undefined;
    };

    const canSend = !sendBlockReason();

    const action = (
      id: WhatsAppQuickActionId,
      label: string,
      enabled: boolean,
      reason?: string,
      requiresConfirm?: boolean,
    ): WhatsAppQuickActionDef => ({
      id,
      label,
      enabled,
      reason: enabled ? undefined : reason,
      requiresConfirm,
    });

    const sendReason = sendBlockReason();

    return [
      action(
        'link_booking',
        'Link booking',
        false,
        'Select a booking in SynqDrive first — linking from inbox UI is not yet available',
      ),
      action(
        'link_customer',
        'Link customer',
        false,
        'Select a customer in SynqDrive first — linking from inbox UI is not yet available',
      ),
      action(
        'link_vehicle',
        'Link vehicle via booking',
        Boolean(input.booking?.id),
        'Link a booking first',
      ),
      action(
        'human_review',
        'Mark for human review',
        input.conversationStatus !== 'PENDING_HUMAN',
        'Already pending human review',
        true,
      ),
      action(
        'assign_user',
        'Assign to user',
        false,
        'User assignment from inbox is not yet available',
      ),
      action(
        'create_task',
        'Create task from conversation',
        Boolean(input.customer || input.booking),
        'No customer or booking linked',
      ),
      action(
        'request_missing_documents',
        'Request missing documents',
        canSend && Boolean(input.booking && (input.documents?.missingCount ?? 0) > 0),
        sendReason ?? (!input.booking ? 'No booking linked' : 'No missing documents'),
        true,
      ),
      action(
        'send_pickup_instructions',
        'Send pickup instructions',
        canSend && Boolean(input.booking && input.station),
        sendReason ?? (!input.station ? 'Pickup station not available' : 'No booking linked'),
      ),
      action(
        'send_return_instructions',
        'Send return instructions',
        canSend && Boolean(input.booking && input.station),
        sendReason ?? (!input.station ? 'Return station not available' : 'No booking linked'),
      ),
      action(
        'send_handover_link',
        'Send handover link',
        canSend && Boolean(input.booking),
        sendReason ?? 'No booking linked',
      ),
      action(
        'send_return_link',
        'Send return link',
        canSend && Boolean(input.booking),
        sendReason ?? 'No booking linked',
      ),
      action(
        'send_payment_deposit_reminder',
        'Send payment/deposit reminder',
        canSend &&
          Boolean(
            input.booking &&
              (input.payment?.paymentStatus === 'OPEN' ||
                input.payment?.paymentStatus === 'OVERDUE' ||
                input.payment?.depositStatus === 'REQUESTED'),
          ),
        sendReason ?? 'No pending payment or deposit',
        true,
      ),
      action(
        'create_damage_followup_task',
        'Create damage follow-up task',
        Boolean(input.damages && input.damages.openCount > 0),
        'No open damages on linked vehicle',
        true,
      ),
      action(
        'close_conversation',
        'Close conversation',
        input.conversationStatus !== 'CLOSED',
        'Already closed',
        true,
      ),
      action(
        'reopen_conversation',
        'Reopen conversation',
        input.conversationStatus === 'CLOSED',
        'Conversation is open',
      ),
    ];
  }
}
