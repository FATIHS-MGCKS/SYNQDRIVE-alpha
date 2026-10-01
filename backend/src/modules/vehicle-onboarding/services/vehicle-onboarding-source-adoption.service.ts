import { Injectable } from '@nestjs/common';
import {
  ActivityEntity,
  OnboardingCaseSourceMode,
  Prisma,
  type VehicleOnboardingCase,
  type VehicleOnboardingCaseSourceRef,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { acquirePgAdvisoryXactLock64 } from '@shared/database/pg-advisory-lock.util';
import { isPrismaUniqueViolation } from '@shared/database/prisma-error.util';
import { buildDimoOnboardingSourceSnapshot } from '../adapters/dimo-onboarding-source.adapter';
import { buildHmOnboardingSourceSnapshot } from '../adapters/high-mobility-onboarding-source.adapter';
import type { OnboardingSourceSnapshotV1 } from '../contracts/onboarding-source-snapshot.v1';
import { ONBOARDING_SOURCE_SNAPSHOT_VERSION } from '../contracts/vo-document-versions';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import {
  projectVehicleOnboardingCase,
  type VehicleOnboardingCaseProjectionDto,
} from '../http/vehicle-onboarding-case.projection';
import { assertCompositeVinConsistencyForActivation } from '../policy/composite-vin-consistency';
import {
  assertCaseMutable,
  assertExpectedConcurrencyToken,
} from '../policy/onboarding-concurrency.util';
import { parseValidatedIdentityDraft } from '../policy/persisted-contract.validation';
import { assertSupportedActivationSourceSet } from '../policy/source-set-invariant';
import { invalidateReadinessSealIfReady } from '../readiness/readiness-invalidation';
import { readinessMutationLockKey } from '../readiness/readiness-mutation-lock';
import { assertSourceNotCanonicallyRegistered } from '../source-adoption/canonical-source-suppression.authority';
import {
  assertAttachClaimCompatible,
  assertTargetOrganizationExistsInTransaction,
  listActiveSourceClaimsForMirror,
  resolveAdoptResumeCaseFromClaims,
} from '../source-adoption/active-source-claim.authority';
import { getSourceAdoptionMutationTestCoordinator } from '../testing/source-adoption-mutation-test-coordinator';
import { PLATFORM_TRUSTED_SOURCE_ADOPTION } from '../source-adoption/platform-trusted-adoption.context';
import { VehicleOnboardingSourceAdoptionAuthority } from '../source-adoption/vehicle-onboarding-source-adoption.authority';
import type { SourceClaimProvider } from '../source-adoption/source-claim-lock';
import { sourceClaimLockKey } from '../source-adoption/source-claim-lock';
import {
  type OnboardingActorContext,
  VehicleOnboardingCaseService,
} from './vehicle-onboarding-case.service';

function scopeKeyFromConnectionScope(scope: string | null): string {
  return scope ?? '';
}

type PendingSourceAdoptionAudit = {
  actorUserId: string | null;
  targetOrganizationId: string;
  caseId: string;
  provider: SourceClaimProvider;
  sourceMirrorId: string;
  mutationType: 'PROVIDER_SOURCE_ADOPTED' | 'PROVIDER_SOURCE_ATTACHED';
};

@Injectable()
export class VehicleOnboardingSourceAdoptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly caseService: VehicleOnboardingCaseService,
    private readonly sourceAdoptionAuthority: VehicleOnboardingSourceAdoptionAuthority,
    private readonly audit: AuditService,
  ) {}

  async adoptProviderSource(input: {
    organizationId: string;
    actorUserId: string | null;
    provider: SourceClaimProvider;
    sourceMirrorId: string;
    idempotencyKey: string;
  }): Promise<VehicleOnboardingCaseProjectionDto> {
    const adoptionCtx: OnboardingActorContext = {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      idempotencyKey: input.idempotencyKey,
      sourceAdoption: PLATFORM_TRUSTED_SOURCE_ADOPTION,
    };

    let pendingAudit: PendingSourceAdoptionAudit | null = null;
    let caseId = '';

    await this.prisma.$transaction(
      async (tx) => {
        await acquirePgAdvisoryXactLock64(
          tx,
          sourceClaimLockKey(input.provider, input.sourceMirrorId),
        );

        await assertTargetOrganizationExistsInTransaction(tx, input.organizationId);
        await assertSourceNotCanonicallyRegistered(tx, input.provider, input.sourceMirrorId);

        const claims = await listActiveSourceClaimsForMirror(
          tx,
          input.provider,
          input.sourceMirrorId,
        );
        const resumeCase = resolveAdoptResumeCaseFromClaims(claims, input.organizationId);
        if (resumeCase) {
          const byKey = await tx.vehicleOnboardingCase.findFirst({
            where: {
              organizationId: input.organizationId,
              idempotencyKey: input.idempotencyKey,
            },
          });
          if (byKey && byKey.id !== resumeCase.id) {
            throw new VehicleOnboardingError(
              'IDEMPOTENCY_KEY_REUSED_FOR_DIFFERENT_REQUEST',
              'Idempotency key was already used for a different onboarding request',
            );
          }
          caseId = resumeCase.id;
          return;
        }

        let caseRow: VehicleOnboardingCase;
        if (input.provider === 'DIMO') {
          caseRow = await this.caseService.openOrResumeFromDimoInTransaction(
            tx,
            adoptionCtx,
            input.sourceMirrorId,
          );
        } else {
          caseRow = await this.caseService.openOrResumeFromHighMobilityInTransaction(
            tx,
            adoptionCtx,
            input.sourceMirrorId,
          );
        }
        caseId = caseRow.id;
        pendingAudit = {
          actorUserId: input.actorUserId,
          targetOrganizationId: input.organizationId,
          caseId: caseRow.id,
          provider: input.provider,
          sourceMirrorId: input.sourceMirrorId,
          mutationType: 'PROVIDER_SOURCE_ADOPTED',
        };
      },
      { maxWait: 30_000, timeout: 60_000 },
    );

    this.recordAudit(pendingAudit);
    return this.loadCaseProjection(input.organizationId, caseId);
  }

  async attachProviderSource(input: {
    organizationId: string;
    caseId: string;
    actorUserId: string | null;
    provider: SourceClaimProvider;
    sourceMirrorId: string;
    expectedConcurrencyToken: string | null;
  }): Promise<VehicleOnboardingCaseProjectionDto> {
    let pendingAudit: PendingSourceAdoptionAudit | null = null;
    let semanticNoop = false;
    const coordinator = getSourceAdoptionMutationTestCoordinator();

    await this.prisma.$transaction(
      async (tx) => {
        await acquirePgAdvisoryXactLock64(
          tx,
          sourceClaimLockKey(input.provider, input.sourceMirrorId),
        );
        await acquirePgAdvisoryXactLock64(tx, readinessMutationLockKey(input.caseId));
        if (coordinator?.onAttachLocksAcquired) {
          await coordinator.onAttachLocksAcquired();
        }

        await assertTargetOrganizationExistsInTransaction(tx, input.organizationId);
        await assertSourceNotCanonicallyRegistered(tx, input.provider, input.sourceMirrorId);

        const claims = await listActiveSourceClaimsForMirror(
          tx,
          input.provider,
          input.sourceMirrorId,
        );
        assertAttachClaimCompatible(claims, input.organizationId, input.caseId);

        const caseRow = await tx.vehicleOnboardingCase.findFirst({
          where: { id: input.caseId, organizationId: input.organizationId },
          include: { sourceRefs: true },
        });
        if (!caseRow) {
          throw new VehicleOnboardingError('CASE_NOT_FOUND', 'Onboarding case not found', {
            caseId: input.caseId,
          });
        }
        assertCaseMutable(caseRow.status);
        assertExpectedConcurrencyToken(
          caseRow.concurrencyToken,
          input.expectedConcurrencyToken,
        );

        const snapshot = await this.loadValidatedSnapshotInTransaction(
          tx,
          input.provider,
          input.sourceMirrorId,
          input.organizationId,
        );
        const scopeKey = scopeKeyFromConnectionScope(snapshot.connectionScope);

        const existingSameMirror = caseRow.sourceRefs.find(
          (ref) => ref.provider === input.provider && ref.sourceMirrorId === input.sourceMirrorId,
        );
        if (existingSameMirror) {
          semanticNoop = true;
          return;
        }

        const prospectiveRef = this.buildProspectiveSourceRef(caseRow.id, snapshot, scopeKey);
        const prospectiveSet = [...caseRow.sourceRefs, prospectiveRef];
        assertSupportedActivationSourceSet(prospectiveSet);
        const identity = parseValidatedIdentityDraft(caseRow);
        assertCompositeVinConsistencyForActivation(identity, prospectiveSet);

        await invalidateReadinessSealIfReady(tx, caseRow);
        const newToken = randomUUID();

        try {
          await tx.vehicleOnboardingCaseSourceRef.create({
            data: {
              id: randomUUID(),
              onboardingCaseId: caseRow.id,
              provider: snapshot.providerType,
              connectionScope: snapshot.connectionScope,
              connectionScopeKey: scopeKey,
              externalVehicleIdentity: snapshot.externalVehicleIdentity,
              sourceMirrorTable: snapshot.sourceMirrorTable,
              sourceMirrorId: snapshot.sourceMirrorId,
              provenanceAt: new Date(snapshot.observedAt),
              isPrimary: false,
              snapshotMetadataJson: snapshot as unknown as Prisma.InputJsonValue,
              snapshotMetadataVersion: ONBOARDING_SOURCE_SNAPSHOT_VERSION,
            },
          });
        } catch (error) {
          if (
            isPrismaUniqueViolation(error, [
              'onboarding_case_id',
              'provider',
              'connection_scope_key',
              'external_vehicle_identity',
            ])
          ) {
            semanticNoop = true;
            return;
          }
          throw error;
        }

        const sourceMode: OnboardingCaseSourceMode =
          caseRow.sourceMode === snapshot.providerType ? caseRow.sourceMode : 'COMPOSITE';

        if (coordinator?.beforeAttachCommit) {
          await coordinator.beforeAttachCommit();
        }

        await tx.vehicleOnboardingCase.update({
          where: { id: caseRow.id },
          data: {
            sourceMode,
            concurrencyToken: newToken,
            lastActorUserId: input.actorUserId,
          },
        });

        pendingAudit = {
          actorUserId: input.actorUserId,
          targetOrganizationId: input.organizationId,
          caseId: caseRow.id,
          provider: input.provider,
          sourceMirrorId: input.sourceMirrorId,
          mutationType: 'PROVIDER_SOURCE_ATTACHED',
        };
      },
      { maxWait: 30_000, timeout: 60_000 },
    );

    if (!semanticNoop) {
      this.recordAudit(pendingAudit);
    }
    return this.loadCaseProjection(input.organizationId, input.caseId);
  }

  private buildProspectiveSourceRef(
    caseId: string,
    snapshot: OnboardingSourceSnapshotV1,
    scopeKey: string,
  ): VehicleOnboardingCaseSourceRef {
    return {
      id: randomUUID(),
      onboardingCaseId: caseId,
      provider: snapshot.providerType,
      connectionScope: snapshot.connectionScope,
      connectionScopeKey: scopeKey,
      externalVehicleIdentity: snapshot.externalVehicleIdentity,
      sourceMirrorTable: snapshot.sourceMirrorTable,
      sourceMirrorId: snapshot.sourceMirrorId,
      provenanceAt: new Date(snapshot.observedAt),
      isPrimary: false,
      snapshotMetadataJson: snapshot as unknown as Prisma.JsonValue,
      snapshotMetadataVersion: ONBOARDING_SOURCE_SNAPSHOT_VERSION,
      createdAt: new Date(),
      firstSeenAt: null,
      lastSeenAt: null,
    };
  }

  private async loadValidatedSnapshotInTransaction(
    tx: Prisma.TransactionClient,
    provider: SourceClaimProvider,
    sourceMirrorId: string,
    organizationId: string,
  ): Promise<OnboardingSourceSnapshotV1> {
    const adoption = PLATFORM_TRUSTED_SOURCE_ADOPTION;
    if (provider === 'DIMO') {
      const dimo = await tx.dimoVehicle.findUnique({
        where: { id: sourceMirrorId },
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
      this.sourceAdoptionAuthority.assertDimoPlatformMirrorAdoptable(
        dimo,
        organizationId,
        adoption,
      );
      return buildDimoOnboardingSourceSnapshot(dimo);
    }
    const hm = await tx.highMobilityVehicle.findUnique({ where: { id: sourceMirrorId } });
    if (!hm) {
      throw new VehicleOnboardingError('SOURCE_NOT_AVAILABLE', 'High Mobility source not available');
    }
    this.sourceAdoptionAuthority.assertHighMobilityMirrorAdoptable(
      hm,
      organizationId,
      adoption,
    );
    return buildHmOnboardingSourceSnapshot(hm, organizationId);
  }

  private async loadCaseProjection(
    organizationId: string,
    caseId: string,
  ): Promise<VehicleOnboardingCaseProjectionDto> {
    const row = await this.prisma.vehicleOnboardingCase.findFirst({
      where: { id: caseId, organizationId },
      include: { sourceRefs: true },
    });
    if (!row) {
      throw new VehicleOnboardingError('CASE_NOT_FOUND', 'Onboarding case not found', { caseId });
    }
    return projectVehicleOnboardingCase(row, row.sourceRefs);
  }

  private recordAudit(pending: PendingSourceAdoptionAudit | null): void {
    if (!pending) {
      return;
    }
    const descriptions: Record<PendingSourceAdoptionAudit['mutationType'], string> = {
      PROVIDER_SOURCE_ADOPTED: 'Vehicle onboarding provider source adopted',
      PROVIDER_SOURCE_ATTACHED: 'Vehicle onboarding provider source attached',
    };
    void this.audit.record({
      actorUserId: pending.actorUserId ?? undefined,
      actorOrganizationId: pending.targetOrganizationId,
      action: 'UPDATE',
      entity: ActivityEntity.ADMIN_OPERATION,
      entityId: pending.caseId,
      description: descriptions[pending.mutationType],
      metaJson: {
        domain: 'VEHICLE_ONBOARDING',
        resourceType: 'VEHICLE_ONBOARDING_CASE',
        caseId: pending.caseId,
        targetOrganizationId: pending.targetOrganizationId,
        provider: pending.provider,
        sourceMirrorId: pending.sourceMirrorId,
        mutationType: pending.mutationType,
      },
    });
  }
}
