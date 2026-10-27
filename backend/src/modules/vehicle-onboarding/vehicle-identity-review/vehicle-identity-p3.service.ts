import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FuelType } from '@prisma/client';
import { VehicleSpecAiService } from '@modules/ai/vehicle-specs/vehicle-spec-ai.service';
import { PrismaService } from '@shared/database/prisma.service';
import { buildRegistrationIdentityCanonical, canonicalToVehicleSpecContext } from './vehicle-identity-canonical.util';
import type { RegistrationIdentityProvenanceDocument } from './vehicle-identity-canonical.types';
import { mergeAiSpecsIntoIdentityPreview } from './vehicle-identity-p3-bridge.util';
import { mergeProvenanceOnSave, parseRegistrationIdentityProvenance } from './vehicle-identity-provenance.util';
import { validateVehicleIdentityFieldConfirmations } from './vehicle-identity-confirm.util';
import type {
  VehicleIdentityFieldConfirmationInput,
  VehicleIdentityManualDraftInput,
} from './vehicle-identity-review.types';
import { VehicleIdentityReviewService } from './vehicle-identity-review.service';

function mapFuelTypeLabel(raw: string | null): FuelType | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s.includes('diesel')) return FuelType.DIESEL;
  if (s.includes('elektr') || s === 'bev' || s.includes('electric')) return FuelType.ELECTRIC;
  if (s.includes('plug') || s.includes('phev')) return FuelType.PLUGIN_HYBRID;
  if (s.includes('hybrid') || s.includes('hyb')) return FuelType.HYBRID;
  if (s.includes('benzin') || s.includes('gasoline') || s.includes('petrol')) return FuelType.GASOLINE;
  return FuelType.OTHER;
}

