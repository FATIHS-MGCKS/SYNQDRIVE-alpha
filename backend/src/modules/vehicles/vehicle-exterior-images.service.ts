import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  Prisma,
} from '@prisma/client';

export type VehicleExteriorView = 'FRONT' | 'LEFT' | 'RIGHT' | 'REAR' | 'ROOF';

export interface VehicleExteriorImageRow {
  id: string;
  vehicleId: string;
  view: VehicleExteriorView;
  imageData: string;
  caption: string | null;
  uploadedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VehicleExteriorModelImageRow {
  id: string;
  modelKey: string;
  make: string;
  model: string;
  view: VehicleExteriorView;
  imageData: string;
  caption: string | null;
  sourceVehicleId: string | null;
  uploadedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * V4.7.50 — VehicleExteriorImagesService
 *
 * Owns the canonical FRONT / LEFT / RIGHT / REAR / ROOF exterior photos per
 * vehicle. These photos drive the Rental Damages "Vehicle damage map"
 * carousel and are uploaded by Master-Admin operators either during vehicle
 * registration (`VehicleRegistrationModal`) or post-hoc on the Master-Admin
 * vehicle detail drawer (`PlatformVehiclesView`).
 *
 * The schema enforces one image per (vehicleId, view) tuple via a unique
 * constraint, so this service exposes an idempotent `upsert` instead of
 * separate create/update endpoints.
 */
@Injectable()
export class VehicleExteriorImagesService {
  private readonly logger = new Logger(VehicleExteriorImagesService.name);

  /**
   * Soft cap on the base64 payload size we accept from the admin UI.
   * Real-world phone-camera JPEGs at sensible compression land well below
   * this. We cap to avoid bloating the row and the JSON transport layer.
   */
  private static readonly MAX_IMAGE_BYTES = 5 * 1024 * 1024; // ~5 MB

  constructor(private readonly prisma: PrismaService) {}

  private static buildModelKey(make: string, model: string): string {
    const normalizePart = (value: string) =>
      value
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `${normalizePart(make)}::${normalizePart(model)}`;
  }

  async listByVehicle(vehicleId: string): Promise<VehicleExteriorImageRow[]> {
    return (this.prisma as any).vehicleExteriorImage.findMany({
      where: { vehicleId },
      orderBy: { view: 'asc' },
    });
  }

  async listEffectiveByVehicle(vehicleId: string): Promise<{
    vehicle: VehicleExteriorImageRow[];
    model: VehicleExteriorModelImageRow[];
    effective: Array<(VehicleExteriorImageRow | VehicleExteriorModelImageRow) & { source: 'vehicle' | 'model' }>;
    modelKey: string | null;
  }> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { make: true, model: true },
    });
    if (!vehicle) throw new NotFoundException(`Vehicle ${vehicleId} not found.`);

    const modelKey = VehicleExteriorImagesService.buildModelKey(
      vehicle.make,
      vehicle.model,
    );
    const [vehicleRows, modelRows] = await Promise.all([
      this.listByVehicle(vehicleId),
      this.listByModel(vehicle.make, vehicle.model),
    ]);
    const byView = new Map<VehicleExteriorView, (VehicleExteriorImageRow | VehicleExteriorModelImageRow) & { source: 'vehicle' | 'model' }>();
    modelRows.forEach((row) => byView.set(row.view, { ...row, source: 'model' }));
    vehicleRows.forEach((row) => byView.set(row.view, { ...row, source: 'vehicle' }));

