import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { LlmGatewayService } from '@modules/ai/llm/llm-gateway.service';
import {
  WORKFLOW_AI_COMMUNICATION_DEFAULTS,
  WORKFLOW_AI_EVENT_PURPOSE_ALLOWLIST,
  isWorkflowAiCommunicationEnabled,
} from './workflow-ai-communication.config';
import { WorkflowAiCommunicationDataService } from './workflow-ai-communication-data.service';
import { WorkflowAiCommunicationFactCheckService } from './workflow-ai-communication-fact-check.service';
import {
  WORKFLOW_AI_COMMUNICATION_PROMPTS,
  WORKFLOW_AI_TRANSPARENCY_DE,
  WORKFLOW_AI_TRANSPARENCY_EN,
} from './workflow-ai-communication-prompts';
import { WorkflowAiCommunicationSafetyService } from './workflow-ai-communication-safety.service';
import type {
  WorkflowAiCommunicationDraft,
  WorkflowAiCommunicationPipelineInput,
  WorkflowAiCommunicationPromptKey,
  WorkflowAiLlmStructuredOutput,
} from './workflow-ai-communication.types';

@Injectable()
export class WorkflowAiCommunicationPipelineService {
  private readonly logger = new Logger(WorkflowAiCommunicationPipelineService.name);

  constructor(
    private readonly llm: LlmGatewayService,
    private readonly data: WorkflowAiCommunicationDataService,
    private readonly factCheck: WorkflowAiCommunicationFactCheckService,
    private readonly safety: WorkflowAiCommunicationSafetyService,
  ) {}

  isEnabled(): boolean {
    return isWorkflowAiCommunicationEnabled() && this.llm.isConfigured();
  }

  async generate(input: WorkflowAiCommunicationPipelineInput): Promise<WorkflowAiCommunicationDraft> {
    if (!isWorkflowAiCommunicationEnabled()) {
      throw new ServiceUnavailableException('Workflow AI communication pipeline is not enabled');
    }

    this.assertPurposeAllowed(input.eventType, input.purpose);
    const prompt = this.resolvePrompt(input.promptKey, input.promptVersion);
    this.assertPromptAllowedForEvent(prompt.allowedEventTypes, input.eventType);

    const facts = await this.data.collectFacts({
      organizationId: input.organizationId,
      eventType: input.eventType,
      eventPayload: input.eventPayload,
      bookingId: input.bookingId,
      customerId: input.customerId,
      vehicleId: input.vehicleId,
      entityType: input.entityType,
      entityId: input.entityId,
    });

    if (facts.length === 0) {
      throw new BadRequestException('Insufficient structured facts for AI communication');
    }

    const requiresApproval =
      prompt.requiresApproval
      || prompt.riskClass === 'CRITICAL'
      || (input.sensitiveFlags?.length ?? 0) > 0
      || input.purpose === 'admin_alert';

    if (requiresApproval && !input.runApproved && !input.dryRun) {
      return {
        message: '',
        citedFactIds: [],
        usedFallbackTemplate: false,
        factCheckPassed: false,
        requiresApproval: true,
        approvalBlocked: true,
        promptKey: input.promptKey,
        promptVersion: input.promptVersion,
        modelId: 'n/a',
        temperature: WORKFLOW_AI_COMMUNICATION_DEFAULTS.temperature,
        maxTokens: WORKFLOW_AI_COMMUNICATION_DEFAULTS.maxTokens,
        aiTransparencyAppended: false,
        riskClass: prompt.riskClass,
        blockedReason: 'Human approval required before send',
      };
    }

    const locale = input.locale ?? 'de';
    const untrusted = this.safety.sanitizeUntrustedCustomerText(input.untrustedCustomerText);
    let structured: WorkflowAiLlmStructuredOutput | null = null;
    let modelId = 'fallback';
    let usedFallback = false;
    let factCheckPassed = false;

    try {
      const llmResult = await this.llm.completeJson<WorkflowAiLlmStructuredOutput>({
        purpose: 'json',
        temperature: WORKFLOW_AI_COMMUNICATION_DEFAULTS.temperature,
        maxTokens: WORKFLOW_AI_COMMUNICATION_DEFAULTS.maxTokens,
        messages: [
          {
            role: 'system',
            content: [
              prompt.systemPrompt,
              'Return JSON only: { "message": string, "citedFactIds": string[], "claimsDiagnosis": boolean, "claimsCertainty": boolean }',
              'Cite only fact ids from the FACTS list. Never invent vehicle faults, amounts, or dates.',
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              `Locale: ${locale}`,
              `Channel: ${input.channel}`,
              `Purpose: ${input.purpose}`,
              `FACTS: ${JSON.stringify(facts)}`,
              untrusted ? this.safety.wrapUntrustedForPrompt(untrusted) : '',
            ].filter(Boolean).join('\n'),
          },
        ],
        schemaName: 'workflow_ai_communication_draft',
      });
      structured = llmResult.data;
      modelId = llmResult.model;
      this.safety.validateStructuredOutput(structured);
      const check = this.factCheck.validate({
        output: structured,
        facts,
        verifiedDiagnosis: input.verifiedDiagnosis,
        eventType: input.eventType,
      });
      factCheckPassed = check.passed;
      if (!check.passed) {
        throw new BadRequestException(check.reason ?? 'Fact check failed');
      }
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        JSON.stringify({
          event: 'workflow_ai_communication_fallback',
          organizationId: input.organizationId,
          promptKey: input.promptKey,
          reason: this.safety.redactForLogs(reason),
        }),
      );
      structured = {
        message: this.renderFallbackTemplate(prompt, facts, locale),
        citedFactIds: facts.slice(0, 2).map((f) => f.id),
        claimsDiagnosis: false,
        claimsCertainty: false,
      };
      usedFallback = true;
      factCheckPassed = true;
      modelId = 'static_fallback';
    }

