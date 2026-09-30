import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  OnboardingCaseSourceMode,
  Prisma,
  type VehicleOnboardingCase,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { isPrismaUniqueViolation } from '@shared/database/prisma-error.util';
import { buildDimoOnboardingSourceSnapshot, identityDraftFromDimoSnapshot } from '../adapters/dimo-onboarding-source.adapter';
import {
  buildHmOnboardingSourceSnapshot,
  identityDraftFromHmSnapshot,
} from '../adapters/high-mobility-onboarding-source.adapter';
import {
  adminDraftFromManualInput,
  buildManualOnboardingSourceSnapshot,
  identityDraftFromManualInput,
  type ManualOnboardingInput,
} from '../adapters/manual-onboarding-source.adapter';
import { DIMO_PLATFORM_DEVELOPER_LICENSE_SCOPE } from '../adapters/connection-scope.constants';
import type { OnboardingSourceSnapshotV1 } from '../contracts/onboarding-source-snapshot.v1';
import {
  VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
  VEHICLE_IDENTITY_DRAFT_VERSION,
  VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION,
  VEHICLE_VALIDATION_FINDINGS_VERSION,
} from '../contracts/vo-document-versions';
import type { VehicleTechnicalBaselineDraftV1 } from '../contracts/vehicle-technical-baseline-draft.v1';
import type { VehicleValidationFindingsV1 } from '../contracts/vehicle-validation-findings.v1';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { assertCaseTransitionAllowed } from '../policy/onboarding-case-transition.policy';
import {
  buildTestReadinessSnapshot,
} from '../readiness/test-readiness-authority';
import { READINESS_SNAPSHOT_VERSION } from '../contracts/vo-document-versions';
import {
  logCaseOpened,
  logCaseResumed,
  logSourceAttached,
} from './vehicle-onboarding-observability';

export interface OnboardingActorContext {
  organizationId: string;
  actorUserId: string | null;
  idempotencyKey: string;
}

function emptyTechnicalDraft(): VehicleTechnicalBaselineDraftV1 {
  return { version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION, referenceInputs: {} };
}

function emptyValidationFindings(): VehicleValidationFindingsV1 {
  return { version: VEHICLE_VALIDATION_FINDINGS_VERSION, findings: [] };
}

function scopeKeyFromConnectionScope(scope: string | null): string {
  return scope ?? '';
}

@Injectable()
export class VehicleOnboardingCaseService {
  constructor(private readonly prisma: PrismaService) {}

  async getCaseForOrganization(
    organizationId: string,
    caseId: string,
  ): Promise<VehicleOnboardingCase> {
    const row = await this.prisma.vehicleOnboardingCase.findFirst({
      where: { id: caseId, organizationId },
    });
    if (!row) {
      throw new VehicleOnboardingError('CASE_NOT_FOUND', 'Onboarding case not found', {
        caseId,
      });
    }
    return row;
  }

  async openOrResumeFromDimo(
    ctx: OnboardingActorContext,
    dimoVehicleId: string,
  ): Promise<VehicleOnboardingCase> {
    const dimo = await this.prisma.dimoVehicle.findUnique({ where: { id: dimoVehicleId } });
    if (!dimo) {
      throw new VehicleOnboardingError('ACTIVATION_PRECONDITION_FAILED', 'DimoVehicle not found');
    }
    const snapshot = buildDimoOnboardingSourceSnapshot(dimo);
    const identity = identityDraftFromDimoSnapshot(snapshot);
    return this.openOrResumeWithPrimarySnapshot(ctx, {
      sourceMode: 'DIMO',
      provider: 'DIMO',
      connectionScope: DIMO_PLATFORM_DEVELOPER_LICENSE_SCOPE,
      externalVehicleIdentity: snapshot.externalVehicleIdentity,
      sourceMirrorTable: snapshot.sourceMirrorTable,
      sourceMirrorId: snapshot.sourceMirrorId,
      snapshot,
      identity,
    });
  }

  async openOrResumeFromHighMobility(
    ctx: OnboardingActorContext,
    hmVehicleId: string,
  ): Promise<VehicleOnboardingCase> {
    const hm = await this.prisma.highMobilityVehicle.findUnique({ where: { id: hmVehicleId } });
    if (!hm) {
      throw new VehicleOnboardingError('ACTIVATION_PRECONDITION_FAILED', 'HM vehicle not found');
    }
    const snapshot = buildHmOnboardingSourceSnapshot(hm, ctx.organizationId);
    const identity = identityDraftFromHmSnapshot(snapshot);
    return this.openOrResumeWithPrimarySnapshot(ctx, {
      sourceMode: 'HIGH_MOBILITY',
      provider: 'HIGH_MOBILITY',
      connectionScope: snapshot.connectionScope,
      externalVehicleIdentity: snapshot.externalVehicleIdentity,
      sourceMirrorTable: snapshot.sourceMirrorTable,
      sourceMirrorId: snapshot.sourceMirrorId,
      snapshot,
      identity,
    });
  }

