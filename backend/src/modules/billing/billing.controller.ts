import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { PaginationParams } from '@shared/utils/pagination';

@Controller()
@UseGuards(RolesGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('admin/billing/subscriptions')
  @Roles('MASTER_ADMIN')
  async findAllSubscriptions(@Query() query: PaginationParams) {
    return this.billingService.findAllSubscriptions(query);
  }

  @Get('admin/billing/revenue-stats')
  @Roles('MASTER_ADMIN')
  async getRevenueStats() {
    return this.billingService.getRevenueStats();
  }

  @Get('billing/subscriptions')
  async findSubscriptions(@Query('orgId') orgId: string) {
    return this.billingService.findSubscription(orgId);
  }

  @Get('billing/invoices')
  async findInvoices(
    @Query('orgId') orgId: string,
    @Query() query: PaginationParams,
  ) {
    return this.billingService.findInvoices(orgId, query);
  }

  @Get('billing/subscriptions/:id')
  async findSubscriptionById(@Param('id') id: string) {
    return this.billingService.findSubscriptionById(id);
  }

  @Post('billing/subscriptions')
  async createSubscription(
    @Body() body: { orgId: string; stripeCustomerId: string; stripeSubscriptionId: string },
  ) {
    return this.billingService.createSubscription(
      body.orgId,
      body.stripeCustomerId,
      body.stripeSubscriptionId,
    );
  }
}
