import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import {
  OnboardingCaseSourceMode,
  Prisma,
  type VehicleOnboardingCase,
  type VehicleOnboardingCaseSourceRef,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { manualOnboardingRequestFingerprint } from '../policy/manual-onboarding-idempotency.fingerprint';
import { isPrismaUniqueViolation } from '@shared/database/prisma-error.util';
import {
  buildDimoOnboardingSourceSnapshot,
  identityDraftFromDimoSnapshot,
} from '../adapters/dimo-onboarding-source.adapter';
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
  ONBOARDING_SOURCE_SNAPSHOT_VERSION,
  VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
  VEHICLE_IDENTITY_DRAFT_VERSION,
  VEHICLE_VALIDATION_FINDINGS_VERSION,
} from '../contracts/vo-document-versions';
import type { VehicleTechnicalBaselineDraftV2 } from '../contracts/vehicle-technical-baseline-draft.v2';
import { VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 } from '../contracts/vo-document-versions';
import type { VehicleValidationFindingsV1 } from '../contracts/vehicle-validation-findings.v1';
import type { VehicleIdentityDraftV1 } from '../contracts/vehicle-identity-draft.v1';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { assertCaseTransitionAllowed } from '../policy/onboarding-case-transition.policy';
import {
  DEFAULT_TENANT_SOURCE_ADOPTION,
  type SourceAdoptionContext,
} from '../source-adoption/source-adoption.context';
import { VehicleOnboardingSourceAdoptionAuthority } from '../source-adoption/vehicle-onboarding-source-adoption.authority';
import {
  logCaseOpened,
  logCaseResumed,
  logSourceAttached,
} from './vehicle-onboarding-observability';
import { invalidateReadinessSealIfReady } from '../readiness/readiness-invalidation';
import { readinessMutationLockKey } from '../readiness/readiness-mutation-lock';
import { acquirePgAdvisoryXactLock64 } from '@shared/database/pg-advisory-lock.util';
import { parseValidatedSourceSnapshot } from '../policy/persisted-contract.validation';
import { hashReadinessRelevantSourceSnapshotProjection } from '../readiness/onboarding-source-snapshot.fingerprint';

export interface OnboardingActorContext {
  organizationId: string;
  actorUserId: string | null;
  idempotencyKey: string;
  sourceAdoption?: SourceAdoptionContext;
}

function emptyTechnicalDraft(): VehicleTechnicalBaselineDraftV2 {
  return { version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 };
}

function emptyValidationFindings(): VehicleValidationFindingsV1 {
  return { version: VEHICLE_VALIDATION_FINDINGS_VERSION, findings: [] };
}

function scopeKeyFromConnectionScope(scope: string | null): string {
  return scope ?? '';
}

function identityDraftFingerprint(draft: VehicleIdentityDraftV1, admin: {
  vehicleName: string | null;
  licensePlate: string | null;
  stationId: string | null;
  notes: string | null;
} | null): string {
  return manualOnboardingRequestFingerprint({
    vin: draft.vin,
    make: draft.make,
    model: draft.model,
    year: draft.year,
    fuelType: draft.fuelType,
    vehicleName: admin?.vehicleName,
    licensePlate: admin?.licensePlate,
    stationId: admin?.stationId,
    notes: admin?.notes,
  });
}

