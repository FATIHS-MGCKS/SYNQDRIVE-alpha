import { Injectable } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import {
  AuthorizationActorType,
  Prisma,
  PrivacyPolicyLifecycleEventType,
  PrivacyPolicyLifecycleStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  POLICY_ACTIVATABLE_STATUSES,
  POLICY_IMMUTABLE_STATUSES,
  POLICY_LIFECYCLE_ERROR_CODES,
} from './policy-lifecycle.constants';
import {
  mapTransitionToEventType,
  PolicyLifecycleActorInput,
  PolicyLifecycleEventsService,
} from './policy-lifecycle-events.service';
import {
  PolicyActiveConflictException,
  PolicyImmutableException,
  PolicyLifecycleTransitionException,
  PolicyNotActivatableException,
  throwPolicyLifecycleError,
} from './policy-lifecycle.exceptions';
import { isPolicySingleActiveViolation } from './policy-lifecycle-prisma.util';
import {
  assertPolicyLifecycleTransition,
  isPolicyActivatable,
} from './policy-lifecycle.transitions';

export type PolicyLifecycleEntityKind =
  | 'PROCESSING_ACTIVITY'
  | 'LEGAL_BASIS_ASSESSMENT'
  | 'ENFORCEMENT_POLICY';

export interface PolicyVersionRecord {
  id: string;
  organizationId: string;
  policyFamilyId: string;
  versionNumber: number;
  status: PrivacyPolicyLifecycleStatus;
  validFrom?: Date | null;
  validUntil?: Date | null;
}

export interface PolicyTransitionInput extends PolicyLifecycleActorInput {}

export interface PolicyActivationInput extends PolicyLifecycleActorInput {
  supersedePeers?: boolean;
}

@Injectable()
export class PolicyLifecycleTransitionValidator {
  assertTransition(
    from: PrivacyPolicyLifecycleStatus,
    to: PrivacyPolicyLifecycleStatus,
  ): void {
    try {
      assertPolicyLifecycleTransition(from, to);
    } catch {
      throw new PolicyLifecycleTransitionException(from, to);
    }
  }

