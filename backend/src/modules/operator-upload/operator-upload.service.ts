import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  HandoverSessionStatus,
  OperatorUploadKind,
  OperatorUploadStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  OPERATOR_UPLOAD_ERROR,
  OPERATOR_UPLOAD_MAX_ATTEMPTS,
  OPERATOR_UPLOAD_RETENTION_MS,
} from './operator-upload.constants';
import { mapOperatorUpload, type OperatorUploadDto } from './operator-upload.mapper';
import {
  isRetryableUploadError,
  sha256Base64,
  validateOperatorUploadBinary,
} from './operator-upload.validation';

const EDITABLE_SESSION_STATUSES: HandoverSessionStatus[] = [
  HandoverSessionStatus.DRAFT,
  HandoverSessionStatus.IN_PROGRESS,
  HandoverSessionStatus.AWAITING_REQUIREMENTS,
  HandoverSessionStatus.AWAITING_SIGNATURE,
];

export interface RegisterOperatorUploadInput {
  organizationId: string;
  clientUploadId: string;
  kind: OperatorUploadKind;
  bookingId: string;
  vehicleId: string;
  handoverSessionId?: string | null;
  handoverKind?: 'PICKUP' | 'RETURN' | null;
  fileName?: string | null;
  mimeType?: string | null;
  requiredForComplete?: boolean;
  uploadedByUserId?: string | null;
}

export interface UploadOperatorBinaryInput {
  organizationId: string;
  clientUploadId: string;
  buffer: Buffer;
  mimeType: string;
  fileName?: string | null;
  uploadedByUserId?: string | null;
}

@Injectable()
export class OperatorUploadService {
  constructor(private readonly prisma: PrismaService) {}

  async registerUpload(input: RegisterOperatorUploadInput): Promise<OperatorUploadDto> {
    const clientUploadId = input.clientUploadId?.trim();
    if (!clientUploadId) {
      throw new BadRequestException('clientUploadId is required');
    }

    const existing = await this.prisma.operatorUpload.findUnique({
      where: {
        organizationId_clientUploadId: {
          organizationId: input.organizationId,
          clientUploadId,
        },
      },
    });
    if (existing) {
      return mapOperatorUpload(existing);
    }

    const booking = await this.prisma.booking.findFirst({
      where: { id: input.bookingId, organizationId: input.organizationId },
      select: { id: true, vehicleId: true },
    });
    if (!booking) {
      throw new NotFoundException({
        code: OPERATOR_UPLOAD_ERROR.BOOKING_MISMATCH,
        message: 'Booking not found for organization',
      });
    }
    if (booking.vehicleId !== input.vehicleId) {
      throw new BadRequestException({
        code: OPERATOR_UPLOAD_ERROR.BOOKING_MISMATCH,
        message: 'vehicleId does not match booking',
      });
    }

    const session = await this.resolveSession(input);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + OPERATOR_UPLOAD_RETENTION_MS);

