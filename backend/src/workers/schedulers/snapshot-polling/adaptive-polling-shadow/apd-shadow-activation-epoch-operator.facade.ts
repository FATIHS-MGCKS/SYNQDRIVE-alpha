import { PrismaClient } from '@prisma/client';
import { P25_APD_B2_V1, P25_APD_B4_V1 } from '../adaptive-polling-policy/p25-apd-policy-versions';
import {
  P25_APD_LTE_R1_COHORT_V1,
  parseApdShadowCohortRuntime,
  computeApdShadowCohortFingerprintSha256,
} from './adaptive-polling-shadow-cohort.config';
import { ApdShadowActivationEpochService } from './apd-shadow-activation-epoch.service';
import {
  assertApdShadowEpochOpsAuthorized,
  assertMutationReleaseIdentity,
  emitApdShadowEpochOpsAudit,
  resolveApprovedReleaseSha,
  resolveObservedDeployedGitSha,
  type ApdShadowEpochOpsContext,
} from './apd-shadow-activation-operator.authority';
import {
  buildSanitizedActivateDryRun,
  buildSanitizedPrepareDryRun,
  redactOperatorSecrets,
} from './apd-shadow-operator-output.sanitize';
import type {
  ActivateApdShadowActivationEpochInput,
  PrepareApdShadowActivationEpochInput,
} from './apd-shadow-activation-epoch.types';

export type ApdShadowEpochOperatorCommand =
  | 'status'
  | 'preflight'
  | 'prepare'
  | 'activate'
  | 'pause'
  | 'close';

export interface ApdShadowEpochOperatorRequest {
  command: ApdShadowEpochOperatorCommand;
  ops: ApdShadowEpochOpsContext;
  dryRun?: boolean;
  organizationId?: string;
  epochId?: string;
  activationRequestKey?: string;
  cohortOrganizationIds?: string[];
}

