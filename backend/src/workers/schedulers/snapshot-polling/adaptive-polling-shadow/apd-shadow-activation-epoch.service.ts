import { Injectable, Logger } from '@nestjs/common';
import { ApdShadowActivationEpochLifecycle } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import {
  ActivateApdShadowActivationEpochInput,
  ApdShadowActiveEpochView,
  ApdShadowActivationEpochGateReason,
  APD_SHADOW_EPOCH_CACHE_TTL_MS,
  PrepareApdShadowActivationEpochInput,
  buildApdShadowActivationScopeKey,
} from './apd-shadow-activation-epoch.types';

@Injectable()
export class ApdShadowActivationEpochService {
  private readonly logger = new Logger(ApdShadowActivationEpochService.name);

  private cacheByScope = new Map<
    string,
    { epoch: ApdShadowActiveEpochView | null; loadedAtMs: number }
  >();

  constructor(private readonly prisma: PrismaService) {}

  /** Bounded-staleness cache read (no database I/O). */
  getCachedActiveEpochSnapshot(
    cohortConfigFingerprintSha256: string,
  ): ApdShadowActiveEpochView | null {
    const activationScopeKey = buildApdShadowActivationScopeKey(
      cohortConfigFingerprintSha256,
    );
    const cached = this.cacheByScope.get(activationScopeKey);
    if (!cached) return null;
    if (Date.now() - cached.loadedAtMs > APD_SHADOW_EPOCH_CACHE_TTL_MS) {
      return null;
    }
    return cached.epoch;
  }

  invalidateCache(scopeKey?: string): void {
    if (scopeKey) {
      this.cacheByScope.delete(scopeKey);
      return;
    }
    this.cacheByScope.clear();
  }

  async prepareEpoch(input: PrepareApdShadowActivationEpochInput): Promise<{ id: string }> {
    const activationScopeKey = buildApdShadowActivationScopeKey(
      input.cohortConfigFingerprintSha256,
    );
    const row = await this.prisma.apdShadowActivationEpoch.create({
      data: {
        activationScopeKey,
        organizationId: input.organizationId,
        cohortConfigFingerprintSha256: input.cohortConfigFingerprintSha256,
        cohortConfigVersion: input.cohortConfigVersion,
        b2PolicyVersion: input.b2PolicyVersion,
        b4PolicyVersion: input.b4PolicyVersion,
        productionReleaseIdentity: input.productionReleaseIdentity ?? null,
        lifecycleState: ApdShadowActivationEpochLifecycle.PREPARED,
        operatorActor: input.operatorActor ?? null,
        operatorReason: input.operatorReason ?? null,
        operatorRequestId: input.operatorRequestId ?? null,
      },
      select: { id: true },
    });
    return row;
  }

