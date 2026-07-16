import { Injectable } from '@nestjs/common';
import {
  Prisma,
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

export type TireDbClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class TireIdentityService {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Prisma.TransactionClient): TireDbClient {
    return tx ?? this.prisma;
  }

  async getActiveTiresForSetup(
    tireSetId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Tire[]> {
    return this.db(tx).tire.findMany({
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
    tx?: Prisma.TransactionClient;
  }): Promise<Tire[]> {
    const db = this.db(args.tx);
    const existing = await this.getActiveTiresForSetup(args.setup.id, args.tx);
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

      const tire = await this.createTireAtPosition(
        {
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
        },
        args.tx,
      );
      created.push(tire);
    }

    if (existing.length === 0 && created.length > 0) {
      await db.vehicleTireSetup.update({
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
    tx?: Prisma.TransactionClient;
  }): Promise<Tire[]> {
    return this.ensureTiresForSetup(args);
  }

  async dismountAllForSetup(
    tireSetId: string,
    dismountedAt: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.db(tx).tire.updateMany({
      where: { tireSetId, active: true },
      data: { active: false, dismountedAt },
    });
  }

  /**
   * Remount the latest inactive tire identity per wheel position for a stored set.
   * Preserves cumulative tire km — only updates mount timestamps.
   */
  async remountStoredSetupTires(
    args: {
      organizationId: string;
      vehicleId: string;
      tireSetId: string;
      mountedAt: Date;
      odometerKm?: number | null;
      userId?: string | null;
      notes?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<Tire[]> {
    const db = this.db(tx);
    const inactive = await db.tire.findMany({
      where: { tireSetId: args.tireSetId, active: false },
      orderBy: [{ dismountedAt: 'desc' }, { updatedAt: 'desc' }],
    });

    const latestByPosition = new Map<TirePosition, Tire>();
    for (const tire of inactive) {
      if (!latestByPosition.has(tire.currentPosition)) {
        latestByPosition.set(tire.currentPosition, tire);
      }
    }

    const remounted: Tire[] = [];
    for (const tire of latestByPosition.values()) {
      const updated = await db.tire.update({
        where: { id: tire.id },
        data: {
          active: true,
          dismountedAt: null,
          mountedAt: args.mountedAt,
        },
      });
      await db.tirePositionHistory.create({
        data: {
          organizationId: args.organizationId,
          vehicleId: args.vehicleId,
          tireSetId: args.tireSetId,
          tireId: tire.id,
          fromPosition: null,
          toPosition: tire.currentPosition,
          changedAt: args.mountedAt,
          odometerKm: args.odometerKm ?? null,
          changeType: TireChangeType.INSTALL,
          notes: args.notes ?? 'Stored set reactivation',
          createdBy: args.userId ?? null,
        },
      });
      remounted.push(updated);
    }

    return remounted;
  }

  async createTireAtPosition(
    input: CreateTireAtPositionInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Tire> {
    const dbPos = wheelPosToDb(input.position);
    const mountedAt = input.mountedAt ?? new Date();
    return this.db(tx).tire.create({
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
  async applyRotation(
    input: ApplyRotationInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Tire[]> {
    const db = this.db(tx);
    const tires = await this.getActiveTiresForSetup(input.tireSetId, tx);
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

    const runRotation = async (client: TireDbClient) => {
      await Promise.all(
        updates.map(({ tire, to }) =>
          client.tire.update({
            where: { id: tire.id },
            data: { currentPosition: to },
          }),
        ),
      );
      await Promise.all(
        updates.map(({ tire, to }) =>
          client.tirePositionHistory.create({
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
      );
    };

    if (tx) {
      await runRotation(db);
    } else {
      await this.prisma.$transaction(async (trx) => runRotation(trx));
    }

    return this.getActiveTiresForSetup(input.tireSetId, tx);
  }

  /**
   * Dismount the tire at a wheel position and mount a new Tire identity.
   */
  async replaceAtPosition(
    input: ReplaceTireAtPositionInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Tire> {
    const db = this.db(tx);
    const dbPos = wheelPosToDb(input.position);
    const now = input.mountedAt ?? new Date();

    const existing = await db.tire.findFirst({
      where: {
        tireSetId: input.tireSetId,
        active: true,
        currentPosition: dbPos,
      },
    });

    if (existing) {
      await db.tire.update({
        where: { id: existing.id },
        data: { active: false, dismountedAt: now },
      });
      await db.tirePositionHistory.create({
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

    const created = await this.createTireAtPosition(
      {
        ...input,
        initialTreadEvidenceSource: replacementEvidence.evidenceSource,
        initialTreadMeasuredAt: replacementEvidence.measuredAt,
        initialTreadConfirmedAt: replacementEvidence.confirmedAt,
        baselineConfidence: replacementEvidence.baselineConfidence,
        baselineStatus: replacementEvidence.baselineStatus,
      },
      tx,
    );
    await db.tirePositionHistory.create({
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

    await db.tireMeasurement.create({
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

  async retireTireAtPosition(
    input: {
      organizationId: string;
      vehicleId: string;
      tireSetId: string;
      position: WheelPos;
      retiredAt?: Date;
      odometerKm?: number | null;
      notes?: string | null;
      userId?: string | null;
    },
    tx?: Prisma.TransactionClient,
  ): Promise<Tire | null> {
    const db = this.db(tx);
    const dbPos = wheelPosToDb(input.position);
    const retiredAt = input.retiredAt ?? new Date();
    const existing = await db.tire.findFirst({
      where: {
        tireSetId: input.tireSetId,
        active: true,
        currentPosition: dbPos,
      },
    });
    if (!existing) return null;

    const retired = await db.tire.update({
      where: { id: existing.id },
      data: { active: false, dismountedAt: retiredAt },
    });
    await db.tirePositionHistory.create({
      data: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        tireSetId: input.tireSetId,
        tireId: existing.id,
        fromPosition: dbPos,
        toPosition: dbPos,
        changedAt: retiredAt,
        odometerKm: input.odometerKm ?? null,
        changeType: TireChangeType.REMOVE,
        notes: input.notes ?? 'Tire retired',
        createdBy: input.userId ?? null,
      },
    });
    return retired;
  }
}
