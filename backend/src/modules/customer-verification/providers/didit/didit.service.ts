import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerVerificationCheckKind } from '@prisma/client';
import { randomUUID } from 'crypto';
import { DIDIT_WORKFLOWS } from '@config/didit.config';
import { DiditClient } from './didit.client';
import {
  mapDiditStatusToCheckStatus,
} from './didit-status.mapper';
import type {
  DiditCreateSessionResponse,
  DiditDecisionPayload,
  DiditSessionMetadata,
} from './didit.types';

/** User return URL after completing Didit UI — not a source of truth (webhook is). */
const DIDIT_USER_RETURN_CALLBACK_URL =
  'https://app.synqdrive.eu/verification/done';

export type StartDiditSessionParams = {
  organizationId: string;
  customerId: string;
  bookingId?: string | null;
  kind: CustomerVerificationCheckKind;
};

export type StartDiditSessionResult = {
  didit: DiditCreateSessionResponse;
  vendorData: string;
  mappedStatus: ReturnType<typeof mapDiditStatusToCheckStatus>;
};

@Injectable()
export class DiditService {
  private readonly logger = new Logger(DiditService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly diditClient: DiditClient,
  ) {}

  assertEnabled(): void {
    const enabled = this.configService.get<boolean>('didit.enabled', false);
    if (!enabled) {
      throw new BadRequestException('Didit document verification is disabled');
    }
  }

  buildVendorData(params: StartDiditSessionParams): string {
    const bookingPart = params.bookingId ?? 'none';
    const nonce = randomUUID();
    return `org:${params.organizationId}|customer:${params.customerId}|booking:${bookingPart}|kind:${params.kind}|nonce:${nonce}`;
  }

  resolveWorkflowId(kind: CustomerVerificationCheckKind): string {
    const workflows = this.configService.get<typeof DIDIT_WORKFLOWS>(
      'didit.workflows',
      DIDIT_WORKFLOWS,
    );
    const workflowId = workflows[kind];
    if (!workflowId || workflowId.startsWith('REPLACE_WITH_')) {
      throw new BadRequestException(
        `Didit workflow for ${kind} is not configured on the server`,
      );
    }
    return workflowId;
  }

  warnIfBiometricModulesPresent(payload: DiditDecisionPayload | null | undefined): void {
    if (!payload || typeof payload !== 'object') return;

    const hasLiveness =
      Array.isArray(payload.liveness_checks) && payload.liveness_checks.length > 0;
    const hasFaceMatch =
      Array.isArray(payload.face_matches) && payload.face_matches.length > 0;

    if (hasLiveness || hasFaceMatch) {
      this.logger.warn(
        'Didit workflow contains biometric modules unexpectedly (liveness_checks or face_matches present). SynqDrive does not use selfie/liveness/face-match verification.',
      );
    }
  }

  async startSession(
    params: StartDiditSessionParams,
  ): Promise<StartDiditSessionResult> {
    this.assertEnabled();

    const workflowId = this.resolveWorkflowId(params.kind);
    const vendorData = this.buildVendorData(params);

    const metadata: DiditSessionMetadata = {
      organizationId: params.organizationId,
      customerId: params.customerId,
      bookingId: params.bookingId ?? null,
      kind: params.kind,
    };

    const didit = await this.diditClient.createSession({
      workflow_id: workflowId,
      vendor_data: vendorData,
      callback: DIDIT_USER_RETURN_CALLBACK_URL,
      callback_method: 'both',
      metadata,
    });

    const mappedStatus = mapDiditStatusToCheckStatus(didit.status);
    if (mappedStatus.warning) {
      this.logger.warn(mappedStatus.warning);
    }

    return { didit, vendorData, mappedStatus };
  }
}
