import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getStripeClient } from './stripe-client.util';
import { SubscriptionLifecycleService } from './subscription-lifecycle.service';
import { StripeSubscriptionOrchestratorService } from './stripe-subscription-orchestrator.service';
import { SubscriptionStatus } from './domain/billing-domain.types';
import {
  assertActivationTransitionAllowed,
  assertNotAlreadyActive,
  BillingActivationGuardErrorCode,
  isStripeActivationConfirmed,
} from './domain/billing-activation-guard';

export interface BillingActivationGuardInput {
  organizationId: string;
  subscriptionId: string;
  actorUserId?: string | null;
  commandIdempotencyKey: string;
}

@Injectable()
export class BillingActivationGuardService {
  private readonly logger = new Logger(BillingActivationGuardService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly lifecycle: SubscriptionLifecycleService,
    private readonly orchestrator: StripeSubscriptionOrchestratorService,
  ) {}

  isStripeConfigured(): boolean {
    return Boolean(this.configService.get<string>('stripe.secretKey'));
  }

  async assertPreActivationContract(subscriptionId: string): Promise<void> {
    const contract = await this.lifecycle.getContractState(subscriptionId);

    try {
      assertNotAlreadyActive(contract.domainStatus);
      assertActivationTransitionAllowed(contract.domainStatus);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes(BillingActivationGuardErrorCode.ALREADY_ACTIVE)) {
        throw new ConflictException({
          code: BillingActivationGuardErrorCode.ALREADY_ACTIVE,
          message: BillingActivationGuardErrorCode.ALREADY_ACTIVE,
          domainStatus: contract.domainStatus,
        });
      }
      throw new ConflictException({
        code: BillingActivationGuardErrorCode.INVALID_TRANSITION,
        message: BillingActivationGuardErrorCode.INVALID_TRANSITION,
        fromStatus: contract.domainStatus,
        toStatus: SubscriptionStatus.ACTIVE,
      });
    }
  }

  /**
   * Push contract to Stripe as ACTIVE, then verify Stripe confirms billable state
   * before the local lifecycle commits ACTIVE.
   */
  async syncStripeAndConfirmActivation(input: BillingActivationGuardInput): Promise<{
    stripeSubscriptionId: string;
    stripeStatus: string;
  }> {
    if (!this.isStripeConfigured()) {
      throw new HttpException(
        {
          code: BillingActivationGuardErrorCode.STRIPE_NOT_CONFIGURED,
          message:
            'Stripe is not configured. Local subscription activation requires Stripe confirmation.',
        },
        HttpStatus.NOT_IMPLEMENTED,
      );
    }

    const syncResult = await this.orchestrator.syncOrganizationSubscription({
      organizationId: input.organizationId,
      subscriptionId: input.subscriptionId,
      actorUserId: input.actorUserId,
      contractDomainStatusOverride: SubscriptionStatus.ACTIVE,
      idempotencyKeySuffix: input.commandIdempotencyKey,
    });

    if (!syncResult.stripeSubscriptionId) {
      throw new ConflictException({
        code: BillingActivationGuardErrorCode.STRIPE_SUBSCRIPTION_MISSING,
        message: BillingActivationGuardErrorCode.STRIPE_SUBSCRIPTION_MISSING,
      });
    }

    const stripe = getStripeClient(this.configService.get<string>('stripe.secretKey'));
    if (!stripe) {
      throw new HttpException(
        {
          code: BillingActivationGuardErrorCode.STRIPE_NOT_CONFIGURED,
          message: BillingActivationGuardErrorCode.STRIPE_NOT_CONFIGURED,
        },
        HttpStatus.NOT_IMPLEMENTED,
      );
    }

    const stripeSub = await stripe.subscriptions.retrieve(syncResult.stripeSubscriptionId);
    if (!isStripeActivationConfirmed(stripeSub.status)) {
      this.logger.warn(
        `Stripe activation not confirmed for sub=${input.subscriptionId} stripe=${syncResult.stripeSubscriptionId} status=${stripeSub.status}`,
      );
      throw new ConflictException({
        code: BillingActivationGuardErrorCode.STRIPE_NOT_CONFIRMED,
        message: BillingActivationGuardErrorCode.STRIPE_NOT_CONFIRMED,
        stripeStatus: stripeSub.status,
        stripeSubscriptionId: syncResult.stripeSubscriptionId,
      });
    }

    return {
      stripeSubscriptionId: syncResult.stripeSubscriptionId,
      stripeStatus: stripeSub.status,
    };
  }

  async guardActivation(input: BillingActivationGuardInput): Promise<{
    stripeSubscriptionId: string;
    stripeStatus: string;
  }> {
    await this.assertPreActivationContract(input.subscriptionId);
    return this.syncStripeAndConfirmActivation(input);
  }
}
