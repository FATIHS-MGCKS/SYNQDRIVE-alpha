import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  ExtraOptionDto,
  InsuranceOptionDto,
  MileagePackageDto,
} from './dto';

type PrismaLike = Pick<
  PrismaService,
  | 'mileagePackage'
  | 'tariffInsuranceOption'
  | 'tariffExtraOption'
  | 'bookingPriceLineItem'
>;

function assertUniquePayloadIds(ids: Array<string | undefined>, entity: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (!id) continue;
    if (seen.has(id)) {
      throw new BadRequestException({
        message: `Doppelte ${entity}-ID im Payload`,
        code: 'TARIFF_OPTION_DUPLICATE_ID',
        id,
      });
    }
    seen.add(id);
  }
}

export async function syncMileagePackagesForVersion(
  prisma: PrismaLike,
  orgId: string,
  versionId: string,
  packages: MileagePackageDto[],
): Promise<void> {
  for (const p of packages) {
    if (p.includedKm <= 0) throw new BadRequestException('includedKm muss > 0 sein');
    if (p.priceCents < 0) throw new BadRequestException('priceCents ungültig');
  }

  assertUniquePayloadIds(
    packages.map((p) => p.id),
    'MileagePackage',
  );

  const existing = await prisma.mileagePackage.findMany({
    where: { tariffVersionId: versionId, organizationId: orgId },
  });
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const keptIds = new Set<string>();

  for (let i = 0; i < packages.length; i++) {
    const p = packages[i];
    const sortOrder = p.sortOrder ?? i;
    const isActive = p.isActive ?? true;

    if (p.id) {
      const row = existingById.get(p.id);
      if (!row) {
        throw new BadRequestException({
          message: 'Kilometerpaket gehört nicht zu dieser Tarifversion',
          code: 'TARIFF_OPTION_ID_MISMATCH',
          id: p.id,
        });
      }
      await prisma.mileagePackage.update({
        where: { id: p.id },
        data: {
          label: p.label,
          includedKm: p.includedKm,
          priceCents: p.priceCents,
          isActive,
          sortOrder,
        },
      });
      keptIds.add(p.id);
      continue;
    }

    const created = await prisma.mileagePackage.create({
      data: {
        organizationId: orgId,
        tariffVersionId: versionId,
        label: p.label,
        includedKm: p.includedKm,
        priceCents: p.priceCents,
        isActive,
        sortOrder,
      },
    });
    keptIds.add(created.id);
  }

  for (const row of existing) {
    if (keptIds.has(row.id)) continue;
    await prisma.mileagePackage.update({
      where: { id: row.id },
      data: { isActive: false },
    });
  }
}

export async function syncInsuranceOptionsForVersion(
  prisma: PrismaLike,
  orgId: string,
  versionId: string,
  options: InsuranceOptionDto[],
): Promise<void> {
  for (const o of options) {
    if (o.priceCents < 0) throw new BadRequestException('Versicherungspreis ungültig');
  }

  assertUniquePayloadIds(
    options.map((o) => o.id),
    'TariffInsuranceOption',
  );

  const existing = await prisma.tariffInsuranceOption.findMany({
    where: { tariffVersionId: versionId, organizationId: orgId },
  });
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const keptIds = new Set<string>();

  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    const sortOrder = o.sortOrder ?? i;
    const isActive = o.isActive ?? true;

    if (o.id) {
      const row = existingById.get(o.id);
      if (!row) {
        throw new BadRequestException({
          message: 'Versicherungsoption gehört nicht zu dieser Tarifversion',
          code: 'TARIFF_OPTION_ID_MISMATCH',
          id: o.id,
        });
      }
      await prisma.tariffInsuranceOption.update({
        where: { id: o.id },
        data: {
          label: o.label,
          description: o.description,
          priceCents: o.priceCents,
          pricingType: o.pricingType ?? 'PER_DAY',
          deductibleCents: o.deductibleCents,
          isDefault: o.isDefault ?? false,
          isActive,
          sortOrder,
        },
      });
      keptIds.add(o.id);
      continue;
    }

    const created = await prisma.tariffInsuranceOption.create({
      data: {
        organizationId: orgId,
        tariffVersionId: versionId,
        label: o.label,
        description: o.description,
        priceCents: o.priceCents,
        pricingType: o.pricingType ?? 'PER_DAY',
        deductibleCents: o.deductibleCents,
        isDefault: o.isDefault ?? false,
        isActive,
        sortOrder,
      },
    });
    keptIds.add(created.id);
  }

  for (const row of existing) {
    if (keptIds.has(row.id)) continue;
    await prisma.tariffInsuranceOption.update({
      where: { id: row.id },
      data: { isActive: false },
    });
  }
}

export async function syncExtraOptionsForVersion(
  prisma: PrismaLike,
  orgId: string,
  versionId: string,
  options: ExtraOptionDto[],
): Promise<void> {
  for (const o of options) {
    if (o.priceCents < 0) throw new BadRequestException('Extra-Preis ungültig');
  }

  assertUniquePayloadIds(
    options.map((o) => o.id),
    'TariffExtraOption',
  );

  const existing = await prisma.tariffExtraOption.findMany({
    where: { tariffVersionId: versionId, organizationId: orgId },
  });
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const keptIds = new Set<string>();

  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    const sortOrder = o.sortOrder ?? i;
    const isActive = o.isActive ?? true;

    if (o.id) {
      const row = existingById.get(o.id);
      if (!row) {
        throw new BadRequestException({
          message: 'Extra-Option gehört nicht zu dieser Tarifversion',
          code: 'TARIFF_OPTION_ID_MISMATCH',
          id: o.id,
        });
      }
      await prisma.tariffExtraOption.update({
        where: { id: o.id },
        data: {
          label: o.label,
          description: o.description,
          priceCents: o.priceCents,
          pricingType: o.pricingType ?? 'PER_DAY',
          isActive,
          sortOrder,
        },
      });
      keptIds.add(o.id);
      continue;
    }

    const created = await prisma.tariffExtraOption.create({
      data: {
        organizationId: orgId,
        tariffVersionId: versionId,
        label: o.label,
        description: o.description,
        priceCents: o.priceCents,
        pricingType: o.pricingType ?? 'PER_DAY',
        isActive,
        sortOrder,
      },
    });
    keptIds.add(created.id);
  }

  for (const row of existing) {
    if (keptIds.has(row.id)) continue;
    await prisma.tariffExtraOption.update({
      where: { id: row.id },
      data: { isActive: false },
    });
  }
}
