import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  VoiceAgentDeploymentStatus,
  VoiceControlPlaneProvider,
  VoiceTestRunStatus,
  type VoiceAssistant,
} from '@prisma/client';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { assertLiveProviderCallsAllowed } from '@modules/voice-call-orchestration/voice-feature-flags.config';
import { PrismaService } from '@shared/database/prisma.service';
import { hashCanonicalAgentConfig } from '../agent-deployment/agent-config.hash';
import { buildCanonicalAgentConfigFromAssistant } from '../agent-deployment/agent-config.builder';
import { VoiceAgentDeploymentRepository } from '../control-plane/voice-control-plane.repository';
import { VoiceTestRunRepository } from '../control-plane/voice-audit-persistence.repository';
import { resolveToolPermissions, VoicePermissionMode } from '../voice-assistant-permissions';
import {
  findScenarioDefinition,
  VOICE_REQUIRED_TEST_SCENARIO_IDS,
  VOICE_TEST_SCENARIO_DEFINITIONS,
  type VoiceTestScenarioId,
  type VoiceTestVerdict,
} from './voice-test-scenarios';

type SimulationAssertion = {
  key: string;
  ok: boolean;
  detail: string;
};

export type VoiceTestRunView = {
  id: string;
  scenarioId: VoiceTestScenarioId;
  mode: 'simulation' | 'live';
  verdict: VoiceTestVerdict | null;
  suggestedVerdict: VoiceTestVerdict | null;
  reason: string | null;
  toolsUsed: string[];
  operatorNotes: string | null;
  status: VoiceTestRunStatus;
  createdAt: string;
  completedAt: string | null;
  technicalDetails: {
    assertions: SimulationAssertion[];
    readinessGaps: string[];
  } | null;
};

export type VoiceTestCenterSummary = {
  ready: boolean;
  passedCount: number;
  partialCount: number;
  failedCount: number;
  pendingCount: number;
  requiredCount: number;
  scenarios: Array<{
    scenarioId: VoiceTestScenarioId;
    latest: VoiceTestRunView | null;
  }>;
};

