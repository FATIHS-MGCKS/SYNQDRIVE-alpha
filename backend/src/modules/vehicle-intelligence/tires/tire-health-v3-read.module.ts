import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import tireWearV3CutoverConfig from '@config/tire-wear-v3-cutover.config';
import { TireWearV3PriorModule } from './wear-v3-prior/tire-wear-v3-prior.module';
import { TireHealthV3ReadService } from './tire-health-v3-read.service';

@Module({
  imports: [
    ConfigModule.forFeature(tireWearV3CutoverConfig),
    TireWearV3PriorModule,
  ],
  providers: [TireHealthV3ReadService],
  exports: [TireHealthV3ReadService],
})
export class TireHealthV3ReadModule {}
