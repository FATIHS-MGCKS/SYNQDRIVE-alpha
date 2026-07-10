import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  EmailProviderPort,
  RegisterDomainInput,
  RegisterDomainResult,
  SendEmailInput,
  SendEmailResult,
  VerifyDomainResult,
} from './email-provider.port';

@Injectable()
export class DevEmailProvider implements EmailProviderPort {
  private readonly logger = new Logger(DevEmailProvider.name);

  readonly providerName = 'dev';
  readonly isSimulated = true;

  isConfigured(): boolean {
    return true;
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const attachmentSummary = (input.attachments ?? [])
      .map((a) => `${a.fileName} (${a.content.length} bytes)`)
      .join(', ');

    this.logger.log(
      `[email-simulated] to=${input.toEmail} from=${input.fromEmail} subject=${input.subject} attachments=[${attachmentSummary}]`,
    );

    return {
      provider: this.providerName,
      providerMessageId: `dev_${randomUUID()}`,
      status: 'SENT_SIMULATED',
    };
  }

  async registerDomain(input: RegisterDomainInput): Promise<RegisterDomainResult> {
    const providerDomainId = `dev_domain_${input.domain.replace(/\./g, '_')}`;
    return {
      providerDomainId,
      status: 'PENDING_DNS',
      dnsRecords: [
        {
          type: 'TXT',
          name: `_synqdrive.${input.domain}`,
          value: 'synqdrive-dev-verify',
          status: 'pending',
        },
      ],
    };
  }

  async verifyDomain(providerDomainId: string): Promise<VerifyDomainResult> {
    return {
      status: providerDomainId.startsWith('dev_domain_') ? 'VERIFIED' : 'FAILED',
      failureReason: providerDomainId.startsWith('dev_domain_') ? null : 'Unknown dev domain',
    };
  }

  async getDomain(providerDomainId: string): Promise<VerifyDomainResult> {
    return this.verifyDomain(providerDomainId);
  }
}
