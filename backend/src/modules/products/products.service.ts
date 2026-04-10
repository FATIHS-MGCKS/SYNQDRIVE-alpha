import { Injectable, NotFoundException } from '@nestjs/common';
import { OrganizationProduct, OrgProductPlan, OrgProductStatus, ProductSlug } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  TRIAL: 'Trial',
  SUSPENDED: 'Inactive',
  CANCELLED: 'Inactive',
};

const PLAN_LABELS: Record<string, string> = {
  STARTER: 'Starter',
  BUSINESS: 'Business',
  PROFESSIONAL: 'Professional',
  ENTERPRISE: 'Enterprise',
  CUSTOM: 'Custom',
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const products = await this.prisma.product.findMany({
      include: {
        organizationProducts: {
          where: { status: { in: ['ACTIVE', 'TRIAL'] } },
          select: { id: true },
        },
      },
      orderBy: { slug: 'asc' },
    });

    return products.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description ?? '',
      organizationsCount: p.organizationProducts.length,
    }));
  }

  async findOrgProducts(orgId: string) {
    const orgProducts = await this.prisma.organizationProduct.findMany({
      where: { organizationId: orgId },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });

    return orgProducts.map((op) => ({
      id: op.id,
      name: op.product.name,
      status: STATUS_LABELS[op.status] ?? op.status,
      plan: PLAN_LABELS[op.plan] ?? op.plan,
    }));
  }

  async getProductStats() {
    const products = await this.prisma.product.findMany({
      include: {
        organizationProducts: {
          select: { status: true },
        },
      },
      orderBy: { slug: 'asc' },
    });

    return products.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      totalOrgs: p.organizationProducts.length,
      active: p.organizationProducts.filter((op) => op.status === 'ACTIVE').length,
      trial: p.organizationProducts.filter((op) => op.status === 'TRIAL').length,
    }));
  }

  async assignProduct(
    orgId: string,
    productSlug: string,
    plan?: string,
  ): Promise<OrganizationProduct> {
    const product = await this.prisma.product.findUnique({
      where: { slug: productSlug as ProductSlug },
    });
    if (!product) {
      throw new NotFoundException(`Product with slug "${productSlug}" not found`);
    }

    const planValue = (plan as OrgProductPlan) || OrgProductPlan.STARTER;

    return this.prisma.organizationProduct.upsert({
      where: {
        organizationId_productId: { organizationId: orgId, productId: product.id },
      },
      create: {
        organizationId: orgId,
        productId: product.id,
        plan: planValue,
        status: OrgProductStatus.ACTIVE,
        activatedAt: new Date(),
      },
      update: {
        plan: planValue,
        status: OrgProductStatus.ACTIVE,
      },
    });
  }

  async removeProduct(orgId: string, productSlug: string): Promise<OrganizationProduct> {
    const product = await this.prisma.product.findUnique({
      where: { slug: productSlug as ProductSlug },
    });
    if (!product) {
      throw new NotFoundException(`Product with slug "${productSlug}" not found`);
    }

    const orgProduct = await this.prisma.organizationProduct.findUnique({
      where: {
        organizationId_productId: { organizationId: orgId, productId: product.id },
      },
    });
    if (!orgProduct) {
      throw new NotFoundException('Organization product assignment not found');
    }

    return this.prisma.organizationProduct.delete({
      where: { id: orgProduct.id },
    });
  }
}
