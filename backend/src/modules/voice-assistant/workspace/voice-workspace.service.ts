import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrganizationStatus,
  VoiceAgentDeploymentStatus,
  VoiceAssistantStatus,
  VoiceConnectionStatus,
  VoicePhoneRegulatoryStatus,
  VoiceProvisioningJobStatus,
  VoiceSubscriptionStatus,
  VoiceTestRunStatus,
  type VoiceAssistant,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { VoiceBudgetEnforcementService } from '@modules/voice-protection/voice-budget-enforcement.service';
import { VoiceAssistantService } from '../voice-assistant.service';
import { VoiceSubscriptionRepository } from '../control-plane/voice-control-plane.repository';
import {
  isVoiceOpsTab,
  isVoiceSettingsSection,
  isVoiceWizardStep,
  VOICE_OPS_TABS,
  VOICE_SETTINGS_SECTIONS,
  VOICE_WIZARD_STEPS,
  wizardStepIndex,
  type VoiceOpsTabId,
  type VoicePrimaryState,
  type VoiceSettingsSectionId,
  type VoiceWizardStepId,
  type VoiceWorkspaceIssueCode,
} from './voice-workspace.constants';

export interface VoiceWorkspaceIssue {
  code: VoiceWorkspaceIssueCode;
  message: string;
  blocking: boolean;
}

export interface VoiceWorkspaceNavigation {
  phase: 'onboarding' | 'operations';
  wizardStep: VoiceWizardStepId | null;
  opsTab: VoiceOpsTabId | null;
  settingsSection: VoiceSettingsSectionId | null;
  allowedWizardSteps: VoiceWizardStepId[];
  allowedOpsTabs: VoiceOpsTabId[];
  allowedSettingsSections: VoiceSettingsSectionId[];
}

export interface VoiceWorkspaceView {
  organizationId: string;
  primaryState: VoicePrimaryState;
  issues: VoiceWorkspaceIssue[];
  navigation: VoiceWorkspaceNavigation;
  onboardingStep: VoiceWizardStepId;
  completedSteps: VoiceWizardStepId[];
  rolloutStatus: 'DISABLED' | 'ENABLED' | 'SUSPENDED';
  subscriptionStatus: string | null;
  assistantStatus: VoiceAssistantStatus;
  readinessReady: boolean;
  testPassed: boolean;
  canActivate: boolean;
  updatedAt: string;
}

export interface UpdateVoiceOnboardingStepInput {
  step: string;
}

