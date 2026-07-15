import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BillingStripeMode } from '@prisma/client';
import { RolesGuard } from '@shared/auth/roles.guard';
import { PermissionsGuard } from '@shared/auth/permissions.guard';
import { MasterBillingGuard } from '@shared/auth/master-billing.guard';
import { RequireMasterBilling } from '@shared/decorators/require-master-billing.decorator';
import { StripeCatalogMappingService } from './stripe-catalog-mapping.service';
import { ConnectStripeCatalogMappingDto } from './dto/stripe-catalog-mapping.dto';

@Controller('admin/billing')
@UseGuards(RolesGuard, PermissionsGuard, MasterBillingGuard)
@RequireMasterBilling()
export class StripeCatalogMappingController {
  constructor(private readonly catalogMappings: StripeCatalogMappingService) {}

  @Get('stripe-catalog-mappings')
  async listMappings(
    @Query('priceVersionId') priceVersionId?: string,
    @Query('priceBookId') priceBookId?: string,
    @Query('billingProductId') billingProductId?: string,
    @Query('stripeMode') stripeMode?: BillingStripeMode,
    @Query('includeDisabled') includeDisabled?: string,
  ) {
    return this.catalogMappings.listMappings({
      priceVersionId,
      priceBookId,
      billingProductId,
      stripeMode,
      includeDisabled: includeDisabled === 'true',
    });
  }

  @Get('stripe-catalog-mappings/:mappingId')
  async getMapping(@Param('mappingId') mappingId: string) {
    return this.catalogMappings.getMappingById(mappingId);
  }

  @Get('price-versions/:versionId/stripe-mappings')
  async listVersionMappings(@Param('versionId') versionId: string) {
    return this.catalogMappings.listMappings({ priceVersionId: versionId, includeDisabled: true });
  }

  @Get('price-versions/:versionId/stripe-mappings/:stripeMode/status')
  async getVersionMappingStatus(
    @Param('versionId') versionId: string,
    @Param('stripeMode') stripeMode: BillingStripeMode,
  ) {
    return this.catalogMappings.getMappingStatus(versionId, stripeMode);
  }

  @Post('price-versions/:versionId/stripe-mappings/connect')
  async connectMapping(
    @Param('versionId') versionId: string,
    @Body() body: ConnectStripeCatalogMappingDto,
  ) {
    return this.catalogMappings.connectMapping({
      priceVersionId: versionId,
      stripeMode: body.stripeMode,
      stripeProductId: body.stripeProductId,
      stripePriceId: body.stripePriceId,
      billingProductId: body.billingProductId,
      currency: body.currency,
      billingInterval: body.billingInterval,
    });
  }

  @Post('stripe-catalog-mappings/:mappingId/validate')
  async validateMapping(@Param('mappingId') mappingId: string) {
    return this.catalogMappings.validateMapping(mappingId);
  }

  @Post('stripe-catalog-mappings/:mappingId/deactivate')
  async deactivateMapping(@Param('mappingId') mappingId: string) {
    return this.catalogMappings.deactivateMapping(mappingId);
  }
}