  assertEditable(status: PrivacyPolicyLifecycleStatus): void {
    if (POLICY_IMMUTABLE_STATUSES.has(status)) {
      throw new PolicyImmutableException();
    }
    if (status !== PrivacyPolicyLifecycleStatus.DRAFT) {
      throwPolicyLifecycleError(
        POLICY_LIFECYCLE_ERROR_CODES.NOT_EDITABLE,
        'Only draft policy versions can be edited.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  assertActivatable(status: PrivacyPolicyLifecycleStatus): void {
    if (status === PrivacyPolicyLifecycleStatus.DRAFT) {
      throw new PolicyNotActivatableException(
        'Policy cannot be activated directly from DRAFT. Submit for review and approval first.',
        { status },
      );
    }
    if (
      status !== PrivacyPolicyLifecycleStatus.ACTIVE &&
      !isPolicyActivatable(status)
    ) {
      throw new PolicyNotActivatableException(
        `Policy must be APPROVED or SCHEDULED before activation (current: ${status})`,
        { status },
      );
    }
  }

  assertRevocationReason(reason?: string | null): void {
    if (!(reason ?? '').trim()) {
      throwPolicyLifecycleError(
        POLICY_LIFECYCLE_ERROR_CODES.REVOCATION_REASON_REQUIRED,
        'A reason is required when revoking a policy.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  assertRejectionReason(reason?: string | null): void {
    if (!(reason ?? '').trim()) {
      throwPolicyLifecycleError(
        POLICY_LIFECYCLE_ERROR_CODES.REJECTION_REASON_REQUIRED,
        'A rejection reason is required.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  assertSuspensionReason(reason?: string | null): void {
    if (!(reason ?? '').trim()) {
      throwPolicyLifecycleError(
        POLICY_LIFECYCLE_ERROR_CODES.SUSPENSION_REASON_REQUIRED,
        'A suspension reason is required.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  assertNotRevokedReactivation(from: PrivacyPolicyLifecycleStatus): void {
    if (from === PrivacyPolicyLifecycleStatus.REVOKED) {
      throwPolicyLifecycleError(
        POLICY_LIFECYCLE_ERROR_CODES.REVOKED_NOT_REACTIVATABLE,
        'Revoked policies cannot be reactivated. Create a new version instead.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }
}

@Injectable()
export class PolicyLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: PolicyLifecycleTransitionValidator,
    private readonly events: PolicyLifecycleEventsService,
  ) {}

  resolveActivationTime(
    record: Pick<PolicyVersionRecord, 'status' | 'validFrom'>,
    now = new Date(),
  ): Date {
    if (
      record.status === PrivacyPolicyLifecycleStatus.SCHEDULED &&
      record.validFrom &&
      record.validFrom.getTime() > now.getTime()
    ) {
      return record.validFrom;
    }
    return now;
  }

  async activateVersion<T extends PolicyVersionRecord>(params: {
    entityKind: PolicyLifecycleEntityKind;
    orgId: string;
    record: T;
    input?: PolicyActivationInput;
    loadCurrent: (tx: Prisma.TransactionClient, id: string) => Promise<T | null>;
    findActivePeers: (
      tx: Prisma.TransactionClient,
      record: T,
    ) => Promise<T[]>;
    applyTransition: (
      tx: Prisma.TransactionClient,
      record: T,
      toStatus: PrivacyPolicyLifecycleStatus,
      patch: Record<string, unknown>,
    ) => Promise<T>;
    recordEvent: (
      tx: Prisma.TransactionClient,
      record: T,
      event: {
        eventType: PrivacyPolicyLifecycleEventType;
        previousStatus: PrivacyPolicyLifecycleStatus | null;
        newStatus: PrivacyPolicyLifecycleStatus;
        input?: PolicyActivationInput;
      },
    ) => Promise<void>;
  }): Promise<T> {
    const { orgId, record, input = {} } = params;
    this.validator.assertActivatable(record.status);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await params.loadCurrent(tx, record.id);
        if (!current || current.organizationId !== orgId) {
          throw new PolicyNotActivatableException('Policy version not found', {
            id: record.id,
          });
        }

        const activePeers = await params.findActivePeers(tx, current);
        const otherActive = activePeers.filter((p) => p.id !== current.id);

        if (current.status === PrivacyPolicyLifecycleStatus.ACTIVE && otherActive.length === 0) {
          return current;
        }

        if (
          current.status !== PrivacyPolicyLifecycleStatus.ACTIVE &&
          !POLICY_ACTIVATABLE_STATUSES.has(current.status)
        ) {
          throw new PolicyNotActivatableException(
            `Policy must be APPROVED or SCHEDULED before activation (current: ${current.status})`,
            { status: current.status },
          );
        }

        const activationTime = this.resolveActivationTime(current);
        const supersede = input.supersedePeers !== false;

        if (supersede && otherActive.length > 0) {
          for (const peer of otherActive) {
            await params.applyTransition(tx, peer, PrivacyPolicyLifecycleStatus.SUPERSEDED, {
              supersededById: current.id,
              validUntil: peer.validUntil ?? activationTime,
            });
            await params.recordEvent(tx, peer, {
              eventType: PrivacyPolicyLifecycleEventType.SUPERSEDED,
              previousStatus: PrivacyPolicyLifecycleStatus.ACTIVE,
              newStatus: PrivacyPolicyLifecycleStatus.SUPERSEDED,
              input: {
                ...input,
                reason: input.reason ?? 'Superseded by a newer active policy version',
                supersededById: current.id,
              },
            });
          }
        }

        if (current.status === PrivacyPolicyLifecycleStatus.ACTIVE) {
          return current;
        }

        const activated = await params.applyTransition(
          tx,
          current,
          PrivacyPolicyLifecycleStatus.ACTIVE,
          {
            activatedAt: activationTime,
            validFrom: current.validFrom ?? activationTime,
          },
        );

        await params.recordEvent(tx, activated, {
          eventType: mapTransitionToEventType(current.status, PrivacyPolicyLifecycleStatus.ACTIVE),
          previousStatus: current.status,
          newStatus: PrivacyPolicyLifecycleStatus.ACTIVE,
          input: {
            ...input,
            validFrom: current.validFrom ?? activationTime,
          },
        });

        return activated;
      });
    } catch (err) {
      if (isPolicySingleActiveViolation(err, params.entityKind)) {
        throw new PolicyActiveConflictException(
          params.entityKind,
          orgId,
          record.policyFamilyId,
        );
      }
      throw err;
    }
  }

  async transitionVersion<T extends PolicyVersionRecord>(params: {
    orgId: string;
    record: T;
    toStatus: PrivacyPolicyLifecycleStatus;
    input?: PolicyTransitionInput;
    patch?: Record<string, unknown>;
    loadCurrent: (tx: Prisma.TransactionClient, id: string) => Promise<T | null>;
    applyTransition: (
      tx: Prisma.TransactionClient,
      record: T,
      toStatus: PrivacyPolicyLifecycleStatus,
      patch: Record<string, unknown>,
    ) => Promise<T>;
    recordEvent: (
      tx: Prisma.TransactionClient,
      record: T,
      event: {
        eventType: PrivacyPolicyLifecycleEventType;
        previousStatus: PrivacyPolicyLifecycleStatus | null;
        newStatus: PrivacyPolicyLifecycleStatus;
        input?: PolicyTransitionInput;
      },
    ) => Promise<void>;
  }): Promise<T> {
    const { orgId, record, toStatus, input = {}, patch = {} } = params;

    if (toStatus === PrivacyPolicyLifecycleStatus.ACTIVE) {
      return this.activateVersion({
        entityKind: 'PROCESSING_ACTIVITY',
        orgId,
        record,
        input,
        loadCurrent: params.loadCurrent,
        findActivePeers: async () => [],
        applyTransition: params.applyTransition,
        recordEvent: params.recordEvent,
      });
    }

    this.validator.assertTransition(record.status, toStatus);

    if (toStatus === PrivacyPolicyLifecycleStatus.REVOKED) {
      this.validator.assertRevocationReason(input.reason);
      this.validator.assertNotRevokedReactivation(record.status);
    }
    if (toStatus === PrivacyPolicyLifecycleStatus.REJECTED) {
      this.validator.assertRejectionReason(input.reason);
    }
    if (toStatus === PrivacyPolicyLifecycleStatus.SUSPENDED) {
      this.validator.assertSuspensionReason(input.reason);
    }
    if (toStatus === PrivacyPolicyLifecycleStatus.SUPERSEDED && !input.supersededById) {
      throwPolicyLifecycleError(
        POLICY_LIFECYCLE_ERROR_CODES.SUPERSEDED_BY_REQUIRED,
        'SUPERSEDED transition requires supersededById referencing the new version.',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const current = await params.loadCurrent(tx, record.id);
      if (!current || current.organizationId !== orgId) {
        throw new PolicyNotActivatableException('Policy version not found', { id: record.id });
      }

      this.validator.assertTransition(current.status, toStatus);

      const now = new Date();
      const statusPatch: Record<string, unknown> = { ...patch };

      if (toStatus === PrivacyPolicyLifecycleStatus.REVOKED) {
        statusPatch.revokedAt = now;
        statusPatch.revocationReason = input.reason?.trim();
      }
      if (toStatus === PrivacyPolicyLifecycleStatus.REJECTED) {
        statusPatch.rejectionReason = input.reason?.trim();
        statusPatch.isCurrentVersion = false;
      }
      if (toStatus === PrivacyPolicyLifecycleStatus.SUSPENDED) {
        statusPatch.suspendedAt = now;
        statusPatch.suspensionReason = input.reason?.trim();
      }
      if (toStatus === PrivacyPolicyLifecycleStatus.SUPERSEDED) {
        statusPatch.supersededById = input.supersededById;
        statusPatch.isCurrentVersion = false;
      }
      if (toStatus === PrivacyPolicyLifecycleStatus.IN_REVIEW) {
        statusPatch.assessedAt = now;
      }
      if (toStatus === PrivacyPolicyLifecycleStatus.APPROVED) {
        statusPatch.approvedAt = now;
      }
      if (toStatus === PrivacyPolicyLifecycleStatus.SCHEDULED && input.validFrom) {
        statusPatch.validFrom = input.validFrom;
      }

      const updated = await params.applyTransition(tx, current, toStatus, statusPatch);

      await params.recordEvent(tx, updated, {
        eventType: mapTransitionToEventType(current.status, toStatus),
        previousStatus: current.status,
        newStatus: toStatus,
        input,
      });

      return updated;
    });
  }
}
