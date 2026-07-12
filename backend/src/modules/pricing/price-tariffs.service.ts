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
import {
  assertTariffVersionEditable,
  assertTariffVersionPublishable,
  resolvePublishTargetStatus,
} from './tariff-version-lifecycle.util';
import { DEFAULT_TARIFF_TIMEZONE, parseTariffEffectiveInstant } from './tariff-instant.util';
import {
  syncExtraOptionsForVersion,
  syncInsuranceOptionsForVersion,
  syncMileagePackagesForVersion,
} from './tariff-option-sync.util';
import { assertStatusMatchesValidity } from './tariff-validity.util';
import { PriceTariffVersionStatus } from '@prisma/client';

const versionInclude = {
  rate: true,
  mileagePackages: { orderBy: { sortOrder: 'asc' as const } },
  insuranceOptions: { orderBy: { sortOrder: 'asc' as const } },
  extraOptions: { orderBy: { sortOrder: 'asc' as const } },
};

type VersionWithIncludes = Prisma.PriceTariffVersionGetPayload<{ include: typeof versionInclude }>;

function partitionGroupVersions(versions: VersionWithIncludes[]) {
  const byStatus = (status: PriceTariffVersionStatus) =>
    versions
      .filter((v) => v.status === status)
      .sort((a, b) => b.versionNumber - a.versionNumber);

  const activeVersion = versions.find((v) => v.status === 'ACTIVE') ?? null;
  const draftVersion = versions.find((v) => v.status === 'DRAFT') ?? null;
  const scheduledVersions = byStatus('SCHEDULED');
  const archivedVersions = byStatus('ARCHIVED');

  return {
    activeVersion,
    draftVersion,
    scheduledVersions,
    archivedVersions,
    /** Legacy flat list — draft + live + scheduled + recent archived (max 5). */
    versions: [
      ...(draftVersion ? [draftVersion] : []),
      ...(activeVersion ? [activeVersion] : []),
      ...scheduledVersions,
      ...archivedVersions.slice(0, 5),
    ],
  };
}