  async openOrResumeManual(
    ctx: OnboardingActorContext,
    input: ManualOnboardingInput,
  ): Promise<VehicleOnboardingCase> {
    const stableExternal = `MANUAL:${ctx.organizationId}:${ctx.idempotencyKey}`;
    const snapshot = buildManualOnboardingSourceSnapshot(
      input,
      ctx.organizationId,
      stableExternal,
    );
    const identity = identityDraftFromManualInput(input);
    const admin = adminDraftFromManualInput(input);
    return this.openOrResumeWithPrimarySnapshot(ctx, {
      sourceMode: 'MANUAL',
      provider: 'MANUAL',
      connectionScope: snapshot.connectionScope,
      externalVehicleIdentity: stableExternal,
      sourceMirrorTable: null,
      sourceMirrorId: null,
      snapshot,
      identity,
      admin,
    });
  }

  /**
   * Internal/test-only: seal readiness without VO-4 engine.
   * Not exposed via public HTTP in VO-3.
   */
  async attestReadyForActivationTestOnly(
    organizationId: string,
    caseId: string,
    actorUserId: string | null,
  ): Promise<VehicleOnboardingCase> {
    const caseRow = await this.getCaseForOrganization(organizationId, caseId);
    if (caseRow.status === 'COMPLETED') {
      return caseRow;
    }
    if (caseRow.status === 'CANCELLED' || caseRow.status === 'EXPIRED') {
      throw new VehicleOnboardingError('TERMINAL_CASE_IDEMPOTENCY', 'Cannot seal terminal case');
    }
    const readiness = buildTestReadinessSnapshot(actorUserId);
    return this.prisma.vehicleOnboardingCase.update({
      where: { id: caseId },
      data: {
        status: 'READY_FOR_ACTIVATION',
        readinessSnapshotJson: readiness as unknown as Prisma.InputJsonValue,
        readinessSnapshotVersion: READINESS_SNAPSHOT_VERSION,
        readinessProfileVersion: readiness.profileVersion,
        lastActorUserId: actorUserId,
      },
    });
  }

  async attachSourceRef(
    organizationId: string,
    caseId: string,
    snapshot: OnboardingSourceSnapshotV1,
    opts: { isPrimary?: boolean } = {},
  ): Promise<void> {
    const caseRow = await this.getCaseForOrganization(organizationId, caseId);
    if (caseRow.status === 'COMPLETED' || caseRow.status === 'CANCELLED' || caseRow.status === 'EXPIRED') {
      throw new VehicleOnboardingError('TERMINAL_CASE_IDEMPOTENCY', 'Cannot attach to terminal case');
    }

    const scopeKey = scopeKeyFromConnectionScope(snapshot.connectionScope);
    try {
      await this.prisma.vehicleOnboardingCaseSourceRef.create({
        data: {
          id: randomUUID(),
          onboardingCaseId: caseId,
          provider: snapshot.providerType,
          connectionScope: snapshot.connectionScope,
          connectionScopeKey: scopeKey,
          externalVehicleIdentity: snapshot.externalVehicleIdentity,
          sourceMirrorTable: snapshot.sourceMirrorTable,
          sourceMirrorId: snapshot.sourceMirrorId,
          provenanceAt: new Date(snapshot.observedAt),
          isPrimary: opts.isPrimary ?? false,
          snapshotMetadataJson: snapshot as unknown as Prisma.InputJsonValue,
          snapshotMetadataVersion: 1,
        },
      });
    } catch (error) {
      if (isPrismaUniqueViolation(error)) {
        logSourceAttached(caseId, snapshot.providerType);
        return;
      }
      throw error;
    }

    const sourceMode: OnboardingCaseSourceMode =
      caseRow.sourceMode === snapshot.providerType
        ? caseRow.sourceMode
        : 'COMPOSITE';

    await this.prisma.vehicleOnboardingCase.update({
      where: { id: caseId },
      data: { sourceMode, lastActorUserId: caseRow.lastActorUserId },
    });
    logSourceAttached(caseId, snapshot.providerType);
  }

