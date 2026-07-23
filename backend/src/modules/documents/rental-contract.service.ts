import { Injectable, NotFoundException } from '@nestjs/common';
import type { BookingDocumentBundle, RentalContract } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { RentalContractLegalSnapshotService } from './rental-contract-legal-snapshot.service';
import type { RentalContractDownloadContext, RentalContractLegalRefsSnapshot } from './rental-contract-legal-snapshot.types';
import { RentalContractDto, toRentalContractDto } from './dto/rental-contract.dto';
import { RENTAL_CONTRACT_ERROR_CODE, RentalContractLegalSnapshotError } from './rental-contract.errors';

@Injectable()
export class RentalContractService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legalSnapshot: RentalContractLegalSnapshotService,
  ) {}

  async getByBooking(orgId: string, bookingId: string): Promise<RentalContractDto | null> {
    const contract = await this.prisma.rentalContract.findFirst({
      where: { organizationId: orgId, bookingId },
    });
    if (!contract) return null;
    return toRentalContractDto(contract);
  }

  /** Idempotently ensure a draft rental contract row exists for a booking. */
  async ensureDraftRecordForBooking(
    orgId: string,
    booking: { id: string; customerId: string; vehicleId: string },
  ): Promise<RentalContract> {
    const existing = await this.prisma.rentalContract.findUnique({
      where: { bookingId: booking.id },
    });
    if (existing) {
      if (existing.organizationId !== orgId) {
        throw new RentalContractLegalSnapshotError(
          RENTAL_CONTRACT_ERROR_CODE.TENANT_MISMATCH,
          'Rental contract tenant mismatch',
          { organizationId: orgId, bookingId: booking.id },
        );
      }
      return existing;
    }
    try {
      return await this.prisma.rentalContract.create({
        data: {
          organizationId: orgId,
          bookingId: booking.id,
          customerId: booking.customerId,
          vehicleId: booking.vehicleId,
          status: 'DRAFT',
        },
      });
    } catch {
      const row = await this.prisma.rentalContract.findUnique({ where: { bookingId: booking.id } });
      if (row) return row;
      throw new NotFoundException('Rental contract could not be created');
    }
  }

  async getDownloadContext(orgId: string, bookingId: string): Promise<RentalContractDownloadContext> {
    const contract = await this.prisma.rentalContract.findFirst({
      where: { organizationId: orgId, bookingId },
    });
    if (!contract) {
      throw new NotFoundException('Rental contract not found');
    }
    if (!contract.generatedDocumentId) {
      throw new RentalContractLegalSnapshotError(
        RENTAL_CONTRACT_ERROR_CODE.GENERATED_DOCUMENT_MISSING,
        'Rental contract has no generated PDF document',
        { organizationId: orgId, bookingId, rentalContractId: contract.id },
      );
    }

    const generated = await this.prisma.generatedDocument.findUnique({
      where: { id: contract.generatedDocumentId },
    });
    if (
      !generated ||
      generated.organizationId !== orgId ||
      generated.bookingId !== bookingId
    ) {
      throw new RentalContractLegalSnapshotError(
        RENTAL_CONTRACT_ERROR_CODE.TENANT_MISMATCH,
        'Rental contract generated document is not scoped to organization/booking',
        {
          organizationId: orgId,
          bookingId,
          rentalContractId: contract.id,
          generatedDocumentId: contract.generatedDocumentId,
        },
      );
    }

    return {
      organizationId: orgId,
      bookingId,
      rentalContractId: contract.id,
      generatedDocumentId: contract.generatedDocumentId,
      legalRefsSnapshot: this.legalSnapshot.parseSnapshot(contract.legalRefsSnapshot),
      legalSnapshotFrozenAt: contract.legalSnapshotFrozenAt
        ? contract.legalSnapshotFrozenAt.toISOString()
        : null,
    };
  }

  async resolveLegalRefsForGeneration(
    orgId: string,
    bookingId: string,
    bundle: BookingDocumentBundle,
    contract: RentalContract,
  ) {
    return this.legalSnapshot.resolveMandatoryLegalRefs(orgId, bookingId, bundle, { contract });
  }

  buildImmutableSnapshot(
    orgId: string,
    bookingId: string,
    refs: Awaited<ReturnType<RentalContractLegalSnapshotService['resolveMandatoryLegalRefs']>>['refs'],
    resolution: Awaited<ReturnType<RentalContractLegalSnapshotService['resolveMandatoryLegalRefs']>>['resolution'],
    frozenAt: Date,
  ): RentalContractLegalRefsSnapshot {
    return this.legalSnapshot.buildSnapshot(orgId, bookingId, refs, resolution, frozenAt);
  }

  shouldSkipLegalSnapshotUpdate(contract: RentalContract): boolean {
    return this.legalSnapshot.isFrozen(contract);
  }

  getFrozenLegalRefs(contract: RentalContract) {
    return this.legalSnapshot.getFrozenRefs(contract);
  }

  toLegalRefsForRendering(
    refs: Awaited<ReturnType<RentalContractLegalSnapshotService['resolveMandatoryLegalRefs']>>['refs'],
  ) {
    return this.legalSnapshot.toLegalRefsForRendering(refs);
  }

  toContractPointerIds(
    refs: Awaited<ReturnType<RentalContractLegalSnapshotService['resolveMandatoryLegalRefs']>>['refs'],
  ) {
    return this.legalSnapshot.toContractPointerIds(refs);
  }
}
