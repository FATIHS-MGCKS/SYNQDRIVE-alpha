import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import tireWearV3PriorShadowConfig from '@config/tire-wear-v3-prior-shadow.config';
import { TireWearV3PriorRepository } from './tire-wear-v3-prior.repository';
import { TireWearV3PriorService } from './tire-wear-v3-prior.service';

@Module({
  imports: [ConfigModule.forFeature(tireWearV3PriorShadowConfig)],
  providers: [TireWearV3PriorRepository, TireWearV3PriorService],
  exports: [TireWearV3PriorService],
})
export class TireWearV3PriorModule {}
