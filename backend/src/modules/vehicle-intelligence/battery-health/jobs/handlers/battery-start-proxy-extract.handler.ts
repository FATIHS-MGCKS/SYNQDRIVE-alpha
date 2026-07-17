import { Injectable, Logger } from '@nestjs/common';
import type { BatteryV2JobHandler } from '../battery-v2-job.handler';
import type { BatteryStartProxyExtractPayload } from '../battery-v2-job.types';
import { BatteryStartProxyExtractService } from '../../lv-start-proxy/battery-start-proxy-extract.service';
import { BatteryV2ProviderError } from '../battery-v2-job.errors';

@Injectable()
export class BatteryStartProxyExtractHandler
  implements BatteryV2JobHandler<'BATTERY_START_PROXY_EXTRACT'>
{
  readonly jobType = 'BATTERY_START_PROXY_EXTRACT' as const;
  private readonly logger = new Logger(BatteryStartProxyExtractHandler.name);

  constructor(private readonly extract: BatteryStartProxyExtractService) {}

  async handle(payload: BatteryStartProxyExtractPayload): Promise<void> {
    const result = await this.extract.extractAndPersist({
      organizationId: payload.organizationId,
      vehicleId: payload.vehicleId,
      tripId: payload.tripId,
      tripStartedAt: new Date(payload.tripStartedAt),
    });

    if (!result.ok) {
      throw new BatteryV2ProviderError(result.reason, {
        retryable: result.retryable,
        jobType: this.jobType,
      });
    }

    if (result.skipped) {
      this.logger.debug(
        `Start proxy skipped vehicle=${payload.vehicleId} trip=${payload.tripId} reason=${result.skipReason}`,
      );
      return;
    }

    this.logger.debug(
      `Start proxy measurements persisted vehicle=${payload.vehicleId} trip=${payload.tripId} count=${result.measurementIds.length}`,
    );
  }
}
