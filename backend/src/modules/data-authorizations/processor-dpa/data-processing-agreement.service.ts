import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  DataProcessingAgreementStatus,
  DpaAuditEventType,
  DpaSubprocessorStatus,
  TransferAssessmentStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { validateDataProcessingAgreement } from '../privacy-domain/privacy-domain.invariants';
import { DpaAuditService } from './dpa-audit.service';
import { DpaSubprocessorService } from './dpa-subprocessor.service';
import { DpaTransferAssessmentService } from './dpa-transfer-assessment.service';
import { isThirdCountry, PROCESSOR_DPA_CONFIG } from './processor-dpa.config';
import type {
  ActivateDataProcessingAgreementDto,
  CreateDataProcessingAgreementDto,
  CreateDpaVersionDto,
  LinkDpaSharingAuthorizationDto,
  TerminateDataProcessingAgreementDto,
  UpdateDataProcessingAgreementDto,
} from './dto/processor-dpa.dto';
import { DPA_PUBLIC_SELECT } from './dto/processor-dpa.dto';

const DPA_INCLUDE = {
  linkedActivities: { include: { processingActivity: { select: { id: true, title: true, activityCode: true } } } },
  subprocessors: true,
  dataLocations: true,
  transferCountries: true,
  sharingLinks: {
    include: {
      dataSharingAuthorization: {
        select: { id: true, recipient: true, status: true, transferCountry: true, transferMechanism: true },
      },
    },
  },
  auditEvents: { orderBy: { createdAt: 'desc' as const }, take: 20 },
} as const;