    const transparency = locale === 'en' ? WORKFLOW_AI_TRANSPARENCY_EN : WORKFLOW_AI_TRANSPARENCY_DE;
    let message = structured.message.trim() + transparency;

    this.safety.assertContentLimits(message);

    if (input.dryRun) {
      message = message; // draft only
    }

    return {
      message,
      citedFactIds: structured.citedFactIds,
      usedFallbackTemplate: usedFallback,
      factCheckPassed,
      requiresApproval,
      approvalBlocked: false,
      promptKey: input.promptKey,
      promptVersion: input.promptVersion,
      modelId,
      temperature: WORKFLOW_AI_COMMUNICATION_DEFAULTS.temperature,
      maxTokens: WORKFLOW_AI_COMMUNICATION_DEFAULTS.maxTokens,
      aiTransparencyAppended: true,
      riskClass: prompt.riskClass,
    };
  }

  private assertPurposeAllowed(eventType: string, purpose: WorkflowAiCommunicationPipelineInput['purpose']): void {
    const allowed = WORKFLOW_AI_EVENT_PURPOSE_ALLOWLIST[eventType];
    if (!allowed) {
      throw new BadRequestException(`Event type ${eventType} is not allowed for AI communication`);
    }
    if (!allowed.includes(purpose)) {
      throw new ForbiddenException(`Purpose ${purpose} is not allowed for event ${eventType}`);
    }
  }

  private resolvePrompt(key: WorkflowAiCommunicationPromptKey, version: string) {
    const prompt = WORKFLOW_AI_COMMUNICATION_PROMPTS[key];
    if (!prompt) {
      throw new BadRequestException(`Unknown AI prompt key: ${key}`);
    }
    if (prompt.version !== version) {
      throw new BadRequestException(`Prompt version mismatch: expected ${prompt.version}, got ${version}`);
    }
    return prompt;
  }

  private assertPromptAllowedForEvent(allowedEventTypes: string[], eventType: string): void {
    if (!allowedEventTypes.includes(eventType)) {
      throw new BadRequestException(`Prompt is not approved for event type ${eventType}`);
    }
  }

  private renderFallbackTemplate(
    prompt: (typeof WORKFLOW_AI_COMMUNICATION_PROMPTS)[WorkflowAiCommunicationPromptKey],
    facts: { label: string; value: string }[],
    locale: 'de' | 'en',
  ): string {
    const nameFact = facts.find((f) => f.label === 'customer_first_name');
    const alertFact = facts.find((f) => f.label.includes('alert') || f.label === 'alertMessage');
    const template = locale === 'en' ? prompt.fallbackTemplateEn : prompt.fallbackTemplateDe;
    return template
      .replace('{{name}}', nameFact ? ` ${nameFact.value}` : '')
      .replace('{{alert}}', alertFact?.value ?? 'documented notice');
  }
}
