import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  WhatsAppMessageDeliveryStatus,
  WhatsAppTemplateCategory,
  WhatsAppTemplateProviderStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { BookingsService } from '@modules/bookings/bookings.service';
import { BookingDocumentBundleService } from '@modules/documents/booking-document-bundle.service';
import { DamagesService } from '@modules/vehicle-intelligence/damages/damages.service';
import { WhatsAppProviderService } from './providers/whatsapp-provider.service';
import { WhatsAppConsentService } from './whatsapp-consent.service';
import { WhatsAppMessagePolicyService } from './whatsapp-message-policy.service';
import { WhatsAppTemplateService } from './whatsapp-template.service';
import { WhatsAppProviderNotConfiguredException } from './utils/whatsapp-errors';
import { normalizePhoneNumber } from './utils/whatsapp-phone.util';

export interface ProactiveSendResult {
  conversationId: string;
  messageId: string;
  status: string;
  usedTemplate: boolean;
  templateCategory?: WhatsAppTemplateCategory;
}

@Injectable()
export class WhatsAppBookingReminderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly documentBundle: BookingDocumentBundleService,
    private readonly damages: DamagesService,
    private readonly provider: WhatsAppProviderService,
    private readonly consent: WhatsAppConsentService,
    private readonly policy: WhatsAppMessagePolicyService,
    private readonly templates: WhatsAppTemplateService,
    private readonly audit: AuditService,
  ) {}

  sendBookingConfirmationWhatsApp(orgId: string, bookingId: string) {
    return this.sendForBooking(orgId, bookingId, {
      category: WhatsAppTemplateCategory.BOOKING_CONFIRMATION,
      fallback: (detail) =>
        `Hallo! Deine Buchung ${detail.core.bookingNumber} ist bestätigt (${detail.core.status}). Abholung: ${detail.core.pickupStationName ?? 'laut Buchung'}.`,
      kind: 'transactional',
    });
  }

  sendPickupReminderWhatsApp(orgId: string, bookingId: string) {
    return this.sendForBooking(orgId, bookingId, {
      category: WhatsAppTemplateCategory.PICKUP_REMINDER,
      fallback: (detail) => {
        const station = detail.stations.pickup;
        const parts = [`Erinnerung: Abholung am ${formatDate(detail.core.startDate)}`];
        if (station?.name) parts.push(`Station ${station.name}`);
        if (station?.handoverInstructions) parts.push(station.handoverInstructions);
        return parts.join('. ');
      },
      kind: 'transactional',
    });
  }

  sendReturnReminderWhatsApp(orgId: string, bookingId: string) {
    return this.sendForBooking(orgId, bookingId, {
      category: WhatsAppTemplateCategory.RETURN_REMINDER,
      fallback: (detail) => {
        const station = detail.stations.return ?? detail.stations.pickup;
        const parts = [`Erinnerung: Rückgabe am ${formatDate(detail.core.endDate)}`];
        if (station?.name) parts.push(`Station ${station.name}`);
        if (station?.returnInstructions) parts.push(station.returnInstructions);
        return parts.join('. ');
      },
      kind: 'transactional',
    });
  }

  async sendMissingDocumentsReminderWhatsApp(orgId: string, bookingId: string) {
    const bundle = await this.documentBundle.getBundleView(orgId, bookingId);
    const missing = [
      ...bundle.missingLegalDocuments,
      ...bundle.legal.missing,
    ];
    if (missing.length === 0) {
      throw new BadRequestException('No missing documents for this booking');
    }

    return this.sendForBooking(orgId, bookingId, {
      category: WhatsAppTemplateCategory.MISSING_DOCUMENTS,
      fallback: (detail) =>
        `Für deine Buchung ${detail.core.bookingNumber} fehlen noch Dokumente: ${missing.join(', ')}. Bitte reiche diese zeitnah ein.`,
      kind: 'transactional',
    });
  }

  sendHandoverLinkWhatsApp(orgId: string, bookingId: string) {
    return this.sendForBooking(orgId, bookingId, {
      category: WhatsAppTemplateCategory.HANDOVER_LINK,
      fallback: (detail) => {
        const url = buildOperatorBookingUrl(detail.core.bookingId);
        return `Deine Übergabe ist vorbereitet. Operator-App: ${url}`;
      },
      kind: 'transactional',
    });
  }

  sendReturnLinkWhatsApp(orgId: string, bookingId: string) {
    return this.sendForBooking(orgId, bookingId, {
      category: WhatsAppTemplateCategory.RETURN_LINK,
      fallback: (detail) => {
        const url = buildOperatorBookingUrl(detail.core.bookingId);
        return `Für die Rückgabe nutze bitte unsere Operator-App: ${url}`;
      },
      kind: 'transactional',
    });
  }

  sendPaymentDepositReminderWhatsApp(orgId: string, bookingId: string) {
    return this.sendForBooking(orgId, bookingId, {
      category: WhatsAppTemplateCategory.PAYMENT_REMINDER,
      fallback: (detail) => {
        const parts = [`Erinnerung zu Buchung ${detail.core.bookingNumber}`];
        if (detail.finance.depositStatus === 'REQUESTED') {
          parts.push(`Kaution: ${detail.finance.depositStatus}`);
        }
        if (detail.finance.paymentStatus && detail.finance.paymentStatus !== 'PAID') {
          parts.push(`Zahlung: ${detail.finance.paymentStatus}`);
        }
        return parts.join('. ');
      },
      kind: 'transactional',
    });
  }

  async sendDamageFollowupWhatsApp(orgId: string, damageId: string) {
    const damage = await this.prisma.vehicleDamage.findFirst({
      where: { id: damageId, vehicle: { organizationId: orgId } },
      include: { vehicle: true },
    });
    if (!damage) throw new NotFoundException('Damage not found');

    const booking = await this.prisma.booking.findFirst({
      where: { organizationId: orgId, vehicleId: damage.vehicleId, status: { in: ['ACTIVE', 'CONFIRMED'] } },
      orderBy: { startDate: 'desc' },
      include: { customer: true },
    });

    const phone = booking?.customer?.phone ?? null;
    if (!phone) {
      throw new BadRequestException('No customer phone available for damage follow-up');
    }

    const config = await this.requireActiveWhatsApp(orgId);
    const convo = await this.findOrCreateConversation(orgId, phone, booking?.customer);

    const content = `Wir haben einen offenen Schadensfall zu deinem Fahrzeug. Bitte bleibe erreichbar — unser Team meldet sich bei dir.`;

    return this.dispatchMessage(orgId, config, convo.id, phone, content, {
      category: WhatsAppTemplateCategory.DAMAGE_FOLLOWUP,
      kind: 'transactional',
    });
  }

  private async sendForBooking(
    orgId: string,
    bookingId: string,
    opts: {
      category: WhatsAppTemplateCategory;
      fallback: (detail: NonNullable<Awaited<ReturnType<BookingsService['findDetail']>>>) => string;
      kind: 'transactional' | 'support';
    },
  ): Promise<ProactiveSendResult> {
    const detail = await this.bookings.findDetail(orgId, bookingId);
    if (!detail) throw new NotFoundException('Booking not found');

    const phone = detail.customer.phone;
    if (!phone?.trim()) {
      throw new BadRequestException('Customer has no phone number for WhatsApp');
    }

    const config = await this.requireActiveWhatsApp(orgId);
    await this.consent.assertCanSend(orgId, phone, opts.kind);

    const convo = await this.findOrCreateConversation(orgId, phone, {
      id: detail.customer.customerId,
      firstName: detail.customer.fullName.split(' ')[0] ?? null,
      lastName: detail.customer.fullName.split(' ').slice(1).join(' ') || null,
    });

    await this.prisma.whatsAppConversation.update({
      where: { id: convo.id },
      data: {
        customerId: detail.customer.customerId,
        bookingId: detail.core.bookingId,
        vehicleId: detail.vehicle?.vehicleId ?? null,
      },
    });

    const content = opts.fallback(detail);
    return this.dispatchMessage(orgId, config, convo.id, phone, content, {
      category: opts.category,
      kind: opts.kind,
    });
  }

  private async dispatchMessage(
    orgId: string,
    config: NonNullable<Awaited<ReturnType<WhatsAppBookingReminderService['requireActiveWhatsApp']>>>,
    conversationId: string,
    phone: string,
    content: string,
    opts: { category: WhatsAppTemplateCategory; kind: 'transactional' | 'support' },
  ): Promise<ProactiveSendResult> {
    const convo = await this.prisma.whatsAppConversation.findFirst({
      where: { id: conversationId, organizationId: orgId },
    });
    if (!convo) throw new NotFoundException('Conversation not found');

    const template = await this.prisma.whatsAppTemplate.findFirst({
      where: {
        organizationId: orgId,
        category: opts.category,
        providerStatus: { in: [WhatsAppTemplateProviderStatus.APPROVED, WhatsAppTemplateProviderStatus.DRAFT] },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const msg = await this.prisma.whatsAppMessage.create({
      data: {
        organizationId: orgId,
        conversationId,
        direction: 'outgoing',
        senderType: 'system',
        senderName: 'SynqDrive',
        content,
        messageType: template ? 'template' : 'text',
        templateName: template?.name ?? null,
        status: WhatsAppMessageDeliveryStatus.QUEUED,
      },
    });

    if (!this.provider.isConfigured(config)) {
      await this.prisma.whatsAppMessage.update({
        where: { id: msg.id },
        data: { status: WhatsAppMessageDeliveryStatus.FAILED, failureReason: 'WHATSAPP_PROVIDER_NOT_CONFIGURED' },
      });
      throw new WhatsAppProviderNotConfiguredException();
    }

    let usedTemplate = false;

    if (template) {
      const policy = this.policy.canSendTemplate(orgId, template);
      if (policy.allowed) {
        try {
          await this.templates.sendTemplateMessage(config, phone, template.id, {}, {
            conversationId,
            messageId: msg.id,
          });
          usedTemplate = true;
        } catch {
          // fall through to free text if template send fails
        }
      }
    }

    if (!usedTemplate) {
      const freeText = this.policy.canSendFreeText(orgId, config, convo);
      if (!freeText.allowed) {
        await this.prisma.whatsAppMessage.update({
          where: { id: msg.id },
          data: {
            status: WhatsAppMessageDeliveryStatus.FAILED,
            failureReason: freeText.reason ?? 'Free text blocked outside service window',
          },
        });
        throw new BadRequestException(
          freeText.reason ?? 'Cannot send free-text reminder — use an approved template outside the service window',
        );
      }

      const result = await this.provider.sendTextMessage(config, phone, content, {
        organizationId: orgId,
        conversationId,
        messageId: msg.id,
      });

      await this.prisma.whatsAppMessage.update({
        where: { id: msg.id },
        data: {
          status:
            result.status === 'FAILED'
              ? WhatsAppMessageDeliveryStatus.FAILED
              : WhatsAppMessageDeliveryStatus.SENT,
          providerMessageId: result.providerMessageId ?? null,
          failureReason: result.failureReason ?? null,
        },
      });
    } else {
      await this.prisma.whatsAppMessage.update({
        where: { id: msg.id },
        data: { status: WhatsAppMessageDeliveryStatus.SENT },
      });
    }

    await this.prisma.whatsAppConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date(), lastMessagePreview: content.slice(0, 120) },
    });

    void this.audit.record({
      actorOrganizationId: orgId,
      action: ActivityAction.CREATE,
      entity: ActivityEntity.INTEGRATION,
      entityId: msg.id,
      description: `WhatsApp proactive reminder (${opts.category})`,
    });

    const updated = await this.prisma.whatsAppMessage.findUnique({ where: { id: msg.id } });

    return {
      conversationId,
      messageId: msg.id,
      status: updated?.status ?? 'QUEUED',
      usedTemplate,
      templateCategory: opts.category,
    };
  }

  private async requireActiveWhatsApp(orgId: string) {
    const config = await this.prisma.orgWhatsAppConfig.findUnique({
      where: { organizationId: orgId },
    });
    if (!config?.isConnected || !config.isActive) {
      throw new BadRequestException('WhatsApp is not connected or active for this organization');
    }
    return config;
  }

  private async findOrCreateConversation(
    orgId: string,
    phone: string,
    customer?: { id: string; firstName: string | null; lastName: string | null } | null,
  ) {
    const phoneNormalized = normalizePhoneNumber(phone);
    if (!phoneNormalized) throw new BadRequestException('Invalid customer phone');

    const existing = await this.prisma.whatsAppConversation.findUnique({
      where: { organizationId_contactPhoneNormalized: { organizationId: orgId, contactPhoneNormalized: phoneNormalized } },
    });
    if (existing) return existing;

    const displayName = customer
      ? [customer.firstName, customer.lastName].filter(Boolean).join(' ') || null
      : null;

    return this.prisma.whatsAppConversation.create({
      data: {
        organizationId: orgId,
        contactPhone: phone,
        contactPhoneNormalized: phoneNormalized,
        contactName: displayName,
        customerId: customer?.id ?? null,
      },
    });
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

function buildOperatorBookingUrl(bookingId: string): string {
  const base = process.env.FRONTEND_URL?.trim()?.replace(/\/$/, '') ?? '';
  return base ? `${base}/operator/bookings/${bookingId}` : `/operator/bookings/${bookingId}`;
}