    return {
      vehicle: vehicleRows,
      model: modelRows,
      effective: Array.from(byView.values()).sort((a, b) => a.view.localeCompare(b.view)),
      modelKey,
    };
  }

  async listByModel(make: string, model: string): Promise<VehicleExteriorModelImageRow[]> {
    const normalized = this.normalizeMakeModel(make, model);
    return (this.prisma as any).vehicleExteriorModelImage.findMany({
      where: { modelKey: normalized.modelKey },
      orderBy: { view: 'asc' },
    });
  }

  async listAvailableModels(): Promise<Array<{
    modelKey: string;
    make: string;
    model: string;
    views: VehicleExteriorView[];
    count: number;
    updatedAt: Date;
  }>> {
    const rows: VehicleExteriorModelImageRow[] = await (this.prisma as any).vehicleExteriorModelImage.findMany({
      orderBy: [{ make: 'asc' }, { model: 'asc' }, { view: 'asc' }],
    });
    const grouped = new Map<string, {
      modelKey: string;
      make: string;
      model: string;
      views: VehicleExteriorView[];
      count: number;
      updatedAt: Date;
    }>();
    rows.forEach((row) => {
      const existing = grouped.get(row.modelKey) ?? {
        modelKey: row.modelKey,
        make: row.make,
        model: row.model,
        views: [],
        count: 0,
        updatedAt: row.updatedAt,
      };
      existing.views.push(row.view);
      existing.count += 1;
      if (row.updatedAt > existing.updatedAt) existing.updatedAt = row.updatedAt;
      grouped.set(row.modelKey, existing);
    });
    return Array.from(grouped.values());
  }

  async upsertModelImage(
    make: string,
    model: string,
    view: VehicleExteriorView,
    imageData: string,
    caption?: string | null,
    sourceVehicleId?: string | null,
    uploadedByUserId?: string | null,
  ): Promise<VehicleExteriorModelImageRow> {
    this.validateImageData(imageData);
    const normalized = this.normalizeMakeModel(make, model);
    return (this.prisma as any).vehicleExteriorModelImage.upsert({
      where: { modelKey_view: { modelKey: normalized.modelKey, view } },
      update: {
        imageData,
        caption: caption ?? null,
        sourceVehicleId: sourceVehicleId ?? null,
        uploadedByUserId: uploadedByUserId ?? null,
        make: normalized.make,
        model: normalized.model,
      },
      create: {
        modelKey: normalized.modelKey,
        make: normalized.make,
        model: normalized.model,
        view,
        imageData,
        caption: caption ?? null,
        sourceVehicleId: sourceVehicleId ?? null,
        uploadedByUserId: uploadedByUserId ?? null,
      },
    });
  }

  async saveVehicleImageAsModelTemplate(
    vehicleId: string,
    view: VehicleExteriorView,
    uploadedByUserId?: string | null,
  ): Promise<VehicleExteriorModelImageRow> {
    const [vehicle, image] = await Promise.all([
      this.prisma.vehicle.findUnique({
        where: { id: vehicleId },
        select: { make: true, model: true },
      }),
      (this.prisma as any).vehicleExteriorImage.findUnique({
        where: { vehicleId_view: { vehicleId, view } },
      }),
    ]);
    if (!vehicle) throw new NotFoundException(`Vehicle ${vehicleId} not found.`);
    if (!image) {
      throw new NotFoundException(
        `No vehicle exterior image found for ${vehicleId} / ${view}.`,
      );
    }
    return this.upsertModelImage(
      vehicle.make,
      vehicle.model,
      view,
      image.imageData,
      image.caption,
      vehicleId,
      uploadedByUserId,
    );
  }

  async applyModelTemplateToVehicle(
    vehicleId: string,
    view: VehicleExteriorView,
    modelKey: string,
    uploadedByUserId?: string | null,
  ): Promise<VehicleExteriorImageRow> {
    if (!modelKey?.trim()) {
      throw new BadRequestException('modelKey is required.');
    }
    const template: VehicleExteriorModelImageRow | null = await (this.prisma as any).vehicleExteriorModelImage.findUnique({
      where: { modelKey_view: { modelKey: modelKey.trim(), view } },
    });
    if (!template) {
      throw new NotFoundException(`Model exterior image ${modelKey} / ${view} not found.`);
    }
    return this.upsert(
      vehicleId,
      view,
      template.imageData,
      template.caption,
      uploadedByUserId,
    );
  }

  async upsert(
    vehicleId: string,
    view: VehicleExteriorView,
    imageData: string,
    caption?: string | null,
    uploadedByUserId?: string | null,
  ): Promise<VehicleExteriorImageRow> {
    this.validateImageData(imageData);

    try {
      return await (this.prisma as any).vehicleExteriorImage.upsert({
        where: { vehicleId_view: { vehicleId, view } },
        update: {
          imageData,
          caption: caption ?? null,
          uploadedByUserId: uploadedByUserId ?? null,
        },
        create: {
          vehicleId,
          view,
          imageData,
          caption: caption ?? null,
          uploadedByUserId: uploadedByUserId ?? null,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        // FK on vehicleId — vehicle does not exist
        throw new NotFoundException(`Vehicle ${vehicleId} not found.`);
      }
      this.logger.error(
        `Failed to upsert exterior image for vehicle=${vehicleId} view=${view}: ${
          (e as Error).message
        }`,
      );
      throw e;
    }
  }

  async delete(vehicleId: string, view: VehicleExteriorView): Promise<void> {
    try {
      await (this.prisma as any).vehicleExteriorImage.delete({
        where: { vehicleId_view: { vehicleId, view } },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        // record not found — treat as idempotent no-op
        return;
      }
      throw e;
    }
  }

  // ── helpers ───────────────────────────────────────────────────────

  private normalizeMakeModel(make: string, model: string): { make: string; model: string; modelKey: string } {
    const normalizedMake = String(make || '').trim();
    const normalizedModel = String(model || '').trim();
    if (!normalizedMake || !normalizedModel) {
      throw new BadRequestException('make and model are required for model exterior images.');
    }
    return {
      make: normalizedMake,
      model: normalizedModel,
      modelKey: VehicleExteriorImagesService.buildModelKey(normalizedMake, normalizedModel),
    };
  }

  private validateImageData(imageData: string): void {
    if (!this.isLikelyDataUrl(imageData)) {
      throw new BadRequestException(
        'imageData must be a base64 data URI (e.g. data:image/jpeg;base64,...).',
      );
    }
    const approxBytes = this.approxBase64Bytes(imageData);
    if (approxBytes > VehicleExteriorImagesService.MAX_IMAGE_BYTES) {
      throw new BadRequestException(
        `Image too large (~${Math.round(approxBytes / 1024)} KB). Max ${
          VehicleExteriorImagesService.MAX_IMAGE_BYTES / (1024 * 1024)
        } MB per view.`,
      );
    }
  }

  private isLikelyDataUrl(value: string): boolean {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    return /^data:image\/(png|jpe?g|webp|gif);base64,/.test(trimmed);
  }

  /** Roughly estimates the decoded byte length of a base64 data URI. */
  private approxBase64Bytes(value: string): number {
    const idx = value.indexOf(',');
    const base64 = idx >= 0 ? value.slice(idx + 1) : value;
    // base64 is ~4/3 ratio
    return Math.floor((base64.length * 3) / 4);
  }
}
