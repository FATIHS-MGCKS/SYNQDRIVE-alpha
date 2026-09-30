import { Injectable } from '@nestjs/common';
import { Prisma, ProductSlug, type VehicleOnboardingCase } from '@prisma/client';
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
import { VehicleOnboardingReadinessService } from './vehicle-onboarding-readiness.service';

export interface ListOnboardingCasesQuery {
  status?: string;
  sourceMode?: string;
  limit?: number;
  cursor?: string;
}

export interface CaptureMutationResult {
  case: VehicleOnboardingCaseProjectionDto;
  semanticNoop: boolean;
}

@Injectable()
export class VehicleOnboardingCaptureService {
  private static readonly DEFAULT_LIMIT = 50;
  private static readonly MAX_LIMIT = 100;
  private static readonly DEFAULT_ACTIVE_STATUSES = ['OPEN', 'IN_PROGRESS', 'READY_FOR_ACTIVATION'];

  constructor(
    private readonly prisma: PrismaService,
    private readonly readinessService: VehicleOnboardingReadinessService,
    private readonly audit: AuditService,
  ) {}

  async listCases(
    organizationId: string,
    query: ListOnboardingCasesQuery,
  ): Promise<{ items: VehicleOnboardingCaseProjectionDto[]; nextCursor: string | null }> {
    const limit = Math.min(
      Math.max(query.limit ?? VehicleOnboardingCaptureService.DEFAULT_LIMIT, 1),
      VehicleOnboardingCaptureService.MAX_LIMIT,
    );
    const statusFilter =
      query.status != null && query.status.trim() !== ''
        ? [query.status.trim()]
        : VehicleOnboardingCaptureService.DEFAULT_ACTIVE_STATUSES;

    const rows = await this.prisma.vehicleOnboardingCase.findMany({
      where: {
        organizationId,
        status: { in: statusFilter as any },
        ...(query.sourceMode ? { sourceMode: query.sourceMode as any } : {}),
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
    return this.mutateDraft(input.organizationId, input.caseId, input.actorUserId, input.expectedConcurrencyToken, async (tx, caseRow) => {
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
        return { semanticNoop: true };
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
      void this.audit.record({
        actorUserId: input.actorUserId ?? undefined,
        actorOrganizationId: input.organizationId,
        action: 'UPDATE',
        entity: 'VEHICLE',
        entityId: caseRow.id,
        description: 'Vehicle onboarding admin baseline updated',
        metaJson: { mutationType: 'ADMIN_BASELINE_UPDATED', caseId: caseRow.id },
      });
      return { semanticNoop: false };
    });
  }

  async updateTechnicalBaseline(input: {
    organizationId: string;
    caseId: string;
    actorUserId: string | null;
    body: unknown;
    expectedConcurrencyToken: string | null;
  }): Promise<CaptureMutationResult> {
    const technicalDraft = parseTechnicalBaselineCapturePayload(input.body);
    return this.mutateDraft(input.organizationId, input.caseId, input.actorUserId, input.expectedConcurrencyToken, async (tx, caseRow) => {
      await assertTechnicalBaselineCaptureValidForCase(tx, caseRow, technicalDraft);
      const currentParsed = parseTechnicalBaselineDraft(caseRow);
      if (currentParsed.version !== 2) {
        throw new VehicleOnboardingError(
          'UNSUPPORTED_CONTRACT_VERSION',
          'Technical baseline capture requires V2 draft storage',
        );
      }
      if (technicalBaselineSemanticEquals(currentParsed.draft, technicalDraft)) {
        return { semanticNoop: true };
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
      void this.audit.record({
        actorUserId: input.actorUserId ?? undefined,
        actorOrganizationId: input.organizationId,
        action: 'UPDATE',
        entity: 'VEHICLE',
        entityId: caseRow.id,
        description: 'Vehicle onboarding technical baseline updated',
        metaJson: { mutationType: 'TECHNICAL_BASELINE_UPDATED', caseId: caseRow.id },
      });
      return { semanticNoop: false };
    });
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
    const snapshot = await this.prisma.$transaction(async (tx) => {
      await acquirePgAdvisoryXactLock64(tx, readinessMutationLockKey(input.caseId));
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
      void this.audit.record({
        actorUserId: input.actorUserId ?? undefined,
        actorOrganizationId: input.organizationId,
        action: 'UPDATE',
        entity: 'VEHICLE',
        entityId: caseRow.id,
        description: 'Vehicle onboarding readiness sealed',
        metaJson: { mutationType: 'READINESS_SEALED', caseId: caseRow.id },
      });
      return snap;
    });
    const caseProjection = await this.getCase(input.organizationId, input.caseId);
    return { case: caseProjection, snapshot };
  }

  private async mutateDraft(
    organizationId: string,
    caseId: string,
    actorUserId: string | null,
    expectedConcurrencyToken: string | null,
    apply: (
      tx: Prisma.TransactionClient,
      caseRow: VehicleOnboardingCase,
    ) => Promise<{ semanticNoop: boolean }>,
  ): Promise<CaptureMutationResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      await acquirePgAdvisoryXactLock64(tx, readinessMutationLockKey(caseId));
      const caseRow = await tx.vehicleOnboardingCase.findFirst({
        where: { id: caseId, organizationId },
      });
      if (!caseRow) {
        throw new VehicleOnboardingError('CASE_NOT_FOUND', 'Onboarding case not found');
      }
      assertCaseMutable(caseRow.status);
      assertExpectedConcurrencyToken(caseRow.concurrencyToken, expectedConcurrencyToken);
      const { semanticNoop } = await apply(tx, caseRow);
      return { semanticNoop };
    });
    const caseProjection = await this.getCase(organizationId, caseId);
    return { case: caseProjection, semanticNoop: result.semanticNoop };
  }
}
