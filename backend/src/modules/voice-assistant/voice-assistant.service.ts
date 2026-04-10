import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { ElevenLabsService } from './elevenlabs.service';
import { VoiceAssistantStatus } from '@prisma/client';

@Injectable()
export class VoiceAssistantService {
  private readonly logger = new Logger(VoiceAssistantService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly elevenLabs: ElevenLabsService,
  ) {}

  async getOrCreate(organizationId: string) {
    let assistant = await this.prisma.voiceAssistant.findUnique({
      where: { organizationId },
    });
    if (!assistant) {
      assistant = await this.prisma.voiceAssistant.create({
        data: { organizationId },
      });
    }
    return assistant;
  }

  async get(organizationId: string) {
    return this.prisma.voiceAssistant.findUnique({
      where: { organizationId },
    });
  }

  async update(organizationId: string, data: {
    name?: string;
    role?: string;
    personality?: string;
    language?: string;
    voiceId?: string;
    voiceName?: string;
    greetingMessage?: string;
    systemPrompt?: string;
    companyContext?: string;
    businessRules?: string;
    forbiddenActions?: string;
    knowledgeSnippets?: string;
    telephonyEnabled?: boolean;
    inboundEnabled?: boolean;
    outboundEnabled?: boolean;
    permAnswerQuestions?: boolean;
    permManageBookings?: boolean;
    permWorkshopHandling?: boolean;
    permBreakdownSupport?: boolean;
    permContactCustomers?: boolean;
    permContactVendors?: boolean;
    permCreateActions?: boolean;
    escalationPhone?: string;
    escalationUserId?: string;
    escalationDepartment?: string;
    escalateOnLowConf?: boolean;
    escalateOnSensitive?: boolean;
    escalateOnRequest?: boolean;
    fallbackMessage?: string;
    businessHoursStart?: string;
    businessHoursEnd?: string;
    businessHoursTimezone?: string;
    afterHoursMessage?: string;
  }) {
    const assistant = await this.getOrCreate(organizationId);
    return this.prisma.voiceAssistant.update({
      where: { id: assistant.id },
      data,
    });
  }

  async activate(organizationId: string) {
    const assistant = await this.getOrCreate(organizationId);

    if (!assistant.name) throw new BadRequestException('Assistant name is required');
    if (!assistant.systemPrompt) throw new BadRequestException('System prompt is required');

    if (!assistant.elevenLabsAgentId && this.elevenLabs.isConfigured()) {
      const prompt = this.buildFullPrompt(assistant);
      const result = await this.elevenLabs.createAgent({
        name: assistant.name,
        systemPrompt: prompt,
        greetingMessage: assistant.greetingMessage ?? undefined,
        voiceId: assistant.voiceId ?? undefined,
        language: assistant.language,
      });
      if (result) {
        await this.prisma.voiceAssistant.update({
          where: { id: assistant.id },
          data: { elevenLabsAgentId: result.agentId },
        });
      }
    } else if (assistant.elevenLabsAgentId && this.elevenLabs.isConfigured()) {
      const prompt = this.buildFullPrompt(assistant);
      await this.elevenLabs.updateAgent(assistant.elevenLabsAgentId, {
        name: assistant.name,
        systemPrompt: prompt,
        greetingMessage: assistant.greetingMessage ?? undefined,
        voiceId: assistant.voiceId ?? undefined,
        language: assistant.language,
      });
    }

    return this.prisma.voiceAssistant.update({
      where: { id: assistant.id },
      data: { status: VoiceAssistantStatus.ACTIVE },
    });
  }

  async deactivate(organizationId: string) {
    const assistant = await this.getOrCreate(organizationId);
    return this.prisma.voiceAssistant.update({
      where: { id: assistant.id },
      data: { status: VoiceAssistantStatus.INACTIVE },
    });
  }

  async getTestSession(organizationId: string) {
    const assistant = await this.getOrCreate(organizationId);
    if (!assistant.elevenLabsAgentId) {
      return { signedUrl: null, agentId: null, message: 'Agent not provisioned yet. Activate the assistant first.' };
    }
    const signedUrl = await this.elevenLabs.getSignedUrl(assistant.elevenLabsAgentId);
    return { signedUrl, agentId: assistant.elevenLabsAgentId };
  }

  async listVoices() {
    return this.elevenLabs.listVoices();
  }

