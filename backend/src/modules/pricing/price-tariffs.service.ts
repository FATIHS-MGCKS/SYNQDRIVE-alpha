import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  CreateTariffGroupDto,
  CreateVehicleAssignmentDto,
  ExtraOptionDto,
  InsuranceOptionDto,
  MileagePackageDto,
  PublishTariffDraftDto,
  TariffRateDto,
  UpdateTariffGroupDto,
  UpsertTariffVersionDto,
} from './dto';
import { PricingMigrationService } from './pricing-migration.service';

const versionInclude = {
  rate: true,
  mileagePackages: { orderBy: { sortOrder: 'asc' as const } },
  insuranceOptions: { orderBy: { sortOrder: 'asc' as const } },
  extraOptions: { orderBy: { sortOrder: 'asc' as const } },
};

@Injectable()
export class PriceTariffsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly migration: PricingMigrationService,
  ) {}

  async getFullCatalog(orgId: string) {
    await this.migration.ensureOrgPricing(orgId);

    const priceBook = await this.prisma.priceBook.findFirst({
      where: { organizationId: orgId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!priceBook) {
      return {
        priceBook: null,
        groups: [],
        assignments: [],
        unassignedVehicleCount: 0,
      };
    }

    const groups = await this.prisma.priceTariffGroup.findMany({
      where: { organizationId: orgId, priceBookId: priceBook.id },
      orderBy: { sortOrder: 'asc' },
      include: {
        versions: {
          where: { status: { in: ['ACTIVE', 'DRAFT'] } },
          orderBy: { versionNumber: 'desc' },
          include: versionInclude,
        },
      },
    });

    const assignments = await this.prisma.vehicleTariffAssignment.findMany({
      where: { organizationId: orgId, isActive: true },
      include: {
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            licensePlate: true,
            year: true,
          },
        },
        tariffGroup: { select: { id: true, name: true, category: true } },
      },
    });

    const unassignedVehicleCount = await this.countUnassignedVehicles(orgId);

    return {
      priceBook,
      groups,
      assignments,
      unassignedVehicleCount,
    };
  }

  async createGroup(orgId: string, dto: CreateTariffGroupDto) {
    const priceBook = await this.requireActivePriceBook(orgId);
    return this.prisma.priceTariffGroup.create({
      data: {
        organizationId: orgId,
        priceBookId: priceBook.id,
        name: dto.name,
        description: dto.description,
        category: dto.category ?? dto.name,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateGroup(orgId: string, groupId: string, dto: UpdateTariffGroupDto) {
    await this.requireGroup(orgId, groupId);
    return this.prisma.priceTariffGroup.update({
      where: { id: groupId },
      data: dto,
    });
  }

  async upsertGroupVersion(
    orgId: string,
    groupId: string,
    dto: UpsertTariffVersionDto,
  ) {
    const group = await this.requireGroup(orgId, groupId);

    let version = await this.prisma.priceTariffVersion.findFirst({
      where: { organizationId: orgId, tariffGroupId: groupId, status: 'DRAFT' },
      include: versionInclude,
    });

    if (!version) {
      const maxVer = await this.prisma.priceTariffVersion.aggregate({
        where: { tariffGroupId: groupId },
        _max: { versionNumber: true },
      });
      version = await this.prisma.priceTariffVersion.create({
        data: {
          organizationId: orgId,
          priceBookId: group.priceBookId,
          tariffGroupId: groupId,
          versionNumber: (maxVer._max.versionNumber ?? 0) + 1,
          status: 'DRAFT',
          validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
        },
        include: versionInclude,
      });
    }

    if (dto.rate) {
      this.validateRate(dto.rate);
      await this.prisma.tariffRate.upsert({
        where: { tariffVersionId: version.id },
        create: {
          organizationId: orgId,
          tariffVersionId: version.id,
          ...this.rateData(dto.rate),
        },
        update: this.rateData(dto.rate),
      });
    }

    if (dto.mileagePackages) {
      await this.replaceMileagePackages(orgId, version.id, dto.mileagePackages);
    }
    if (dto.insuranceOptions) {
      await this.replaceInsuranceOptions(orgId, version.id, dto.insuranceOptions);
    }
    if (dto.extraOptions) {
      await this.replaceExtraOptions(orgId, version.id, dto.extraOptions);
    }

    return this.prisma.priceTariffVersion.findUniqueOrThrow({
      where: { id: version.id },
      include: versionInclude,
    });
  }

  async updateVersion(orgId: string, versionId: string, dto: UpsertTariffVersionDto) {
    const version = await this.requireVersion(orgId, versionId);
    if (version.status === 'ARCHIVED') {
      throw new BadRequestException('Archivierte Versionen können nicht bearbeitet werden');
    }

    if (dto.validFrom) {
      await this.prisma.priceTariffVersion.update({
        where: { id: versionId },
        data: { validFrom: new Date(dto.validFrom) },
      });
    }

    if (dto.rate) {
      this.validateRate(dto.rate);
      await this.prisma.tariffRate.upsert({
        where: { tariffVersionId: versionId },
        create: {
          organizationId: orgId,
          tariffVersionId: versionId,
          ...this.rateData(dto.rate),
        },
        update: this.rateData(dto.rate),
      });
    }

    if (dto.mileagePackages) {
      await this.replaceMileagePackages(orgId, versionId, dto.mileagePackages);
    }
    if (dto.insuranceOptions) {
      await this.replaceInsuranceOptions(orgId, versionId, dto.insuranceOptions);
    }
    if (dto.extraOptions) {
      await this.replaceExtraOptions(orgId, versionId, dto.extraOptions);
    }

    return this.prisma.priceTariffVersion.findUniqueOrThrow({
      where: { id: versionId },
      include: versionInclude,
    });
  }

  /**
   * Atomically publishes a DRAFT tariff version: archives other ACTIVE versions in the
   * group and promotes the draft. Preferred API: POST .../groups/:groupId/publish.
   *
   * @deprecated Prefer `publishTariffDraft` with explicit groupId + draftVersionId.
   */
  async activateVersion(orgId: string, versionId: string) {
    const version = await this.requireVersion(orgId, versionId);
    return this.publishTariffDraft(orgId, version.tariffGroupId, {
      draftVersionId: versionId,
    });
  }

  async publishTariffDraft(
    orgId: string,
    groupId: string,
    dto: PublishTariffDraftDto,
  ) {
    await this.requireGroup(orgId, groupId);

    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();

    await this.prisma.$transaction(
      async (tx) => {
        const draft = await tx.priceTariffVersion.findFirst({
          where: {
            id: dto.draftVersionId,
            organizationId: orgId,
            tariffGroupId: groupId,
          },
          include: { rate: true },
        });

        if (!draft) {
          const foreignDraft = await tx.priceTariffVersion.findFirst({
            where: { id: dto.draftVersionId },
            select: { organizationId: true, tariffGroupId: true },
          });
          if (foreignDraft?.organizationId !== orgId) {
            throw new NotFoundException({
              message: 'Tarif-Entwurf nicht gefunden',
              code: 'TARIFF_DRAFT_NOT_FOUND',
            });
          }
          if (foreignDraft.tariffGroupId !== groupId) {
            throw new BadRequestException({
              message: 'Entwurf gehört nicht zu dieser Tarifgruppe',
              code: 'TARIFF_DRAFT_GROUP_MISMATCH',
            });
          }
          throw new NotFoundException({
            message: 'Tarif-Entwurf nicht gefunden',
            code: 'TARIFF_DRAFT_NOT_FOUND',
          });
        }

        if (draft.status === 'ACTIVE') {
          throw new BadRequestException({
            message: 'Tarifversion ist bereits aktiv',
            code: 'TARIFF_VERSION_ALREADY_ACTIVE',
          });
        }

        if (draft.status === 'ARCHIVED') {
          throw new BadRequestException({
            message: 'Archivierte Versionen können nicht veröffentlicht werden',
            code: 'TARIFF_VERSION_ARCHIVED',
          });
        }

        if (draft.status !== 'DRAFT') {
          throw new BadRequestException({
            message: 'Nur Entwürfe können veröffentlicht werden',
            code: 'TARIFF_INVALID_STATUS',
          });
        }

        if (
          dto.expectedVersionNumber != null &&
          draft.versionNumber !== dto.expectedVersionNumber
        ) {
          throw new ConflictException({
            message: 'Entwurf wurde zwischenzeitlich geändert',
            code: 'TARIFF_DRAFT_VERSION_CONFLICT',
          });
        }

        if (!draft.rate) {
          throw new BadRequestException({
            message: 'Tarifversion benötigt eine Rate vor Veröffentlichung',
            code: 'TARIFF_RATE_REQUIRED',
          });
        }
        this.validateRate(draft.rate);

        const activeOthers = await tx.priceTariffVersion.findMany({
          where: {
            organizationId: orgId,
            tariffGroupId: groupId,
            status: 'ACTIVE',
            id: { not: dto.draftVersionId },
          },
        });

        for (const active of activeOthers) {
          await tx.priceTariffVersion.update({
            where: { id: active.id },
            data: { status: 'ARCHIVED', validTo: effectiveFrom },
          });
        }

        const promoted = await tx.priceTariffVersion.updateMany({
          where: {
            id: dto.draftVersionId,
            organizationId: orgId,
            tariffGroupId: groupId,
            status: 'DRAFT',
          },
          data: {
            status: 'ACTIVE',
            validFrom: effectiveFrom,
            validTo: null,
          },
        });

        if (promoted.count !== 1) {
          throw new ConflictException({
            message:
              'Veröffentlichung konnte nicht abgeschlossen werden — konkurrierender Vorgang oder Entwurf nicht mehr gültig',
            code: 'TARIFF_PUBLISH_CONFLICT',
          });
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.prisma.priceTariffVersion.findUniqueOrThrow({
      where: { id: dto.draftVersionId },
      include: versionInclude,
    });
  }

  async assignVehicle(orgId: string, dto: CreateVehicleAssignmentDto) {
    const group = await this.requireGroup(orgId, dto.tariffGroupId);
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, organizationId: orgId },
    });
    if (!vehicle) throw new NotFoundException('Fahrzeug nicht gefunden');

    const existing = await this.prisma.vehicleTariffAssignment.findFirst({
      where: { organizationId: orgId, vehicleId: dto.vehicleId, isActive: true },
    });
    if (existing) {
      throw new BadRequestException(
        'Fahrzeug hat bereits eine aktive Tarifzuweisung — bitte zuerst deaktivieren',
      );
    }

    return this.prisma.vehicleTariffAssignment.create({
      data: {
        organizationId: orgId,
        vehicleId: dto.vehicleId,
        tariffGroupId: group.id,
        priceBookId: group.priceBookId,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
        isActive: true,
      },
    });
  }

  async deactivateAssignment(orgId: string, assignmentId: string) {
    const row = await this.prisma.vehicleTariffAssignment.findFirst({
      where: { id: assignmentId, organizationId: orgId },
    });
    if (!row) throw new NotFoundException('Zuweisung nicht gefunden');
    return this.prisma.vehicleTariffAssignment.update({
      where: { id: assignmentId },
      data: { isActive: false, validTo: new Date() },
    });
  }

  async listUnassignedVehicles(orgId: string) {
    const assignedIds = (
      await this.prisma.vehicleTariffAssignment.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { vehicleId: true },
      })
    ).map((a) => a.vehicleId);

    return this.prisma.vehicle.findMany({
      where: {
        organizationId: orgId,
        id: assignedIds.length ? { notIn: assignedIds } : undefined,
      },
      select: {
        id: true,
        make: true,
        model: true,
        licensePlate: true,
        year: true,
        dailyRateEur: true,
      },
      orderBy: { make: 'asc' },
    });
  }

  private async countUnassignedVehicles(orgId: string) {
    const vehicles = await this.listUnassignedVehicles(orgId);
    return vehicles.length;
  }

  private async requireActivePriceBook(orgId: string) {
    let book = await this.prisma.priceBook.findFirst({
      where: { organizationId: orgId, isActive: true },
    });
    if (!book) {
      await this.migration.ensureOrgPricing(orgId);
      book = await this.prisma.priceBook.findFirst({
        where: { organizationId: orgId, isActive: true },
      });
    }
    if (!book) throw new NotFoundException('Kein aktives Preisbuch');
    return book;
  }

  private async requireGroup(orgId: string, groupId: string) {
    const group = await this.prisma.priceTariffGroup.findFirst({
      where: { id: groupId, organizationId: orgId },
    });
    if (!group) throw new NotFoundException('Tarifgruppe nicht gefunden');
    return group;
  }

  private async requireVersion(orgId: string, versionId: string) {
    const version = await this.prisma.priceTariffVersion.findFirst({
      where: { id: versionId, organizationId: orgId },
      include: { rate: true },
    });
    if (!version) throw new NotFoundException('Tarifversion nicht gefunden');
    return version;
  }

  private validateRate(rate: TariffRateDto | { dailyRateCents: number }) {
    if (rate.dailyRateCents <= 0) {
      throw new BadRequestException('dailyRateCents muss > 0 sein');
    }
  }

  private rateData(rate: TariffRateDto) {
    return {
      dailyRateCents: rate.dailyRateCents,
      weeklyRateCents: rate.weeklyRateCents ?? 0,
      monthlyRateCents: rate.monthlyRateCents ?? 0,
      includedKmPerDay: rate.includedKmPerDay ?? 200,
      extraKmPriceCents: rate.extraKmPriceCents ?? 0,
      depositAmountCents: rate.depositAmountCents ?? 0,
      minimumRentalDays: rate.minimumRentalDays ?? null,
    };
  }

  private async replaceMileagePackages(
    orgId: string,
    versionId: string,
    packages: MileagePackageDto[],
  ) {
    for (const p of packages) {
      if (p.includedKm <= 0) throw new BadRequestException('includedKm muss > 0 sein');
      if (p.priceCents < 0) throw new BadRequestException('priceCents ungültig');
    }
    await this.prisma.mileagePackage.deleteMany({
      where: { tariffVersionId: versionId, organizationId: orgId },
    });
    if (packages.length) {
      await this.prisma.mileagePackage.createMany({
        data: packages.map((p, i) => ({
          organizationId: orgId,
          tariffVersionId: versionId,
          label: p.label,
          includedKm: p.includedKm,
          priceCents: p.priceCents,
          isActive: p.isActive ?? true,
          sortOrder: p.sortOrder ?? i,
        })),
      });
    }
  }

  private async replaceInsuranceOptions(
    orgId: string,
    versionId: string,
    options: InsuranceOptionDto[],
  ) {
    for (const o of options) {
      if (o.priceCents < 0) throw new BadRequestException('Versicherungspreis ungültig');
    }
    await this.prisma.tariffInsuranceOption.deleteMany({
      where: { tariffVersionId: versionId, organizationId: orgId },
    });
    if (options.length) {
      await this.prisma.tariffInsuranceOption.createMany({
        data: options.map((o, i) => ({
          organizationId: orgId,
          tariffVersionId: versionId,
          label: o.label,
          description: o.description,
          priceCents: o.priceCents,
          pricingType: o.pricingType ?? 'PER_DAY',
          deductibleCents: o.deductibleCents,
          isDefault: o.isDefault ?? false,
          isActive: o.isActive ?? true,
          sortOrder: o.sortOrder ?? i,
        })),
      });
    }
  }

  private async replaceExtraOptions(
    orgId: string,
    versionId: string,
    options: ExtraOptionDto[],
  ) {
    for (const o of options) {
      if (o.priceCents < 0) throw new BadRequestException('Extra-Preis ungültig');
    }
    await this.prisma.tariffExtraOption.deleteMany({
      where: { tariffVersionId: versionId, organizationId: orgId },
    });
    if (options.length) {
      await this.prisma.tariffExtraOption.createMany({
        data: options.map((o, i) => ({
          organizationId: orgId,
          tariffVersionId: versionId,
          label: o.label,
          description: o.description,
          priceCents: o.priceCents,
          pricingType: o.pricingType ?? 'PER_DAY',
          isActive: o.isActive ?? true,
          sortOrder: o.sortOrder ?? i,
        })),
      });
    }
  }
}
