import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppBookingReminderService } from './whatsapp-booking-reminder.service';

/**
 * Thin facade for future workflow/automation integration.
 * TODO: Wire WorkflowEventService handlers when notification.prepare should send WhatsApp.
 */
@Injectable()
export class WhatsAppAutomationHooksService {
  private readonly logger = new Logger(WhatsAppAutomationHooksService.name);

  constructor(private readonly reminders: WhatsAppBookingReminderService) {}

  /** TODO: Hook on booking.created / booking.confirmed workflow events */
  async onBookingConfirmed(orgId: string, bookingId: string) {
    this.logger.debug(`[TODO automation] booking.confirmed → WhatsApp for ${bookingId} in ${orgId}`);
    return this.reminders.sendBookingConfirmationWhatsApp(orgId, bookingId);
  }

  /** TODO: Hook on pickup approaching (scheduler or insight detector) */
  async onPickupApproaching(orgId: string, bookingId: string) {
    return this.reminders.sendPickupReminderWhatsApp(orgId, bookingId);
  }

  /** TODO: Hook on return approaching */
  async onReturnApproaching(orgId: string, bookingId: string) {
    return this.reminders.sendReturnReminderWhatsApp(orgId, bookingId);
  }

  /** TODO: Hook on document bundle missing items */
  async onMissingDocumentsDetected(orgId: string, bookingId: string) {
    return this.reminders.sendMissingDocumentsReminderWhatsApp(orgId, bookingId);
  }

  /** TODO: Hook on deposit/payment pending */
  async onPaymentDepositPending(orgId: string, bookingId: string) {
    return this.reminders.sendPaymentDepositReminderWhatsApp(orgId, bookingId);
  }

  /** TODO: Hook on damage case created */
  async onDamageCaseCreated(orgId: string, damageId: string) {
    return this.reminders.sendDamageFollowupWhatsApp(orgId, damageId);
  }

  /** TODO: Hook when handover is ready for customer */
  async onHandoverReady(orgId: string, bookingId: string) {
    return this.reminders.sendHandoverLinkWhatsApp(orgId, bookingId);
  }

  /** TODO: Hook after return inspection completed */
  async onReturnInspectionCompleted(orgId: string, bookingId: string) {
    return this.reminders.sendReturnLinkWhatsApp(orgId, bookingId);
  }

  /** TODO: Support ticket update — aiCanCreateSupport not wired yet */
  async onSupportTicketUpdate(_orgId: string, _ticketId: string) {
    this.logger.debug('[TODO automation] support ticket update → WhatsApp not connected yet');
    return { ok: false, reason: 'Support ticket WhatsApp integration not connected yet' };
  }
}
