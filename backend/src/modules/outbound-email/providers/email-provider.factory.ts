import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailProviderPort } from './email-provider.port';
import { DevEmailProvider } from './dev-email.provider';
import { ResendEmailProvider } from './resend/resend-email.provider';

@Injectable()
export class EmailProviderFactory {
  private readonly logger = new Logger(EmailProviderFactory.name);
  private readonly provider: EmailProviderPort;

  constructor(
    private readonly config: ConfigService,
    private readonly devProvider: DevEmailProvider,
    private readonly resendProvider: ResendEmailProvider,
  ) {
    const providerId = this.config.get<string>('email.provider', 'dev');
    switch (providerId) {
      case 'resend':
        this.provider = this.resendProvider;
        this.logger.log('Outbound email provider: resend');
        break;
      case 'postmark':
        this.logger.warn(
          'EMAIL_PROVIDER=postmark is not implemented — falling back to dev provider',
        );
        this.provider = this.devProvider;
        break;
      default:
        this.provider = this.devProvider;
        this.logger.log('Outbound email provider: dev (simulated)');
    }
  }

  getProvider(): EmailProviderPort {
    return this.provider;
  }
}
