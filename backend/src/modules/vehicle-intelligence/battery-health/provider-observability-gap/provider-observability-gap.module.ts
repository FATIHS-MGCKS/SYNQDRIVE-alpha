import { Module } from '@nestjs/common';
import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import { ProviderObservabilityGapRepository } from './provider-observability-gap.repository';
import { ProviderObservabilityGapService } from './provider-observability-gap.service';

@Module({
  providers: [
    BatteryPolicyProfileService,
    ProviderObservabilityGapRepository,
    ProviderObservabilityGapService,
  ],
  exports: [ProviderObservabilityGapRepository, ProviderObservabilityGapService],
})
export class ProviderObservabilityGapModule {}

export { ProviderObservabilityGapService, ProviderObservabilityGapRepository };