  async getConversations(organizationId: string, limit = 50) {
    return this.prisma.voiceConversation.findMany({
      where: { organizationId },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }

  async syncConversations(organizationId: string) {
    const assistant = await this.get(organizationId);
    if (!assistant?.elevenLabsAgentId) return { synced: 0 };

    const remote = await this.elevenLabs.listConversations(assistant.elevenLabsAgentId);
    let synced = 0;

    for (const conv of remote) {
      const exists = await this.prisma.voiceConversation.findFirst({
        where: { elevenLabsConvId: conv.conversation_id },
      });
      if (exists) continue;

      const detail = await this.elevenLabs.getConversation(conv.conversation_id);

      const durationSeconds = conv.end_time_unix_secs && conv.start_time_unix_secs
        ? conv.end_time_unix_secs - conv.start_time_unix_secs
        : null;

      await this.prisma.voiceConversation.create({
        data: {
          organizationId,
          voiceAssistantId: assistant.id,
          elevenLabsConvId: conv.conversation_id,
          direction: 'inbound',
          durationSeconds,
          outcome: conv.status === 'done' ? 'RESOLVED' : 'FAILED',
          transcript: typeof detail?.transcript === 'string' ? detail.transcript : JSON.stringify(detail?.transcript ?? ''),
          summary: detail?.metadata?.summary ?? null,
          startedAt: conv.start_time_unix_secs ? new Date(conv.start_time_unix_secs * 1000) : new Date(),
          endedAt: conv.end_time_unix_secs ? new Date(conv.end_time_unix_secs * 1000) : null,
        },
      });

      if (durationSeconds) {
        await this.prisma.voiceAssistant.update({
          where: { id: assistant.id },
          data: {
            totalCalls: { increment: 1 },
            answeredCalls: { increment: 1 },
            totalTalkMinutes: { increment: durationSeconds / 60 },
          },
        });
      }
      synced++;
    }

    return { synced };
  }

  async getReadiness(organizationId: string) {
    const a = await this.get(organizationId);
    if (!a) return { ready: false, checks: [] };

    const checks = [
      { key: 'name', label: 'Assistant name', ok: Boolean(a.name) },
      { key: 'systemPrompt', label: 'System prompt', ok: Boolean(a.systemPrompt) },
      { key: 'voice', label: 'Voice selected', ok: Boolean(a.voiceId) },
      { key: 'greeting', label: 'Greeting message', ok: Boolean(a.greetingMessage) },
      { key: 'escalation', label: 'Escalation configured', ok: Boolean(a.escalationPhone || a.escalationUserId) },
      { key: 'elevenlabs', label: 'ElevenLabs connected', ok: this.elevenLabs.isConfigured() },
      { key: 'agentProvisioned', label: 'Agent provisioned', ok: Boolean(a.elevenLabsAgentId) },
    ];

    return { ready: checks.every(c => c.ok), checks };
  }

  async getAdminOverview() {
    const assistants = await this.prisma.voiceAssistant.findMany({
      include: { organization: { select: { id: true, companyName: true } } },
      orderBy: { updatedAt: 'desc' },
    });

    const totalCalls = assistants.reduce((s: number, a) => s + a.totalCalls, 0);
    const totalMinutes = assistants.reduce((s: number, a) => s + a.totalTalkMinutes, 0);

    return {
      assistants: assistants.map((a) => ({
        organizationId: a.organizationId,
        organizationName: a.organization.companyName,
        name: a.name,
        status: a.status,
        voiceName: a.voiceName,
        language: a.language,
        telephonyEnabled: a.telephonyEnabled,
        phoneNumber: a.phoneNumber,
        totalCalls: a.totalCalls,
        answeredCalls: a.answeredCalls,
        totalTalkMinutes: a.totalTalkMinutes,
        elevenLabsAgentId: a.elevenLabsAgentId,
        updatedAt: a.updatedAt,
      })),
      summary: { totalOrgs: assistants.length, totalCalls, totalMinutes },
    };
  }

  private buildFullPrompt(assistant: any): string {
    const parts: string[] = [];
    if (assistant.systemPrompt) parts.push(assistant.systemPrompt);
    if (assistant.companyContext) parts.push(`\n\nCompany Context:\n${assistant.companyContext}`);
    if (assistant.businessRules) parts.push(`\n\nBusiness Rules:\n${assistant.businessRules}`);
    if (assistant.forbiddenActions) parts.push(`\n\nForbidden Actions:\n${assistant.forbiddenActions}`);
    if (assistant.knowledgeSnippets) parts.push(`\n\nKnowledge Base:\n${assistant.knowledgeSnippets}`);

    const perms: string[] = [];
    if (assistant.permAnswerQuestions) perms.push('answer questions');
    if (assistant.permManageBookings) perms.push('manage bookings');
    if (assistant.permWorkshopHandling) perms.push('handle workshop requests');
    if (assistant.permBreakdownSupport) perms.push('provide breakdown support');
    if (assistant.permContactCustomers) perms.push('contact customers');
    if (assistant.permContactVendors) perms.push('contact vendors');
    if (assistant.permCreateActions) perms.push('create/update/delete records');
    if (perms.length > 0) parts.push(`\n\nYou are allowed to: ${perms.join(', ')}.`);

    if (assistant.escalateOnRequest || assistant.escalateOnLowConf || assistant.escalateOnSensitive) {
      const triggers: string[] = [];
      if (assistant.escalateOnRequest) triggers.push('when the caller requests a human');
      if (assistant.escalateOnLowConf) triggers.push('when you are not confident in your answer');
      if (assistant.escalateOnSensitive) triggers.push('for sensitive topics');
      parts.push(`\n\nEscalation: Transfer the call ${triggers.join(', ')}.`);
      if (assistant.fallbackMessage) parts.push(`If no agent is available, say: "${assistant.fallbackMessage}"`);
    }

    return parts.join('');
  }
}
