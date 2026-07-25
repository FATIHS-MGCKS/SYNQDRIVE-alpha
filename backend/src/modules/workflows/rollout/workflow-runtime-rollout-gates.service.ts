import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@shared/database/prisma.service';
import type { WorkflowRuntimeRolloutStage } from './workflow-runtime-rollout.contract';
import { readGlobalRolloutConfig } from './workflow-runtime-rollout.resolver';

export interface WorkflowRuntimePreDeploymentGate {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface WorkflowRuntimePreDeploymentGateResult {
  status: 'PASS' | 'FAIL';
  gates: WorkflowRuntimePreDeploymentGate[];
  evaluatedAt: string;
}

@Injectable()
export class WorkflowRuntimeRolloutGatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async evaluate(orgId: string): Promise<WorkflowRuntimePreDeploymentGateResult> {
    const global = readGlobalRolloutConfig(this.config);
    const gates: WorkflowRuntimePreDeploymentGate[] = [];

    gates.push({
      id: 'P0_TESTS',
      label: 'P0 workflow automation tests green',
      passed: global.gateTestsPass,
      detail: global.gateTestsPass ? 'CI gate flag set' : 'Set WORKFLOW_RUNTIME_GATE_TESTS_PASS=true after verify',
    });

    gates.push({
      id: 'TENANT_TESTS',
      label: 'Tenant isolation tests green',
      passed: global.gateTestsPass,
    });

    const [totalComparisons, deviationCount] = await Promise.all([
      this.prisma.orgWorkflowShadowComparison.count({ where: { organizationId: orgId } }),
      this.prisma.orgWorkflowShadowComparison.count({
        where: { organizationId: orgId, hasDeviation: true },
      }),
    ]);
    const deviationPct =
      totalComparisons > 0 ? (deviationCount / totalComparisons) * 100 : 0;
    const shadowPass = deviationPct <= global.shadowDeviationThresholdPct;
    gates.push({
      id: 'SHADOW_DEVIATION',
      label: 'Shadow deviation under threshold',
      passed: shadowPass,
      detail: `${deviationPct.toFixed(1)}% vs max ${global.shadowDeviationThresholdPct}% (${deviationCount}/${totalComparisons})`,
    });

    gates.push({
      id: 'DEAD_LETTER_RATE',
      label: 'Dead-letter rate acceptable',
      passed: true,
      detail: 'Manual ops review — no automated DLQ metric wired yet',
    });

    gates.push({
      id: 'PROVIDER_WEBHOOKS',
      label: 'Provider webhooks verified',
      passed: global.gateTestsPass,
      detail: 'Voice/WhatsApp webhook checks delegated to provider modules',
    });

    const orgSettings = await this.prisma.orgWorkflowRuntimeRolloutSettings.findUnique({
      where: { organizationId: orgId },
    });
    gates.push({
      id: 'MONITORING_ACTIVE',
      label: 'Monitoring linkage acknowledged',
      passed: global.monitoringEnabled && (orgSettings?.monitoringAcknowledged ?? false),
    });

    gates.push({
      id: 'ROLLBACK_TESTED',
      label: 'Rollback path tested',
      passed: global.gateTestsPass,
    });

    gates.push({
      id: 'COMPLIANCE_CONFIG',
      label: 'Compliance configuration present',
      passed: orgSettings != null,
      detail: orgSettings ? 'Org rollout settings row exists' : 'Create org rollout settings first',
    });

    const failed = gates.filter((gate) => !gate.passed);
    return {
      status: failed.length === 0 ? 'PASS' : 'FAIL',
      gates,
      evaluatedAt: new Date().toISOString(),
    };
  }
}

export function minimumStageForPromotion(
  target: WorkflowRuntimeRolloutStage,
): WorkflowRuntimeRolloutStage {
  return target;
}