@Injectable()
export class VehicleOnboardingCaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sourceAdoptionAuthority: VehicleOnboardingSourceAdoptionAuthority,
  ) {}

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
    const adoption = ctx.sourceAdoption ?? DEFAULT_TENANT_SOURCE_ADOPTION;
    const dimo = await this.loadDimoMirrorForOnboarding(dimoVehicleId);
    this.sourceAdoptionAuthority.assertDimoPlatformMirrorAdoptable(
      dimo,
      ctx.organizationId,
      adoption,
    );
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
    const adoption = ctx.sourceAdoption ?? DEFAULT_TENANT_SOURCE_ADOPTION;
    const hm = await this.prisma.highMobilityVehicle.findUnique({ where: { id: hmVehicleId } });
    if (!hm) {
      throw new VehicleOnboardingError('SOURCE_NOT_AVAILABLE', 'High Mobility source not available');
    }
    this.sourceAdoptionAuthority.assertHighMobilityMirrorAdoptable(
      hm,
      ctx.organizationId,
      adoption,
    );
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
      requestFingerprint: manualOnboardingRequestFingerprint(input),
    });
  }

  async attachDimoSource(
    ctx: Pick<OnboardingActorContext, 'organizationId' | 'sourceAdoption'>,
    caseId: string,
    dimoVehicleId: string,
    opts: { isPrimary?: boolean } = {},
  ): Promise<void> {
    const adoption = ctx.sourceAdoption ?? DEFAULT_TENANT_SOURCE_ADOPTION;
    const dimo = await this.loadDimoMirrorForOnboarding(dimoVehicleId);
    this.sourceAdoptionAuthority.assertDimoPlatformMirrorAdoptable(
      dimo,
      ctx.organizationId,
      adoption,
    );
    const snapshot = buildDimoOnboardingSourceSnapshot(dimo);
    await this.attachValidatedSourceRef(ctx.organizationId, caseId, snapshot, opts);
  }

  async attachHighMobilitySource(
    ctx: Pick<OnboardingActorContext, 'organizationId' | 'sourceAdoption'>,
    caseId: string,
    hmVehicleId: string,
    opts: { isPrimary?: boolean } = {},
  ): Promise<void> {
    const adoption = ctx.sourceAdoption ?? DEFAULT_TENANT_SOURCE_ADOPTION;
    const hm = await this.prisma.highMobilityVehicle.findUnique({ where: { id: hmVehicleId } });
    if (!hm) {
      throw new VehicleOnboardingError('SOURCE_NOT_AVAILABLE', 'High Mobility source not available');
    }
    this.sourceAdoptionAuthority.assertHighMobilityMirrorAdoptable(
      hm,
      ctx.organizationId,
      adoption,
    );
    const snapshot = buildHmOnboardingSourceSnapshot(hm, ctx.organizationId);
    await this.attachValidatedSourceRef(ctx.organizationId, caseId, snapshot, opts);
  }

  async refreshHighMobilitySourceEvidence(
    ctx: Pick<OnboardingActorContext, 'organizationId' | 'sourceAdoption'>,
    caseId: string,
    hmVehicleId: string,
  ): Promise<void> {
    const adoption = ctx.sourceAdoption ?? DEFAULT_TENANT_SOURCE_ADOPTION;
    await this.prisma.$transaction(async (tx) => {
      await acquirePgAdvisoryXactLock64(tx, readinessMutationLockKey(caseId));
      const caseRow = await tx.vehicleOnboardingCase.findFirst({
        where: { id: caseId, organizationId: ctx.organizationId },
      });
      if (!caseRow) {
        throw new VehicleOnboardingError('CASE_NOT_FOUND', 'Onboarding case not found');
      }
      if (caseRow.status === 'COMPLETED' || caseRow.status === 'CANCELLED' || caseRow.status === 'EXPIRED') {
        throw new VehicleOnboardingError('TERMINAL_CASE_IDEMPOTENCY', 'Cannot refresh terminal case');
      }
      const ref = await tx.vehicleOnboardingCaseSourceRef.findFirst({
        where: {
          onboardingCaseId: caseId,
          provider: 'HIGH_MOBILITY',
          sourceMirrorId: hmVehicleId,
        },
      });
      if (!ref) {
        throw new VehicleOnboardingError('SOURCE_NOT_AVAILABLE', 'High Mobility source ref not found on case');
      }
      const hm = await tx.highMobilityVehicle.findUnique({ where: { id: hmVehicleId } });
      if (!hm) {
        throw new VehicleOnboardingError('SOURCE_NOT_AVAILABLE', 'High Mobility source not available');
      }
      this.sourceAdoptionAuthority.assertHighMobilityMirrorAdoptable(hm, ctx.organizationId, adoption);
      const oldSnap = parseValidatedSourceSnapshot(ref);
      const newSnap = buildHmOnboardingSourceSnapshot(hm, ctx.organizationId);
      const oldVin = oldSnap.vin?.trim() || null;
      const newVin = newSnap.vin?.trim() || null;
      if (oldVin && newVin && oldVin !== newVin) {
        throw new VehicleOnboardingError(
          'IDENTITY_REVIEW_REQUIRED',
          'Provider VIN changed; identity review required before refresh',
        );
      }
      const oldHash = hashReadinessRelevantSourceSnapshotProjection(oldSnap);
      const newHash = hashReadinessRelevantSourceSnapshotProjection(newSnap);
      if (oldHash === newHash) {
        return;
      }
      await tx.vehicleOnboardingCaseSourceRef.update({
        where: { id: ref.id },
        data: {
          snapshotMetadataJson: newSnap as unknown as Prisma.InputJsonValue,
          snapshotMetadataVersion: ONBOARDING_SOURCE_SNAPSHOT_VERSION,
          provenanceAt: new Date(newSnap.observedAt),
        },
      });
      const freshCase = await tx.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseId } });
      await invalidateReadinessSealIfReady(tx, freshCase);
    });
  }

  /** Internal persistence only — snapshot must already pass adoption authority. */
  private async attachValidatedSourceRef(
    organizationId: string,
    caseId: string,
    snapshot: OnboardingSourceSnapshotV1,
    opts: { isPrimary?: boolean } = {},
  ): Promise<void> {
    const scopeKey = scopeKeyFromConnectionScope(snapshot.connectionScope);
    const wantsPrimary = opts.isPrimary ?? false;

    await this.prisma.$transaction(async (tx) => {
      await acquirePgAdvisoryXactLock64(tx, readinessMutationLockKey(caseId));
      const caseRow = await tx.vehicleOnboardingCase.findFirst({
        where: { id: caseId, organizationId },
      });
      if (!caseRow) {
        throw new VehicleOnboardingError('CASE_NOT_FOUND', 'Onboarding case not found');
      }
      if (
        caseRow.status === 'COMPLETED' ||
        caseRow.status === 'CANCELLED' ||
        caseRow.status === 'EXPIRED'
      ) {
        throw new VehicleOnboardingError('TERMINAL_CASE_IDEMPOTENCY', 'Cannot attach to terminal case');
      }

      if (wantsPrimary) {
        const existingPrimary = await tx.vehicleOnboardingCaseSourceRef.findFirst({
          where: { onboardingCaseId: caseId, isPrimary: true },
        });
        if (existingPrimary && !this.isSemanticSourceRefMatch(existingPrimary, snapshot, scopeKey)) {
          throw new VehicleOnboardingError(
            'PRIMARY_SOURCE_CONFLICT',
            'Case already has a different primary source',
          );
        }
      }

      const existingSemantic = await tx.vehicleOnboardingCaseSourceRef.findFirst({
        where: {
          onboardingCaseId: caseId,
          provider: snapshot.providerType,
          connectionScopeKey: scopeKey,
          externalVehicleIdentity: snapshot.externalVehicleIdentity,
        },
      });
      if (existingSemantic) {
        logSourceAttached(caseId, snapshot.providerType);
        return;
      }

      await invalidateReadinessSealIfReady(tx, caseRow);
      const fresh = await tx.vehicleOnboardingCase.findUniqueOrThrow({ where: { id: caseId } });
      try {
        await tx.vehicleOnboardingCaseSourceRef.create({
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
            isPrimary: wantsPrimary,
            snapshotMetadataJson: snapshot as unknown as Prisma.InputJsonValue,
            snapshotMetadataVersion: ONBOARDING_SOURCE_SNAPSHOT_VERSION,
          },
        });
      } catch (error) {
        if (isPrismaUniqueViolation(error, ['onboarding_case_id', 'is_primary'])) {
          throw new VehicleOnboardingError(
            'PRIMARY_SOURCE_CONFLICT',
            'Case already has a primary source ref',
          );
        }
        if (
          isPrismaUniqueViolation(error, [
            'onboarding_case_id',
            'provider',
            'connection_scope_key',
            'external_vehicle_identity',
          ])
        ) {
          logSourceAttached(caseId, snapshot.providerType);
          return;
        }
        throw error;
      }

      const sourceMode: OnboardingCaseSourceMode =
        fresh.sourceMode === snapshot.providerType ? fresh.sourceMode : 'COMPOSITE';

      await tx.vehicleOnboardingCase.update({
        where: { id: caseId },
        data: { sourceMode, lastActorUserId: fresh.lastActorUserId },
      });
    });
    logSourceAttached(caseId, snapshot.providerType);
  }

  private isSemanticSourceRefMatch(
    ref: VehicleOnboardingCaseSourceRef,
    snapshot: OnboardingSourceSnapshotV1,
    scopeKey: string,
  ): boolean {
    return (
      ref.provider === snapshot.providerType &&
      ref.connectionScopeKey === scopeKey &&
      ref.externalVehicleIdentity === snapshot.externalVehicleIdentity
    );
  }

  private assertIdempotentCaseMatchesRequest(
    existing: VehicleOnboardingCase,
    primary: {
      provider: string;
      scopeKey: string;
      externalVehicleIdentity: string;
    },
    requestFingerprint?: string,
  ): void {
    const matches =
      existing.primarySourceProvider === primary.provider &&
      existing.primarySourceScopeKey === primary.scopeKey &&
      existing.primarySourceExternalId === primary.externalVehicleIdentity;
    if (!matches) {
      throw new VehicleOnboardingError(
        'IDEMPOTENCY_KEY_REUSED_FOR_DIFFERENT_REQUEST',
        'Idempotency key was already used for a different onboarding request',
      );
    }
    if (requestFingerprint && existing.draftIdentityJson) {
      const draft = existing.draftIdentityJson as unknown as VehicleIdentityDraftV1;
      const admin = existing.draftAdminBaselineJson as {
        vehicleName: string | null;
        licensePlate: string | null;
        stationId: string | null;
        notes: string | null;
      } | null;
      if (identityDraftFingerprint(draft, admin) !== requestFingerprint) {
        throw new VehicleOnboardingError(
          'IDEMPOTENCY_KEY_REUSED_FOR_DIFFERENT_REQUEST',
          'Idempotency key was already used for a different manual onboarding request',
        );
      }
    }
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
      identity: VehicleIdentityDraftV1;
      admin?: import('../contracts/vehicle-admin-baseline-draft.v1').VehicleAdministrativeBaselineDraftV1;
      requestFingerprint?: string;
    },
  ): Promise<VehicleOnboardingCase> {
    const scopeKey = scopeKeyFromConnectionScope(primary.connectionScope);
    const requestPrimary = {
      provider: primary.provider,
      scopeKey,
      externalVehicleIdentity: primary.externalVehicleIdentity,
    };

    const byKey = await this.prisma.vehicleOnboardingCase.findFirst({
      where: {
        organizationId: ctx.organizationId,
        idempotencyKey: ctx.idempotencyKey,
      },
    });
    if (byKey) {
      this.assertIdempotentCaseMatchesRequest(byKey, requestPrimary, primary.requestFingerprint);
      logCaseResumed(byKey.id, ctx.organizationId);
      return byKey;
    }

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
          draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
          validationFindingsJson: emptyValidationFindings() as unknown as Prisma.InputJsonValue,
          validationFindingsVersion: VEHICLE_VALIDATION_FINDINGS_VERSION,
          idempotencyKey: ctx.idempotencyKey,
          concurrencyToken: randomUUID(),
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
              snapshotMetadataVersion: ONBOARDING_SOURCE_SNAPSHOT_VERSION,
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
          this.assertIdempotentCaseMatchesRequest(
            existing,
            requestPrimary,
            primary.requestFingerprint,
          );
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

  /** Prisma-safe mirror load (integration DBs may lag schema columns such as powertrain_type). */
  private async loadDimoMirrorForOnboarding(dimoVehicleId: string) {
    const dimo = await this.prisma.dimoVehicle.findUnique({
      where: { id: dimoVehicleId },
      select: {
        id: true,
        externalId: true,
        vin: true,
        make: true,
        model: true,
        year: true,
        fuelType: true,
        updatedAt: true,
      },
    });
    if (!dimo) {
      throw new VehicleOnboardingError('SOURCE_NOT_AVAILABLE', 'DIMO source not available');
    }
    return dimo;
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
