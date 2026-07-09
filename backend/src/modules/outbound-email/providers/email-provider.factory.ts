import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailProviderPort } from './email-provider.port';
import { DevEmailProvider } from './dev-email.provider';

@Injectable()
export class EmailProviderFactory {
  private readonly logger = new Logger(EmailProviderFactory.name);
  private readonly provider: EmailProviderPort;

  constructor(
    private readonly config: ConfigService,
    private readonly devProvider: DevEmailProvider,
  ) {
    const providerId = this.config.get<string>('email.provider', 'dev');
    switch (providerId) {
      case 'resend':
      case 'postmark':
        this.logger.warn(
          `EMAIL_PROVIDER=${providerId} is not wired yet — falling back to dev provider`,
        );
        this.provider = this.devProvider;
        break;
      default:
        this.provider = this.devProvider;
    }
  }

  getProvider(): EmailProviderPort {
    return this.provider;
  }
}