@Injectable()
export class DataProcessingAgreementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: DpaAuditService,
    private readonly subprocessors: DpaSubprocessorService,
    private readonly transferAssessment: DpaTransferAssessmentService,
  ) {}

  async list(orgId: string, filters?: { status?: DataProcessingAgreementStatus; currentOnly?: boolean }) {
    return this.prisma.dataProcessingAgreement.findMany({
      where: {
        organizationId: orgId,
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.currentOnly === false ? {} : { isCurrentVersion: true }),
      },
      select: DPA_PUBLIC_SELECT,
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  async getById(orgId: string, id: string) {
    const row = await this.prisma.dataProcessingAgreement.findFirst({
      where: { id, organizationId: orgId },
      include: {
        linkedActivities: DPA_INCLUDE.linkedActivities,
        subprocessors: true,
        dataLocations: true,
        transferCountries: true,
        sharingLinks: DPA_INCLUDE.sharingLinks,
        auditEvents: DPA_INCLUDE.auditEvents,
      },
    });
    if (!row) throw new NotFoundException({ message: 'DPA not found', code: 'DPA_NOT_FOUND' });
    const { documentStorageRef: _hidden, ...publicRow } = row;
    return {
      ...publicRow,
      governance: this.transferAssessment.summarize(row),
      disclaimer: PROCESSOR_DPA_CONFIG.disclaimer,
    };
  }

  async create(orgId: string, dto: CreateDataProcessingAgreementDto, actorUserId?: string) {
    const activityIds = this.resolveActivityIds(dto);
    await this.assertActivities(orgId, activityIds);

    const policyFamilyId = randomUUID();
    const transferAssessmentStatus = this.transferAssessment.deriveStatus(dto.transferCountries);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.dataProcessingAgreement.create({
        data: {
          id: randomUUID(),
          organizationId: orgId,
          policyFamilyId,
          versionNumber: 1,
          isCurrentVersion: true,
          processingActivityId: activityIds[0] ?? null,
          processorName: dto.processorName.trim(),
          processorRole: dto.processorRole,
          contractReference: dto.contractReference?.trim() || null,
          safeguards: dto.safeguards?.trim() || null,
          primaryTransferMechanism: dto.primaryTransferMechanism ?? null,
          transferAssessmentStatus,
          effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
          effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : null,
          reviewDate: dto.reviewDate ? new Date(dto.reviewDate) : null,
          ownerUserId: dto.ownerUserId ?? actorUserId ?? null,
          providerKind: dto.providerKind?.trim() || null,
          status: DataProcessingAgreementStatus.DRAFT,
        },
      });

      await this.syncActivityLinks(tx, orgId, created.id, activityIds);
      await this.syncNested(tx, orgId, created.id, dto, actorUserId);

      validateDataProcessingAgreement({
        organizationId: orgId,
        processingActivityOrganizationId: orgId,
        status: created.status,
        effectiveFrom: created.effectiveFrom,
        effectiveUntil: created.effectiveUntil,
        signedAt: created.signedAt,
        terminatedAt: created.terminatedAt,
      });

      await this.audit.record(tx, {
        organizationId: orgId,
        agreementId: created.id,
        eventType: DpaAuditEventType.CREATED,
        actorUserId,
        summary: `DPA created for ${created.processorName}`,
      });

      return this.getById(orgId, created.id);
    });
  }

  async update(orgId: string, id: string, dto: UpdateDataProcessingAgreementDto, actorUserId?: string) {
    const current = await this.findOrThrow(orgId, id);
    if (current.status !== DataProcessingAgreementStatus.DRAFT) {
      throw new UnprocessableEntityException('Only DRAFT agreements can be edited — create a new version');
    }

    const activityIds = dto.processingActivityIds ?? undefined;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dataProcessingAgreement.update({
        where: { id },
        data: {
          processorName: dto.processorName?.trim(),
          processorRole: dto.processorRole,
          contractReference: dto.contractReference?.trim(),
          safeguards: dto.safeguards?.trim(),
          primaryTransferMechanism: dto.primaryTransferMechanism,
          effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
          effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : undefined,
          reviewDate: dto.reviewDate ? new Date(dto.reviewDate) : undefined,
          ownerUserId: dto.ownerUserId,
          providerKind: dto.providerKind?.trim(),
        },
      });

      if (activityIds) {
        await this.syncActivityLinks(tx, orgId, id, activityIds);
        await tx.dataProcessingAgreement.update({
          where: { id },
          data: { processingActivityId: activityIds[0] ?? null },
        });
      }

      await this.audit.record(tx, {
        organizationId: orgId,
        agreementId: id,
        eventType: DpaAuditEventType.UPDATED,
        actorUserId,
        summary: 'DPA draft updated',
      });

      return this.getById(orgId, updated.id);
    });
  }

  async activate(orgId: string, id: string, dto: ActivateDataProcessingAgreementDto, actorUserId: string) {
    const current = await this.findOrThrow(orgId, id);
    if (current.status !== DataProcessingAgreementStatus.DRAFT) {
      throw new UnprocessableEntityException('Only DRAFT agreements can be activated');
    }

    const signedAt = dto.signedAt ? new Date(dto.signedAt) : new Date();
    const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : current.effectiveFrom ?? signedAt;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dataProcessingAgreement.update({
        where: { id },
        data: {
          status: DataProcessingAgreementStatus.ACTIVE,
          signedAt,
          signedByUserId: actorUserId,
          effectiveFrom,
        },
      });

      validateDataProcessingAgreement({
        organizationId: orgId,
        processingActivityOrganizationId: orgId,
        status: updated.status,
        effectiveFrom: updated.effectiveFrom,
        effectiveUntil: updated.effectiveUntil,
        signedAt: updated.signedAt,
        terminatedAt: updated.terminatedAt,
      });

      await this.audit.record(tx, {
        organizationId: orgId,
        agreementId: id,
        eventType: DpaAuditEventType.ACTIVATED,
        actorUserId,
        summary: 'DPA activated',
      });

      return this.getById(orgId, id);
    });
  }

  async terminate(orgId: string, id: string, dto: TerminateDataProcessingAgreementDto, actorUserId: string) {
    const current = await this.findOrThrow(orgId, id);
    if (current.status !== DataProcessingAgreementStatus.ACTIVE) {
      throw new UnprocessableEntityException('Only ACTIVE agreements can be terminated');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.dataProcessingAgreement.update({
        where: { id },
        data: {
          status: DataProcessingAgreementStatus.TERMINATED,
          terminatedAt: new Date(),
        },
      });

      await this.audit.record(tx, {
        organizationId: orgId,
        agreementId: id,
        eventType: DpaAuditEventType.TERMINATED,
        actorUserId,
        summary: dto.reason,
      });

      return this.getById(orgId, id);
    });
  }

  async createVersion(orgId: string, id: string, dto: CreateDpaVersionDto, actorUserId?: string) {
    const source = await this.prisma.dataProcessingAgreement.findFirst({
      where: { id, organizationId: orgId },
      include: {
        linkedActivities: true,
        subprocessors: true,
        dataLocations: true,
        transferCountries: true,
      },
    });
    if (!source) throw new NotFoundException({ message: 'DPA not found' });

    return this.prisma.$transaction(async (tx) => {
      await tx.dataProcessingAgreement.update({
        where: { id: source.id },
        data: { isCurrentVersion: false },
      });

      const created = await tx.dataProcessingAgreement.create({
        data: {
          id: randomUUID(),
          organizationId: orgId,
          policyFamilyId: source.policyFamilyId,
          versionNumber: source.versionNumber + 1,
          isCurrentVersion: true,
          processingActivityId: source.processingActivityId,
          processorName: source.processorName,
          processorRole: source.processorRole,
          contractReference: source.contractReference,
          safeguards: source.safeguards,
          primaryTransferMechanism: source.primaryTransferMechanism,
          transferAssessmentStatus: source.transferAssessmentStatus,
          effectiveFrom: source.effectiveFrom,
          effectiveUntil: source.effectiveUntil,
          reviewDate: source.reviewDate,
          ownerUserId: source.ownerUserId,
          providerKind: source.providerKind,
          status: DataProcessingAgreementStatus.DRAFT,
        },
      });

      for (const link of source.linkedActivities) {
        await tx.dataProcessingAgreementActivity.create({
          data: {
            id: randomUUID(),
            organizationId: orgId,
            agreementId: created.id,
            processingActivityId: link.processingActivityId,
          },
        });
      }

      for (const sp of source.subprocessors) {
        await tx.dataProcessingAgreementSubprocessor.create({
          data: {
            id: randomUUID(),
            organizationId: orgId,
            agreementId: created.id,
            name: sp.name,
            processorRole: sp.processorRole,
            dataLocationCountry: sp.dataLocationCountry,
            processingPartnerCountry: sp.processingPartnerCountry,
            status: sp.status,
            effectiveFrom: sp.effectiveFrom,
            effectiveUntil: sp.effectiveUntil,
            reviewRequired: sp.reviewRequired,
          },
        });
      }

      for (const loc of source.dataLocations) {
        await tx.dataProcessingAgreementDataLocation.create({
          data: {
            id: randomUUID(),
            organizationId: orgId,
            agreementId: created.id,
            countryCode: loc.countryCode,
            regionLabel: loc.regionLabel,
            isPrimary: loc.isPrimary,
          },
        });
      }

      for (const tc of source.transferCountries) {
        await tx.dataProcessingAgreementTransferCountry.create({
          data: {
            id: randomUUID(),
            organizationId: orgId,
            agreementId: created.id,
            countryCode: tc.countryCode,
            transferMechanism: tc.transferMechanism,
            assessmentStatus: tc.assessmentStatus,
            safeguards: tc.safeguards,
          },
        });
      }

      await this.audit.record(tx, {
        organizationId: orgId,
        agreementId: created.id,
        eventType: DpaAuditEventType.VERSION_CREATED,
        actorUserId,
        summary: dto.reason ?? `New DPA version v${created.versionNumber}`,
        metadata: { sourceAgreementId: source.id },
      });

      return this.getById(orgId, created.id);
    });
  }

  async linkSharingAuthorization(
    orgId: string,
    agreementId: string,
    dto: LinkDpaSharingAuthorizationDto,
    actorUserId?: string,
  ) {
    await this.findOrThrow(orgId, agreementId);
    const sharing = await this.prisma.dataSharingAuthorization.findFirst({
      where: { id: dto.dataSharingAuthorizationId, organizationId: orgId },
    });
    if (!sharing) throw new NotFoundException({ message: 'Data sharing authorization not found' });

    return this.prisma.$transaction(async (tx) => {
      await tx.dataProcessingAgreementSharingLink.create({
        data: {
          id: randomUUID(),
          organizationId: orgId,
          agreementId,
          dataSharingAuthorizationId: sharing.id,
        },
      });

      await this.audit.record(tx, {
        organizationId: orgId,
        agreementId,
        eventType: DpaAuditEventType.SHARING_LINKED,
        actorUserId,
        summary: `Linked sharing authorization ${sharing.recipient}`,
        metadata: { dataSharingAuthorizationId: sharing.id },
      });

      return this.getById(orgId, agreementId);
    });
  }

  private resolveActivityIds(dto: CreateDataProcessingAgreementDto): string[] {
    const ids = [...(dto.processingActivityIds ?? [])];
    if (dto.processingActivityId && !ids.includes(dto.processingActivityId)) {
      ids.unshift(dto.processingActivityId);
    }
    return [...new Set(ids)];
  }

  private async syncNested(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    orgId: string,
    agreementId: string,
    dto: CreateDataProcessingAgreementDto,
    actorUserId?: string,
  ) {
    if (dto.dataLocations?.length) {
      for (const loc of dto.dataLocations) {
        await tx.dataProcessingAgreementDataLocation.create({
          data: {
            id: randomUUID(),
            organizationId: orgId,
            agreementId,
            countryCode: loc.countryCode.trim().toUpperCase(),
            regionLabel: loc.regionLabel?.trim() || null,
            isPrimary: loc.isPrimary ?? false,
          },
        });
      }
    }

    if (dto.transferCountries?.length) {
      for (const tc of dto.transferCountries) {
        await tx.dataProcessingAgreementTransferCountry.create({
          data: {
            id: randomUUID(),
            organizationId: orgId,
            agreementId,
            countryCode: tc.countryCode.trim().toUpperCase(),
            transferMechanism: tc.transferMechanism,
            assessmentStatus: tc.assessmentStatus ?? TransferAssessmentStatus.NOT_ASSESSED,
            safeguards: tc.safeguards?.trim() || null,
          },
        });
      }
      await tx.dataProcessingAgreement.update({
        where: { id: agreementId },
        data: {
          transferAssessmentStatus: this.transferAssessment.deriveStatus(dto.transferCountries),
        },
      });
    }

    if (dto.subprocessors?.length) {
      for (const sp of dto.subprocessors) {
        await this.subprocessors.createInTransaction(tx, orgId, agreementId, sp, actorUserId);
      }
    }
  }

  private async syncActivityLinks(
    tx: Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    orgId: string,
    agreementId: string,
    activityIds: string[],
  ) {
    await tx.dataProcessingAgreementActivity.deleteMany({ where: { agreementId } });
    for (const processingActivityId of activityIds) {
      await tx.dataProcessingAgreementActivity.create({
        data: {
          id: randomUUID(),
          organizationId: orgId,
          agreementId,
          processingActivityId,
        },
      });
    }
  }

  private async assertActivities(orgId: string, activityIds: string[]) {
    if (activityIds.length === 0) return;
    const count = await this.prisma.processingActivity.count({
      where: { organizationId: orgId, id: { in: activityIds } },
    });
    if (count !== activityIds.length) {
      throw new BadRequestException({ message: 'Invalid processing activity reference' });
    }
  }

  private async findOrThrow(orgId: string, id: string) {
    const row = await this.prisma.dataProcessingAgreement.findFirst({ where: { id, organizationId: orgId } });
    if (!row) throw new NotFoundException({ message: 'DPA not found', code: 'DPA_NOT_FOUND' });
    return row;
  }
}