@Injectable()
export class VoiceWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assistantService: VoiceAssistantService,
    private readonly subscriptions: VoiceSubscriptionRepository,
    private readonly protection: VoiceBudgetEnforcementService,
  ) {}

  async getWorkspace(organizationId: string): Promise<VoiceWorkspaceView> {
    await this.assistantService.getOrCreateAssistantForOrg(organizationId);
    const row = await this.prisma.voiceAssistant.findUnique({
      where: { organizationId },
    });
    if (!row) {
      throw new NotFoundException('Voice assistant not found');
    }

    const [subscription, readiness, org, failedJob, pendingPhone, failedDeployment, testRun] =
      await Promise.all([
        this.subscriptions.listByOrganization(organizationId).then((rows) => rows[0] ?? null),
        this.assistantService.getReadiness(organizationId),
        this.prisma.organization.findUnique({
          where: { id: organizationId },
          select: { status: true },
        }),
        this.prisma.voiceProvisioningJob.findFirst({
          where: {
            organizationId,
            status: VoiceProvisioningJobStatus.FAILED,
          },
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.voicePhoneNumber.findFirst({
          where: {
            organizationId,
            regulatoryStatus: {
              in: [
                VoicePhoneRegulatoryStatus.PENDING,
                VoicePhoneRegulatoryStatus.IN_REVIEW,
              ],
            },
          },
        }),
        this.prisma.voiceAgentDeployment.findFirst({
          where: {
            organizationId,
            status: VoiceAgentDeploymentStatus.FAILED,
          },
          orderBy: { updatedAt: 'desc' },
        }),
        this.prisma.voiceTestRun.findFirst({
          where: { organizationId, status: VoiceTestRunStatus.PASSED },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    const completedSteps = this.computeCompletedSteps({
      assistant: row,
      subscription,
      readiness,
      testPassed: Boolean(testRun),
      knowledgeReady: this.isKnowledgeReady(row),
    });

    const issues = this.collectIssues({
      organizationId,
      orgStatus: org?.status ?? OrganizationStatus.ACTIVE,
      subscription,
      assistant: row,
      readiness,
      failedJob,
      pendingPhone,
      failedDeployment,
    });

    const primaryState = this.derivePrimaryState({
      subscription,
      assistant: row,
      readiness,
      completedSteps,
      issues,
    });

    const onboardingStep = this.resolveOnboardingStep(row, completedSteps);
    const navigation = this.buildNavigation(primaryState, onboardingStep, completedSteps);

    let canActivate = false;
    try {
      await this.protection.assertActivationAllowed(organizationId);
      canActivate = readiness.ready && row.status !== VoiceAssistantStatus.ACTIVE;
    } catch {
      canActivate = false;
    }

    return {
      organizationId,
      primaryState,
      issues,
      navigation,
      onboardingStep,
      completedSteps,
      rolloutStatus: this.deriveRolloutStatus(subscription, org?.status),
      subscriptionStatus: subscription?.status ?? null,
      assistantStatus: row.status,
      readinessReady: readiness.ready,
      testPassed: Boolean(testRun),
      canActivate,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async updateOnboardingStep(
    organizationId: string,
    input: UpdateVoiceOnboardingStepInput,
  ): Promise<VoiceWorkspaceView> {
    if (!isVoiceWizardStep(input.step)) {
      throw new BadRequestException('Invalid onboarding step');
    }

    const workspace = await this.getWorkspace(organizationId);
    const target = input.step as VoiceWizardStepId;

    if (!workspace.navigation.allowedWizardSteps.includes(target)) {
      throw new BadRequestException({
        message: 'Onboarding step is not allowed yet',
        step: target,
        allowedSteps: workspace.navigation.allowedWizardSteps,
      });
    }

    const row = await this.prisma.voiceAssistant.findUnique({
      where: { organizationId },
    });
    if (!row) {
      throw new NotFoundException('Voice assistant not found');
    }

    await this.prisma.voiceAssistant.update({
      where: { id: row.id },
      data: {
        onboardingStep: target,
        onboardingCompletedSteps: workspace.completedSteps,
      },
    });

    return this.getWorkspace(organizationId);
  }

  validateRoute(input: {
    workspace: VoiceWorkspaceView;
    wizardStep?: string | null;
    opsTab?: string | null;
    settingsSection?: string | null;
  }): VoiceWorkspaceNavigation {
    const { workspace } = input;
    const phase = workspace.navigation.phase;

    if (phase === 'onboarding') {
      const step =
        input.wizardStep && isVoiceWizardStep(input.wizardStep)
          ? input.wizardStep
          : workspace.onboardingStep;
      const allowed = workspace.navigation.allowedWizardSteps.includes(step)
        ? step
        : workspace.onboardingStep;

      return {
        phase: 'onboarding',
        wizardStep: allowed,
        opsTab: null,
        settingsSection: null,
        allowedWizardSteps: workspace.navigation.allowedWizardSteps,
        allowedOpsTabs: [],
        allowedSettingsSections: [],
      };
    }

    const opsTab =
      input.opsTab && isVoiceOpsTab(input.opsTab) ? input.opsTab : 'overview';
    const allowedTab = workspace.navigation.allowedOpsTabs.includes(opsTab)
      ? opsTab
      : 'overview';

    let settingsSection: VoiceSettingsSectionId | null = null;
    if (allowedTab === 'settings') {
      const requested =
        input.settingsSection && isVoiceSettingsSection(input.settingsSection)
          ? input.settingsSection
          : 'assistant';
      settingsSection = workspace.navigation.allowedSettingsSections.includes(requested)
        ? requested
        : 'assistant';
    }

    return {
      phase: 'operations',
      wizardStep: null,
      opsTab: allowedTab,
      settingsSection,
      allowedWizardSteps: [],
      allowedOpsTabs: workspace.navigation.allowedOpsTabs,
      allowedSettingsSections: workspace.navigation.allowedSettingsSections,
    };
  }

  private deriveRolloutStatus(
    subscription: { status: VoiceSubscriptionStatus } | null,
    orgStatus: OrganizationStatus | undefined,
  ): 'DISABLED' | 'ENABLED' | 'SUSPENDED' {
    if (orgStatus === OrganizationStatus.SUSPENDED) return 'SUSPENDED';
    if (
      subscription?.status === VoiceSubscriptionStatus.SUSPENDED ||
      subscription?.status === VoiceSubscriptionStatus.CANCELLED
    ) {
      return 'SUSPENDED';
    }
    if (
      subscription &&
      (subscription.status === VoiceSubscriptionStatus.TRIAL ||
        subscription.status === VoiceSubscriptionStatus.ACTIVE ||
        subscription.status === VoiceSubscriptionStatus.PAST_DUE)
    ) {
      return 'ENABLED';
    }
    return 'DISABLED';
  }

  private derivePrimaryState(input: {
    subscription: { status: VoiceSubscriptionStatus; planCode: string } | null;
    assistant: VoiceAssistant;
    readiness: { ready: boolean };
    completedSteps: VoiceWizardStepId[];
    issues: VoiceWorkspaceIssue[];
  }): VoicePrimaryState {
    if (input.issues.some((issue) => issue.code === 'suspended' && issue.blocking)) {
      return 'SUSPENDED';
    }

    if (
      !input.subscription ||
      input.subscription.status === VoiceSubscriptionStatus.PENDING
    ) {
      return 'NO_PLAN';
    }

    if (input.assistant.status === VoiceAssistantStatus.ACTIVE) {
      const degraded =
        input.assistant.connectionStatus === VoiceConnectionStatus.DEGRADED ||
        input.assistant.connectionStatus === VoiceConnectionStatus.ERROR ||
        input.issues.some(
          (issue) =>
            issue.blocking &&
            ['provider_unreachable', 'mcp_unreachable', 'budget_blocked', 'deployment_failed'].includes(
              issue.code,
            ),
        );
      return degraded ? 'DEGRADED' : 'ACTIVE';
    }

    const preActivationSteps = VOICE_WIZARD_STEPS.filter((step) => step !== 'activation');
    const allButActivationComplete = preActivationSteps.every((step) =>
      input.completedSteps.includes(step),
    );

    if (allButActivationComplete && input.readiness.ready) {
      return 'READY_TO_ACTIVATE';
    }

    return 'ONBOARDING';
  }

  private collectIssues(input: {
    organizationId: string;
    orgStatus: OrganizationStatus;
    subscription: { status: VoiceSubscriptionStatus } | null;
    assistant: VoiceAssistant;
    readiness: { checks: Array<{ key: string; ok: boolean; verification?: string }> };
    failedJob: { errorMessage: string | null } | null;
    pendingPhone: { id: string } | null;
    failedDeployment: { id: string } | null;
  }): VoiceWorkspaceIssue[] {
    const issues: VoiceWorkspaceIssue[] = [];

    if (input.orgStatus === OrganizationStatus.SUSPENDED) {
      issues.push({
        code: 'suspended',
        message: 'Organization is suspended.',
        blocking: true,
      });
    }

    if (
      input.subscription?.status === VoiceSubscriptionStatus.SUSPENDED ||
      input.subscription?.status === VoiceSubscriptionStatus.CANCELLED
    ) {
      issues.push({
        code: 'suspended',
        message: 'Voice subscription is suspended.',
        blocking: true,
      });
    }

    if (!input.subscription) {
      issues.push({
        code: 'subscription_missing',
        message: 'No voice subscription selected.',
        blocking: true,
      });
    }

    const elevenLabs = input.readiness.checks.find((check) => check.key === 'elevenlabs');
    const twilio = input.readiness.checks.find((check) => check.key === 'twilio');
    if ((elevenLabs && !elevenLabs.ok) || (twilio && !twilio.ok)) {
      issues.push({
        code: 'provider_unreachable',
        message: 'One or more voice providers are unreachable.',
        blocking: false,
      });
    }

    if (input.failedJob) {
      issues.push({
        code: 'provisioning_failed',
        message: input.failedJob.errorMessage ?? 'Voice provisioning failed.',
        blocking: false,
      });
    }

    if (input.pendingPhone) {
      issues.push({
        code: 'regulatory_pending',
        message: 'Phone number regulatory review is pending.',
        blocking: false,
      });
    }

    if (input.failedDeployment) {
      issues.push({
        code: 'deployment_failed',
        message: 'Agent deployment failed.',
        blocking: false,
      });
    }

    const mcpEnabled = process.env.VOICE_MCP_GATEWAY_ENABLED === 'true';
    if (mcpEnabled && elevenLabs && elevenLabs.verification === 'not_verified') {
      issues.push({
        code: 'mcp_unreachable',
        message: 'MCP gateway health could not be verified.',
        blocking: false,
      });
    }

    return issues;
  }

  private computeCompletedSteps(input: {
    assistant: VoiceAssistant;
    subscription: { planCode: string } | null;
    readiness: { ready: boolean };
    testPassed: boolean;
    knowledgeReady: boolean;
  }): VoiceWizardStepId[] {
    const completed: VoiceWizardStepId[] = [];

    if (input.subscription?.planCode) completed.push('plan');
    if (
      input.assistant.name?.trim() &&
      input.assistant.voiceId &&
      input.assistant.greetingMessage?.trim()
    ) {
      completed.push('assistant');
    }
    if (input.knowledgeReady) completed.push('knowledge');
    if (input.assistant.toolPermissions) completed.push('permissions');
    if (
      input.assistant.phoneNumber ||
      (!input.assistant.telephonyEnabled && !input.assistant.inboundEnabled)
    ) {
      completed.push('phone');
    }
    if (
      input.assistant.businessHoursStart?.trim() &&
      input.assistant.businessHoursEnd?.trim() &&
      (input.assistant.fallbackMessage?.trim() || input.assistant.escalationPhone?.trim())
    ) {
      completed.push('availability');
    }
    if (input.testPassed) completed.push('tests');
    if (input.readiness.ready && input.assistant.status === VoiceAssistantStatus.ACTIVE) {
      completed.push('activation');
    }

    return completed;
  }

  private isKnowledgeReady(assistant: VoiceAssistant): boolean {
    return Boolean(
      assistant.companyContext?.trim() ||
        assistant.businessRules?.trim() ||
        assistant.knowledgeSnippets?.trim(),
    );
  }

  private resolveOnboardingStep(
    assistant: VoiceAssistant,
    completedSteps: VoiceWizardStepId[],
  ): VoiceWizardStepId {
    const stored = assistant.onboardingStep;
    if (stored && isVoiceWizardStep(stored)) {
      const idx = wizardStepIndex(stored);
      const maxAllowed = this.maxAllowedWizardIndex(completedSteps);
      if (idx <= maxAllowed) return stored;
    }

    const firstIncomplete = VOICE_WIZARD_STEPS.find((step) => !completedSteps.includes(step));
    return firstIncomplete ?? 'activation';
  }

  private maxAllowedWizardIndex(completedSteps: VoiceWizardStepId[]): number {
    let max = 0;
    for (const step of VOICE_WIZARD_STEPS) {
      if (completedSteps.includes(step)) {
        max = Math.max(max, wizardStepIndex(step) + 1);
      }
    }
    return Math.min(max, VOICE_WIZARD_STEPS.length - 1);
  }

  private buildNavigation(
    primaryState: VoicePrimaryState,
    onboardingStep: VoiceWizardStepId,
    completedSteps: VoiceWizardStepId[],
  ): VoiceWorkspaceNavigation {
    const maxAllowed = this.maxAllowedWizardIndex(completedSteps);
    const allowedWizardSteps = VOICE_WIZARD_STEPS.filter(
      (step) => wizardStepIndex(step) <= maxAllowed,
    );

    if (primaryState !== 'ACTIVE' && primaryState !== 'DEGRADED') {
      return {
        phase: 'onboarding',
        wizardStep: onboardingStep,
        opsTab: null,
        settingsSection: null,
        allowedWizardSteps,
        allowedOpsTabs: [],
        allowedSettingsSections: [],
      };
    }

    return {
      phase: 'operations',
      wizardStep: null,
      opsTab: 'overview',
      settingsSection: null,
      allowedWizardSteps: [],
      allowedOpsTabs: [...VOICE_OPS_TABS],
      allowedSettingsSections: [...VOICE_SETTINGS_SECTIONS],
    };
  }
}