@Injectable()
export class PriceTariffsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly migration: PricingMigrationService,
  ) {}

  async getFullCatalog(orgId: string) {
    await this.migration.ensureOrgPricing(orgId);
    await this.promoteDueScheduledVersions(orgId);

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

    const groupsRaw = await this.prisma.priceTariffGroup.findMany({
      where: { organizationId: orgId, priceBookId: priceBook.id },
      orderBy: { sortOrder: 'asc' },
      include: {
        versions: {
          orderBy: { versionNumber: 'desc' },
          include: versionInclude,
        },
      },
    });

    const groups = groupsRaw.map((g) => {
      const partitioned = partitionGroupVersions(g.versions);
      const { versions: _flat, ...rest } = g;
      return {
        ...rest,
        ...partitioned,
      };
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
      await syncMileagePackagesForVersion(this.prisma, orgId, version.id, dto.mileagePackages);
    }
    if (dto.insuranceOptions) {
      await syncInsuranceOptionsForVersion(this.prisma, orgId, version.id, dto.insuranceOptions);
    }
    if (dto.extraOptions) {
      await syncExtraOptionsForVersion(this.prisma, orgId, version.id, dto.extraOptions);
    }

    return this.prisma.priceTariffVersion.findUniqueOrThrow({
      where: { id: version.id },
      include: versionInclude,
    });
  }

  async updateVersion(
    orgId: string,
    versionId: string,
    dto: UpsertTariffVersionDto,
    actorId?: string,
  ) {
    const version = await this.requireVersion(orgId, versionId);
    assertTariffVersionEditable(version.status);

    if (dto.validFrom) {
      await this.prisma.priceTariffVersion.update({
        where: { id: versionId },
        data: {
          validFrom: new Date(dto.validFrom),
          ...(actorId ? { updatedBy: actorId } : {}),
        },
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
      await syncMileagePackagesForVersion(this.prisma, orgId, versionId, dto.mileagePackages);
    }
    if (dto.insuranceOptions) {
      await syncInsuranceOptionsForVersion(this.prisma, orgId, versionId, dto.insuranceOptions);
    }
    if (dto.extraOptions) {
      await syncExtraOptionsForVersion(this.prisma, orgId, versionId, dto.extraOptions);
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
    actorId?: string,
  ) {
    await this.requireGroup(orgId, groupId);
    await this.promoteDueScheduledVersions(orgId);

    const org = await this.prisma.organization.findFirst({
      where: { id: orgId },
      select: { timezone: true },
    });
    const orgTimezone = org?.timezone?.trim() || DEFAULT_TARIFF_TIMEZONE;
    const effectiveFrom = dto.effectiveFrom
      ? parseTariffEffectiveInstant(dto.effectiveFrom, orgTimezone)
      : new Date();
    const targetStatus = resolvePublishTargetStatus(effectiveFrom);

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

        assertTariffVersionPublishable(draft.status);

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

        if (targetStatus === 'ACTIVE') {
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
        }

        if (targetStatus === 'SCHEDULED') {
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
              data: { validTo: effectiveFrom },
            });
          }
        }

        const promoted = await tx.priceTariffVersion.updateMany({
          where: {
            id: dto.draftVersionId,
            organizationId: orgId,
            tariffGroupId: groupId,
            status: 'DRAFT',
          },
          data: {
            status: targetStatus,
            validFrom: effectiveFrom,
            validTo: null,
            publishedAt: new Date(),
            ...(actorId ? { publishedBy: actorId, updatedBy: actorId } : {}),
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

    const published = await this.prisma.priceTariffVersion.findUniqueOrThrow({
      where: { id: dto.draftVersionId },
      include: versionInclude,
    });

    assertStatusMatchesValidity(published.status, published.validFrom, published.validTo);

    return published;
  }

  /**
   * Promotes SCHEDULED versions whose validFrom has passed to ACTIVE and archives prior ACTIVE.
   */
  async promoteDueScheduledVersions(orgId: string, now: Date = new Date()) {
    const due = await this.prisma.priceTariffVersion.findMany({
      where: {
        organizationId: orgId,
        status: 'SCHEDULED',
        validFrom: { lte: now },
      },
    });

    for (const scheduled of due) {
      await this.prisma.$transaction(async (tx) => {
        const row = await tx.priceTariffVersion.findFirst({
          where: { id: scheduled.id, organizationId: orgId, status: 'SCHEDULED' },
        });
        if (!row) return;

        const activeOthers = await tx.priceTariffVersion.findMany({
          where: {
            organizationId: orgId,
            tariffGroupId: row.tariffGroupId,
            status: 'ACTIVE',
          },
        });

        for (const active of activeOthers) {
          await tx.priceTariffVersion.update({
            where: { id: active.id },
            data: { status: 'ARCHIVED', validTo: row.validFrom },
          });
        }

        await tx.priceTariffVersion.update({
          where: { id: row.id },
          data: { status: 'ACTIVE', validTo: null },
        });
      });
    }
  }

  async assignVehicle(orgId: string, dto: CreateVehicleAssignmentDto) {
    const group = await this.requireGroup(orgId, dto.tariffGroupId);
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, organizationId: orgId },
    });
    if (!vehicle) throw new NotFoundException('Fahrzeug nicht gefunden');

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.vehicleTariffAssignment.findFirst({
        where: { organizationId: orgId, vehicleId: dto.vehicleId, isActive: true },
      });

      if (existing?.tariffGroupId === group.id) {
        return existing;
      }

      if (existing) {
        await tx.vehicleTariffAssignment.update({
          where: { id: existing.id },
          data: { isActive: false, validTo: new Date() },
        });
      }

      return tx.vehicleTariffAssignment.create({
        data: {
          organizationId: orgId,
          vehicleId: dto.vehicleId,
          tariffGroupId: group.id,
          priceBookId: group.priceBookId,
          validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
          isActive: true,
        },
      });
    });
  }

  async deleteTariffGroup(orgId: string, groupId: string) {
    await this.requireGroup(orgId, groupId);

    await this.prisma.$transaction(async (tx) => {
      await tx.vehicleTariffAssignment.updateMany({
        where: { organizationId: orgId, tariffGroupId: groupId, isActive: true },
        data: { isActive: false, validTo: new Date() },
      });

      await tx.priceTariffGroup.delete({
        where: { id: groupId },
      });
    });

    return { deleted: true, groupId };
  }

  async discardDraftVersion(orgId: string, groupId: string, versionId: string) {
    await this.requireGroup(orgId, groupId);
    const version = await this.requireVersion(orgId, versionId);

    if (version.tariffGroupId !== groupId) {
      throw new BadRequestException('Entwurf gehört nicht zu dieser Tarifgruppe');
    }
    if (version.status !== 'DRAFT') {
      throw new BadRequestException('Nur Entwürfe können verworfen werden');
    }

    await this.prisma.priceTariffVersion.delete({
      where: { id: versionId },
    });

    return { discarded: true, versionId };
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
}
