import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmailProviderPort } from './email-provider.port';
import { DevEmailProvider } from './dev-email.provider';
import { ResendEmailProvider } from './resend-email.provider';

@Injectable()
export class EmailProviderRegistry {
  constructor(
    private readonly config: ConfigService,
    private readonly devProvider: DevEmailProvider,
    private readonly resendProvider: ResendEmailProvider,
  ) {}

  resolve(): EmailProviderPort {
    const mode = this.config.get<string>('email.provider', 'auto');
    const simulate = this.config.get<boolean>('email.simulateEnabled', false);

    if (mode === 'dev' || simulate) {
      return this.devProvider;
    }
    if (mode === 'resend' || (mode === 'auto' && this.resendProvider.isConfigured())) {
      return this.resendProvider;
    }
    return this.devProvider;
  }

  resolveForDomains(): EmailProviderPort {
    const mode = this.config.get<string>('email.provider', 'auto');
    if (mode === 'dev') return this.devProvider;
    if (this.resendProvider.isConfigured()) return this.resendProvider;
    return this.devProvider;
  }
}