@Injectable()
export class VoiceTestCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly deployments: VoiceAgentDeploymentRepository,
    private readonly testRuns: VoiceTestRunRepository,
    private readonly activityLog: ActivityLogService,
  ) {}

  listScenarios() {
    return VOICE_TEST_SCENARIO_DEFINITIONS;
  }

  async getSummary(organizationId: string): Promise<VoiceTestCenterSummary> {
    const runs = await this.testRuns.listByOrganization(organizationId, 200);
    const latestByScenario = new Map<string, VoiceTestRunView>();

    for (const run of runs) {
      if (!latestByScenario.has(run.scenario)) {
        latestByScenario.set(run.scenario, this.toView(run));
      }
    }

    const scenarios = VOICE_REQUIRED_TEST_SCENARIO_IDS.map((scenarioId) => ({
      scenarioId,
      latest: latestByScenario.get(scenarioId) ?? null,
    }));

    const verdicts = scenarios
      .map((row) => row.latest?.verdict)
      .filter((value): value is VoiceTestVerdict => Boolean(value));

    const passedCount = verdicts.filter((v) => v === 'PASS').length;
    const partialCount = verdicts.filter((v) => v === 'PARTIAL').length;
    const failedCount = verdicts.filter((v) => v === 'FAIL').length;
    const pendingCount = VOICE_REQUIRED_TEST_SCENARIO_IDS.length - verdicts.length;

    const criticalIds = VOICE_REQUIRED_TEST_SCENARIO_IDS.filter((id) => {
      const def = findScenarioDefinition(id);
      return def?.critical;
    });

    const criticalReady = criticalIds.every((id) => {
      const verdict = latestByScenario.get(id)?.verdict;
      return verdict === 'PASS' || verdict === 'PARTIAL';
    });

    const ready =
      criticalReady &&
      failedCount === 0 &&
      passedCount + partialCount >= Math.min(8, VOICE_REQUIRED_TEST_SCENARIO_IDS.length);

    return {
      ready,
      passedCount,
      partialCount,
      failedCount,
      pendingCount,
      requiredCount: VOICE_REQUIRED_TEST_SCENARIO_IDS.length,
      scenarios,
    };
  }

  async runScenario(
    organizationId: string,
    scenarioId: VoiceTestScenarioId,
    mode: 'simulation' | 'live' = 'simulation',
    actorUserId?: string,
  ): Promise<VoiceTestRunView> {
    const definition = findScenarioDefinition(scenarioId);
    if (!definition) {
      throw new BadRequestException('Unknown test scenario');
    }

    if (mode === 'live') {
      try {
        assertLiveProviderCallsAllowed();
      } catch {
        throw new ForbiddenException(
          'Live test calls require staging approval (VOICE_AI_PROVISIONING_STAGING_ENABLED=true).',
        );
      }
    }

    const assistant = await this.requireAssistant(organizationId);
    const deployment = await this.ensureDraftDeployment(organizationId, assistant);
    const simulation = this.evaluateSimulation(assistant, definition.tools, mode);

    const run = await this.testRuns.create({
      organizationId,
      agentDeploymentId: deployment.id,
      scenario: scenarioId,
      assertions: [
        {
          mode,
          suggestedVerdict: simulation.suggestedVerdict,
          toolsUsed: definition.tools,
          assertions: simulation.assertions,
          readinessGaps: simulation.readinessGaps,
        },
      ],
    });

    await this.testRuns.update(organizationId, run.id, {
      status: VoiceTestRunStatus.RUNNING,
      startedAt: new Date(),
    });

    const completed = await this.testRuns.findById(organizationId, run.id);
    if (!completed) {
      throw new NotFoundException('Test run not found');
    }

    await this.activityLog.log({
      organizationId,
      userId: actorUserId,
      action: 'UPDATE',
      entity: 'ORGANIZATION',
      entityId: organizationId,
      description: `Voice test scenario "${scenarioId}" started in ${mode} mode.`,
      metaJson: {
        auditAction: 'VOICE_TEST_RUN_STARTED',
        scenarioId,
        mode,
        testRunId: run.id,
      },
    });

    return this.toView(completed);
  }

  async recordVerdict(
    organizationId: string,
    testRunId: string,
    input: { verdict: VoiceTestVerdict; reason: string; operatorNotes?: string },
    actorUserId?: string,
  ): Promise<VoiceTestRunView> {
    const run = await this.testRuns.findById(organizationId, testRunId);
    if (!run) {
      throw new NotFoundException('Test run not found');
    }

    const status =
      input.verdict === 'FAIL' ? VoiceTestRunStatus.FAILED : VoiceTestRunStatus.PASSED;

    const existingAssertions = Array.isArray(run.assertions) ? [...run.assertions] : [];
    existingAssertions.push({
      verdict: input.verdict,
      reason: input.reason,
      operatorNotes: input.operatorNotes ?? null,
      recordedAt: new Date().toISOString(),
    });

    await this.testRuns.update(organizationId, testRunId, {
      status,
      assertions: existingAssertions,
      redactedResult: {
        verdict: input.verdict,
        reason: input.reason,
        operatorNotes: input.operatorNotes ?? null,
      },
      completedAt: new Date(),
    });

    await this.activityLog.log({
      organizationId,
      userId: actorUserId,
      action: 'UPDATE',
      entity: 'ORGANIZATION',
      entityId: organizationId,
      description: `Voice test run ${testRunId} recorded as ${input.verdict}.`,
      metaJson: {
        auditAction: 'VOICE_TEST_RUN_VERDICT',
        testRunId,
        verdict: input.verdict,
        scenario: run.scenario,
      },
    });

    const updated = await this.testRuns.findById(organizationId, testRunId);
    if (!updated) {
      throw new NotFoundException('Test run not found');
    }
    return this.toView(updated);
  }

  private async requireAssistant(organizationId: string) {
    const assistant = await this.prisma.voiceAssistant.findUnique({
      where: { organizationId },
    });
    if (!assistant) {
      throw new NotFoundException('Voice assistant not found');
    }
    return assistant;
  }

  private async ensureDraftDeployment(organizationId: string, assistant: VoiceAssistant) {
    const existing = await this.deployments.findDraftByAssistant(organizationId, assistant.id);
    if (existing) {
      return existing;
    }

    const config = buildCanonicalAgentConfigFromAssistant(assistant);
    return this.deployments.create({
      organizationId,
      voiceAssistantId: assistant.id,
      provider: VoiceControlPlaneProvider.ELEVENLABS,
      status: VoiceAgentDeploymentStatus.DRAFT,
      version: 0,
      configHash: hashCanonicalAgentConfig(config),
      configSnapshot: config,
    });
  }

  private evaluateSimulation(
    assistant: VoiceAssistant,
    tools: string[],
    mode: 'simulation' | 'live',
  ): {
    suggestedVerdict: VoiceTestVerdict;
    assertions: SimulationAssertion[];
    readinessGaps: string[];
  } {
    const permissions = resolveToolPermissions(assistant);
    const readinessGaps: string[] = [];
    const assertions: SimulationAssertion[] = [];

    if (!assistant.systemPrompt?.trim()) readinessGaps.push('system_prompt');
    if (!assistant.greetingMessage?.trim()) readinessGaps.push('greeting');
    if (!assistant.voiceId?.trim()) readinessGaps.push('voice');

    assertions.push({
      key: 'identity',
      ok: Boolean(assistant.name?.trim()),
      detail: assistant.name?.trim() ? 'Assistant identity configured' : 'Missing assistant name',
    });
    assertions.push({
      key: 'greeting',
      ok: Boolean(assistant.greetingMessage?.trim()),
      detail: assistant.greetingMessage?.trim()
        ? 'Greeting available for caller opening'
        : 'Greeting missing',
    });
    assertions.push({
      key: 'escalation',
      ok: Boolean(assistant.escalationPhone?.trim() || assistant.fallbackMessage?.trim()),
      detail:
        assistant.escalationPhone?.trim() || assistant.fallbackMessage?.trim()
          ? 'Escalation path configured'
          : 'No escalation or fallback configured',
    });

    const enabledTools = tools.filter((tool) => {
      if (tool === 'answer_general') return true;
      if (tool === 'escalation' || tool === 'transfer' || tool === 'emergency_escalation') {
        return Boolean(assistant.escalateOnRequest || assistant.escalationPhone);
      }
      if (tool === 'permission_guard') {
        return Boolean(assistant.escalateOnSensitive);
      }
      const capability = Object.keys(permissions).find((key) => key.includes(tool.split('_')[0]));
      if (!capability) return true;
      return permissions[capability as keyof typeof permissions] !== VoicePermissionMode.DISABLED;
    });

    assertions.push({
      key: 'tools',
      ok: enabledTools.length >= Math.ceil(tools.length * 0.6),
      detail: `Simulated tool coverage: ${enabledTools.length}/${tools.length}`,
    });

    assertions.push({
      key: 'mode',
      ok: mode === 'simulation' || Boolean(assistant.elevenLabsAgentId),
      detail:
        mode === 'simulation'
          ? 'Simulation mode — no live provider call'
          : assistant.elevenLabsAgentId
            ? 'Live mode requires provisioned agent'
            : 'Live mode blocked until agent exists',
    });

    const failed = assertions.filter((item) => !item.ok).length;
    const suggestedVerdict: VoiceTestVerdict =
      failed === 0 && readinessGaps.length === 0
        ? 'PASS'
        : failed <= 1
          ? 'PARTIAL'
          : 'FAIL';

    return { suggestedVerdict, assertions, readinessGaps };
  }

  private toView(run: {
    id: string;
    scenario: string;
    status: VoiceTestRunStatus;
    assertions: unknown;
    redactedResult: unknown;
    createdAt: Date;
    completedAt: Date | null;
  }): VoiceTestRunView {
    const payload = this.readAssertions(run.assertions);
    const result =
      run.redactedResult && typeof run.redactedResult === 'object' && !Array.isArray(run.redactedResult)
        ? (run.redactedResult as { verdict?: VoiceTestVerdict; reason?: string; operatorNotes?: string | null })
        : null;

    return {
      id: run.id,
      scenarioId: run.scenario as VoiceTestScenarioId,
      mode: payload.mode ?? 'simulation',
      verdict: result?.verdict ?? null,
      suggestedVerdict: payload.suggestedVerdict ?? null,
      reason: result?.reason ?? null,
      toolsUsed: payload.toolsUsed ?? [],
      operatorNotes: result?.operatorNotes ?? null,
      status: run.status,
      createdAt: run.createdAt.toISOString(),
      completedAt: run.completedAt?.toISOString() ?? null,
      technicalDetails: payload.assertions
        ? {
            assertions: payload.assertions,
            readinessGaps: payload.readinessGaps ?? [],
          }
        : null,
    };
  }

  private readAssertions(value: unknown): {
    mode?: 'simulation' | 'live';
    suggestedVerdict?: VoiceTestVerdict;
    toolsUsed?: string[];
    assertions?: SimulationAssertion[];
    readinessGaps?: string[];
  } {
    if (!Array.isArray(value) || value.length === 0) {
      return {};
    }
    const first = value[0];
    if (!first || typeof first !== 'object' || Array.isArray(first)) {
      return {};
    }
    return first as {
      mode?: 'simulation' | 'live';
      suggestedVerdict?: VoiceTestVerdict;
      toolsUsed?: string[];
      assertions?: SimulationAssertion[];
      readinessGaps?: string[];
    };
  }
}
