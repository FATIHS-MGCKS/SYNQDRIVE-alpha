import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingHandoverSignatureStorageStatus,
  HandoverSignatureRole,
  Prisma,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { Response } from 'express';
import { PrismaService } from '@shared/database/prisma.service';
import { DOCUMENTS_STORAGE } from '@modules/documents/storage/document-storage.interface';
import type { DocumentStoragePort } from '@modules/documents/storage/document-storage.interface';
import { sha256Hex } from '@modules/documents/storage/document-storage-content-hash.util';
import {
  HANDOVER_SIGNATURE_DOCUMENT_TYPE,
  HANDOVER_SIGNATURE_RETENTION_CLASS,
  HANDOVER_SIGNATURE_VIEW_URL_TTL_SECONDS,
  HANDOVER_SIGNATURE_ERROR_CODE,
} from './booking-handover-signature.constants';
import {
  parseAndValidateSignatureDataUrl,
  signatureDataUrlPresent,
} from './booking-handover-signature-data-url.util';
import {
  EMPTY_HANDOVER_SIGNATURE_SUMMARY,
  type HandoverSignatureSummary,
  type HandoverSignatureViewUrlResponse,
  buildProtocolCompleted,
} from './booking-handover-signature.types';

type SignatureRoleInput = {
  role: HandoverSignatureRole;
  dataUrl: string | null | undefined;
  signerName: string | null | undefined;
  signedAt: Date;
};

