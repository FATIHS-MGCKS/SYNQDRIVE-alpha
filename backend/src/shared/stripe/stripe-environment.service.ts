import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingStripeMode } from '@prisma/client';
import {
  assertBillingStripeModeMatchesRuntime,
  assertStripeWebhookLivemodeMatchesRuntime,
  ResolvedStripeEnvironment,
  resolveStripeEnvironment,
  validateStripeEnvironmentOrThrow,
} from '@shared/stripe/stripe-environment.util';

@Injectable()
export class StripeEnvironmentService implements OnModuleInit {
  private readonly logger = new Logger(StripeEnvironmentService.name);
  private resolved: ResolvedStripeEnvironment;

  constructor(private readonly configService: ConfigService) {
    this.resolved = this.loadResolved();
  }

  onModuleInit(): void {
    if (!this.resolved.configured) {
      this.logger.warn('Stripe is not configured — environment separation checks skipped');
      return;
    }

    this.resolved = validateStripeEnvironmentOrThrow(this.resolved);
    this.logger.log(
      `Stripe environment locked: runtime=${this.resolved.runtimeEnvironment} nodeEnv=${this.resolved.nodeEnv}`,
    );
  }

  getRuntimeEnvironment(): ResolvedStripeEnvironment['runtimeEnvironment'] {
    return this.resolved.runtimeEnvironment;
  }

  getBillingStripeMode(): BillingStripeMode | null {
    return this.resolved.billingStripeMode;
  }

  getRuntimeStripeMode(): BillingStripeMode | null {
    return this.resolved.billingStripeMode;
  }

  isProductionRuntime(): boolean {
    return this.resolved.isProductionNode;
  }

  assertWebhookLivemode(eventLivemode: boolean): void {
    assertStripeWebhookLivemodeMatchesRuntime(eventLivemode, this.resolved.billingStripeMode);
  }

  assertResourceStripeMode(resourceMode: BillingStripeMode): void {
    assertBillingStripeModeMatchesRuntime(resourceMode, this.resolved.billingStripeMode);
  }

  refreshFromConfig(): ResolvedStripeEnvironment {
    this.resolved = validateStripeEnvironmentOrThrow(this.loadResolved());
    return this.resolved;
  }

  private loadResolved(): ResolvedStripeEnvironment {
    return resolveStripeEnvironment({
      nodeEnv: this.configService.get<string>('app.nodeEnv'),
      secretKey: this.configService.get<string>('stripe.secretKey'),
      explicitEnvironment: this.configService.get<string | null>(
        'stripe.explicitEnvironmentSetting',
      ),
      allowTestInProduction: this.configService.get<boolean>('stripe.allowTestInProduction'),
    });
  }
}