  private async openOrResumeWithPrimarySnapshot(
    ctx: OnboardingActorContext,
    primary: {
      sourceMode: OnboardingCaseSourceMode;
      provider: string;
      connectionScope: string | null;
      externalVehicleIdentity: string;
      sourceMirrorTable: string | null;
      sourceMirrorId: string | null;
      snapshot: OnboardingSourceSnapshotV1;
      identity: import('../contracts/vehicle-identity-draft.v1').VehicleIdentityDraftV1;
      admin?: import('../contracts/vehicle-admin-baseline-draft.v1').VehicleAdministrativeBaselineDraftV1;
    },
  ): Promise<VehicleOnboardingCase> {
    const byKey = await this.prisma.vehicleOnboardingCase.findFirst({
      where: {
        organizationId: ctx.organizationId,
        idempotencyKey: ctx.idempotencyKey,
      },
    });
    if (byKey) {
      logCaseResumed(byKey.id, ctx.organizationId);
      return byKey;
    }

    const scopeKey = scopeKeyFromConnectionScope(primary.connectionScope);
    const caseId = randomUUID();

    try {
      const created = await this.prisma.vehicleOnboardingCase.create({
        data: {
          id: caseId,
          organizationId: ctx.organizationId,
          sourceMode: primary.sourceMode,
          status: 'OPEN',
          primarySourceProvider: primary.provider,
          primarySourceScopeKey: scopeKey,
          primarySourceExternalId: primary.externalVehicleIdentity,
          draftIdentityJson: primary.identity as unknown as Prisma.InputJsonValue,
          draftIdentityVersion: VEHICLE_IDENTITY_DRAFT_VERSION,
          draftAdminBaselineJson: (primary.admin ?? {
            version: VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
            vehicleName: null,
            licensePlate: null,
            stationId: null,
            notes: null,
          }) as unknown as Prisma.InputJsonValue,
          draftAdminBaselineVersion: VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
          draftTechnicalBaselineJson: emptyTechnicalDraft() as unknown as Prisma.InputJsonValue,
          draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION,
          validationFindingsJson: emptyValidationFindings() as unknown as Prisma.InputJsonValue,
          validationFindingsVersion: VEHICLE_VALIDATION_FINDINGS_VERSION,
          idempotencyKey: ctx.idempotencyKey,
          initiatedByUserId: ctx.actorUserId,
          lastActorUserId: ctx.actorUserId,
          sourceRefs: {
            create: {
              id: randomUUID(),
              provider: primary.provider,
              connectionScope: primary.connectionScope,
              connectionScopeKey: scopeKey,
              externalVehicleIdentity: primary.externalVehicleIdentity,
              sourceMirrorTable: primary.sourceMirrorTable,
              sourceMirrorId: primary.sourceMirrorId,
              provenanceAt: new Date(primary.snapshot.observedAt),
              isPrimary: true,
              snapshotMetadataJson: primary.snapshot as unknown as Prisma.InputJsonValue,
              snapshotMetadataVersion: 1,
            },
          },
        },
      });
      logCaseOpened(created.id, ctx.organizationId, primary.provider);
      return created;
    } catch (error) {
      if (isPrismaUniqueViolation(error, ['organization_id', 'idempotency_key'])) {
        const existing = await this.prisma.vehicleOnboardingCase.findFirst({
          where: {
            organizationId: ctx.organizationId,
            idempotencyKey: ctx.idempotencyKey,
          },
        });
        if (existing) {
          logCaseResumed(existing.id, ctx.organizationId);
          return existing;
        }
      }
      if (isPrismaUniqueViolation(error)) {
        const open = await this.prisma.vehicleOnboardingCase.findFirst({
          where: {
            organizationId: ctx.organizationId,
            primarySourceProvider: primary.provider,
            primarySourceScopeKey: scopeKey,
            primarySourceExternalId: primary.externalVehicleIdentity,
            status: { in: ['OPEN', 'IN_PROGRESS', 'READY_FOR_ACTIVATION'] },
          },
        });
        if (open) {
          logCaseResumed(open.id, ctx.organizationId);
          return open;
        }
        throw new VehicleOnboardingError('SOURCE_REF_CONFLICT', 'Open case source conflict', {
          provider: primary.provider,
        });
      }
      throw error;
    }
  }

  async markInProgress(organizationId: string, caseId: string, actorUserId: string | null): Promise<void> {
    const row = await this.getCaseForOrganization(organizationId, caseId);
    if (row.status === 'OPEN') {
      assertCaseTransitionAllowed(row.status, 'IN_PROGRESS');
      await this.prisma.vehicleOnboardingCase.update({
        where: { id: caseId },
        data: { status: 'IN_PROGRESS', lastActorUserId: actorUserId },
      });
    }
  }
}
