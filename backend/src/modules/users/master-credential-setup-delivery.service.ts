import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MembershipStatus, PasswordResetPurpose, UserStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { PasswordResetService } from '@modules/auth/password-reset.service';
import { acquireCanonicalSecurityMutationLocks } from '@modules/auth/iam-security-mutation-concurrency';
import { acquireSecurityOperationAdmissionLock } from '@modules/auth/refresh-token-session-concurrency';
import {
  decryptInviteToken,
  encryptInviteToken,
} from './utils/invite-secret-crypto.util';

export type CredentialSetupDeliveryStatus = {
  intentPresent: boolean;
  deliveryAttempted: boolean;
  deliveryConfirmed: boolean;
  credentialEstablished: boolean;
};

@Injectable()
export class MasterCredentialSetupDeliveryService {
  private readonly logger = new Logger(MasterCredentialSetupDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  async ensureDeliveryForOperation(input: {
    securityOperationId: string;
    organizationId: string;
    userId: string;
    actorUserId: string;
  }): Promise<CredentialSetupDeliveryStatus> {
    const intent = await this.prisma.masterIdentityCredentialSetupIntent.findUnique({
      where: { securityOperationId: input.securityOperationId },
    });
    if (
      !intent ||
      intent.userId !== input.userId ||
      intent.organizationId !== input.organizationId
    ) {
      return {
        intentPresent: false,
        deliveryAttempted: false,
        deliveryConfirmed: false,
        credentialEstablished: false,
      };
    }

    if (intent.credentialEstablishedAt) {
      return {
        intentPresent: true,
        deliveryAttempted: Boolean(intent.transportConfirmedAt),
        deliveryConfirmed: Boolean(intent.transportConfirmedAt),
        credentialEstablished: true,
      };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { passwordHash: true, status: true, email: true },
    });
    if (!user) {
      return {
        intentPresent: true,
        deliveryAttempted: false,
        deliveryConfirmed: false,
        credentialEstablished: false,
      };
    }
    if (user.passwordHash) {
      await this.prisma.masterIdentityCredentialSetupIntent.update({
        where: { id: intent.id },
        data: { credentialEstablishedAt: new Date(), deliveryTokenCiphertext: null },
      });
      return {
        intentPresent: true,
        deliveryAttempted: Boolean(intent.transportConfirmedAt),
        deliveryConfirmed: Boolean(intent.transportConfirmedAt),
        credentialEstablished: true,
      };
    }

    if (intent.transportConfirmedAt && intent.passwordResetTokenId) {
      const bound = await this.prisma.passwordResetToken.findUnique({
        where: { id: intent.passwordResetTokenId },
        select: { usedAt: true, revokedAt: true, expiresAt: true },
      });
      if (
        bound &&
        !bound.usedAt &&
        !bound.revokedAt &&
        bound.expiresAt > new Date()
      ) {
        return {
          intentPresent: true,
          deliveryAttempted: true,
          deliveryConfirmed: true,
          credentialEstablished: false,
        };
      }
    }

    await this.passwordReset.assertOperationBoundResetRateLimits({
      organizationId: input.organizationId,
      userId: input.userId,
      securityOperationId: input.securityOperationId,
    });

    const admission = await this.prisma.$transaction(async (tx) => {
      await acquireSecurityOperationAdmissionLock(tx, input.securityOperationId);
      await acquireCanonicalSecurityMutationLocks(tx, {
        organizationIds: [input.organizationId],
        userIds: [input.userId],
      });

      const freshIntent = await tx.masterIdentityCredentialSetupIntent.findUnique({
        where: { securityOperationId: input.securityOperationId },
      });
      if (
        !freshIntent ||
        freshIntent.userId !== input.userId ||
        freshIntent.organizationId !== input.organizationId
      ) {
        return { kind: 'missing' as const };
      }
      if (freshIntent.credentialEstablishedAt) {
        return { kind: 'completed' as const, transportConfirmedAt: freshIntent.transportConfirmedAt };
      }

      const membership = await tx.organizationMembership.findFirst({
        where: {
          id: freshIntent.membershipId,
          organizationId: input.organizationId,
          userId: input.userId,
          status: MembershipStatus.ACTIVE,
        },
        include: {
          user: { select: { id: true, email: true, status: true, passwordHash: true } },
        },
      });
      if (!membership?.user || membership.user.status !== UserStatus.ACTIVE) {
        return { kind: 'ineligible' as const };
      }
      if (membership.user.passwordHash) {
        await tx.masterIdentityCredentialSetupIntent.update({
          where: { id: freshIntent.id },
          data: { credentialEstablishedAt: new Date(), deliveryTokenCiphertext: null },
        });
        return { kind: 'completed' as const, transportConfirmedAt: freshIntent.transportConfirmedAt };
      }

      const currentGen = freshIntent.deliveryGeneration;
      let linkedToken:
        | {
            id: string;
            usedAt: Date | null;
            revokedAt: Date | null;
            expiresAt: Date;
            setupDeliveryGeneration: number | null;
          }
        | null = null;
      if (freshIntent.passwordResetTokenId) {
        linkedToken = await tx.passwordResetToken.findUnique({
          where: { id: freshIntent.passwordResetTokenId },
          select: {
            id: true,
            usedAt: true,
            revokedAt: true,
            expiresAt: true,
            setupDeliveryGeneration: true,
          },
        });
      }

      const tokenCurrent =
        linkedToken &&
        !linkedToken.usedAt &&
        !linkedToken.revokedAt &&
        linkedToken.expiresAt > new Date() &&
        linkedToken.setupDeliveryGeneration === currentGen;

      if (
        tokenCurrent &&
        freshIntent.transportConfirmedAt &&
        freshIntent.deliveryTokenCiphertext
      ) {
        return {
          kind: 'already_confirmed' as const,
        };
      }

      if (tokenCurrent && freshIntent.deliveryTokenCiphertext && !freshIntent.transportConfirmedAt) {
        return {
          kind: 'retry_transport' as const,
          intentId: freshIntent.id,
          deliveryGeneration: currentGen,
          passwordResetTokenId: linkedToken!.id,
          ciphertext: freshIntent.deliveryTokenCiphertext,
          email: membership.user.email,
          expiresAt: linkedToken!.expiresAt,
        };
      }

      await this.passwordReset.assertOperationBoundResetEligibleInTransaction(tx, {
        organizationId: input.organizationId,
        userId: input.userId,
        actorUserId: input.actorUserId,
        securityOperationId: input.securityOperationId,
      });

      const nextGen = currentGen + 1;
      const { tokenId, plainToken, expiresAt } =
        await this.passwordReset.createOperationBoundTokenInTransaction(tx, {
          userId: input.userId,
          email: membership.user.email,
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          securityOperationId: input.securityOperationId,
          setupDeliveryGeneration: nextGen,
          reason: 'master_identity_provision',
        });

      const ciphertext = encryptInviteToken(plainToken);
      const admitted = await tx.masterIdentityCredentialSetupIntent.updateMany({
        where: {
          id: freshIntent.id,
          deliveryGeneration: currentGen,
          credentialEstablishedAt: null,
        },
        data: {
          deliveryGeneration: nextGen,
          passwordResetTokenId: tokenId,
          deliveryTokenCiphertext: ciphertext,
          transportRequestedAt: new Date(),
          transportConfirmedAt: null,
        },
      });
      if (admitted.count !== 1) {
        const raced = await tx.masterIdentityCredentialSetupIntent.findUnique({
          where: { id: freshIntent.id },
        });
        if (raced?.transportConfirmedAt) {
          return { kind: 'already_confirmed' as const };
        }
        if (raced?.deliveryTokenCiphertext && !raced.transportConfirmedAt && raced.passwordResetTokenId) {
          const racedToken = await tx.passwordResetToken.findUnique({
            where: { id: raced.passwordResetTokenId },
            select: { id: true, expiresAt: true, setupDeliveryGeneration: true, revokedAt: true, usedAt: true },
          });
          const mem = await tx.organizationMembership.findFirst({
            where: { id: freshIntent.membershipId },
            include: { user: { select: { email: true } } },
          });
          if (racedToken && !racedToken.revokedAt && !racedToken.usedAt) {
            return {
              kind: 'retry_transport' as const,
              intentId: freshIntent.id,
              deliveryGeneration: raced.deliveryGeneration,
              passwordResetTokenId: racedToken.id,
              ciphertext: raced.deliveryTokenCiphertext,
              email: mem?.user.email ?? membership.user.email,
              expiresAt: racedToken.expiresAt,
            };
          }
        }
        throw new NotFoundException('Credential setup delivery admission lost');
      }

      return {
        kind: 'fresh_transport' as const,
        intentId: freshIntent.id,
        deliveryGeneration: nextGen,
        passwordResetTokenId: tokenId,
        ciphertext,
        email: membership.user.email,
        expiresAt,
        plainToken,
      };
    });

    if (admission.kind === 'missing') {
      return {
        intentPresent: false,
        deliveryAttempted: false,
        deliveryConfirmed: false,
        credentialEstablished: false,
      };
    }
    if (admission.kind === 'ineligible') {
      return {
        intentPresent: true,
        deliveryAttempted: false,
        deliveryConfirmed: false,
        credentialEstablished: false,
      };
    }
    if (admission.kind === 'completed') {
      return {
        intentPresent: true,
        deliveryAttempted: Boolean(admission.transportConfirmedAt),
        deliveryConfirmed: Boolean(admission.transportConfirmedAt),
        credentialEstablished: true,
      };
    }
    if (admission.kind === 'already_confirmed') {
      return {
        intentPresent: true,
        deliveryAttempted: true,
        deliveryConfirmed: true,
        credentialEstablished: false,
      };
    }

    const liveIntent = await this.prisma.masterIdentityCredentialSetupIntent.findUnique({
      where: { id: admission.intentId },
      select: {
        deliveryGeneration: true,
        passwordResetTokenId: true,
        deliveryTokenCiphertext: true,
        credentialEstablishedAt: true,
        transportConfirmedAt: true,
      },
    });
    if (
      !liveIntent ||
      liveIntent.credentialEstablishedAt ||
      liveIntent.deliveryGeneration !== admission.deliveryGeneration ||
      liveIntent.passwordResetTokenId !== admission.passwordResetTokenId ||
      !liveIntent.deliveryTokenCiphertext
    ) {
      return {
        intentPresent: true,
        deliveryAttempted: false,
        deliveryConfirmed: Boolean(liveIntent?.transportConfirmedAt),
        credentialEstablished: Boolean(liveIntent?.credentialEstablishedAt),
      };
    }

    const plain =
      admission.kind === 'retry_transport'
        ? decryptInviteToken(admission.ciphertext)
        : admission.plainToken;
    const email = admission.email;
    const expiresAt = admission.expiresAt;

    const sent = await this.passwordReset.deliverOperationBoundResetEmail({
      email,
      plainToken: plain,
      expiresAt,
      purpose: PasswordResetPurpose.ADMIN_INITIATED,
    });
    if (sent) {
      await this.prisma.masterIdentityCredentialSetupIntent.updateMany({
        where: {
          id: admission.intentId,
          deliveryGeneration: admission.deliveryGeneration,
          passwordResetTokenId: admission.passwordResetTokenId,
          transportConfirmedAt: null,
        },
        data: {
          transportConfirmedAt: new Date(),
          deliveryTokenCiphertext: null,
        },
      });
    } else {
      this.logger.warn(
        `Credential setup mail not confirmed for operation=${input.securityOperationId}`,
      );
    }

    return {
      intentPresent: true,
      deliveryAttempted: true,
      deliveryConfirmed: sent,
      credentialEstablished: false,
    };
  }
}