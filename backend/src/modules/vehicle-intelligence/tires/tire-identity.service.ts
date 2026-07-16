import { Injectable } from '@nestjs/common';
import {
  Tire,
  TireChangeType,
  TireEvidenceSource,
  TirePosition,
  TireSeason,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  buildSetupBaselineFields,
  resolveInitialTreadEvidence,
  resolveWheelTreadMm,
  type WheelPos,
} from './tire-evidence-provenance';

export type { WheelPos };

const WHEEL_ORDER: WheelPos[] = ['FL', 'FR', 'RL', 'RR'];

export function wheelPosToDb(pos: WheelPos): TirePosition {
  if (pos === 'FL') return TirePosition.FRONT_LEFT;
  if (pos === 'FR') return TirePosition.FRONT_RIGHT;
  if (pos === 'RL') return TirePosition.REAR_LEFT;
  return TirePosition.REAR_RIGHT;
}

export function dbPosToWheel(pos: TirePosition | string): WheelPos {
  if (pos === TirePosition.FRONT_LEFT || pos === 'FRONT_LEFT') return 'FL';
  if (pos === TirePosition.FRONT_RIGHT || pos === 'FRONT_RIGHT') return 'FR';
  if (pos === TirePosition.REAR_LEFT || pos === 'REAR_LEFT') return 'RL';
  return 'RR';
}

export interface CreateTireAtPositionInput {
  organizationId: string;
  vehicleId: string;
  tireSetId: string;
  position: WheelPos;
  initialTreadDepthMm: number;
  initialTreadEvidenceSource?: TireEvidenceSource | null;
  initialTreadMeasuredAt?: Date | null;
  initialTreadConfirmedAt?: Date | null;
  initialTreadEvidenceId?: string | null;
  baselineConfidence?: number | null;
  baselineStatus?: import('@prisma/client').TireBaselineStatus | null;
  brand?: string | null;
  tireModel?: string | null;
  dotCode?: string | null;
  seasonType?: TireSeason;
  mountedAt?: Date;
}

export interface ApplyRotationInput {
  organizationId: string;
  vehicleId: string;
  tireSetId: string;
  moveMap: Record<string, string>;
  changedAt: Date;
  odometerKm?: number | null;
  rotationTemplate?: string;
  notes?: string | null;
  userId?: string | null;
}

export interface ReplaceTireAtPositionInput extends CreateTireAtPositionInput {
  odometerKm?: number | null;
  notes?: string | null;
  userId?: string | null;
  workshopName?: string | null;
}

