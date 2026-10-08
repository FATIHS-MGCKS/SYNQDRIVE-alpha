import { Injectable, Logger } from '@nestjs/common';
import { ApdShadowActivationEpochLifecycle } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { P25_APD_B2_V1, P25_APD_B4_V1 } from '../adaptive-polling-policy/p25-apd-policy-versions';
import {
  assertApdShadowEpochInternalOpsAuthorized,
  assertDeployedReleaseIdentity,
  type ApdShadowEpochOpsContext,
} from './apd-shadow-activation-operator.authority';
import { APD_SHADOW_EPOCH_T0_SQL } from './apd-shadow-epoch-t0.authority';
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

  /** Positive ACTIVE snapshots — read hints only (isEnabledForVehicle prefetch). */
  private positiveCacheByScope = new Map<
    string,
    { epoch: ApdShadowActiveEpochView; loadedAtMs: number }
  >();

  constructor(private readonly prisma: PrismaService) {}

  /** Bounded-staleness positive cache (read hints only — never used at decision-write boundary). */
  getCachedActiveEpochSnapshot(
    cohortConfigFingerprintSha256: string,
  ): ApdShadowActiveEpochView | null {
    const activationScopeKey = buildApdShadowActivationScopeKey(
      cohortConfigFingerprintSha256,
    );
    const cached = this.positiveCacheByScope.get(activationScopeKey);
    if (!cached) return null;
    if (Date.now() - cached.loadedAtMs > APD_SHADOW_EPOCH_CACHE_TTL_MS) {
      this.positiveCacheByScope.delete(activationScopeKey);
      return null;
    }
    return cached.epoch;
  }

  invalidateCache(scopeKey?: string): void {
    if (scopeKey) {
      this.positiveCacheByScope.delete(scopeKey);
      return;
    }
    this.positiveCacheByScope.clear();
  }

  private assertCohortOrganizations(input: {
    organizationId: string;
    cohortOrganizationIds: string[];
  }): void {
    const unique = [...new Set(input.cohortOrganizationIds.map((id) => id.trim()))];
    if (!unique.includes(input.organizationId)) {
      throw new Error('activation epoch organizationId not in cohortOrganizationIds');
    }
    if (unique.length === 0) {
      throw new Error('cohortOrganizationIds must not be empty');
    }
  }

  private assertFrozenPolicyVersions(b2: string, b4: string): void {
    if (b2 !== P25_APD_B2_V1 || b4 !== P25_APD_B4_V1) {
      throw new Error('activation epoch policy version must match frozen P25 APDS policy');
    }
  }

  async prepareEpoch(input: PrepareApdShadowActivationEpochInput): Promise<{ id: string }> {
    assertApdShadowEpochInternalOpsAuthorized('prepareEpoch', {
      operatorActor: input.operatorActor ?? undefined,
      operationRequestId: input.operatorRequestId ?? undefined,
      operationReason: input.operatorReason ?? undefined,
      opsToken: input.opsToken,
      expectedDeployedSha: input.expectedDeployedSha,
    });
    this.assertCohortOrganizations(input);
    this.assertFrozenPolicyVersions(input.b2PolicyVersion, input.b4PolicyVersion);
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
   * Idempotent when the same activationRequestKey is replayed for the same scope.
   */
  async activateEpoch(
    input: ActivateApdShadowActivationEpochInput,
  ): Promise<ApdShadowActiveEpochView> {
    assertApdShadowEpochInternalOpsAuthorized('activateEpoch', {
      operatorActor: input.operatorActor,
      operationRequestId: input.operatorRequestId ?? input.activationRequestKey,
      operationReason: input.operatorReason,
      opsToken: input.opsToken,
      expectedDeployedSha: input.expectedDeployedSha ?? input.productionReleaseIdentity ?? undefined,
    });
    assertDeployedReleaseIdentity(
      input.expectedDeployedSha ?? input.productionReleaseIdentity ?? undefined,
    );
    if (input.cohortOrganizationIds.length === 0) {
      throw new Error('cohortOrganizationIds must not be empty');
    }
    this.assertFrozenPolicyVersions(input.b2PolicyVersion, input.b4PolicyVersion);

    const activationScopeKey = buildApdShadowActivationScopeKey(
      input.cohortConfigFingerprintSha256,
    );

    const activated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`apd_shadow_epoch:${activationScopeKey}`}))`;

      const existingByRequest = await tx.apdShadowActivationEpoch.findFirst({
        where: { activationRequestKey: input.activationRequestKey },
      });
      if (existingByRequest) {
        this.assertActivationRequestScopeMatch(existingByRequest, input, activationScopeKey);
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
      if (!input.cohortOrganizationIds.includes(epoch.organizationId)) {
        throw new Error('activation epoch organizationId not in cohort');
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

      const [{ activated_at }] = await tx.$queryRaw<Array<{ activated_at: Date }>>(
        APD_SHADOW_EPOCH_T0_SQL,
      );

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
    this.positiveCacheByScope.set(activationScopeKey, {
      epoch: view,
      loadedAtMs: Date.now(),
    });
    return view;
  }

  private assertActivationRequestScopeMatch(
    existing: {
      id: string;
      activationScopeKey: string;
      cohortConfigFingerprintSha256: string;
      b2PolicyVersion: string;
      b4PolicyVersion: string;
    },
    input: ActivateApdShadowActivationEpochInput,
    activationScopeKey: string,
  ): void {
    if (existing.id !== input.epochId) {
      throw new Error('activation request key bound to a different epoch id');
    }
    if (existing.activationScopeKey !== activationScopeKey) {
      throw new Error('activation request key scope mismatch');
    }
    if (existing.cohortConfigFingerprintSha256 !== input.cohortConfigFingerprintSha256) {
      throw new Error('activation request key cohort fingerprint mismatch');
    }
    if (
      existing.b2PolicyVersion !== input.b2PolicyVersion ||
      existing.b4PolicyVersion !== input.b4PolicyVersion
    ) {
      throw new Error('activation request key policy version mismatch');
    }
  }

  async pauseEpoch(epochId: string, ops: Partial<ApdShadowEpochOpsContext> = {}): Promise<void> {
    assertApdShadowEpochInternalOpsAuthorized('pauseEpoch', ops);
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

  async closeEpoch(epochId: string, ops: Partial<ApdShadowEpochOpsContext> = {}): Promise<void> {
    assertApdShadowEpochInternalOpsAuthorized('closeEpoch', ops);
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

  /**
   * Read-path loader (may use positive cache). Not authoritative for scientific writes.
   */
  async loadActiveEpochForScope(
    cohortConfigFingerprintSha256: string,
  ): Promise<ApdShadowActiveEpochView | null> {
    const cached = this.getCachedActiveEpochSnapshot(cohortConfigFingerprintSha256);
    if (cached) return cached;
    return this.loadActiveEpochForScopeAuthoritative(cohortConfigFingerprintSha256, {
      updatePositiveCache: true,
    });
  }

  /**
   * Authoritative loader for decision-write boundary — always queries database.
   */
  async loadActiveEpochForScopeAuthoritative(
    cohortConfigFingerprintSha256: string,
    options?: { updatePositiveCache?: boolean },
  ): Promise<ApdShadowActiveEpochView | null> {
    const activationScopeKey = buildApdShadowActivationScopeKey(
      cohortConfigFingerprintSha256,
    );
    const now = Date.now();

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
      if (view && options?.updatePositiveCache) {
        this.positiveCacheByScope.set(activationScopeKey, { epoch: view, loadedAtMs: now });
      }
      if (!view) {
        this.positiveCacheByScope.delete(activationScopeKey);
      }
      return view;
    } catch (err) {
      this.logger.warn(
        `APD shadow activation epoch authoritative lookup failed (fail-closed): ${err instanceof Error ? err.message : err}`,
      );
      this.positiveCacheByScope.delete(activationScopeKey);
      throw err;
    }
  }

  evaluateShadowEpochGate(input: {
    cohortConfigFingerprintSha256: string | null;
    decisionAtMs: number;
    activeEpoch: ApdShadowActiveEpochView | null;
    vehicleOrganizationId?: string | null;
    /** When set, vehicle org must be in this allowlist (multi-tenant cohort). */
    cohortOrganizationIds?: string[];
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
    if (input.vehicleOrganizationId) {
      const cohortOrgs = input.cohortOrganizationIds?.filter(Boolean) ?? [];
      if (cohortOrgs.length > 0) {
        if (!cohortOrgs.includes(input.vehicleOrganizationId)) {
          return { allowed: false, reason: 'EPOCH_ORG_MISMATCH' };
        }
      } else if (epoch.organizationId !== input.vehicleOrganizationId) {
        return { allowed: false, reason: 'EPOCH_ORG_MISMATCH' };
      }
    }
    if (epoch.b2PolicyVersion !== P25_APD_B2_V1 || epoch.b4PolicyVersion !== P25_APD_B4_V1) {
      return { allowed: false, reason: 'EPOCH_POLICY_VERSION_MISMATCH' };
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