  /**
   * Authorized activation: establishes immutable DB-time T0 and ACTIVE lifecycle atomically.
   * Idempotent when the same activationRequestKey is replayed.
   */
  async activateEpoch(
    input: ActivateApdShadowActivationEpochInput,
  ): Promise<ApdShadowActiveEpochView> {
    const activationScopeKey = buildApdShadowActivationScopeKey(
      input.cohortConfigFingerprintSha256,
    );

    const activated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`apd_shadow_epoch:${activationScopeKey}`}))`;

      const existingByRequest = await tx.apdShadowActivationEpoch.findFirst({
        where: { activationRequestKey: input.activationRequestKey },
      });
      if (existingByRequest) {
        if (
          existingByRequest.lifecycleState === ApdShadowActivationEpochLifecycle.ACTIVE &&
          existingByRequest.activatedAt
        ) {
          return existingByRequest;
        }
        throw new Error(
          `activation request key already used for non-ACTIVE epoch ${existingByRequest.id}`,
        );
      }

      const epoch = await tx.apdShadowActivationEpoch.findUnique({
        where: { id: input.epochId },
      });
      if (!epoch) {
        throw new Error(`activation epoch not found: ${input.epochId}`);
      }
      if (epoch.activationScopeKey !== activationScopeKey) {
        throw new Error('activation epoch scope mismatch');
      }
      if (epoch.cohortConfigFingerprintSha256 !== input.cohortConfigFingerprintSha256) {
        throw new Error('activation epoch cohort fingerprint mismatch');
      }
      if (
        epoch.b2PolicyVersion !== input.b2PolicyVersion ||
        epoch.b4PolicyVersion !== input.b4PolicyVersion
      ) {
        throw new Error('activation epoch policy version mismatch');
      }

      if (epoch.lifecycleState === ApdShadowActivationEpochLifecycle.ACTIVE && epoch.activatedAt) {
        return epoch;
      }
      if (epoch.lifecycleState !== ApdShadowActivationEpochLifecycle.PREPARED) {
        throw new Error(
          `cannot activate epoch in lifecycle ${epoch.lifecycleState}`,
        );
      }

      const otherActive = await tx.apdShadowActivationEpoch.findFirst({
        where: {
          activationScopeKey,
          lifecycleState: ApdShadowActivationEpochLifecycle.ACTIVE,
        },
      });
      if (otherActive && otherActive.id !== epoch.id) {
        throw new Error(
          `another ACTIVE epoch already exists for scope: ${otherActive.id}`,
        );
      }

      const [{ activated_at }] = await tx.$queryRaw<
        Array<{ activated_at: Date }>
      >`SELECT NOW() AS activated_at`;

      const updated = await tx.apdShadowActivationEpoch.update({
        where: { id: epoch.id },
        data: {
          lifecycleState: ApdShadowActivationEpochLifecycle.ACTIVE,
          activatedAt: activated_at,
          activationRequestKey: input.activationRequestKey,
          operatorActor: input.operatorActor,
          operatorReason: input.operatorReason,
          operatorRequestId: input.operatorRequestId ?? null,
          productionReleaseIdentity:
            input.productionReleaseIdentity ?? epoch.productionReleaseIdentity,
        },
      });
      return updated;
    });

    const view = this.toActiveView(activated);
    this.cacheByScope.set(activationScopeKey, {
      epoch: view,
      loadedAtMs: Date.now(),
    });
    return view;
  }

  async pauseEpoch(epochId: string): Promise<void> {
    await this.prisma.apdShadowActivationEpoch.updateMany({
      where: {
        id: epochId,
        lifecycleState: ApdShadowActivationEpochLifecycle.ACTIVE,
      },
      data: {
        lifecycleState: ApdShadowActivationEpochLifecycle.PAUSED,
        pausedAt: new Date(),
      },
    });
    this.invalidateCache();
  }

  async closeEpoch(epochId: string): Promise<void> {
    await this.prisma.apdShadowActivationEpoch.updateMany({
      where: {
        id: epochId,
        lifecycleState: {
          in: [
            ApdShadowActivationEpochLifecycle.ACTIVE,
            ApdShadowActivationEpochLifecycle.PAUSED,
            ApdShadowActivationEpochLifecycle.PREPARED,
          ],
        },
      },
      data: {
        lifecycleState: ApdShadowActivationEpochLifecycle.CLOSED,
        closedAt: new Date(),
      },
    });
    this.invalidateCache();
  }

  async loadActiveEpochForScope(
    cohortConfigFingerprintSha256: string,
  ): Promise<ApdShadowActiveEpochView | null> {
    const activationScopeKey = buildApdShadowActivationScopeKey(
      cohortConfigFingerprintSha256,
    );
    const cached = this.cacheByScope.get(activationScopeKey);
    const now = Date.now();
    if (cached && now - cached.loadedAtMs < APD_SHADOW_EPOCH_CACHE_TTL_MS) {
      return cached.epoch;
    }

    try {
      const row = await this.prisma.apdShadowActivationEpoch.findFirst({
        where: {
          activationScopeKey,
          lifecycleState: ApdShadowActivationEpochLifecycle.ACTIVE,
          activatedAt: { not: null },
        },
        orderBy: { activatedAt: 'desc' },
      });
      const view = row?.activatedAt ? this.toActiveView(row) : null;
      this.cacheByScope.set(activationScopeKey, { epoch: view, loadedAtMs: now });
      return view;
    } catch (err) {
      this.logger.warn(
        `APD shadow activation epoch lookup failed (fail-closed): ${err instanceof Error ? err.message : err}`,
      );
      this.cacheByScope.set(activationScopeKey, { epoch: null, loadedAtMs: now });
      return null;
    }
  }

  evaluateShadowEpochGate(input: {
    cohortConfigFingerprintSha256: string | null;
    decisionAtMs: number;
    activeEpoch: ApdShadowActiveEpochView | null;
  }): { allowed: true; epoch: ApdShadowActiveEpochView } | { allowed: false; reason: ApdShadowActivationEpochGateReason } {
    if (!input.cohortConfigFingerprintSha256) {
      return { allowed: false, reason: 'EPOCH_MISSING' };
    }
    const epoch = input.activeEpoch;
    if (!epoch) {
      return { allowed: false, reason: 'EPOCH_MISSING' };
    }
    if (epoch.lifecycleState !== ApdShadowActivationEpochLifecycle.ACTIVE) {
      return { allowed: false, reason: 'EPOCH_NOT_ACTIVE' };
    }
    if (epoch.cohortConfigFingerprintSha256 !== input.cohortConfigFingerprintSha256) {
      return { allowed: false, reason: 'EPOCH_FINGERPRINT_MISMATCH' };
    }
    const t0Ms = epoch.activatedAt.getTime();
    if (input.decisionAtMs < t0Ms) {
      return { allowed: false, reason: 'DECISION_BEFORE_T0' };
    }
    return { allowed: true, epoch };
  }

  private toActiveView(row: {
    id: string;
    activationScopeKey: string;
    organizationId: string;
    cohortConfigFingerprintSha256: string;
    lifecycleState: ApdShadowActivationEpochLifecycle;
    activatedAt: Date | null;
    b2PolicyVersion: string;
    b4PolicyVersion: string;
    productionReleaseIdentity: string | null;
  }): ApdShadowActiveEpochView {
    if (!row.activatedAt) {
      throw new Error(`ACTIVE epoch ${row.id} missing activatedAt`);
    }
    return {
      id: row.id,
      activationScopeKey: row.activationScopeKey,
      organizationId: row.organizationId,
      cohortConfigFingerprintSha256: row.cohortConfigFingerprintSha256,
      lifecycleState: row.lifecycleState,
      activatedAt: row.activatedAt,
      b2PolicyVersion: row.b2PolicyVersion,
      b4PolicyVersion: row.b4PolicyVersion,
      productionReleaseIdentity: row.productionReleaseIdentity,
    };
  }
}
