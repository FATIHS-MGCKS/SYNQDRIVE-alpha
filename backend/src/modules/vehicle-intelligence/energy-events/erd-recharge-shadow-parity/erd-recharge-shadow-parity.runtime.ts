import { Injectable, Logger, Optional } from '@nestjs/common';
import { ErdRechargeShadowParityService } from './erd-recharge-shadow-parity.service';
import { ErdRechargeShadowParityMetricsService } from './erd-recharge-shadow-parity.metrics';
import { resolveErdRechargeShadowRuntimeAuthorization } from './erd-recharge-shadow-runtime-scope.policy';
import { ERD_RECHARGE_SHADOW_RUN_RESULT } from './erd-recharge-shadow-parity.types';

@Injectable()
export class ErdRechargeShadowParityRuntimeService {
  private readonly logger = new Logger(ErdRechargeShadowParityRuntimeService.name);

  constructor(
    private readonly parityService: ErdRechargeShadowParityService,
    @Optional() private readonly metrics?: ErdRechargeShadowParityMetricsService,
  ) {}

  /**
   * Fail-open hook after legacy DIMO energy detection — must not affect product persistence.
   */
  runAfterEnergyDetectionSafe(input: {
    organizationId: string;
    vehicleId: string;
    windowFrom: Date;
    windowTo: Date;
  }): void {
    const authorization = resolveErdRechargeShadowRuntimeAuthorization({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      env: process.env,
    });

    if (!authorization.authorized) {
      this.metrics?.recordRun(ERD_RECHARGE_SHADOW_RUN_RESULT.SKIPPED_FLAG_OFF);
      return;
    }

    void this.parityService
      .evaluateVehicleWindow({
        ...input,
        persist: true,
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Shadow parity runtime isolated failure vehicle=${input.vehicleId}: ${message}`,
        );
        this.metrics?.recordRun(ERD_RECHARGE_SHADOW_RUN_RESULT.FAILED_ISOLATED);
      });
  }
}
