import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { Roles } from '@shared/decorators/roles.decorator';
import { RolesGuard } from '@shared/auth/roles.guard';

@Controller('admin/products')
@UseGuards(RolesGuard)
@Roles('MASTER_ADMIN')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async findAll() {
    return this.productsService.findAll();
  }

  @Get('stats')
  async getStats() {
    return this.productsService.getProductStats();
  }

  @Get('org/:orgId')
  async findOrgProducts(@Param('orgId') orgId: string) {
    return this.productsService.findOrgProducts(orgId);
  }

  @Post('assign')
  async assignToOrganization(
    @Body() body: { orgId: string; productSlug: string; plan?: string },
  ) {
    return this.productsService.assignProduct(body.orgId, body.productSlug, body.plan);
  }

  @Delete(':orgId/:productSlug')
  async removeFromOrganization(
    @Param('orgId') orgId: string,
    @Param('productSlug') productSlug: string,
  ) {
    return this.productsService.removeProduct(orgId, productSlug);
  }
}
