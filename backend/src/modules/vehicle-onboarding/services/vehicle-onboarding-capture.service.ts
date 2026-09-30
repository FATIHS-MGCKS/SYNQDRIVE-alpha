import { Injectable } from '@nestjs/common';
import {
  OnboardingCaseStatus,
  Prisma,
  ProductSlug,
  type VehicleOnboardingCase,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { acquirePgAdvisoryXactLock64 } from '@shared/database/pg-advisory-lock.util';
import { VEHICLE_ADMIN_BASELINE_DRAFT_VERSION } from '../contracts/vo-document-versions';
import { VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 } from '../contracts/vo-document-versions';
import type { VehicleOnboardingReadinessSnapshotV2 } from '../contracts/readiness-snapshot.v2';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import {
  projectVehicleOnboardingCase,
  type VehicleOnboardingCaseProjectionDto,
} from '../http/vehicle-onboarding-case.projection';
import {
  adminBaselineSemanticEquals,
  parseAdminBaselineCapturePayload,
} from '../policy/admin-baseline-capture.validation';
import type { ValidatedCaseListQuery } from '../policy/capture-request.validation';
import {
  assertExpectedConcurrencyToken,
  assertCaseMutable,
} from '../policy/onboarding-concurrency.util';
import { parseValidatedAdminDraft } from '../policy/persisted-contract.validation';
import { parseTechnicalBaselineDraft } from '../policy/technical-baseline-draft.validation';
import {
  assertTechnicalBaselineCaptureValidForCase,
  parseTechnicalBaselineCapturePayload,
  technicalBaselineSemanticEquals,
} from '../policy/technical-baseline-capture.validation';
import { invalidateReadinessSealIfReady } from '../readiness/readiness-invalidation';
import { readinessMutationLockKey } from '../readiness/readiness-mutation-lock';
import { getCaptureMutationTestCoordinator } from '../testing/capture-mutation-test-coordinator';
import { VehicleOnboardingReadinessService } from './vehicle-onboarding-readiness.service';

export interface CaptureMutationResult {
  case: VehicleOnboardingCaseProjectionDto;
  semanticNoop: boolean;
}

type PendingCaptureAudit = {
  actorUserId: string | null;
  organizationId: string;
  caseId: string;
  mutationType: 'ADMIN_BASELINE_UPDATED' | 'TECHNICAL_BASELINE_UPDATED' | 'READINESS_SEALED';
};

@Injectable()
export class VehicleOnboardingCaptureService {
  private static readonly DEFAULT_LIMIT = 50;
  private static readonly MAX_LIMIT = 100;
  private static readonly DEFAULT_ACTIVE_STATUSES: OnboardingCaseStatus[] = [
    'OPEN',
    'IN_PROGRESS',
    'READY_FOR_ACTIVATION',
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly readinessService: VehicleOnboardingReadinessService,
    private readonly audit: AuditService,
  ) {}

  async listCases(
    organizationId: string,
    query: ValidatedCaseListQuery,
  ): Promise<{ items: VehicleOnboardingCaseProjectionDto[]; nextCursor: string | null }> {
    const limit = Math.min(
      Math.max(query.limit ?? VehicleOnboardingCaptureService.DEFAULT_LIMIT, 1),
      VehicleOnboardingCaptureService.MAX_LIMIT,
    );
    const statusFilter: OnboardingCaseStatus[] = query.status
      ? [query.status]
      : VehicleOnboardingCaptureService.DEFAULT_ACTIVE_STATUSES;

    const rows = await this.prisma.vehicleOnboardingCase.findMany({
      where: {
        organizationId,
        status: { in: statusFilter },
        ...(query.sourceMode ? { sourceMode: query.sourceMode } : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
      include: { sourceRefs: true },
    });

    const page = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? page[page.length - 1]?.id ?? null : null;
    return {
      items: page.map((row) => projectVehicleOnboardingCase(row, row.sourceRefs)),
      nextCursor,
    };
  }

  async getCase(organizationId: string, caseId: string): Promise<VehicleOnboardingCaseProjectionDto> {
    const row = await this.prisma.vehicleOnboardingCase.findFirst({
      where: { id: caseId, organizationId },
      include: { sourceRefs: true },
    });
    if (!row) {
      throw new VehicleOnboardingError('CASE_NOT_FOUND', 'Onboarding case not found', { caseId });
    }
    return projectVehicleOnboardingCase(row, row.sourceRefs);
  }

  async updateAdminBaseline(input: {
    organizationId: string;
    caseId: string;
    actorUserId: string | null;
    body: unknown;
    expectedConcurrencyToken: string | null;
  }): Promise<CaptureMutationResult> {
    const adminDraft = parseAdminBaselineCapturePayload(input.body);
    const { result, pendingAudit } = await this.mutateDraft(
      input.organizationId,
      input.caseId,
      input.expectedConcurrencyToken,
      async (tx, caseRow) => {
        const current = parseValidatedAdminDraft(caseRow);
        const currentNorm =
          current ??
          ({
            version: VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
            vehicleName: null,
            licensePlate: null,
            stationId: null,
            notes: null,
          } as const);
        if (adminBaselineSemanticEquals(currentNorm, adminDraft)) {
          return { semanticNoop: true, pendingAudit: null };
        }
        if (adminDraft.stationId) {
          const station = await tx.station.findFirst({
            where: { id: adminDraft.stationId, organizationId: input.organizationId },
            select: { id: true },
          });
          if (!station) {
            throw new VehicleOnboardingError(
              'STATION_SCOPE_MISMATCH',
              'Station is not available for this organization',
            );
          }
        }
        await invalidateReadinessSealIfReady(tx, caseRow);
        await tx.vehicleOnboardingCase.update({
          where: { id: caseRow.id },
          data: {
            draftAdminBaselineJson: adminDraft as unknown as Prisma.InputJsonValue,
            draftAdminBaselineVersion: VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
            lastActorUserId: input.actorUserId,
            concurrencyToken: randomUUID(),
            ...(caseRow.status === 'OPEN' ? { status: 'IN_PROGRESS' } : {}),
          },
        });
        return {
          semanticNoop: false,
          pendingAudit: {
            actorUserId: input.actorUserId,
            organizationId: input.organizationId,
            caseId: caseRow.id,
            mutationType: 'ADMIN_BASELINE_UPDATED',
          },
        };
      },
    );
    this.recordPendingAudit(pendingAudit);
    const caseProjection = await this.getCase(input.organizationId, input.caseId);
    return { case: caseProjection, semanticNoop: result.semanticNoop };
  }

  async updateTechnicalBaseline(input: {
    organizationId: string;
    caseId: string;
    actorUserId: string | null;
    body: unknown;
    expectedConcurrencyToken: string | null;
  }): Promise<CaptureMutationResult> {
    const technicalDraft = parseTechnicalBaselineCapturePayload(input.body);
    const { result, pendingAudit } = await this.mutateDraft(
      input.organizationId,
      input.caseId,
      input.expectedConcurrencyToken,
      async (tx, caseRow) => {
        await assertTechnicalBaselineCaptureValidForCase(tx, caseRow, technicalDraft);
        const currentParsed = parseTechnicalBaselineDraft(caseRow);
        if (currentParsed.version !== 2) {
          throw new VehicleOnboardingError(
            'UNSUPPORTED_CONTRACT_VERSION',
            'Technical baseline capture requires V2 draft storage',
          );
        }
        if (technicalBaselineSemanticEquals(currentParsed.draft, technicalDraft)) {
          return { semanticNoop: true, pendingAudit: null };
        }
        await invalidateReadinessSealIfReady(tx, caseRow);
        await tx.vehicleOnboardingCase.update({
          where: { id: caseRow.id },
          data: {
            draftTechnicalBaselineJson: technicalDraft as unknown as Prisma.InputJsonValue,
            draftTechnicalBaselineVersion: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
            lastActorUserId: input.actorUserId,
            concurrencyToken: randomUUID(),
            ...(caseRow.status === 'OPEN' ? { status: 'IN_PROGRESS' } : {}),
          },
        });
        return {
          semanticNoop: false,
          pendingAudit: {
            actorUserId: input.actorUserId,
            organizationId: input.organizationId,
            caseId: caseRow.id,
            mutationType: 'TECHNICAL_BASELINE_UPDATED',
          },
        };
      },
    );
    this.recordPendingAudit(pendingAudit);
    const caseProjection = await this.getCase(input.organizationId, input.caseId);
    return { case: caseProjection, semanticNoop: result.semanticNoop };
  }

  async evaluateReadinessPreview(input: {
    organizationId: string;
    caseId: string;
    selectedProduct: ProductSlug;
    actorUserId: string | null;
  }): Promise<VehicleOnboardingReadinessSnapshotV2> {
    return this.readinessService.evaluateReadiness({
      organizationId: input.organizationId,
      onboardingCaseId: input.caseId,
      selectedProduct: input.selectedProduct,
      actorUserId: input.actorUserId,
      seal: false,
    });
  }

  async sealReadiness(input: {
    organizationId: string;
    caseId: string;
    selectedProduct: ProductSlug;
    actorUserId: string | null;
    expectedConcurrencyToken: string | null;
  }): Promise<{ case: VehicleOnboardingCaseProjectionDto; snapshot: VehicleOnboardingReadinessSnapshotV2 }> {
    const newToken = randomUUID();
    const coordinator = getCaptureMutationTestCoordinator();
    let pendingAudit: PendingCaptureAudit | null = null;
    const snapshot = await this.prisma.$transaction(
      async (tx) => {
      await acquirePgAdvisoryXactLock64(tx, readinessMutationLockKey(input.caseId));
      if (coordinator?.onSealLockAcquired) {
        await coordinator.onSealLockAcquired();
      }
      const caseRow = await tx.vehicleOnboardingCase.findFirst({
        where: { id: input.caseId, organizationId: input.organizationId },
      });
      if (!caseRow) {
        throw new VehicleOnboardingError('CASE_NOT_FOUND', 'Onboarding case not found');
      }
      assertCaseMutable(caseRow.status);
      assertExpectedConcurrencyToken(caseRow.concurrencyToken, input.expectedConcurrencyToken);
      const snap = await this.readinessService.evaluateReadinessInTransaction(tx, {
        organizationId: input.organizationId,
        onboardingCaseId: input.caseId,
        selectedProduct: input.selectedProduct,
        actorUserId: input.actorUserId,
        seal: true,
        newConcurrencyToken: newToken,
      });
      if (coordinator?.beforeSealCommit) {
        await coordinator.beforeSealCommit();
      }
      pendingAudit = {
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        caseId: caseRow.id,
        mutationType: 'READINESS_SEALED',
      };
      return snap;
      },
      { maxWait: 30_000, timeout: 60_000 },
    );
    this.recordPendingAudit(pendingAudit);
    const caseProjection = await this.getCase(input.organizationId, input.caseId);
    return { case: caseProjection, snapshot };
  }

  private recordPendingAudit(pending: PendingCaptureAudit | null): void {
    if (!pending) return;
    const descriptions: Record<PendingCaptureAudit['mutationType'], string> = {
      ADMIN_BASELINE_UPDATED: 'Vehicle onboarding admin baseline updated',
      TECHNICAL_BASELINE_UPDATED: 'Vehicle onboarding technical baseline updated',
      READINESS_SEALED: 'Vehicle onboarding readiness sealed',
    };
    void this.audit.record({
      actorUserId: pending.actorUserId ?? undefined,
      actorOrganizationId: pending.organizationId,
      action: 'UPDATE',
      entity: 'VEHICLE',
      entityId: pending.caseId,
      description: descriptions[pending.mutationType],
      metaJson: { mutationType: pending.mutationType, caseId: pending.caseId },
    });
  }

  private async mutateDraft(
    organizationId: string,
    caseId: string,
    expectedConcurrencyToken: string | null,
    apply: (
      tx: Prisma.TransactionClient,
      caseRow: VehicleOnboardingCase,
    ) => Promise<{ semanticNoop: boolean; pendingAudit: PendingCaptureAudit | null }>,
  ): Promise<{
    result: { semanticNoop: boolean };
    pendingAudit: PendingCaptureAudit | null;
  }> {
    const coordinator = getCaptureMutationTestCoordinator();
    let pendingAudit: PendingCaptureAudit | null = null;
    const result = await this.prisma.$transaction(
      async (tx) => {
        await acquirePgAdvisoryXactLock64(tx, readinessMutationLockKey(caseId));
        if (coordinator?.onMutationLockAcquired) {
          await coordinator.onMutationLockAcquired();
        }
        const caseRow = await tx.vehicleOnboardingCase.findFirst({
          where: { id: caseId, organizationId },
        });
        if (!caseRow) {
          throw new VehicleOnboardingError('CASE_NOT_FOUND', 'Onboarding case not found');
        }
        assertCaseMutable(caseRow.status);
        assertExpectedConcurrencyToken(caseRow.concurrencyToken, expectedConcurrencyToken);
        const applyResult = await apply(tx, caseRow);
        pendingAudit = applyResult.pendingAudit;
        if (coordinator?.beforeMutationCommit) {
          await coordinator.beforeMutationCommit();
        }
        return { semanticNoop: applyResult.semanticNoop };
      },
      { maxWait: 30_000, timeout: 60_000 },
    );
    return { result, pendingAudit };
  }
}