@Injectable()
export class TireIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveTiresForSetup(tireSetId: string): Promise<Tire[]> {
    return this.prisma.tire.findMany({
      where: { tireSetId, active: true },
    });
  }

  /**
   * Backfill per-wheel Tire rows when a setup predates identity tracking.
   * Does not overwrite existing active tires.
   */
  async ensureTiresForSetup(args: {
    setup: {
      id: string;
      organizationId: string | null;
      vehicleId: string;
      tireSeason: TireSeason;
      brandModelFront?: string | null;
      brandModelRear?: string | null;
      dotCodeFront?: string | null;
      dotCodeRear?: string | null;
      initialTreadFrontMm?: number | null;
      initialTreadRearMm?: number | null;
      initialTreadDepthMm?: number | null;
      initialTreadEvidenceSource?: TireEvidenceSource | null;
      baselineConfidence?: number | null;
      baselineStatus?: import('@prisma/client').TireBaselineStatus | null;
    };
    treadByPosition?: Partial<Record<WheelPos, number>>;
    treadEvidenceByPosition?: Partial<Record<WheelPos, TireEvidenceSource>>;
    mountedAt?: Date;
    legacySource?: string | null;
    measuredAt?: Date | null;
    evidenceId?: string | null;
  }): Promise<Tire[]> {
    const existing = await this.getActiveTiresForSetup(args.setup.id);
    if (existing.length >= 4) return existing;

    const orgId = args.setup.organizationId;
    if (!orgId) return existing;

    const mountedAt = args.mountedAt ?? args.measuredAt ?? new Date();
    const setupBaseline = buildSetupBaselineFields({
      treadByPosition: args.treadByPosition,
      setupInitialTreadFrontMm: args.setup.initialTreadFrontMm,
      setupInitialTreadRearMm: args.setup.initialTreadRearMm,
      setupInitialTreadDepthMm: args.setup.initialTreadDepthMm,
      setupBaselineEvidenceSource: args.setup.initialTreadEvidenceSource,
      legacySource: args.legacySource,
      measuredAt: args.measuredAt ?? mountedAt,
      evidenceId: args.evidenceId,
    });

    const occupied = new Set(existing.map((t) => t.currentPosition));
    const created: Tire[] = [...existing];

    for (const pos of WHEEL_ORDER) {
      if (occupied.has(wheelPosToDb(pos))) continue;
      const isFront = pos.startsWith('F');
      const { treadMm, usedDefaultFallback } = resolveWheelTreadMm(pos, {
        treadByPosition: args.treadByPosition,
        setupInitialTreadFrontMm: args.setup.initialTreadFrontMm,
        setupInitialTreadRearMm: args.setup.initialTreadRearMm,
        setupInitialTreadDepthMm: args.setup.initialTreadDepthMm,
      });
      const wheelEvidence = resolveInitialTreadEvidence({
          treadMm,
          treadByPosition: args.treadByPosition,
          setupInitialTreadFrontMm: args.setup.initialTreadFrontMm,
          setupInitialTreadRearMm: args.setup.initialTreadRearMm,
          setupInitialTreadDepthMm: args.setup.initialTreadDepthMm,
          setupBaselineEvidenceSource: args.setup.initialTreadEvidenceSource,
          legacySource: args.legacySource,
          measuredAt: args.measuredAt ?? mountedAt,
          evidenceId: args.evidenceId,
          usedDefaultFallback,
        });
      const wheelEvidenceSource =
        args.treadEvidenceByPosition?.[pos] ?? wheelEvidence.evidenceSource;

      const tire = await this.createTireAtPosition({
        organizationId: orgId,
        vehicleId: args.setup.vehicleId,
        tireSetId: args.setup.id,
        position: pos,
        initialTreadDepthMm: treadMm,
        initialTreadEvidenceSource: wheelEvidenceSource,
        initialTreadMeasuredAt: wheelEvidence.measuredAt,
        initialTreadConfirmedAt: wheelEvidence.confirmedAt,
        initialTreadEvidenceId: wheelEvidence.evidenceId,
        baselineConfidence: wheelEvidence.baselineConfidence,
        baselineStatus: wheelEvidence.baselineStatus,
        brand: isFront ? args.setup.brandModelFront : args.setup.brandModelRear,
        tireModel: isFront ? args.setup.brandModelFront : args.setup.brandModelRear,
        dotCode: isFront ? args.setup.dotCodeFront : args.setup.dotCodeRear,
        seasonType: args.setup.tireSeason,
        mountedAt,
      });
      created.push(tire);
    }

    if (existing.length === 0 && created.length > 0) {
      await this.prisma.vehicleTireSetup.update({
        where: { id: args.setup.id },
        data: setupBaseline,
      });
    }

    return created;
  }

  async createTireSet(args: {
    setup: {
      id: string;
      organizationId: string | null;
      vehicleId: string;
      tireSeason: TireSeason;
      brandModelFront?: string | null;
      brandModelRear?: string | null;
      dotCodeFront?: string | null;
      dotCodeRear?: string | null;
      initialTreadFrontMm?: number | null;
      initialTreadRearMm?: number | null;
      initialTreadDepthMm?: number | null;
    };
    treadByPosition?: Partial<Record<WheelPos, number>>;
    mountedAt?: Date;
  }): Promise<Tire[]> {
    return this.ensureTiresForSetup(args);
  }

  async dismountAllForSetup(tireSetId: string, dismountedAt: Date): Promise<void> {
    await this.prisma.tire.updateMany({
      where: { tireSetId, active: true },
      data: { active: false, dismountedAt },
    });
  }

  async createTireAtPosition(input: CreateTireAtPositionInput): Promise<Tire> {
    const dbPos = wheelPosToDb(input.position);
    const mountedAt = input.mountedAt ?? new Date();
    return this.prisma.tire.create({
      data: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tireSetId: input.tireSetId,
        brand: input.brand ?? null,
        tireModel: input.tireModel ?? null,
        dotCode: input.dotCode ?? null,
        seasonType: input.seasonType ?? TireSeason.ALL_SEASON,
        installedPosition: dbPos,
        currentPosition: dbPos,
        initialTreadDepthMm: input.initialTreadDepthMm,
        initialTreadEvidenceSource: input.initialTreadEvidenceSource ?? null,
        initialTreadMeasuredAt: input.initialTreadMeasuredAt ?? null,
        initialTreadConfirmedAt: input.initialTreadConfirmedAt ?? null,
        initialTreadEvidenceId: input.initialTreadEvidenceId ?? null,
        baselineConfidence: input.baselineConfidence ?? null,
        baselineStatus: input.baselineStatus ?? null,
        estimatedTreadMm: input.initialTreadDepthMm,
        mountedAt,
        active: true,
      },
    });
  }

  /**
   * Permute Tire.currentPosition according to the rotation template move map.
   * Writes TirePositionHistory rows with tireId for each moved tire.
   */
  async applyRotation(input: ApplyRotationInput): Promise<Tire[]> {
    const tires = await this.getActiveTiresForSetup(input.tireSetId);
    if (tires.length === 0) return [];

    const byCurrent = new Map<TirePosition, Tire>();
    for (const tire of tires) {
      byCurrent.set(tire.currentPosition, tire);
    }

    const updates: Array<{ tire: Tire; to: TirePosition }> = [];
    for (const [fromDb, toDb] of Object.entries(input.moveMap)) {
      const tire = byCurrent.get(fromDb as TirePosition);
      if (!tire) continue;
      updates.push({ tire, to: toDb as TirePosition });
    }

    if (updates.length === 0) return tires;

    await this.prisma.$transaction([
      ...updates.map(({ tire, to }) =>
        this.prisma.tire.update({
          where: { id: tire.id },
          data: { currentPosition: to },
        }),
      ),
      ...updates.map(({ tire, to }) =>
        this.prisma.tirePositionHistory.create({
          data: {
            organizationId: input.organizationId,
            vehicleId: input.vehicleId,
            tireSetId: input.tireSetId,
            tireId: tire.id,
            fromPosition: tire.currentPosition,
            toPosition: to,
            changedAt: input.changedAt,
            odometerKm: input.odometerKm ?? null,
            changeType: TireChangeType.ROTATE,
            rotationTemplate: input.rotationTemplate ?? null,
            notes: input.notes ?? null,
            createdBy: input.userId ?? null,
          },
        }),
      ),
    ]);

    return this.getActiveTiresForSetup(input.tireSetId);
  }

  /**
   * Dismount the tire at a wheel position and mount a new Tire identity.
   */
  async replaceAtPosition(input: ReplaceTireAtPositionInput): Promise<Tire> {
    const dbPos = wheelPosToDb(input.position);
    const now = input.mountedAt ?? new Date();

    const existing = await this.prisma.tire.findFirst({
      where: {
        tireSetId: input.tireSetId,
        active: true,
        currentPosition: dbPos,
      },
    });

    if (existing) {
      await this.prisma.tire.update({
        where: { id: existing.id },
        data: { active: false, dismountedAt: now },
      });
      await this.prisma.tirePositionHistory.create({
        data: {
          organizationId: input.organizationId,
          vehicleId: input.vehicleId,
          tireSetId: input.tireSetId,
          tireId: existing.id,
          fromPosition: dbPos,
          toPosition: dbPos,
          changedAt: now,
          odometerKm: input.odometerKm ?? null,
          changeType: TireChangeType.REPLACE,
          notes: input.notes ?? null,
          createdBy: input.userId ?? null,
        },
      });
    }

    const replacementEvidence = resolveInitialTreadEvidence({
      treadMm: input.initialTreadDepthMm,
      legacySource: 'replacement',
      workshopName: input.workshopName,
      measuredAt: now,
    });

    const created = await this.createTireAtPosition({
      ...input,
      initialTreadEvidenceSource: replacementEvidence.evidenceSource,
      initialTreadMeasuredAt: replacementEvidence.measuredAt,
      initialTreadConfirmedAt: replacementEvidence.confirmedAt,
      baselineConfidence: replacementEvidence.baselineConfidence,
      baselineStatus: replacementEvidence.baselineStatus,
    });
    await this.prisma.tirePositionHistory.create({
      data: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tireSetId: input.tireSetId,
        tireId: created.id,
        fromPosition: null,
        toPosition: dbPos,
        changedAt: now,
        odometerKm: input.odometerKm ?? null,
        changeType: TireChangeType.REPLACE,
        notes: input.notes ?? null,
        createdBy: input.userId ?? null,
      },
    });

    await this.prisma.tireMeasurement.create({
      data: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tireId: created.id,
        measuredTreadMm: input.initialTreadDepthMm,
        measuredAt: now,
        odometerKm: input.odometerKm ?? null,
        source: 'replacement',
        notes: input.notes ?? null,
      },
    });

    return created;
  }
}