@Injectable()
export class BookingHandoverSignatureService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(DOCUMENTS_STORAGE)
    private readonly storage: DocumentStoragePort,
  ) {}

  async ingestForProtocol(
    tx: Prisma.TransactionClient,
    input: {
      organizationId: string;
      bookingId: string;
      protocolId: string;
      customerSignatureDataUrl?: string | null;
      staffSignatureDataUrl?: string | null;
      customerSignatureName?: string | null;
      staffSignatureName?: string | null;
      signedAt: Date;
    },
  ): Promise<void> {
    const roles: SignatureRoleInput[] = [
      {
        role: 'CUSTOMER',
        dataUrl: input.customerSignatureDataUrl,
        signerName: input.customerSignatureName,
        signedAt: input.signedAt,
      },
      {
        role: 'STAFF',
        dataUrl: input.staffSignatureDataUrl,
        signerName: input.staffSignatureName,
        signedAt: input.signedAt,
      },
    ];

    for (const entry of roles) {
      if (!signatureDataUrlPresent(entry.dataUrl)) continue;
      const parsed = parseAndValidateSignatureDataUrl(entry.dataUrl!);
      const stored = await this.storage.putObject({
        organizationId: input.organizationId,
        bookingId: input.bookingId,
        documentType: `${HANDOVER_SIGNATURE_DOCUMENT_TYPE}_${entry.role}`,
        originalName: `${entry.role.toLowerCase()}-signature.png`,
        buffer: parsed.buffer,
        mimeType: parsed.mimeType,
      });

      await tx.bookingHandoverSignature.create({
        data: {
          organizationId: input.organizationId,
          bookingId: input.bookingId,
          protocolId: input.protocolId,
          role: entry.role,
          signerName: entry.signerName?.trim() || null,
          signedAt: entry.signedAt,
          objectKey: stored.objectKey,
          storageProvider: stored.storageProvider,
          contentHash: stored.contentHash,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          storageStatus: BookingHandoverSignatureStorageStatus.STORED,
          migratedAt: new Date(),
          retentionClass: HANDOVER_SIGNATURE_RETENTION_CLASS,
        },
      });
    }
  }

  async summariesForProtocolIds(
    organizationId: string,
    protocolIds: string[],
  ): Promise<Map<string, { customer: HandoverSignatureSummary; staff: HandoverSignatureSummary }>> {
    const map = new Map<
      string,
      { customer: HandoverSignatureSummary; staff: HandoverSignatureSummary }
    >();
    if (protocolIds.length === 0) return map;

    const rows = await this.prisma.bookingHandoverSignature.findMany({
      where: {
        organizationId,
        protocolId: { in: protocolIds },
        deletedAt: null,
        storageStatus: {
          in: [
            BookingHandoverSignatureStorageStatus.STORED,
            BookingHandoverSignatureStorageStatus.LEGACY_CLEARED,
          ],
        },
      },
      select: {
        id: true,
        protocolId: true,
        role: true,
        signedAt: true,
      },
    });

    for (const protocolId of protocolIds) {
      map.set(protocolId, {
        customer: { ...EMPTY_HANDOVER_SIGNATURE_SUMMARY },
        staff: { ...EMPTY_HANDOVER_SIGNATURE_SUMMARY },
      });
    }

    for (const row of rows) {
      const entry = map.get(row.protocolId);
      if (!entry) continue;
      const summary: HandoverSignatureSummary = {
        signaturePresent: true,
        signedAt: row.signedAt.toISOString(),
        signatureReferenceId: row.id,
      };
      if (row.role === 'CUSTOMER') entry.customer = summary;
      if (row.role === 'STAFF') entry.staff = summary;
    }

    return map;
  }

  async createViewUrl(
    organizationId: string,
    bookingId: string,
    signatureReferenceId: string,
    createdByUserId: string | null,
  ): Promise<HandoverSignatureViewUrlResponse> {
    const signature = await this.prisma.bookingHandoverSignature.findFirst({
      where: {
        id: signatureReferenceId,
        organizationId,
        bookingId,
        deletedAt: null,
        storageStatus: {
          in: [
            BookingHandoverSignatureStorageStatus.STORED,
            BookingHandoverSignatureStorageStatus.LEGACY_CLEARED,
          ],
        },
      },
    });

    if (!signature?.objectKey) {
      throw new NotFoundException({
        code: HANDOVER_SIGNATURE_ERROR_CODE.NOT_FOUND,
        message: 'Signature not found',
      });
    }

    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(
      Date.now() + HANDOVER_SIGNATURE_VIEW_URL_TTL_SECONDS * 1000,
    );

    await this.prisma.bookingHandoverSignatureAccessToken.create({
      data: {
        organizationId,
        signatureId: signature.id,
        tokenHash,
        expiresAt,
        createdByUserId,
      },
    });

    const baseUrl = this.resolvePublicApiBaseUrl();
    const viewUrl = `${baseUrl}/booking-signature-access/${rawToken}`;

    return {
      signatureReferenceId: signature.id,
      viewUrl,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async streamByAccessToken(token: string, res: Response): Promise<void> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const access = await this.prisma.bookingHandoverSignatureAccessToken.findFirst({
      where: { tokenHash },
      include: {
        signature: true,
      },
    });

    if (!access) {
      throw new NotFoundException({
        code: HANDOVER_SIGNATURE_ERROR_CODE.TOKEN_INVALID,
        message: 'Signature access token is invalid',
      });
    }

    if (access.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException({
        code: HANDOVER_SIGNATURE_ERROR_CODE.TOKEN_EXPIRED,
        message: 'Signature access token has expired',
      });
    }

    const signature = access.signature;
    if (
      !signature ||
      signature.deletedAt ||
      !signature.objectKey ||
      signature.organizationId !== access.organizationId
    ) {
      throw new NotFoundException({
        code: HANDOVER_SIGNATURE_ERROR_CODE.NOT_FOUND,
        message: 'Signature not found',
      });
    }

    await this.verifyStoredObject(signature);

    const stream = await this.storage.getObjectStream(signature.objectKey);
    res.setHeader('Content-Type', signature.mimeType ?? 'image/png');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    await this.prisma.bookingHandoverSignatureAccessToken.update({
      where: { id: access.id },
      data: { usedAt: new Date() },
    });

    stream.pipe(res);
  }

  async loadDataUrlsForPdf(
    organizationId: string,
    protocolId: string,
    legacy?: {
      customerSignatureDataUrl?: string | null;
      staffSignatureDataUrl?: string | null;
    },
  ): Promise<{ customerSignatureDataUrl: string | null; staffSignatureDataUrl: string | null }> {
    const rows = await this.prisma.bookingHandoverSignature.findMany({
      where: {
        organizationId,
        protocolId,
        deletedAt: null,
        storageStatus: {
          in: [
            BookingHandoverSignatureStorageStatus.STORED,
            BookingHandoverSignatureStorageStatus.LEGACY_CLEARED,
          ],
        },
      },
    });

    let customerSignatureDataUrl: string | null = null;
    let staffSignatureDataUrl: string | null = null;

    for (const row of rows) {
      if (!row.objectKey || !row.mimeType) continue;
      await this.verifyStoredObject(row);
      const buffer = await this.storage.getObject(row.objectKey);
      const dataUrl = `data:${row.mimeType};base64,${buffer.toString('base64')}`;
      if (row.role === 'CUSTOMER') customerSignatureDataUrl = dataUrl;
      if (row.role === 'STAFF') staffSignatureDataUrl = dataUrl;
    }

    if (!customerSignatureDataUrl && legacy?.customerSignatureDataUrl) {
      customerSignatureDataUrl = legacy.customerSignatureDataUrl;
    }
    if (!staffSignatureDataUrl && legacy?.staffSignatureDataUrl) {
      staffSignatureDataUrl = legacy.staffSignatureDataUrl;
    }

    return { customerSignatureDataUrl, staffSignatureDataUrl };
  }

  async markDeletionEligible(
    organizationId: string,
    signatureReferenceId: string,
    deletionEligibleAt: Date,
  ): Promise<void> {
    await this.prisma.bookingHandoverSignature.updateMany({
      where: { id: signatureReferenceId, organizationId },
      data: { deletionEligibleAt },
    });
  }

  async purgeEligibleSignatures(organizationId: string): Promise<number> {
    const now = new Date();
    const eligible = await this.prisma.bookingHandoverSignature.findMany({
      where: {
        organizationId,
        deletedAt: null,
        deletionEligibleAt: { lte: now },
      },
      select: { id: true, objectKey: true },
    });

    let count = 0;
    for (const row of eligible) {
      if (row.objectKey) {
        await this.storage.deleteObject(row.objectKey).catch(() => undefined);
      }
      await this.prisma.bookingHandoverSignature.update({
        where: { id: row.id },
        data: {
          deletedAt: now,
          objectKey: null,
        },
      });
      count += 1;
    }
    return count;
  }

  async getSummary(
    organizationId: string,
    bookingId: string,
    signatureReferenceId: string,
  ): Promise<HandoverSignatureSummary> {
    const row = await this.prisma.bookingHandoverSignature.findFirst({
      where: {
        id: signatureReferenceId,
        organizationId,
        bookingId,
        deletedAt: null,
        storageStatus: {
          in: [
            BookingHandoverSignatureStorageStatus.STORED,
            BookingHandoverSignatureStorageStatus.LEGACY_CLEARED,
          ],
        },
      },
      select: { id: true, signedAt: true },
    });

    if (!row) {
      return { ...EMPTY_HANDOVER_SIGNATURE_SUMMARY };
    }

    return {
      signaturePresent: true,
      signedAt: row.signedAt.toISOString(),
      signatureReferenceId: row.id,
    };
  }

  buildProtocolCompleted(
    customer: HandoverSignatureSummary,
    staff: HandoverSignatureSummary,
  ): boolean {
    return buildProtocolCompleted(customer, staff);
  }

  private async verifyStoredObject(signature: {
    objectKey: string | null;
    contentHash: string | null;
    sizeBytes: number | null;
  }): Promise<void> {
    if (!signature.objectKey || !signature.contentHash) {
      throw new ConflictException({
        code: HANDOVER_SIGNATURE_ERROR_CODE.STORAGE_VERIFICATION_FAILED,
        message: 'Signature storage reference is incomplete',
      });
    }

    const buffer = await this.storage.getObject(signature.objectKey);
    const hash = sha256Hex(buffer);
    if (hash !== signature.contentHash) {
      throw new ConflictException({
        code: HANDOVER_SIGNATURE_ERROR_CODE.STORAGE_VERIFICATION_FAILED,
        message: 'Signature storage integrity check failed',
      });
    }
    if (signature.sizeBytes != null && buffer.length !== signature.sizeBytes) {
      throw new ConflictException({
        code: HANDOVER_SIGNATURE_ERROR_CODE.STORAGE_VERIFICATION_FAILED,
        message: 'Signature storage size mismatch',
      });
    }
  }

  private resolvePublicApiBaseUrl(): string {
    const base =
      process.env.APP_URL?.trim() ||
      process.env.TWILIO_VOICE_WEBHOOK_BASE_URL?.trim() ||
      'http://localhost:3001';
    return `${base.replace(/\/$/, '')}/api/v1`;
  }
}
