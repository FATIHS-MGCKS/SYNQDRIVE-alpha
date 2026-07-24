import { Injectable, NotFoundException } from '@nestjs/common';
import { DpaAuditEventType, DpaSubprocessorStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@shared/database/prisma.service';
import { DpaAuditService } from './dpa-audit.service';
import type { DpaSubprocessorDto, ReviewDpaSubprocessorDto, UpdateDpaSubprocessorDto } from './dto/processor-dpa.dto';

@Injectable()
export class DpaSubprocessorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: DpaAuditService,
  ) {}

  async add(orgId: string, agreementId: string, dto: DpaSubprocessorDto, actorUserId?: string) {
    await this.assertAgreement(orgId, agreementId);
    return this.prisma.$transaction(async (tx) => {
      const created = await this.createInTransaction(tx, orgId, agreementId, dto, actorUserId);
      return created;
    });
  }

  async update(
    orgId: string,
    agreementId: string,
    subprocessorId: string,
    dto: UpdateDpaSubprocessorDto,
    actorUserId?: string,
  ) {
    const existing = await this.findOrThrow(orgId, agreementId, subprocessorId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dataProcessingAgreementSubprocessor.update({
        where: { id: subprocessorId },
        data: {
          name: dto.name?.trim(),
          processorRole: dto.processorRole,
          dataLocationCountry: dto.dataLocationCountry?.trim().toUpperCase(),
          processingPartnerCountry: dto.processingPartnerCountry?.trim().toUpperCase(),
          effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
          effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : undefined,
          reviewRequired: true,
          status: DpaSubprocessorStatus.PENDING_REVIEW,
        },
      });

      await this.audit.record(tx, {
        organizationId: orgId,
        agreementId,
        eventType: DpaAuditEventType.SUBPROCESSOR_CHANGED,
        actorUserId,
        summary: `Subprocessor changed: ${updated.name}`,
        metadata: { subprocessorId, previousName: existing.name },
      });

      await this.audit.record(tx, {
        organizationId: orgId,
        agreementId,
        eventType: DpaAuditEventType.SUBPROCESSOR_REVIEW_REQUIRED,
        actorUserId,
        summary: `Review required for subprocessor ${updated.name}`,
        metadata: { subprocessorId },
      });

      return updated;
    });
  }

  async review(
    orgId: string,
    agreementId: string,
    subprocessorId: string,
    dto: ReviewDpaSubprocessorDto,
    actorUserId: string,
  ) {
    await this.findOrThrow(orgId, agreementId, subprocessorId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.dataProcessingAgreementSubprocessor.update({
        where: { id: subprocessorId },
        data: {
          status: dto.status,
          reviewRequired: false,
        },
      });

      await this.audit.record(tx, {
        organizationId: orgId,
        agreementId,
        eventType: DpaAuditEventType.SUBPROCESSOR_CHANGED,
        actorUserId,
        summary: `Subprocessor review ${dto.status}: ${updated.name}`,
        metadata: { subprocessorId, reason: dto.reason },
      });

      return updated;
    });
  }

  async createInTransaction(
    tx: Prisma.TransactionClient,
    orgId: string,
    agreementId: string,
    dto: DpaSubprocessorDto,
    actorUserId?: string,
  ) {
    const created = await tx.dataProcessingAgreementSubprocessor.create({
      data: {
        id: randomUUID(),
        organizationId: orgId,
        agreementId,
        name: dto.name.trim(),
        processorRole: dto.processorRole ?? 'SUBPROCESSOR',
        dataLocationCountry: dto.dataLocationCountry?.trim().toUpperCase() || null,
        processingPartnerCountry: dto.processingPartnerCountry?.trim().toUpperCase() || null,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
        effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : null,
        status: DpaSubprocessorStatus.DRAFT,
      },
    });

    await this.audit.record(tx, {
      organizationId: orgId,
      agreementId,
      eventType: DpaAuditEventType.SUBPROCESSOR_ADDED,
      actorUserId,
      summary: `Subprocessor added: ${created.name}`,
      metadata: { subprocessorId: created.id },
    });

    return created;
  }

  private async assertAgreement(orgId: string, agreementId: string) {
    const row = await this.prisma.dataProcessingAgreement.findFirst({
      where: { id: agreementId, organizationId: orgId },
    });
    if (!row) throw new NotFoundException({ message: 'DPA not found' });
  }

  private async findOrThrow(orgId: string, agreementId: string, subprocessorId: string) {
    const row = await this.prisma.dataProcessingAgreementSubprocessor.findFirst({
      where: { id: subprocessorId, agreementId, organizationId: orgId },
    });
    if (!row) throw new NotFoundException({ message: 'Subprocessor not found' });
    return row;
  }
}
