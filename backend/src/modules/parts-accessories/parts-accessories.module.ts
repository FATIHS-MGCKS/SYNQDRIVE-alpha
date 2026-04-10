import { Module } from '@nestjs/common';
import { PartsAccessoriesService } from './parts-accessories.service';
import {
  PartsAccessoriesController,
  PartsAccessoriesAdminController,
} from './parts-accessories.controller';
import { AlzuraAdapter } from './providers/alzura.adapter';
import { EbayAdapter } from './providers/ebay.adapter';

@Module({
  controllers: [PartsAccessoriesController, PartsAccessoriesAdminController],
  providers: [PartsAccessoriesService, AlzuraAdapter, EbayAdapter],
  exports: [PartsAccessoriesService],
})
export class PartsAccessoriesModule {}