    try {
      const row = await this.prisma.operatorUpload.create({
        data: {
          organizationId: input.organizationId,
          clientUploadId,
          kind: input.kind,
          status: OperatorUploadStatus.PENDING,
          bookingId: input.bookingId,
          handoverSessionId: session?.id ?? null,
          vehicleId: input.vehicleId,
          handoverKind: input.handoverKind ?? session?.kind ?? null,
          fileName: input.fileName ?? null,
          mimeType: input.mimeType ?? null,
          requiredForComplete: input.requiredForComplete ?? false,
          uploadedByUserId: input.uploadedByUserId ?? null,
          expiresAt,
          maxAttempts: OPERATOR_UPLOAD_MAX_ATTEMPTS,
        },
      });
      return mapOperatorUpload(row);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const dup = await this.prisma.operatorUpload.findUnique({
          where: {
            organizationId_clientUploadId: {
              organizationId: input.organizationId,
              clientUploadId,
            },
          },
        });
        if (dup) return mapOperatorUpload(dup);
      }
      throw err;
    }
  }

  async uploadBinary(input: UploadOperatorBinaryInput): Promise<OperatorUploadDto> {
    const row = await this.prisma.operatorUpload.findUnique({
      where: {
        organizationId_clientUploadId: {
          organizationId: input.organizationId,
          clientUploadId: input.clientUploadId,
        },
      },
    });
    if (!row) {
      throw new NotFoundException({
        code: OPERATOR_UPLOAD_ERROR.NOT_FOUND,
        message: 'Upload not found',
      });
    }
    if (row.status === OperatorUploadStatus.CANCELLED) {
      throw new ConflictException({
        code: OPERATOR_UPLOAD_ERROR.CANCELLED,
        message: 'Upload was cancelled',
      });
    }
    if (row.status === OperatorUploadStatus.UPLOADED || row.status === OperatorUploadStatus.PROCESSING) {
      return mapOperatorUpload(row);
    }

    await this.assertSessionEditable(row.handoverSessionId, row.organizationId, row.bookingId);

    const validation = validateOperatorUploadBinary(input.buffer, input.mimeType);
    if (!validation.ok) {
      const failed = await this.prisma.operatorUpload.update({
        where: { id: row.id },
        data: {
          status: OperatorUploadStatus.FAILED,
          errorCode: validation.code,
          errorMessage: validation.message,
          retryable: false,
          attemptCount: { increment: 1 },
          lastAttemptAt: new Date(),
        },
      });
      throw new BadRequestException({
        code: validation.code,
        message: validation.message,
        upload: mapOperatorUpload(failed),
      });
    }

    if (row.attemptCount >= row.maxAttempts) {
      throw new ConflictException({
        code: OPERATOR_UPLOAD_ERROR.MAX_ATTEMPTS,
        message: 'Maximum upload attempts exceeded',
      });
    }

    const contentSha256 = sha256Base64(input.buffer);
    const duplicate = await this.prisma.operatorUpload.findFirst({
      where: {
        organizationId: input.organizationId,
        id: { not: row.id },
        contentSha256,
        status: { in: [OperatorUploadStatus.UPLOADED, OperatorUploadStatus.PROCESSING] },
        bookingId: row.bookingId,
        kind: row.kind,
      },
    });
    if (duplicate?.targetRefId) {
      const linked = await this.prisma.operatorUpload.update({
        where: { id: row.id },
        data: {
          status: OperatorUploadStatus.UPLOADED,
          contentSha256,
          fileSizeBytes: input.buffer.length,
          mimeType: input.mimeType,
          fileName: input.fileName ?? row.fileName,
          storagePayload: Prisma.DbNull,
          targetRefType: duplicate.targetRefType,
          targetRefId: duplicate.targetRefId,
          progressPercent: 100,
          attemptCount: { increment: 1 },
          lastAttemptAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });
      return mapOperatorUpload(linked);
    }

    const storagePayload = {
      encoding: 'base64',
      mimeType: input.mimeType,
      data: input.buffer.toString('base64'),
    } as Prisma.InputJsonValue;

    const updated = await this.prisma.operatorUpload.update({
      where: { id: row.id },
      data: {
        status: OperatorUploadStatus.UPLOADED,
        mimeType: input.mimeType,
        fileName: input.fileName ?? row.fileName,
        fileSizeBytes: input.buffer.length,
        contentSha256,
        storagePayload,
        progressPercent: 100,
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
        uploadedByUserId: input.uploadedByUserId ?? row.uploadedByUserId,
        errorCode: null,
        errorMessage: null,
        expiresAt: new Date(Date.now() + OPERATOR_UPLOAD_RETENTION_MS),
      },
    });

    return mapOperatorUpload(updated);
  }

  async markFailed(
    organizationId: string,
    clientUploadId: string,
    error: { code: string; message: string; retryable?: boolean },
  ): Promise<OperatorUploadDto> {
    const row = await this.requireUpload(organizationId, clientUploadId);
    const retryable = error.retryable ?? isRetryableUploadError(error.code);
    const nextStatus =
      !retryable || row.attemptCount + 1 >= row.maxAttempts
        ? OperatorUploadStatus.FAILED
        : OperatorUploadStatus.PENDING;

    const updated = await this.prisma.operatorUpload.update({
      where: { id: row.id },
      data: {
        status: nextStatus,
        errorCode: error.code,
        errorMessage: error.message,
        retryable,
        attemptCount: { increment: 1 },
        lastAttemptAt: new Date(),
      },
    });
    return mapOperatorUpload(updated);
  }

  async cancelUpload(organizationId: string, clientUploadId: string): Promise<OperatorUploadDto> {
    const row = await this.requireUpload(organizationId, clientUploadId);
    if (row.status === OperatorUploadStatus.UPLOADED || row.status === OperatorUploadStatus.PROCESSING) {
      throw new ConflictException({
        code: OPERATOR_UPLOAD_ERROR.NOT_RETRYABLE,
        message: 'Cannot cancel completed upload',
      });
    }
    const updated = await this.prisma.operatorUpload.update({
      where: { id: row.id },
      data: {
        status: OperatorUploadStatus.CANCELLED,
        cancelledAt: new Date(),
        storagePayload: Prisma.DbNull,
      },
    });
    return mapOperatorUpload(updated);
  }

  async getUpload(organizationId: string, clientUploadId: string): Promise<OperatorUploadDto> {
    const row = await this.requireUpload(organizationId, clientUploadId);
    return mapOperatorUpload(row);
  }

  async listByHandoverSession(
    organizationId: string,
    handoverSessionId: string,
  ): Promise<OperatorUploadDto[]> {
    const rows = await this.prisma.operatorUpload.findMany({
      where: { organizationId, handoverSessionId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(mapOperatorUpload);
  }

  async assertRequiredUploadsComplete(
    organizationId: string,
    handoverSessionId: string,
  ): Promise<void> {
    const incomplete = await this.prisma.operatorUpload.findFirst({
      where: {
        organizationId,
        handoverSessionId,
        requiredForComplete: true,
        status: {
          notIn: [OperatorUploadStatus.UPLOADED, OperatorUploadStatus.PROCESSING, OperatorUploadStatus.CANCELLED],
        },
      },
    });
    if (incomplete) {
      throw new ConflictException({
        code: OPERATOR_UPLOAD_ERROR.INCOMPLETE,
        message: 'Required uploads are not complete',
        clientUploadId: incomplete.clientUploadId,
        status: incomplete.status,
      });
    }
  }

  async cleanupOrphans(organizationId: string, olderThanMs = 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMs);
    const result = await this.prisma.operatorUpload.updateMany({
      where: {
        organizationId,
        status: { in: [OperatorUploadStatus.PENDING, OperatorUploadStatus.UPLOADING, OperatorUploadStatus.FAILED] },
        updatedAt: { lt: cutoff },
        OR: [
          { handoverSessionId: null },
          {
            handoverSession: {
              status: { in: [HandoverSessionStatus.CANCELLED, HandoverSessionStatus.SUPERSEDED, HandoverSessionStatus.COMPLETED] },
            },
          },
        ],
      },
      data: {
        status: OperatorUploadStatus.CANCELLED,
        cancelledAt: new Date(),
        storagePayload: Prisma.DbNull,
        errorCode: OPERATOR_UPLOAD_ERROR.CANCELLED,
        errorMessage: 'Orphan upload cleaned up',
      },
    });
    return result.count;
  }

  private async requireUpload(organizationId: string, clientUploadId: string) {
    const row = await this.prisma.operatorUpload.findUnique({
      where: {
        organizationId_clientUploadId: { organizationId, clientUploadId },
      },
    });
    if (!row) {
      throw new NotFoundException({
        code: OPERATOR_UPLOAD_ERROR.NOT_FOUND,
        message: 'Upload not found',
      });
    }
    return row;
  }

  private async resolveSession(input: RegisterOperatorUploadInput) {
    if (!input.handoverSessionId) return null;

    const session = await this.prisma.bookingHandoverSession.findFirst({
      where: {
        id: input.handoverSessionId,
        organizationId: input.organizationId,
        bookingId: input.bookingId,
      },
    });
    if (!session) {
      throw new ConflictException({
        code: OPERATOR_UPLOAD_ERROR.SESSION_DENIED,
        message: 'Handover session does not belong to booking/organization',
      });
    }
    if (session.status === HandoverSessionStatus.CANCELLED || session.status === HandoverSessionStatus.SUPERSEDED) {
      throw new ConflictException({
        code: OPERATOR_UPLOAD_ERROR.SESSION_CANCELLED,
        message: 'Handover session is cancelled',
      });
    }
    if (!EDITABLE_SESSION_STATUSES.includes(session.status)) {
      throw new ConflictException({
        code: OPERATOR_UPLOAD_ERROR.SESSION_NOT_EDITABLE,
        message: 'Handover session is not editable',
      });
    }
    if (input.handoverKind && session.kind !== input.handoverKind) {
      throw new ConflictException({
        code: OPERATOR_UPLOAD_ERROR.SESSION_DENIED,
        message: 'Handover kind mismatch',
      });
    }
    return session;
  }

  private async assertSessionEditable(
    handoverSessionId: string | null,
    organizationId: string,
    bookingId: string,
  ) {
    if (!handoverSessionId) return;
    const session = await this.prisma.bookingHandoverSession.findFirst({
      where: { id: handoverSessionId, organizationId, bookingId },
    });
    if (!session) {
      throw new ConflictException({
        code: OPERATOR_UPLOAD_ERROR.SESSION_DENIED,
        message: 'Invalid handover session',
      });
    }
    if (session.status === HandoverSessionStatus.CANCELLED) {
      throw new ConflictException({
        code: OPERATOR_UPLOAD_ERROR.SESSION_CANCELLED,
        message: 'Handover session cancelled',
      });
    }
    if (!EDITABLE_SESSION_STATUSES.includes(session.status)) {
      throw new ConflictException({
        code: OPERATOR_UPLOAD_ERROR.SESSION_NOT_EDITABLE,
        message: 'Handover session not editable',
      });
    }
  }
}
