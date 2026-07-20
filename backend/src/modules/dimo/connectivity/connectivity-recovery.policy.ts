import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import connectivityRecoveryConfig from '@config/connectivity-recovery.config';

@Injectable()
export class ConnectivityRecoveryPolicyService {
  constructor(
    @Inject(connectivityRecoveryConfig.KEY)
    private readonly config: ConfigType<typeof connectivityRecoveryConfig>,
  ) {}

  isEpisodeRecoveryEnabled(): boolean {
    return this.config.episodeRecoveryEnabled;
  }

  isReconciliationApplyEnabled(): boolean {
    return this.config.reconciliationApplyEnabled;
  }

  assertReconciliationApplyEnabled(): void {
    if (!this.isReconciliationApplyEnabled()) {
      throw new Error(
        'Episode reconciliation apply is disabled — set CONNECTIVITY_RECONCILIATION_APPLY_ENABLED=1',
      );
    }
  }
}
