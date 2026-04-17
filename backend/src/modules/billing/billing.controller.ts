import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { RolesGuard } from '@shared/auth/roles.guard';
import { Roles } from '@shared/decorators/roles.decorator';
import { PaginationParams } from '@shared/utils/pagination';

/**
 * Resolve the org scope for a billing call.
 * - MASTER_ADMIN may pass any orgId (used for support / impersonation).
 * - All other users must resolve to their JWT organizationId, regardless of
 *   whether a query/body parameter tries to override it. This prevents any
 *   cross-tenant lookup via spoofed ?orgId= or body.orgId.
 */
function resolveOrgScope(user: any, requestedOrgId?: string | null): string {
  if (!user) {
    throw new ForbiddenException('Authentication required');
  }
  if (user.platformRole === 'MASTER_ADMIN') {
    if (!requestedOrgId) {
      throw new NotFoundException('orgId is required for admin billing lookup');
    }
    return requestedOrgId;
  }
  const jwtOrg: string | undefined = user.organizationId;
  if (!jwtOrg) {
    throw new ForbiddenException('No organization context in token');
  }
  if (requestedOrgId && requestedOrgId !== jwtOrg) {
    throw new ForbiddenException('You do not have access to this organization');
  }
  return jwtOrg;
}

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
  async findSubscriptions(
    @Query('orgId') orgId: string | undefined,
    @Req() req: any,
  ) {
    const scoped = resolveOrgScope(req?.user, orgId);
    return this.billingService.findSubscription(scoped);
  }

  @Get('billing/invoices')
  async findInvoices(
    @Query('orgId') orgId: string | undefined,
    @Query() query: PaginationParams,
    @Req() req: any,
  ) {
    const scoped = resolveOrgScope(req?.user, orgId);
    return this.billingService.findInvoices(scoped, query);
  }

  @Get('billing/subscriptions/:id')
  async findSubscriptionById(@Param('id') id: string, @Req() req: any) {
    const sub = await this.billingService.findSubscriptionById(id);
    if (!sub) throw new NotFoundException('Subscription not found');
    // Cross-tenant check: non-admins may only read their own org's subscription.
    const user = req?.user;
    if (user?.platformRole !== 'MASTER_ADMIN') {
      const jwtOrg: string | undefined = user?.organizationId;
      if (!jwtOrg || (sub as any).organizationId !== jwtOrg) {
        throw new NotFoundException('Subscription not found');
      }
    }
    return sub;
  }

  // Subscription creation is a platform operation (onboarding/Stripe sync).
  // Restricting to MASTER_ADMIN prevents arbitrary users from attaching
  // Stripe customers/subscriptions to other orgs.
  @Post('billing/subscriptions')
  @Roles('MASTER_ADMIN')
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