export class ApdShadowActivationEpochOperatorFacade {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly epochService = new ApdShadowActivationEpochService(prisma as never),
  ) {}

  async run(request: ApdShadowEpochOperatorRequest): Promise<Record<string, unknown>> {
    const { command, ops, dryRun } = request;
    assertApdShadowEpochOpsAuthorized(command, ops);

    const runtime = parseApdShadowCohortRuntime({
      ...process.env,
      WORKER_APD_SHADOW_ENABLED: 'true',
    });
    const fingerprint = runtime.configFingerprintSha256;
    const cohortOrgIds =
      request.cohortOrganizationIds ??
      (runtime.config
        ? [...new Set(runtime.config.members.map((m) => m.organizationId))]
        : []);

    const approvedSha = resolveApprovedReleaseSha();
    const auditBase = {
      operation: command,
      operatorActor: ops.operatorActor,
      operationRequestId: ops.operationRequestId,
      operationReason: ops.operationReason,
      expectedDeployedSha: approvedSha,
      observedDeployedSha: resolveObservedDeployedGitSha(),
      timestampUtc: new Date().toISOString(),
      dryRun: dryRun === true,
      cohortFingerprintSha256: fingerprint ?? undefined,
      organizationId: request.organizationId,
      epochId: request.epochId,
    };

    try {
      switch (command) {
        case 'status':
          return await this.status(fingerprint);
        case 'preflight':
          return await this.preflight(ops, fingerprint, cohortOrgIds, dryRun);
        case 'prepare':
          return await this.prepare(request, ops, fingerprint, cohortOrgIds, dryRun, auditBase);
        case 'activate':
          return await this.activate(request, ops, fingerprint, cohortOrgIds, dryRun, auditBase);
        case 'pause':
          return await this.pause(request, ops, dryRun, auditBase);
        case 'close':
          return await this.close(request, ops, dryRun, auditBase);
        default:
          throw new Error(`unknown command: ${command}`);
      }
    } catch (err) {
      emitApdShadowEpochOpsAudit({
        ...auditBase,
        success: false,
        error: redactOperatorSecrets({
          message: err instanceof Error ? err.message : String(err),
        }).message as string,
      });
      throw err;
    }
  }

  private async status(fingerprint: string | null): Promise<Record<string, unknown>> {
    const runtime = parseApdShadowCohortRuntime(process.env);
    let activeEpoch = null;
    if (fingerprint) {
      activeEpoch = await this.epochService.loadActiveEpochForScopeAuthoritative(fingerprint);
    }
    const rows = fingerprint
      ? await this.prisma.apdShadowActivationEpoch.findMany({
          where: { cohortConfigFingerprintSha256: fingerprint },
          orderBy: { createdAt: 'desc' },
          take: 5,
        })
      : [];
    return {
      cohortState: runtime.state,
      cohortFingerprintSha256: fingerprint,
      deployedGitSha: resolveObservedDeployedGitSha(),
      activeEpoch,
      recentEpochs: rows.map((r) => ({
        id: r.id,
        lifecycleState: r.lifecycleState,
        activatedAt: r.activatedAt,
        organizationId: r.organizationId,
      })),
    };
  }

  private async preflight(
    ops: ApdShadowEpochOpsContext,
    fingerprint: string | null,
    cohortOrgIds: string[],
    dryRun?: boolean,
  ): Promise<Record<string, unknown>> {
    const release = assertMutationReleaseIdentity('preflight');
    if (!fingerprint) {
      throw new Error('preflight: cohort fingerprint missing (cohort not READY)');
    }
    if (cohortOrgIds.length === 0) {
      throw new Error('preflight: cohortOrganizationIds empty');
    }
    emitApdShadowEpochOpsAudit({
      operation: 'preflight',
      operatorActor: ops.operatorActor,
      operationRequestId: ops.operationRequestId,
      operationReason: ops.operationReason,
      expectedDeployedSha: release.approved,
      observedDeployedSha: release.observed,
      success: true,
      error: null,
      timestampUtc: new Date().toISOString(),
      dryRun: dryRun === true,
      cohortFingerprintSha256: fingerprint,
    });
    return {
      ok: true,
      fingerprint,
      b2: P25_APD_B2_V1,
      b4: P25_APD_B4_V1,
      release: { approved: release.approved, observed: release.observed },
      dryRun: dryRun === true,
    };
  }

  private async prepare(
    request: ApdShadowEpochOperatorRequest,
    ops: ApdShadowEpochOpsContext,
    fingerprint: string | null,
    cohortOrgIds: string[],
    dryRun?: boolean,
    auditBase?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!fingerprint || !request.organizationId) {
      throw new Error('prepare requires READY cohort and organizationId');
    }
    const cohortConfigVersion =
      parseApdShadowCohortRuntime(process.env).config?.version ?? P25_APD_LTE_R1_COHORT_V1;
    const release = assertMutationReleaseIdentity('prepare');
    const input: PrepareApdShadowActivationEpochInput = {
      organizationId: request.organizationId,
      cohortOrganizationIds: cohortOrgIds,
      cohortConfigFingerprintSha256: fingerprint,
      cohortConfigVersion,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      productionReleaseIdentity: release.approved,
      operatorActor: ops.operatorActor,
      operatorReason: ops.operationReason,
      operatorRequestId: ops.operationRequestId,
      opsToken: ops.opsToken,
    };
    if (dryRun) {
      emitApdShadowEpochOpsAudit({
        ...(auditBase as object),
        success: true,
        error: null,
      } as never);
      return {
        dryRun: true,
        wouldPrepare: buildSanitizedPrepareDryRun({
          organizationId: request.organizationId,
          cohortOrganizationIds: cohortOrgIds,
          cohortConfigFingerprintSha256: fingerprint,
          cohortConfigVersion,
          b2PolicyVersion: P25_APD_B2_V1,
          b4PolicyVersion: P25_APD_B4_V1,
          operatorActor: ops.operatorActor,
          operatorReason: ops.operationReason,
          operationRequestId: ops.operationRequestId,
          approvedReleaseSha: release.approved,
        }),
      };
    }
    const row = await this.epochService.prepareEpoch(input);
    emitApdShadowEpochOpsAudit({
      ...(auditBase as object),
      success: true,
      error: null,
      epochId: row.id,
    } as never);
    return { epochId: row.id };
  }

  private async activate(
    request: ApdShadowEpochOperatorRequest,
    ops: ApdShadowEpochOpsContext,
    fingerprint: string | null,
    cohortOrgIds: string[],
    dryRun?: boolean,
    auditBase?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!fingerprint || !request.epochId || !request.activationRequestKey) {
      throw new Error('activate requires epochId, activationRequestKey, and READY cohort');
    }
    const release = assertMutationReleaseIdentity('activate');
    const input: ActivateApdShadowActivationEpochInput = {
      epochId: request.epochId,
      activationRequestKey: request.activationRequestKey,
      cohortOrganizationIds: cohortOrgIds,
      cohortConfigFingerprintSha256: fingerprint,
      b2PolicyVersion: P25_APD_B2_V1,
      b4PolicyVersion: P25_APD_B4_V1,
      operatorActor: ops.operatorActor,
      operatorReason: ops.operationReason,
      operatorRequestId: ops.operationRequestId,
      productionReleaseIdentity: release.approved,
      opsToken: ops.opsToken,
    };
    if (dryRun) {
      emitApdShadowEpochOpsAudit({
        ...(auditBase as object),
        success: true,
        error: null,
      } as never);
      return {
        dryRun: true,
        wouldActivate: buildSanitizedActivateDryRun({
          epochId: request.epochId,
          activationRequestKey: request.activationRequestKey,
          cohortOrganizationIds: cohortOrgIds,
          cohortConfigFingerprintSha256: fingerprint,
          b2PolicyVersion: P25_APD_B2_V1,
          b4PolicyVersion: P25_APD_B4_V1,
          operatorActor: ops.operatorActor,
          operatorReason: ops.operationReason,
          operationRequestId: ops.operationRequestId,
          approvedReleaseSha: release.approved,
        }),
      };
    }
    const active = await this.epochService.activateEpoch(input);
    emitApdShadowEpochOpsAudit({
      ...(auditBase as object),
      success: true,
      error: null,
      epochId: active.id,
    } as never);
    return { epoch: active };
  }

  private async pause(
    request: ApdShadowEpochOperatorRequest,
    ops: ApdShadowEpochOpsContext,
    dryRun?: boolean,
    auditBase?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!request.epochId) throw new Error('pause requires epochId');
    if (dryRun) {
      emitApdShadowEpochOpsAudit({ ...(auditBase as object), success: true, error: null } as never);
      return { dryRun: true, wouldPause: request.epochId };
    }
    await this.epochService.pauseEpoch(request.epochId, ops);
    emitApdShadowEpochOpsAudit({ ...(auditBase as object), success: true, error: null } as never);
    return { paused: request.epochId };
  }

  private async close(
    request: ApdShadowEpochOperatorRequest,
    ops: ApdShadowEpochOpsContext,
    dryRun?: boolean,
    auditBase?: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!request.epochId) throw new Error('close requires epochId');
    if (dryRun) {
      emitApdShadowEpochOpsAudit({ ...(auditBase as object), success: true, error: null } as never);
      return { dryRun: true, wouldClose: request.epochId };
    }
    await this.epochService.closeEpoch(request.epochId, ops);
    emitApdShadowEpochOpsAudit({ ...(auditBase as object), success: true, error: null } as never);
    return { closed: request.epochId };
  }
}

export function fingerprintFromEnv(): string | null {
  const runtime = parseApdShadowCohortRuntime(process.env);
  if (runtime.config) {
    return computeApdShadowCohortFingerprintSha256(runtime.config);
  }
  return runtime.configFingerprintSha256;
}
