import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { grossToNetCents } from './pricing-calculation.util';

const DEFAULT_TAX_PERCENT = 19;

const DEFAULT_INSURANCES = [
  { label: 'CDW Plus', priceGross: 15, pricingType: 'PER_DAY' as const, description: 'Reduziert SB auf 0' },
  { label: 'Diebstahlschutz', priceGross: 8, pricingType: 'PER_DAY' as const },
];

const DEFAULT_EXTRAS = [
  { label: 'GPS Navigation', priceGross: 5, pricingType: 'PER_DAY' as const },
  { label: 'Kindersitz', priceGross: 8, pricingType: 'PER_DAY' as const },
];

const DEFAULT_PACKAGES = [
  { label: '500 km Paket', includedKm: 500, priceGross: 69 },
  { label: '1000 km Paket', includedKm: 1000, priceGross: 119 },
];

function inferCategory(model: string, fuelType: string): string {
  if (fuelType === 'ELECTRIC') return 'Electric';
  const lm = model.toLowerCase();
  if (lm.includes('touran') || lm.includes('transporter')) return 'Van';
  if (lm.includes('golf') || lm.includes('fiat')) return 'Compact';
  if (lm.includes('audi') || lm.includes('mercedes') || lm.includes('bmw')) return 'Premium';
  return 'Sedan';
}

