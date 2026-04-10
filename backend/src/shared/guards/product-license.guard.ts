import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service';

export const PRODUCT_KEY = 'required_product';

/**
 * Ensures the organization has the required product license active.
 * Even if a user's role permits access, the product must be enabled
 * for the organization (Phase 3 architecture requirement).
 */
@Injectable()
export class ProductLicenseGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredProduct = this.reflector.getAllAndOverride<string>(PRODUCT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredProduct) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const organizationId = request.params.orgId || request.user?.organizationId;

    if (!organizationId) {
      throw new ForbiddenException('Organization context required');
    }

    const orgProduct = await this.prisma.organizationProduct.findFirst({
      where: {
        organizationId,
        product: { slug: requiredProduct as any },
        status: 'ACTIVE',
      },
    });

    if (!orgProduct) {
      throw new ForbiddenException(
        `Product license '${requiredProduct}' is not active for this organization`,
      );
    }

    return true;
  }
}
