import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import dimoConfig from '@config/dimo.config';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import { DimoModule } from '../dimo/dimo.module';

@Module({
  imports: [ConfigModule.forFeature(dimoConfig), DimoModule],
  controllers: [VehiclesController],
  providers: [VehiclesService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
