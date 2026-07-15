import { Injectable } from '@nestjs/common';
import { OutboundEmailPolicyService } from '@modules/outbound-email/outbound-email-policy.service';
import { BillingEmailSuppressionService } from './billing-email-suppression.service';

export interface BillingEmailRecipientCandidate {
  email: string;
  source: 'invoice_email' | 'organization_email' | 'manager_email';
}

@Injectable()
export class BillingEmailRecipientService {
  constructor(
    private readonly policy: OutboundEmailPolicyService,
    private readonly suppression: BillingEmailSuppressionService,
  ) {}

  buildRecipientCandidates(org: {
    invoiceEmail?: string | null;
    email?: string | null;
    managerEmail?: string | null;
  }): BillingEmailRecipientCandidate[] {
    const candidates: BillingEmailRecipientCandidate[] = [];
    const push = (value: string | null | undefined, source: BillingEmailRecipientCandidate['source']) => {
      const email = value?.trim();
      if (!email || !this.policy.isValidEmail(email)) return;
      if (candidates.some((row) => row.email.toLowerCase() === email.toLowerCase())) return;
      candidates.push({ email, source });
    };
    push(org.invoiceEmail, 'invoice_email');
    push(org.email, 'organization_email');
    push(org.managerEmail, 'manager_email');
    return candidates;
  }

  async resolveRecipient(
    organizationId: string,
    org: {
      invoiceEmail?: string | null;
      email?: string | null;
      managerEmail?: string | null;
    },
    options?: { excludeEmails?: string[] },
  ): Promise<{ email: string; source: BillingEmailRecipientCandidate['source'] } | null> {
    const excluded = new Set(
      (options?.excludeEmails ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean),
    );
    for (const candidate of this.buildRecipientCandidates(org)) {
      const normalized = candidate.email.toLowerCase();
      if (excluded.has(normalized)) continue;
      if (await this.suppression.isSuppressed(organizationId, normalized)) continue;
      return candidate;
    }
    return null;
  }
}
