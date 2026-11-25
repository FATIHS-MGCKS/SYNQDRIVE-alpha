import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrganizationProduct,
  OrganizationProductVehicleAccessMode,
  OrgProductPlan,
  OrgProductStatus,
  ProductSlug,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { MasterAdminAuditAction } from '@modules/activity-log/master-admin-audit.contract';
import { MasterAdminAuditService } from '@modules/activity-log/master-admin-audit.service';
import { defaultVehicleAccessModeForNewAssignment } from './organization-product-vehicle-access-defaults';
import {
  assertPlatformProductAssignable,
  assertPlatformProductMetadataEditable,
  assertRetiredPlatformVehicleAccessModeMutation,
} from './retired-platform-product-slugs';
import type { ParsedProductMetadataPatch } from './parse-product-metadata-patch';
import {
  buildProductMetadataAuditInput,
  persistProductMetadataMandatoryAuditTx,
} from './product-metadata-mandatory-audit.util';
import { STEP_UP_ACTION } from '@modules/iam-mfa/iam-mfa.policy';

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

type MasterAdminAuditContext = {
  correlationId: string;
  route?: string;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masterAdminAudit: MasterAdminAuditService,
  ) {}

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
      catalogStatus: p.catalogStatus,
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
      productSlug: op.product.slug,
      status: STATUS_LABELS[op.status] ?? op.status,
      plan: PLAN_LABELS[op.plan] ?? op.plan,
      vehicleAccessMode: op.vehicleAccessMode,
    }));
  }

  private storageDescription(description: string | null): string | null {
    return description;
  }

  private descriptionsEqual(a: string | null, b: string | null): boolean {
    return (a ?? null) === (b ?? null);
  }

  async findCatalogProductBySlug(productSlug: ProductSlug) {
    const product = await this.prisma.product.findUnique({
      where: { slug: productSlug },
      include: {
        organizationProducts: {
          where: { status: { in: ['ACTIVE', 'TRIAL'] } },
          select: { id: true },
        },
      },
    });
    if (!product) {
      throw new NotFoundException(`Product with slug "${productSlug}" not found`);
    }
    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description ?? '',
      catalogStatus: product.catalogStatus,
      organizationsCount: product.organizationProducts.length,
    };
  }

  async updateProductMetadataForMasterAdmin(input: {
    productSlug: ProductSlug;
    patch: ParsedProductMetadataPatch;
    actorUserId: string;
    audit: MasterAdminAuditContext;
  }) {
    assertPlatformProductMetadataEditable(input.productSlug);

    const product = await this.prisma.product.findUnique({
      where: { slug: input.productSlug },
    });
    if (!product) {
      throw new NotFoundException(`Product with slug "${input.productSlug}" not found`);
    }

    const currentName = product.name;
    const currentDescription = this.storageDescription(product.description);

    if (
      currentName !== input.patch.ifCurrentName ||
      !this.descriptionsEqual(currentDescription, input.patch.ifCurrentDescription)
    ) {
      throw new ConflictException(
        'Product metadata changed concurrently; reload and retry with current name and description',
      );
    }

    const targetDescription = this.storageDescription(input.patch.description);
    const willMutate =
      currentName !== input.patch.name ||
      !this.descriptionsEqual(currentDescription, targetDescription);

    if (!willMutate) {
      return this.findCatalogProductBySlug(input.productSlug);
    }

    const before = { name: currentName, description: currentDescription };
    const after = { name: input.patch.name, description: targetDescription };

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.updateMany({
        where: {
          id: product.id,
          slug: input.productSlug,
          name: input.patch.ifCurrentName,
          description:
            input.patch.ifCurrentDescription === null
              ? { equals: null }
              : input.patch.ifCurrentDescription,
        },
        data: {
          name: input.patch.name,
          description: targetDescription,
        },
      });

      if (updated.count !== 1) {
        throw new ConflictException(
          'Product metadata changed concurrently; reload and retry with current name and description',
        );
      }

      await persistProductMetadataMandatoryAuditTx(
        tx,
        buildProductMetadataAuditInput({
          actorUserId: input.actorUserId,
          productId: product.id,
          productSlug: input.productSlug,
          correlationId: input.audit.correlationId,
          route: input.audit.route,
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
          mfaStepUpAction: STEP_UP_ACTION.MASTER_ORGANIZATION,
          before,
          after,
        }),
      );
    });

    return this.findCatalogProductBySlug(input.productSlug);
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
      catalogStatus: p.catalogStatus,
      totalOrgs: p.organizationProducts.length,
      active: p.organizationProducts.filter((op) => op.status === 'ACTIVE').length,
      trial: p.organizationProducts.filter((op) => op.status === 'TRIAL').length,
    }));
  }

  /**
   * Legacy assign path — preserves Rental/admin callers without MFA audit envelope.
   * Does not change vehicleAccessMode on update.
   */
  async assignProduct(
    orgId: string,
    productSlug: string,
    plan?: string,
  ): Promise<OrganizationProduct> {
    assertPlatformProductAssignable(productSlug);
    const product = await this.prisma.product.findUnique({
      where: { slug: productSlug as ProductSlug },
    });
    if (!product) {
      throw new NotFoundException(`Product with slug "${productSlug}" not found`);
    }

    const planValue = (plan as OrgProductPlan) || OrgProductPlan.STARTER;

    const vehicleAccessMode = defaultVehicleAccessModeForNewAssignment(product.slug);

    return this.prisma.organizationProduct.upsert({
      where: {
        organizationId_productId: { organizationId: orgId, productId: product.id },
      },
      create: {
        organizationId: orgId,
        productId: product.id,
        plan: planValue,
        status: OrgProductStatus.ACTIVE,
        vehicleAccessMode,
        activatedAt: new Date(),
      },
      update: {
        plan: planValue,
        status: OrgProductStatus.ACTIVE,
      },
    });
  }

  async assignProductForMasterAdmin(input: {
    orgId: string;
    productSlug: ProductSlug;
    plan?: string;
    /** Omitted on reassignment preserves the stored mode; required implicitly for new rows via defaults. */
    vehicleAccessMode?: OrganizationProductVehicleAccessMode;
    actorUserId: string;
    audit?: MasterAdminAuditContext;
  }): Promise<OrganizationProduct> {
    assertPlatformProductAssignable(input.productSlug);
    const product = await this.prisma.product.findUnique({
      where: { slug: input.productSlug },
    });
    if (!product) {
      throw new NotFoundException(`Product with slug "${input.productSlug}" not found`);
    }

    const planValue = (input.plan as OrgProductPlan) || OrgProductPlan.STARTER;

    const existing = await this.prisma.organizationProduct.findUnique({
      where: {
        organizationId_productId: { organizationId: input.orgId, productId: product.id },
      },
    });

    if (existing) {
      if (
        input.vehicleAccessMode !== undefined &&
        input.vehicleAccessMode !== existing.vehicleAccessMode
      ) {
        throw new BadRequestException(
          'vehicleAccessMode cannot be changed via assign; use PATCH vehicle-access-mode',
        );
      }
      const willMutate =
        existing.plan !== planValue || existing.status !== OrgProductStatus.ACTIVE;
      if (!willMutate) {
        return existing;
      }
      const updated = await this.prisma.organizationProduct.update({
        where: { id: existing.id },
        data: {
          plan: planValue,
          status: OrgProductStatus.ACTIVE,
        },
      });
      if (input.audit) {
        await this.masterAdminAudit.record({
          auditAction: MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
          actorUserId: input.actorUserId,
          actorPlatformRole: 'MASTER_ADMIN',
          targetOrganizationId: input.orgId,
          entityId: updated.id,
          description: `Organization product reassigned (${input.productSlug})`,
          correlationId: input.audit.correlationId,
          route: input.audit.route,
          ipAddress: input.audit.ipAddress,
          userAgent: input.audit.userAgent,
          changeSummary: 'reassign',
          before: { plan: existing.plan, status: existing.status },
          after: { plan: updated.plan, status: updated.status },
          metadata: {
            domain: 'organization_product',
            action: 'reassign',
            productSlug: input.productSlug,
            vehicleAccessMode: existing.vehicleAccessMode,
          },
        });
      }
      return updated;
    }

    const vehicleAccessModeForCreate =
      input.vehicleAccessMode ?? defaultVehicleAccessModeForNewAssignment(product.slug);

    const created = await this.prisma.organizationProduct.create({
      data: {
        organizationId: input.orgId,
        productId: product.id,
        plan: planValue,
        status: OrgProductStatus.ACTIVE,
        vehicleAccessMode: vehicleAccessModeForCreate,
        activatedAt: new Date(),
      },
    });

    if (input.audit) {
      await this.masterAdminAudit.record({
        auditAction: MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
        actorUserId: input.actorUserId,
        actorPlatformRole: 'MASTER_ADMIN',
        targetOrganizationId: input.orgId,
        entityId: created.id,
        description: `Organization product assigned (${input.productSlug}) with vehicle access mode ${vehicleAccessModeForCreate}`,
        correlationId: input.audit.correlationId,
        route: input.audit.route,
        ipAddress: input.audit.ipAddress,
        userAgent: input.audit.userAgent,
        changeSummary: 'assign',
        after: {
          productSlug: input.productSlug,
          vehicleAccessMode: vehicleAccessModeForCreate,
          status: created.status,
        },
        metadata: { domain: 'organization_product', action: 'assign' },
      });
    }

    return created;
  }

  async updateVehicleAccessMode(input: {
    orgId: string;
    productSlug: ProductSlug;
    vehicleAccessMode: OrganizationProductVehicleAccessMode;
    ifCurrentVehicleAccessMode: OrganizationProductVehicleAccessMode;
    actorUserId: string;
    audit?: MasterAdminAuditContext;
  }): Promise<OrganizationProduct> {
    const product = await this.prisma.product.findUnique({
      where: { slug: input.productSlug },
    });
    if (!product) {
      throw new NotFoundException(`Product with slug "${input.productSlug}" not found`);
    }

    const orgProduct = await this.prisma.organizationProduct.findUnique({
      where: {
        organizationId_productId: { organizationId: input.orgId, productId: product.id },
      },
    });
    if (!orgProduct) {
      throw new NotFoundException('Organization product assignment not found');
    }

    if (orgProduct.vehicleAccessMode !== input.ifCurrentVehicleAccessMode) {
      throw new ConflictException(
        `Vehicle access mode expectation mismatch; expected ${input.ifCurrentVehicleAccessMode}, found ${orgProduct.vehicleAccessMode}`,
      );
    }

    if (orgProduct.vehicleAccessMode === input.vehicleAccessMode) {
      return orgProduct;
    }

    assertRetiredPlatformVehicleAccessModeMutation({
      productSlug: input.productSlug,
      from: orgProduct.vehicleAccessMode,
      to: input.vehicleAccessMode,
    });

    const updated = await this.prisma.organizationProduct.updateMany({
      where: {
        id: orgProduct.id,
        organizationId: input.orgId,
        vehicleAccessMode: input.ifCurrentVehicleAccessMode,
      },
      data: {
        vehicleAccessMode: input.vehicleAccessMode,
      },
    });

    if (updated.count !== 1) {
      const current = await this.prisma.organizationProduct.findUnique({ where: { id: orgProduct.id } });
      if (!current) {
        throw new NotFoundException('Organization product assignment not found');
      }
      throw new ConflictException(
        `Vehicle access mode changed concurrently; expected ${input.ifCurrentVehicleAccessMode}, found ${current.vehicleAccessMode}`,
      );
    }

    const result = await this.prisma.organizationProduct.findUniqueOrThrow({
      where: { id: orgProduct.id },
    });

    if (
      input.audit &&
      input.vehicleAccessMode === OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE
    ) {
      await this.masterAdminAudit.record({
        auditAction: MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
        actorUserId: input.actorUserId,
        actorPlatformRole: 'MASTER_ADMIN',
        targetOrganizationId: input.orgId,
        entityId: result.id,
        description: `Organization product vehicle access mode broadened to ORGANIZATION_WIDE (${input.productSlug})`,
        correlationId: input.audit.correlationId,
        route: input.audit.route,
        ipAddress: input.audit.ipAddress,
        userAgent: input.audit.userAgent,
        changeSummary: 'vehicle-access-mode-broaden',
        before: { vehicleAccessMode: input.ifCurrentVehicleAccessMode },
        after: { vehicleAccessMode: input.vehicleAccessMode },
        metadata: { domain: 'organization_product', action: 'vehicle_access_mode_patch' },
      });
    } else if (input.audit) {
      await this.masterAdminAudit.record({
        auditAction: MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
        actorUserId: input.actorUserId,
        actorPlatformRole: 'MASTER_ADMIN',
        targetOrganizationId: input.orgId,
        entityId: result.id,
        description: `Organization product vehicle access mode set to ${input.vehicleAccessMode} (${input.productSlug})`,
        correlationId: input.audit.correlationId,
        route: input.audit.route,
        ipAddress: input.audit.ipAddress,
        userAgent: input.audit.userAgent,
        changeSummary: 'vehicle-access-mode-narrow',
        before: { vehicleAccessMode: input.ifCurrentVehicleAccessMode },
        after: { vehicleAccessMode: input.vehicleAccessMode },
        metadata: { domain: 'organization_product', action: 'vehicle_access_mode_patch' },
      });
    }

    return result;
  }

  async removeProduct(
    orgId: string,
    productSlug: string,
    masterAdmin?: { actorUserId: string; audit: MasterAdminAuditContext },
  ): Promise<OrganizationProduct> {
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

    const deleted = await this.prisma.organizationProduct.delete({
      where: { id: orgProduct.id },
    });

    if (masterAdmin) {
      await this.masterAdminAudit.record({
        auditAction: MasterAdminAuditAction.PRIVILEGED_HTTP_MUTATION,
        actorUserId: masterAdmin.actorUserId,
        actorPlatformRole: 'MASTER_ADMIN',
        targetOrganizationId: orgId,
        entityId: orgProduct.id,
        description: `Organization product removed (${productSlug}); vehicle grants remain until explicit revoke`,
        correlationId: masterAdmin.audit.correlationId,
        route: masterAdmin.audit.route,
        ipAddress: masterAdmin.audit.ipAddress,
        userAgent: masterAdmin.audit.userAgent,
        changeSummary: 'remove',
        before: {
          vehicleAccessMode: orgProduct.vehicleAccessMode,
          status: orgProduct.status,
        },
        metadata: { domain: 'organization_product', action: 'remove' },
      });
    }

    return deleted;
  }
}