@Injectable()
export class VehicleIdentityP3Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly reviewService: VehicleIdentityReviewService,
    private readonly vehicleSpecAi: VehicleSpecAiService,
  ) {}

  private get p3Enabled(): boolean {
    return this.config.get<{ enabled?: boolean }>('vehicleIdentityP3')?.enabled === true;
  }

  private get aiLiveEnabled(): boolean {
    return this.config.get<{ aiLiveEnabled?: boolean }>('vehicleIdentityP3')?.aiLiveEnabled === true;
  }

  private assertP3Enabled(): void {
    if (!this.p3Enabled) {
      throw new ForbiddenException({
        message: 'Vehicle identity P3 persistence is disabled in this environment',
        code: 'ZB1_VEHICLE_IDENTITY_P3_DISABLED',
      });
    }
  }

  async getProvenance(orgId: string, vehicleId: string) {
    this.assertP3Enabled();
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: { registrationIdentityProvenance: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return {
      provenance: parseRegistrationIdentityProvenance(vehicle.registrationIdentityProvenance),
    };
  }

  async previewAiV2(
    orgId: string,
    vehicleId: string,
    body: {
      documentExtractionId?: string;
      manual?: VehicleIdentityManualDraftInput | null;
      confirmations: VehicleIdentityFieldConfirmationInput[];
      vinMismatchAcknowledged?: boolean;
      acceptP2AsSystemPower?: boolean;
      /** Test-only injection — never used in production HTTP path. */
      injectedAiSpecs?: Record<string, string | number | boolean | null>;
    },
  ) {
    this.assertP3Enabled();
    const snapshot = await this.reviewService.getReviewSnapshot(orgId, vehicleId, {
      documentExtractionId: body.documentExtractionId,
      manual: body.manual ?? null,
      vinMismatchAcknowledged: body.vinMismatchAcknowledged,
    });
    const validation = validateVehicleIdentityFieldConfirmations({
      snapshot,
      confirmations: body.confirmations ?? [],
      vinMismatchAcknowledged: body.vinMismatchAcknowledged === true,
      acceptP2AsSystemPower: body.acceptP2AsSystemPower === true,
    });
    if (!validation.ok) {
      throw new BadRequestException({
        code: 'VEHICLE_IDENTITY_CONFIRM_VALIDATION_FAILED',
        errors: validation.errors,
      });
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: { year: true },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const canonical = buildRegistrationIdentityCanonical({
      snapshot,
      confirmations: body.confirmations,
      vehicleYear: vehicle.year,
    });

    let rawAiSpecs: Record<string, string | number | boolean | null> = {};
    let aiLiveInvoked = false;

    if (body.injectedAiSpecs) {
      rawAiSpecs = body.injectedAiSpecs;
      aiLiveInvoked = false;
    } else if (this.aiLiveEnabled && this.vehicleSpecAi.isConfigured()) {
      const latest = await this.prisma.vehicleLatestState.findUnique({
        where: { vehicleId },
        select: { dimoTokenId: true },
      });
      const tokenIds = latest?.dimoTokenId != null ? [latest.dimoTokenId] : undefined;
      const result = await this.vehicleSpecAi.getVehicleSpecs(
        tokenIds,
        canonicalToVehicleSpecContext(canonical),
      );
      rawAiSpecs = result.specs ?? {};
      aiLiveInvoked = true;
    }

    const preview = mergeAiSpecsIntoIdentityPreview({ canonical, rawAiSpecs });
    return { ...preview, aiLiveInvoked };
  }

  async saveIdentity(
    orgId: string,
    vehicleId: string,
    body: {
      documentExtractionId?: string;
      manual?: VehicleIdentityManualDraftInput | null;
      confirmations: VehicleIdentityFieldConfirmationInput[];
      vinMismatchAcknowledged?: boolean;
      acceptP2AsSystemPower?: boolean;
      acceptSuggestedFieldKeys?: string[];
      injectedAiSpecs?: Record<string, string | number | boolean | null>;
    },
  ) {
    this.assertP3Enabled();
    const preview = await this.previewAiV2(orgId, vehicleId, body);

    if (preview.conflicts.length > 0) {
      throw new BadRequestException({
        code: 'VEHICLE_IDENTITY_SAVE_BLOCKED_CONFLICTS',
        conflicts: preview.conflicts,
      });
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId: orgId },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        vin: true,
        fuelType: true,
        registrationIdentityProvenance: true,
      },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const existing = parseRegistrationIdentityProvenance(vehicle.registrationIdentityProvenance);
    const acceptedSuggestions: RegistrationIdentityProvenanceDocument['fields'] = {};
    const acceptKeys = new Set(body.acceptSuggestedFieldKeys ?? []);
    for (const [key, entry] of Object.entries(preview.suggestedFields)) {
      if (acceptKeys.has(key) && entry) {
        acceptedSuggestions[key as keyof NonNullable<typeof acceptedSuggestions>] = entry;
      }
    }

    const provenanceDoc = mergeProvenanceOnSave({
      existing,
      canonical: preview.canonical,
      acceptedSuggestions,
    });

    const byCanonical = new Map(preview.canonical.fields.map((f) => [f.key, f.value]));
    const data: {
      make?: string;
      model?: string;
      year?: number;
      vin?: string | null;
      fuelType?: FuelType;
      registrationIdentityProvenance: RegistrationIdentityProvenanceDocument;
    } = { registrationIdentityProvenance: provenanceDoc };

    const make = byCanonical.get('make');
    const model = byCanonical.get('model');
    const year = byCanonical.get('year');
    const vin = byCanonical.get('vin');
    const fuel = byCanonical.get('fuelType');

    if (typeof make === 'string' && make.trim()) data.make = make.trim();
    if (typeof model === 'string' && model.trim()) data.model = model.trim();
    if (typeof year === 'number' && Number.isFinite(year)) data.year = year;
    if (vin === null || typeof vin === 'string') data.vin = vin === '' ? null : vin;
    const mappedFuel = mapFuelTypeLabel(typeof fuel === 'string' ? fuel : null);
    if (mappedFuel) data.fuelType = mappedFuel;

    await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data,
    });

    return {
      ok: true,
      persisted: true,
      provenance: provenanceDoc,
    };
  }
}