@Injectable()
export class PricingMigrationService {
  private readonly logger = new Logger(PricingMigrationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent: creates default price book + tariffs from vehicle legacy rates. */
  async ensureOrgPricing(orgId: string): Promise<{ migrated: boolean; vehiclesAssigned: number }> {
    const existingBook = await this.prisma.priceBook.findFirst({
      where: { organizationId: orgId, isActive: true },
    });
    if (existingBook) {
      const assignmentCount = await this.prisma.vehicleTariffAssignment.count({
        where: { organizationId: orgId, isActive: true },
      });
      if (assignmentCount > 0) {
        return { migrated: false, vehiclesAssigned: assignmentCount };
      }
    }

    const vehicles = await this.prisma.vehicle.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        model: true,
        fuelType: true,
        year: true,
        dailyRateEur: true,
        weeklyRateEur: true,
        monthlyRateEur: true,
        extraKmPrice: true,
      },
    });

    if (vehicles.length === 0) {
      return { migrated: false, vehiclesAssigned: 0 };
    }

    const priceBook =
      existingBook ??
      (await this.prisma.priceBook.create({
        data: {
          organizationId: orgId,
          name: 'Standard Preisbuch',
          currency: 'EUR',
          taxRatePercent: DEFAULT_TAX_PERCENT,
        },
      }));

    const groupsByCategory = new Map<string, string>();
    let assigned = 0;

    for (const v of vehicles) {
      const category = inferCategory(v.model, v.fuelType);
      let groupId = groupsByCategory.get(category);

      if (!groupId) {
        let group = await this.prisma.priceTariffGroup.findFirst({
          where: { organizationId: orgId, priceBookId: priceBook.id, category },
        });
        if (!group) {
          group = await this.prisma.priceTariffGroup.create({
            data: {
              organizationId: orgId,
              priceBookId: priceBook.id,
              name: category,
              category,
              sortOrder: groupsByCategory.size,
            },
          });
        }

        groupId = group.id;
        groupsByCategory.set(category, groupId);

        const hasActive = await this.prisma.priceTariffVersion.findFirst({
          where: { tariffGroupId: groupId, status: 'ACTIVE' },
        });

        if (!hasActive) {
          const sample = vehicles.find(
            (sv) => inferCategory(sv.model, sv.fuelType) === category,
          )!;
          const dailyGross =
            sample.dailyRateEur != null && sample.dailyRateEur > 0
              ? Math.round(sample.dailyRateEur * 100)
              : this.demoDailyGross(category, sample.year);
          const weeklyGross =
            sample.weeklyRateEur != null && sample.weeklyRateEur > 0
              ? Math.round(sample.weeklyRateEur * 100)
              : Math.round(dailyGross * 5.5);
          const monthlyGross =
            sample.monthlyRateEur != null && sample.monthlyRateEur > 0
              ? Math.round(sample.monthlyRateEur * 100)
              : Math.round(dailyGross * 20);
          const extraKmGross =
            sample.extraKmPrice != null && sample.extraKmPrice > 0
              ? Math.round(sample.extraKmPrice * 100)
              : 22;

          const version = await this.prisma.priceTariffVersion.create({
            data: {
              organizationId: orgId,
              priceBookId: priceBook.id,
              tariffGroupId: groupId,
              versionNumber: 1,
              status: 'ACTIVE',
              validFrom: new Date(),
              rate: {
                create: {
                  organizationId: orgId,
                  dailyRateCents: grossToNetCents(dailyGross, DEFAULT_TAX_PERCENT),
                  weeklyRateCents: grossToNetCents(weeklyGross, DEFAULT_TAX_PERCENT),
                  monthlyRateCents: grossToNetCents(monthlyGross, DEFAULT_TAX_PERCENT),
                  includedKmPerDay: 200,
                  extraKmPriceCents: extraKmGross,
                  depositAmountCents: Math.round(dailyGross * 3),
                },
              },
            },
          });

          await this.seedDefaultOptions(orgId, version.id, category);
        }
      }

      const activeAssignment = await this.prisma.vehicleTariffAssignment.findFirst({
        where: { organizationId: orgId, vehicleId: v.id, isActive: true },
      });
      if (!activeAssignment) {
        await this.prisma.vehicleTariffAssignment.create({
          data: {
            organizationId: orgId,
            vehicleId: v.id,
            tariffGroupId: groupId,
            priceBookId: priceBook.id,
            validFrom: new Date(),
            isActive: true,
          },
        });
        assigned++;
      }
    }

    this.logger.log(`Pricing migration for org ${orgId}: ${assigned} vehicles assigned`);
    return { migrated: true, vehiclesAssigned: assigned };
  }

  private demoDailyGross(category: string, year: number): number {
    const base =
      category === 'Premium' ? 8900 : category === 'Electric' ? 7900 : category === 'Sedan' ? 5900 : 4500;
    const yearMod = year >= 2025 ? 1200 : year >= 2024 ? 600 : 0;
    return base + yearMod;
  }

  private async seedDefaultOptions(
    orgId: string,
    versionId: string,
    category: string,
  ) {
    const mult = category === 'Premium' ? 1.4 : category === 'Electric' ? 1.2 : 1;

    for (const [i, pkg] of DEFAULT_PACKAGES.entries()) {
      await this.prisma.mileagePackage.create({
        data: {
          organizationId: orgId,
          tariffVersionId: versionId,
          label: pkg.label,
          includedKm: pkg.includedKm,
          priceCents: grossToNetCents(Math.round(pkg.priceGross * 100 * mult), DEFAULT_TAX_PERCENT),
          sortOrder: i,
        },
      });
    }

    for (const [i, ins] of DEFAULT_INSURANCES.entries()) {
      await this.prisma.tariffInsuranceOption.create({
        data: {
          organizationId: orgId,
          tariffVersionId: versionId,
          label: ins.label,
          description: ins.description,
          priceCents: grossToNetCents(Math.round(ins.priceGross * 100 * mult), DEFAULT_TAX_PERCENT),
          pricingType: ins.pricingType,
          sortOrder: i,
        },
      });
    }

    for (const [i, ext] of DEFAULT_EXTRAS.entries()) {
      await this.prisma.tariffExtraOption.create({
        data: {
          organizationId: orgId,
          tariffVersionId: versionId,
          label: ext.label,
          priceCents: grossToNetCents(Math.round(ext.priceGross * 100 * mult), DEFAULT_TAX_PERCENT),
          pricingType: ext.pricingType,
          sortOrder: i,
        },
      });
    }
  }
}
