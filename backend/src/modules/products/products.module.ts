import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { CoreEntitlementsReadController } from './entitlements/core-entitlements-read.controller';
import { EntitlementsQueryService } from './entitlements/entitlements-query.service';
import { ProductVehicleAccessModule } from './product-vehicle-access/product-vehicle-access.module';

@Module({
  imports: [ProductVehicleAccessModule],
  controllers: [ProductsController, CoreEntitlementsReadController],
  providers: [ProductsService, EntitlementsQueryService],
  exports: [ProductsService, EntitlementsQueryService, ProductVehicleAccessModule],
})
export class ProductsModule {}
