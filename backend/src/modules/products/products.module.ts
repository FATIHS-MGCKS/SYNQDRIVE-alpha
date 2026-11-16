import { Module } from '@nestjs/common';
import { ActivityLogModule } from '@modules/activity-log/activity-log.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { CoreEntitlementsReadController } from './entitlements/core-entitlements-read.controller';
import { EntitlementsQueryService } from './entitlements/entitlements-query.service';
import { ProductVehicleAccessModule } from './product-vehicle-access/product-vehicle-access.module';
import { VehicleProductGrantModule } from './vehicle-product-grants/vehicle-product-grant.module';

@Module({
  imports: [ActivityLogModule, ProductVehicleAccessModule, VehicleProductGrantModule],
  controllers: [ProductsController, CoreEntitlementsReadController],
  providers: [ProductsService, EntitlementsQueryService],
  exports: [
    ProductsService,
    EntitlementsQueryService,
    ProductVehicleAccessModule,
    VehicleProductGrantModule,
  ],
})
export class ProductsModule {}
