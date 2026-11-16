import { Controller, Get, Param } from '@nestjs/common';
import { OrgScoped } from '@shared/decorators/org-scoped.decorator';
import { EntitlementsQueryService } from './entitlements-query.service';

/**
 * Versioned read API for organization product entitlements (P2-PR2).
 *
 * Full path: /api/v1/core/entitlements/v1/organizations/:orgId[...]
 *
 * Authentication: user JWT (global AuthGuard).
 * Authorization: OrgScopingGuard via @OrgScoped() — no M2M service principals in P2.
 *
 * Writes remain on admin/products (MASTER_ADMIN) — not exposed here.
 */
@OrgScoped()
@Controller('core/entitlements/v1')
export class CoreEntitlementsReadController {
  constructor(private readonly entitlements: EntitlementsQueryService) {}

  @Get('organizations/:orgId')
  listOrganizationEntitlements(@Param('orgId') orgId: string) {
    return this.entitlements.listForOrganization(orgId);
  }

  @Get('organizations/:orgId/products/:productSlug')
  getOrganizationProductEntitlement(
    @Param('orgId') orgId: string,
    @Param('productSlug') productSlug: string,
  ) {
    return this.entitlements.getForOrganizationProduct(orgId, productSlug);
  }
}