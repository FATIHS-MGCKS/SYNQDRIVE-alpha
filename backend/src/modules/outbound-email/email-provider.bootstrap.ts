import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailProviderBootstrap implements OnModuleInit {
  private readonly logger = new Logger(EmailProviderBootstrap.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const provider = this.config.get<string>('email.provider', 'dev');
    const isProd = (process.env.NODE_ENV || 'development') === 'production';

    if (!isProd) {
      this.logger.log(`Email provider active: ${provider}`);
      return;
    }

    if (provider === 'dev') {
      this.logger.warn(
        'EMAIL_PROVIDER=dev in production — outbound emails will be simulated only',
      );
      return;
    }

    if (provider === 'resend') {
      const apiKey = this.config.get<string>('email.resendApiKey', '');
      if (!apiKey?.trim()) {
        throw new Error(
          'FATAL: RESEND_API_KEY is required when EMAIL_PROVIDER=resend in production',
        );
      }
      this.logger.log('Email provider active: resend');
      return;
    }

    if (provider === 'postmark') {
      throw new Error(
        'FATAL: EMAIL_PROVIDER=postmark is not implemented — use resend or dev',
      );
    }
  }
}
