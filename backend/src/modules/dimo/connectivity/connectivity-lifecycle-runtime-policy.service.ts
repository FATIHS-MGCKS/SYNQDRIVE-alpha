import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import deviceConnectionWebhookInboxConfig from '@config/device-connection-webhook-inbox.config';
import {
  evaluateOrphanReconciliationEligibility,
  isInboxEligibleForAutomaticRuntimeReplay,
  type LifecycleReconciliationEligibility,
} from './connectivity-lifecycle-runtime.policy';

@Injectable()
export class ConnectivityLifecycleRuntimePolicyService implements OnModuleInit {
  private readonly logger = new Logger(ConnectivityLifecycleRuntimePolicyService.name);

  constructor(
    @Inject(deviceConnectionWebhookInboxConfig.KEY)
    private readonly config: ConfigType<typeof deviceConnectionWebhookInboxConfig>,
  ) {}

  onModuleInit(): void {
    if (!this.config.automaticLifecycleReconciliationEnabled) {
      this.logger.warn({
        msg: 'connectivity.lifecycle_reconciliation_disabled',
        reason: 'CONNECTIVITY_LIFECYCLE_RECONCILE_AFTER not configured',
        nodeEnv: process.env.NODE_ENV ?? 'development',
      });
      return;
    }

    this.logger.log({
      msg: 'connectivity.lifecycle_reconciliation_enabled',
      cutover: this.config.lifecycleReconcileAfter?.toISOString() ?? null,
    });
  }

  get automaticLifecycleReconciliationEnabled(): boolean {
    return this.config.automaticLifecycleReconciliationEnabled;
  }

  get lifecycleReconcileAfter(): Date | null {
    return this.config.lifecycleReconcileAfter;
  }

  evaluateOrphanReconciliationEligibility(input: {
    receivedAt: Date;
    processedAt: Date | null;
  }): LifecycleReconciliationEligibility {
    return evaluateOrphanReconciliationEligibility({
      receivedAt: input.receivedAt,
      processedAt: input.processedAt,
      lifecycleReconcileAfter: this.config.lifecycleReconcileAfter,
      automaticLifecycleReconciliationEnabled: this.config.automaticLifecycleReconciliationEnabled,
    });
  }

  isInboxEligibleForAutomaticRuntimeReplay(receivedAt: Date): boolean {
    return isInboxEligibleForAutomaticRuntimeReplay({
      receivedAt,
      lifecycleReconcileAfter: this.config.lifecycleReconcileAfter,
      automaticLifecycleReconciliationEnabled: this.config.automaticLifecycleReconciliationEnabled,
    });
  }
}
