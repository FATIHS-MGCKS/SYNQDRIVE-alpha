import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ActivityAction, ActivityEntity } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService, AuditContext } from '@modules/activity-log/audit.service';
import {
  CreateVendorDto,
  UpdateVendorDto,
  LinkVendorVehicleDto,
  UpdateVendorVehicleLinkDto,
} from './dto';

/** Request-derived audit context (actor + traceability), built by the controller. */
type VendorAuditActor = Pick<
  AuditContext,
  'actorUserId' | 'actorOrganizationId' | 'ipAddress' | 'userAgent' | 'route'
>;

const VEHICLE_SELECT = {
  id: true,
  make: true,
  model: true,
  licensePlate: true,
  year: true,
  vin: true,
} as const;

@Injectable()
export class VendorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── master data ────────────────────────────────────────────────────────────

  async create(orgId: string, dto: CreateVendorDto, actor?: VendorAuditActor) {
    const vendor = await this.prisma.vendor.create({
      data: {
        organizationId: orgId,
        name: dto.name,
        category: dto.category,
        sourceType: dto.sourceType,
        source: dto.source,
        externalPlaceId: dto.externalPlaceId,
        street: dto.street,
        addressLine2: dto.addressLine2,
        city: dto.city,
        postalCode: dto.postalCode,
        country: dto.country,
        latitude: dto.latitude,
        longitude: dto.longitude,
        website: dto.website,
        phone: dto.phone,
        email: dto.email,
        notes: dto.notes,
        serviceAreas: dto.serviceAreas ?? [],
        contactName: dto.contactName,
        contactRole: dto.contactRole,
        contactPhone: dto.contactPhone,
        contactEmail: dto.contactEmail,
        contactNotes: dto.contactNotes,
        isActive: dto.isActive ?? true,
      },
    });

    void this.audit.record({
      ...actor,
      actorOrganizationId: orgId,
      action: ActivityAction.CREATE,
      entity: ActivityEntity.VENDOR,
      entityId: vendor.id,
      description: `Created vendor "${vendor.name}"`,
      metaJson: { category: vendor.category, source: vendor.source },
    });

    return this.findById(orgId, vendor.id);
  }

  async findAll(orgId: string) {
    const vendors = await this.prisma.vendor.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      include: {
        vendorVehicles: { include: { vehicle: { select: VEHICLE_SELECT } } },
        _count: { select: { invoices: true } },
      },
    });

    return vendors.map((v) => this.shapeVendor(v));
  }

  async findById(orgId: string, id: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, organizationId: orgId },
      include: {
        vendorVehicles: {
          include: { vehicle: { select: VEHICLE_SELECT } },
          orderBy: [{ isPreferred: 'desc' }, { createdAt: 'asc' }],
        },
        _count: { select: { invoices: true } },
      },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return this.shapeVendor(vendor);
  }

  async update(
    orgId: string,
    id: string,
    dto: UpdateVendorDto,
    actor?: VendorAuditActor,
  ) {
    await this.assertVendor(orgId, id);

    // Only master-data fields are persisted. Vehicle links are never touched
    // here — they are managed exclusively via the link endpoints.
    await this.prisma.vendor.update({
      where: { id },
      data: {
        name: dto.name,
        category: dto.category,
        sourceType: dto.sourceType,
        source: dto.source,
        externalPlaceId: dto.externalPlaceId,
        street: dto.street,
        addressLine2: dto.addressLine2,
        city: dto.city,
        postalCode: dto.postalCode,
        country: dto.country,
        latitude: dto.latitude,
        longitude: dto.longitude,
        website: dto.website,
        phone: dto.phone,
        email: dto.email,
        notes: dto.notes,
        serviceAreas: dto.serviceAreas,
        contactName: dto.contactName,
        contactRole: dto.contactRole,
        contactPhone: dto.contactPhone,
        contactEmail: dto.contactEmail,
        contactNotes: dto.contactNotes,
        isActive: dto.isActive,
      },
    });

    void this.audit.record({
      ...actor,
      actorOrganizationId: orgId,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.VENDOR,
      entityId: id,
      description: `Updated vendor "${dto.name ?? id}"`,
      changeSummary: Object.keys(dto).join(', ') || undefined,
    });

    return this.findById(orgId, id);
  }

  async remove(orgId: string, id: string, actor?: VendorAuditActor) {
    const vendor = await this.assertVendor(orgId, id);
    await this.prisma.vendor.delete({ where: { id } });

    void this.audit.critical({
      ...actor,
      actorOrganizationId: orgId,
      action: ActivityAction.DELETE,
      entity: ActivityEntity.VENDOR,
      entityId: id,
      description: `Deleted vendor "${vendor.name}"`,
    });

    return { success: true };
  }

  // ── vehicle links ───────────────────────────────────────────────────────────

  async linkVehicle(
    orgId: string,
    vendorId: string,
    dto: LinkVendorVehicleDto,
    actor?: VendorAuditActor,
  ) {
    await this.assertVendor(orgId, vendorId);
    // Strict tenancy: the vehicle must belong to the SAME org. No cross-tenant links.
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, organizationId: orgId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found in this organization');
    }

    const relationType = dto.relationType ?? 'OTHER';

    const link = await this.prisma.$transaction(async (tx) => {
      // Business rule: at most one *preferred* vendor per (vehicle, relationType).
      if (dto.isPreferred) {
        await tx.vendorVehicle.updateMany({
          where: {
            vehicleId: dto.vehicleId,
            relationType,
            isPreferred: true,
            NOT: { vendorId },
          },
          data: { isPreferred: false },
        });
      }

      return tx.vendorVehicle.upsert({
        where: { vendorId_vehicleId: { vendorId, vehicleId: dto.vehicleId } },
        create: {
          vendorId,
          vehicleId: dto.vehicleId,
          relationType,
          isPreferred: dto.isPreferred ?? false,
          priority: dto.priority,
          validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
          notes: dto.notes,
        },
        update: {
          relationType,
          isPreferred: dto.isPreferred ?? undefined,
          priority: dto.priority,
          validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
          notes: dto.notes,
        },
        include: { vehicle: { select: VEHICLE_SELECT } },
      });
    });

    void this.audit.record({
      ...actor,
      actorOrganizationId: orgId,
      action: ActivityAction.LINK,
      entity: ActivityEntity.VENDOR_VEHICLE_LINK,
      entityId: link.id,
      description: `Linked vehicle to vendor (${relationType})`,
      metaJson: { vendorId, vehicleId: dto.vehicleId, relationType },
    });

    return this.shapeLink(link);
  }

  async updateLink(
    orgId: string,
    vendorId: string,
    linkId: string,
    dto: UpdateVendorVehicleLinkDto,
    actor?: VendorAuditActor,
  ) {
    await this.assertVendor(orgId, vendorId);
    const existing = await this.prisma.vendorVehicle.findFirst({
      where: { id: linkId, vendorId },
      select: { id: true, vehicleId: true, relationType: true },
    });
    if (!existing) throw new NotFoundException('Vehicle link not found');

    const relationType = dto.relationType ?? existing.relationType;

    const link = await this.prisma.$transaction(async (tx) => {
      if (dto.isPreferred) {
        await tx.vendorVehicle.updateMany({
          where: {
            vehicleId: existing.vehicleId,
            relationType,
            isPreferred: true,
            NOT: { id: linkId },
          },
          data: { isPreferred: false },
        });
      }
      return tx.vendorVehicle.update({
        where: { id: linkId },
        data: {
          relationType: dto.relationType,
          isPreferred: dto.isPreferred,
          priority: dto.priority,
          validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
          notes: dto.notes,
        },
        include: { vehicle: { select: VEHICLE_SELECT } },
      });
    });

    void this.audit.record({
      ...actor,
      actorOrganizationId: orgId,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.VENDOR_VEHICLE_LINK,
      entityId: linkId,
      description: `Updated vehicle link (${relationType})`,
      metaJson: { vendorId, vehicleId: existing.vehicleId },
    });

    return this.shapeLink(link);
  }

  async unlinkVehicle(
    orgId: string,
    vendorId: string,
    linkId: string,
    actor?: VendorAuditActor,
  ) {
    await this.assertVendor(orgId, vendorId);
    const existing = await this.prisma.vendorVehicle.findFirst({
      where: { id: linkId, vendorId },
      select: { id: true, vehicleId: true },
    });
    if (!existing) throw new NotFoundException('Vehicle link not found');

    await this.prisma.vendorVehicle.delete({ where: { id: linkId } });

    void this.audit.record({
      ...actor,
      actorOrganizationId: orgId,
      action: ActivityAction.UNLINK,
      entity: ActivityEntity.VENDOR_VEHICLE_LINK,
      entityId: linkId,
      description: `Unlinked vehicle from vendor`,
      metaJson: { vendorId, vehicleId: existing.vehicleId },
    });

    return { success: true };
  }

  // ── detail-page data ─────────────────────────────────────────────────────────

  async getInvoices(orgId: string, vendorId: string) {
    await this.assertVendor(orgId, vendorId);
    const invoices = await this.prisma.orgInvoice.findMany({
      where: { organizationId: orgId, vendorId },
      orderBy: { invoiceDate: 'desc' },
      select: {
        id: true,
        invoiceNumber: true,
        type: true,
        title: true,
        vehicleId: true,
        totalCents: true,
        currency: true,
        status: true,
        invoiceDate: true,
        dueDate: true,
      },
    });
    return invoices;
  }

  async getAudit(orgId: string, vendorId: string, limit = 100) {
    await this.assertVendor(orgId, vendorId);
    return this.prisma.activityLog.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { entity: ActivityEntity.VENDOR, entityId: vendorId },
          {
            entity: ActivityEntity.VENDOR_VEHICLE_LINK,
            metaJson: { path: ['vendorId'], equals: vendorId },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        description: true,
        changeSummary: true,
        level: true,
        userId: true,
        createdAt: true,
      },
    });
  }

  /**
   * Vendor-scoped document storage is not modeled yet (no fabricated data).
   * The endpoint exists so the detail page can render a prepared, empty state.
   */
  async getDocuments(orgId: string, vendorId: string) {
    await this.assertVendor(orgId, vendorId);
    return [] as Array<Record<string, unknown>>;
  }

  /**
   * Vendor service/maintenance history is not modeled yet (the legacy
   * PartnerServiceCase world was removed). Returns empty until a canonical
   * ServiceCase model exists — no dummy logic.
   */
  async getServiceHistory(orgId: string, vendorId: string) {
    await this.assertVendor(orgId, vendorId);
    return [] as Array<Record<string, unknown>>;
  }

  async getStats(orgId: string) {
    const [total, active, byCategory] = await Promise.all([
      this.prisma.vendor.count({ where: { organizationId: orgId } }),
      this.prisma.vendor.count({ where: { organizationId: orgId, isActive: true } }),
      this.prisma.vendor.groupBy({
        by: ['category'],
        where: { organizationId: orgId, isActive: true },
        _count: true,
      }),
    ]);
    return {
      total,
      active,
      inactive: total - active,
      byCategory: byCategory.reduce(
        (acc, g) => ({ ...acc, [g.category]: g._count }),
        {} as Record<string, number>,
      ),
    };
  }

  // ── helpers ──────────────────────────────────────────────────────────────────

  private async assertVendor(orgId: string, id: string) {
    const vendor = await this.prisma.vendor.findFirst({
      where: { id, organizationId: orgId },
      select: { id: true, name: true },
    });
    if (!vendor) throw new NotFoundException('Vendor not found');
    return vendor;
  }

  private shapeVendor(
    v: Prisma.VendorGetPayload<{
      include: {
        vendorVehicles: { include: { vehicle: { select: typeof VEHICLE_SELECT } } };
        _count: { select: { invoices: true } };
      };
    }>,
  ) {
    const { vendorVehicles, _count, ...rest } = v;
    return {
      ...rest,
      linkedVehicles: vendorVehicles.map((vv) => this.shapeLink(vv)),
      linkedVehicleCount: vendorVehicles.length,
      invoiceCount: _count.invoices,
    };
  }

  private shapeLink(
    vv: Prisma.VendorVehicleGetPayload<{
      include: { vehicle: { select: typeof VEHICLE_SELECT } };
    }>,
  ) {
    return {
      // Vehicle fields (flat, for backward compatibility with existing UI).
      id: vv.vehicle.id,
      make: vv.vehicle.make,
      model: vv.vehicle.model,
      licensePlate: vv.vehicle.licensePlate,
      year: vv.vehicle.year,
      vin: vv.vehicle.vin,
      // Link fields.
      vendorVehicleId: vv.id,
      relationType: vv.relationType,
      isPreferred: vv.isPreferred,
      priority: vv.priority,
      validFrom: vv.validFrom,
      validUntil: vv.validUntil,
      notes: vv.notes,
    };
  }
}
