import { Module } from '@nestjs/common';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { VendorMapboxService } from './vendor-mapbox.service';
import { ServiceCasesModule } from '@modules/service-cases/service-cases.module';

@Module({
  imports: [ServiceCasesModule],
  controllers: [VendorsController],
  providers: [VendorsService, VendorMapboxService],
  exports: [VendorsService],
})
export class VendorsModule {}
