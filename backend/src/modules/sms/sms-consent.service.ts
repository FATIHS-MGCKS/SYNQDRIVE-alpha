import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { normalizePhoneNumber } from '@modules/whatsapp/utils/whatsapp-phone.util';
import { SmsConsentBlockedException } from './utils/sms-errors';

const OPT_OUT_PATTERNS = [/^stop$/i, /^stopp$/i, /^unsubscribe$/i, /^abmelden$/i, /^opt[\s-]?out$/i];
const OPT_IN_PATTERNS = [/^start$/i, /^ja$/i, /^einverstanden$/i, /^opt[\s-]?in$/i];

export type SmsMessageKind = 'transactional' | 'marketing' | 'support';

@Injectable()
export class SmsConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getConsent(orgId: string, phoneNormalized: string) {
    return this.prisma.smsConsent.findUnique({
      where: { organizationId_phoneNormalized: { organizationId: orgId, phoneNormalized } },
    });
  }

  isOptedOut(consent: { optedOutAt: Date | null; optedInAt: Date | null } | null): boolean {
    if (!consent?.optedOutAt) return false;
    if (!consent.optedInAt) return true;
    return consent.optedOutAt > consent.optedInAt;
  }

  async assertCanSend(orgId: string, phone: string, kind: SmsMessageKind = 'transactional'): Promise<void> {
    const phoneNormalized = normalizePhoneNumber(phone);
    if (!phoneNormalized) return;

    const consent = await this.getConsent(orgId, phoneNormalized);
    if (!this.isOptedOut(consent)) return;

    if (kind === 'marketing') {
      throw new SmsConsentBlockedException('Customer has opted out of SMS. Marketing messages are blocked.');
    }
    if (kind === 'support' && consent && !consent.transactionalAllowed) {
      throw new SmsConsentBlockedException('Customer has opted out of non-essential SMS communication.');
    }
    if (kind !== 'transactional') {
      throw new SmsConsentBlockedException('Customer has opted out via STOP.');
    }
  }

  async processInboundConsentKeywords(
    orgId: string,
    phone: string,
    body: string,
    customerId?: string | null,
  ): Promise<'opt_out' | 'opt_in' | null> {
    const trimmed = body.trim();
    const phoneNormalized = normalizePhoneNumber(phone);
    if (!phoneNormalized) return null;

    if (OPT_OUT_PATTERNS.some((p) => p.test(trimmed))) {
      await this.setOptOut(orgId, phoneNormalized, customerId, 'inbound_stop');
      return 'opt_out';
    }
    if (OPT_IN_PATTERNS.some((p) => p.test(trimmed))) {
      await this.setOptIn(orgId, phoneNormalized, customerId, 'inbound_start');
      return 'opt_in';
    }
    return null;
  }

  private async setOptOut(
    orgId: string,
    phoneNormalized: string,
    customerId: string | null | undefined,
    source: string,
  ) {
    await this.prisma.smsConsent.upsert({
      where: { organizationId_phoneNormalized: { organizationId: orgId, phoneNormalized } },
      create: {
        organizationId: orgId,
        phoneNormalized,
        customerId: customerId ?? null,
        optedOutAt: new Date(),
        marketingAllowed: false,
        transactionalAllowed: true,
        source,
      },
      update: {
        optedOutAt: new Date(),
        marketingAllowed: false,
        customerId: customerId ?? undefined,
        source,
      },
    });
    void this.audit.record({
      actorOrganizationId: orgId,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.INTEGRATION,
      description: 'SMS opt-out recorded from inbound STOP keyword',
      metaJson: { phoneNormalized, source },
    });
  }

  private async setOptIn(
    orgId: string,
    phoneNormalized: string,
    customerId: string | null | undefined,
    source: string,
  ) {
    await this.prisma.smsConsent.upsert({
      where: { organizationId_phoneNormalized: { organizationId: orgId, phoneNormalized } },
      create: {
        organizationId: orgId,
        phoneNormalized,
        customerId: customerId ?? null,
        optedInAt: new Date(),
        optedOutAt: null,
        marketingAllowed: false,
        transactionalAllowed: true,
        source,
      },
      update: {
        optedInAt: new Date(),
        optedOutAt: null,
        customerId: customerId ?? undefined,
        source,
      },
    });
  }
}
