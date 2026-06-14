import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { DamageType, DamageSeverity } from '@prisma/client';

// Bound base64 damage images stored directly in Postgres (vehicle_damage_images).
// Without this, a single 1–2 MB raw upload bloats the row/table indefinitely.
const MAX_DAMAGE_IMAGE_BYTES = parseInt(
  process.env.MAX_DAMAGE_IMAGE_BYTES || `${6 * 1024 * 1024}`,
  10,
);
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

@Injectable()
export class DamagesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates a base64 (optionally data-URL) image before it is persisted.
   * Enforces an allowed MIME type and a maximum decoded size.
   */
  private validateImageData(imageData: string): void {
    if (!imageData || typeof imageData !== 'string') {
      throw new BadRequestException('imageData is required');
    }

    let base64 = imageData;
    const dataUrlMatch = /^data:([^;,]+);base64,(.*)$/s.exec(imageData);
    if (dataUrlMatch) {
      const mime = dataUrlMatch[1].toLowerCase();
      if (!ALLOWED_IMAGE_MIME.has(mime)) {
        throw new BadRequestException(
          `Unsupported image type "${mime}". Allowed: ${[...ALLOWED_IMAGE_MIME].join(', ')}`,
        );
      }
      base64 = dataUrlMatch[2];
    }

    // Decoded byte length from base64 length (minus padding).
    const len = base64.length;
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    const bytes = Math.floor((len * 3) / 4) - padding;

    if (bytes > MAX_DAMAGE_IMAGE_BYTES) {
      throw new BadRequestException(
        `Image too large (${(bytes / 1024 / 1024).toFixed(1)} MB). Max ${(
          MAX_DAMAGE_IMAGE_BYTES /
          1024 /
          1024
        ).toFixed(0)} MB — compress before upload.`,
      );
    }
  }

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
    data.images?.forEach((img) => this.validateImageData(img.imageData));
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
    this.validateImageData(imageData);
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
