import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DamageType, DamageSeverity } from '@prisma/client';

@Injectable()
export class DamagesService {
  constructor(private readonly prisma: PrismaService) {}

  async findByVehicle(vehicleId: string) {
    return this.prisma.vehicleDamage.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
      include: { images: true },
    });
  }

  async findActive(vehicleId: string) {
    return this.prisma.vehicleDamage.findMany({
      where: { vehicleId, repairedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { images: true },
    });
  }

  async findById(id: string) {
    return this.prisma.vehicleDamage.findUnique({
      where: { id },
      include: { images: true },
    });
  }

  async create(data: {
    vehicleId: string;
    damageType: DamageType;
    severity?: DamageSeverity;
    description?: string;
    locationX?: number;
    locationY?: number;
    locationLabel?: string;
    estimatedCostCents?: number;
    reportedBy?: string;
    images?: { imageData: string; caption?: string }[];
  }) {
    return this.prisma.vehicleDamage.create({
      data: {
        vehicle: { connect: { id: data.vehicleId } },
        damageType: data.damageType,
        severity: data.severity ?? 'MINOR',
        description: data.description,
        locationX: data.locationX,
        locationY: data.locationY,
        locationLabel: data.locationLabel,
        estimatedCostCents: data.estimatedCostCents,
        reportedBy: data.reportedBy,
        ...(data.images?.length ? {
          images: {
            create: data.images.map(img => ({
              imageData: img.imageData,
              caption: img.caption,
            })),
          },
        } : {}),
      },
      include: { images: true },
    });
  }

  async markRepaired(id: string) {
    return this.prisma.vehicleDamage.update({
      where: { id },
      data: { repairedAt: new Date() },
    });
  }

  async addImage(damageId: string, imageData: string, caption?: string) {
    return this.prisma.vehicleDamageImage.create({
      data: {
        damage: { connect: { id: damageId } },
        imageData,
        caption,
      },
    });
  }

  async getStats(vehicleId: string) {
    const [active, total] = await Promise.all([
      this.prisma.vehicleDamage.count({ where: { vehicleId, repairedAt: null } }),
      this.prisma.vehicleDamage.count({ where: { vehicleId } }),
    ]);
    return { active, total, repaired: total - active };
  }
}
