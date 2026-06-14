import { Module } from '@nestjs/common';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { VendorMapboxService } from './vendor-mapbox.service';

@Module({
  controllers: [VendorsController],
  providers: [VendorsService, VendorMapboxService],
  exports: [VendorsService],
})
export class VendorsModule {}
