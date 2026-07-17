import { Injectable, Logger } from '@nestjs/common';
import { ELEVENLABS_PROVIDER_DEFAULTS } from './elevenlabs-provider.config';
import {
  ElevenLabsInvalidConfigurationError,
  ElevenLabsProviderError,
  ElevenLabsProviderUnavailableError,
  ElevenLabsRegionMismatchError,
  ElevenLabsResourceNotFoundError,
  ElevenLabsUnauthorizedError,
} from './elevenlabs-provider.errors';
import { ElevenLabsProviderHttpClient } from './elevenlabs-provider.http-client';
import { ElevenLabsProviderPort } from './elevenlabs-provider.port';
import { maskExternalId, redactProviderPayload } from './elevenlabs-provider.redaction';
import { ElevenLabsProviderTenantResolver } from './elevenlabs-provider.tenant-resolver';
import type {
  CreateAgentInput,
  ElevenLabsProviderHealth,
  ElevenLabsVoiceView,
  ElevenLabsWorkspaceValidation,
  ImportTwilioPhoneNumberInput,
  ImportTwilioPhoneNumberResult,
  MaskedElevenLabsAgentView,
  MaskedElevenLabsConversationView,
  MaskedElevenLabsDeploymentView,
  MaskedElevenLabsPhoneNumberView,
  MaskedOutboundCallView,
  MaskedPostCallConfigView,
  MaskedToolsConfigView,
  OutboundCallPreparation,
  PostCallConfigurationInput,
  ToolsConfigurationInput,
  UpdateAgentInput,
} from './elevenlabs-provider.types';

type RawAgentResponse = {
  agent_id?: string;
  name?: string;
  status?: string;
  version?: string | number;
  platform_settings?: Record<string, unknown>;
  conversation_config?: {
    agent?: {
      prompt?: { prompt?: string };
      first_message?: string;
      language?: string;
      tools?: unknown[];
      mcp_server_ids?: string[];
    };
    tts?: { voice_id?: string };
  };
};

type RawPhoneNumberResponse = {
  phone_number_id: string;
  phone_number?: string;
  agent_id?: string | null;
};

type RawConversationResponse = {
  conversation_id: string;
  agent_id: string;
  status: string;
  start_time_unix_secs?: number;
  end_time_unix_secs?: number;
  transcript?: unknown;
};

@Injectable()
export class ElevenLabsProviderAdapter implements ElevenLabsProviderPort {
  private readonly logger = new Logger(ElevenLabsProviderAdapter.name);

  constructor(
    private readonly http: ElevenLabsProviderHttpClient,
    private readonly tenantResolver: ElevenLabsProviderTenantResolver,
  ) {}

  async checkHealth(): Promise<ElevenLabsProviderHealth> {
    const checkedAt = new Date().toISOString();
    const configured = this.http.isConfigured();

    if (!configured) {
      return {
        configured: false,
        reachable: false,
        authorized: false,
        degraded: false,
        healthy: false,
        connectionStatus: 'NOT_CONFIGURED',
        checkedAt,
        message: 'ElevenLabs API key is not configured.',
      };
    }

    try {
      this.assertRegionConfiguration();
      await this.http.request(ELEVENLABS_PROVIDER_DEFAULTS.healthPath, { method: 'GET' }, {
        timeoutMs: ELEVENLABS_PROVIDER_DEFAULTS.healthTimeoutMs,
        retries: 0,
      });

      return {
        configured: true,
        reachable: true,
        authorized: true,
        degraded: false,
        healthy: true,
        connectionStatus: 'CONNECTED',
        checkedAt,
      };
    } catch (err: unknown) {
      if (err instanceof ElevenLabsUnauthorizedError) {
        return {
          configured: true,
          reachable: true,
          authorized: false,
          degraded: true,
          healthy: false,
          connectionStatus: 'DEGRADED',
          checkedAt,
          message: err.message,
        };
      }

      const unreachable = err instanceof ElevenLabsProviderUnavailableError;
      return {
        configured: true,
        reachable: !unreachable,
        authorized: false,
        degraded: !unreachable,
        healthy: false,
        connectionStatus: unreachable ? 'NOT_CONFIGURED' : 'DEGRADED',
        checkedAt,
        message: err instanceof ElevenLabsProviderError ? err.message : 'ElevenLabs health check failed.',
      };
    }
  }

  async validateWorkspace(): Promise<ElevenLabsWorkspaceValidation> {
    const checkedAt = new Date().toISOString();
    const configured = this.http.isConfigured();

    if (!configured) {
      return {
        valid: false,
        configured: false,
        authorized: false,
        convaiAccessible: false,
        checkedAt,
        message: 'ElevenLabs API key is not configured.',
      };
    }

    try {
      this.assertRegionConfiguration();
      await this.http.request(ELEVENLABS_PROVIDER_DEFAULTS.healthPath, { method: 'GET' }, {
        timeoutMs: ELEVENLABS_PROVIDER_DEFAULTS.healthTimeoutMs,
        retries: 0,
      });

      let convaiAccessible = false;
      try {
        await this.http.request('/convai/phone-numbers', { method: 'GET' }, {
          timeoutMs: ELEVENLABS_PROVIDER_DEFAULTS.healthTimeoutMs,
          retries: 0,
        });
        convaiAccessible = true;
      } catch (convaiErr: unknown) {
        if (convaiErr instanceof ElevenLabsUnauthorizedError) {
          throw convaiErr;
        }
        this.logger.warn(
          `ElevenLabs convai workspace probe degraded: ${
            convaiErr instanceof Error ? convaiErr.message : 'unknown'
          }`,
        );
      }

      return {
        valid: convaiAccessible,
        configured: true,
        authorized: true,
        convaiAccessible,
        checkedAt,
        message: convaiAccessible
          ? undefined
          : 'ElevenLabs workspace is reachable but conversational AI access is degraded.',
      };
    } catch (err: unknown) {
      const authorized = false;
      return {
        valid: false,
        configured: true,
        authorized,
        convaiAccessible: false,
        checkedAt,
        message: err instanceof ElevenLabsProviderError ? err.message : 'Workspace validation failed.',
      };
    }
  }

  async listVoices(): Promise<ElevenLabsVoiceView[]> {
    if (!this.http.isConfigured()) {
      return [];
    }

    try {
      const data = await this.http.requestJson<{ voices?: Record<string, unknown>[] }>('/voices');
      return (data.voices ?? []).map((voice) => ({
        voiceId: String(voice.voice_id),
        name: String(voice.name),
        category: voice.category ? String(voice.category) : undefined,
        labels: voice.labels as Record<string, string> | undefined,
        previewUrl: voice.preview_url ? String(voice.preview_url) : undefined,
      }));
    } catch (err: unknown) {
      if (err instanceof ElevenLabsInvalidConfigurationError) {
        return [];
      }
      throw err;
    }
  }

  async getAgent(params: {
    organizationId: string;
    deploymentId: string;
  }): Promise<MaskedElevenLabsAgentView> {
    const tenant = await this.tenantResolver.resolveAgentRef(
      params.organizationId,
      params.deploymentId,
    );
    const raw = await this.http.requestJson<RawAgentResponse>(
      `/convai/agents/${encodeURIComponent(tenant.externalAgentId)}`,
    );
    return this.toMaskedAgentView(params.deploymentId, tenant.maskedExternalRef, raw);
  }

  async createAgent(input: CreateAgentInput): Promise<MaskedElevenLabsAgentView> {
    await this.tenantResolver.assertDeploymentInOrg(input.organizationId, input.deploymentId);
    const body = this.buildAgentBody(input);
    const raw = await this.http.requestJson<RawAgentResponse>('/convai/agents/create', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return this.toMaskedAgentView(
      input.deploymentId,
      maskExternalId(raw.agent_id, 'agent'),
      raw,
    );
  }

  async updateAgent(input: UpdateAgentInput): Promise<MaskedElevenLabsAgentView> {
    const tenant = await this.tenantResolver.resolveAgentRef(
      input.organizationId,
      input.deploymentId,
    );
    const body = this.buildAgentBody(input);
    const raw = await this.http.requestJson<RawAgentResponse>(
      `/convai/agents/${encodeURIComponent(tenant.externalAgentId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(body),
      },
    );
    return this.toMaskedAgentView(input.deploymentId, tenant.maskedExternalRef, raw);
  }

  async getAgentDeployment(params: {
    organizationId: string;
    deploymentId: string;
  }): Promise<MaskedElevenLabsDeploymentView> {
    const tenant = await this.tenantResolver.resolveAgentRef(
      params.organizationId,
      params.deploymentId,
    );
    const raw = await this.http.requestJson<RawAgentResponse>(
      `/convai/agents/${encodeURIComponent(tenant.externalAgentId)}`,
    );

    return {
      deploymentId: params.deploymentId,
      maskedAgentRef: tenant.maskedExternalRef,
      version: 1,
      providerVersion: raw.version != null ? String(raw.version) : null,
      status: raw.status,
    };
  }

  async listPhoneNumbers(params: {
    organizationId: string;
  }): Promise<MaskedElevenLabsPhoneNumberView[]> {
    const allowedRefs = await this.tenantResolver.listOrganizationPhoneExternalIds(
      params.organizationId,
    );
    if (allowedRefs.size === 0) {
      return [];
    }

    const data = await this.http.requestJson<
      { phone_numbers?: RawPhoneNumberResponse[] } | RawPhoneNumberResponse[]
    >('/convai/phone-numbers');

    const numbers = Array.isArray(data) ? data : (data.phone_numbers ?? []);
    return numbers
      .filter((row) => allowedRefs.has(row.phone_number_id))
      .map((row) => this.toMaskedPhoneView(params.organizationId, row));
  }

  async importTwilioPhoneNumber(
    input: ImportTwilioPhoneNumberInput,
  ): Promise<ImportTwilioPhoneNumberResult> {
    await this.tenantResolver.assertPhoneInOrg(input.organizationId, input.phoneNumberId);

    const body = redactProviderPayload({
      phone_number: input.e164,
      label: input.label ?? 'SynqDrive',
      provider: 'twilio',
      sid: input.twilioAccountSid,
      token: input.twilioAuthToken,
      region_config: input.region ? { region: input.region } : undefined,
    });

    const raw = await this.http.requestJson<RawPhoneNumberResponse>('/convai/phone-numbers', {
      method: 'POST',
      body: JSON.stringify({
        phone_number: input.e164,
        label: input.label ?? 'SynqDrive',
        provider: 'twilio',
        sid: input.twilioAccountSid,
        token: input.twilioAuthToken,
        ...(input.region ? { region_config: { region: input.region } } : {}),
      }),
    });

    this.logger.log(
      `Imported Twilio number for org ${input.organizationId}: ${JSON.stringify(body)}`,
    );

    const masked = this.toMaskedPhoneView(input.organizationId, raw, input.phoneNumberId);
    return {
      controlPlanePhoneNumberId: input.phoneNumberId,
      elevenLabsPhoneId: raw.phone_number_id,
      maskedPhoneRef: masked.maskedPhoneRef,
      maskedE164: masked.maskedE164,
    };
  }

  async assignPhoneNumberToAgent(params: {
    organizationId: string;
    phoneNumberId: string;
    deploymentId: string;
  }): Promise<void> {
    const [tenantAgent, tenantPhone] = await Promise.all([
      this.tenantResolver.resolveAgentRef(params.organizationId, params.deploymentId),
      this.tenantResolver.resolvePhoneRef(params.organizationId, params.phoneNumberId),
    ]);

    await this.http.request(
      `/convai/phone-numbers/${encodeURIComponent(tenantPhone.externalPhoneId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ agent_id: tenantAgent.externalAgentId }),
      },
    );
  }

  async unassignPhoneNumberFromAgent(params: {
    organizationId: string;
    phoneNumberId: string;
  }): Promise<void> {
    const tenantPhone = await this.tenantResolver.resolvePhoneRef(
      params.organizationId,
      params.phoneNumberId,
    );

    await this.http.request(
      `/convai/phone-numbers/${encodeURIComponent(tenantPhone.externalPhoneId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ agent_id: null }),
      },
    );
  }

  async prepareOutboundCall(params: {
    organizationId: string;
    deploymentId: string;
    phoneNumberId: string;
    toE164: string;
  }): Promise<OutboundCallPreparation> {
    const blockers: string[] = [];

    if (!this.http.isConfigured()) {
      blockers.push('ElevenLabs is not configured.');
    }

    try {
      await this.tenantResolver.resolveAgentRef(params.organizationId, params.deploymentId);
    } catch {
      blockers.push('Agent deployment is not provisioned for organization.');
    }

    try {
      await this.tenantResolver.resolvePhoneRef(params.organizationId, params.phoneNumberId);
    } catch {
      blockers.push('Phone number is not provisioned for organization.');
    }

    if (!params.toE164?.trim()) {
      blockers.push('Destination number is required.');
    }

    return {
      organizationId: params.organizationId,
      deploymentId: params.deploymentId,
      phoneNumberId: params.phoneNumberId,
      maskedToE164: maskExternalId(params.toE164, 'e164') ?? '***',
      ready: blockers.length === 0,
      blockers,
    };
  }

  async startOutboundCall(params: {
    organizationId: string;
    deploymentId: string;
    phoneNumberId: string;
    toE164: string;
  }): Promise<MaskedOutboundCallView> {
    const preparation = await this.prepareOutboundCall(params);
    if (!preparation.ready) {
      throw new ElevenLabsInvalidConfigurationError(preparation.blockers.join(' '));
    }

    const [tenantAgent, tenantPhone] = await Promise.all([
      this.tenantResolver.resolveAgentRef(params.organizationId, params.deploymentId),
      this.tenantResolver.resolvePhoneRef(params.organizationId, params.phoneNumberId),
    ]);

    const raw = await this.http.requestJson<{
      conversation_id?: string;
      call_sid?: string;
      status?: string;
    }>('/convai/twilio/outbound-call', {
      method: 'POST',
      body: JSON.stringify({
        agent_id: tenantAgent.externalAgentId,
        agent_phone_number_id: tenantPhone.externalPhoneId,
        to_number: params.toE164,
      }),
    });

    return {
      maskedConversationRef: maskExternalId(raw.conversation_id, 'conv'),
      maskedCallRef: maskExternalId(raw.call_sid, 'call'),
      status: raw.status ?? 'started',
    };
  }

  async getConversation(params: {
    organizationId: string;
    deploymentId: string;
    conversationId: string;
  }): Promise<MaskedElevenLabsConversationView> {
    const tenant = await this.tenantResolver.resolveAgentRef(
      params.organizationId,
      params.deploymentId,
    );

    const raw = await this.http.requestJson<RawConversationResponse>(
      `/convai/conversations/${encodeURIComponent(params.conversationId)}`,
    );

    if (raw.agent_id !== tenant.externalAgentId) {
      throw new ElevenLabsResourceNotFoundError(
        'Conversation does not belong to the requested agent deployment.',
      );
    }

    return {
      maskedConversationRef: maskExternalId(raw.conversation_id, 'conv') ?? 'conv_***',
      maskedAgentRef: tenant.maskedExternalRef,
      status: raw.status,
      startedAt: raw.start_time_unix_secs
        ? new Date(raw.start_time_unix_secs * 1000).toISOString()
        : null,
      endedAt: raw.end_time_unix_secs
        ? new Date(raw.end_time_unix_secs * 1000).toISOString()
        : null,
      hasTranscript: Boolean(raw.transcript),
    };
  }

  async getPostCallConfiguration(params: {
    organizationId: string;
    deploymentId: string;
  }): Promise<MaskedPostCallConfigView> {
    const agent = await this.getRawAgentForDeployment(params.organizationId, params.deploymentId);
    const platformSettings = agent.platform_settings ?? {};
    const webhook = platformSettings.webhook as Record<string, unknown> | undefined;
    const postCall = platformSettings.post_call as Record<string, unknown> | undefined;

    return {
      deploymentId: params.deploymentId,
      webhookConfigured: Boolean(webhook?.url),
      sendAudio: typeof postCall?.send_audio === 'boolean' ? postCall.send_audio : undefined,
      analysisEnabled:
        typeof postCall?.analysis_enabled === 'boolean' ? postCall.analysis_enabled : undefined,
    };
  }

  async updatePostCallConfiguration(
    params: {
      organizationId: string;
      deploymentId: string;
    } & PostCallConfigurationInput,
  ): Promise<MaskedPostCallConfigView> {
    const tenant = await this.tenantResolver.resolveAgentRef(
      params.organizationId,
      params.deploymentId,
    );

    const platformSettings: Record<string, unknown> = {};
    if (params.webhookUrl !== undefined) {
      platformSettings.webhook = { url: params.webhookUrl };
    }
    if (params.sendAudio !== undefined || params.analysisEnabled !== undefined) {
      platformSettings.post_call = {
        ...(params.sendAudio !== undefined ? { send_audio: params.sendAudio } : {}),
        ...(params.analysisEnabled !== undefined
          ? { analysis_enabled: params.analysisEnabled }
          : {}),
      };
    }

    await this.http.requestJson(
      `/convai/agents/${encodeURIComponent(tenant.externalAgentId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ platform_settings: platformSettings }),
      },
    );

    return this.getPostCallConfiguration(params);
  }

  async getToolsConfiguration(params: {
    organizationId: string;
    deploymentId: string;
  }): Promise<MaskedToolsConfigView> {
    const agent = await this.getRawAgentForDeployment(params.organizationId, params.deploymentId);
    const tools = agent.conversation_config?.agent?.tools ?? [];
    const mcpServerIds = agent.conversation_config?.agent?.mcp_server_ids ?? [];

    return {
      deploymentId: params.deploymentId,
      mcpConfigured: mcpServerIds.length > 0,
      toolCount: tools.length,
    };
  }

  async updateToolsConfiguration(
    params: {
      organizationId: string;
      deploymentId: string;
    } & ToolsConfigurationInput,
  ): Promise<MaskedToolsConfigView> {
    const tenant = await this.tenantResolver.resolveAgentRef(
      params.organizationId,
      params.deploymentId,
    );

    const conversationConfig: Record<string, unknown> = {
      agent: {
        ...(params.toolIds ? { tools: params.toolIds.map((id) => ({ id })) } : {}),
        ...(params.mcpServerUrl
          ? { mcp_server_ids: [params.mcpServerUrl] }
          : params.mcpServerUrl === null
            ? { mcp_server_ids: [] }
            : {}),
      },
    };

    await this.http.requestJson(
      `/convai/agents/${encodeURIComponent(tenant.externalAgentId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ conversation_config: conversationConfig }),
      },
    );

    return this.getToolsConfiguration(params);
  }

  private async getRawAgentForDeployment(
    organizationId: string,
    deploymentId: string,
  ): Promise<RawAgentResponse> {
    const tenant = await this.tenantResolver.resolveAgentRef(organizationId, deploymentId);
    return this.http.requestJson<RawAgentResponse>(
      `/convai/agents/${encodeURIComponent(tenant.externalAgentId)}`,
    );
  }

  private buildAgentBody(
    input: Partial<
      Pick<CreateAgentInput, 'name' | 'systemPrompt' | 'greetingMessage' | 'voiceId' | 'language'>
    >,
  ): Record<string, unknown> {
    const name = input.name ?? 'SynqDrive Agent';
    return {
      conversation_config: {
        agent: {
          ...(input.systemPrompt ? { prompt: { prompt: input.systemPrompt } } : {}),
          ...(input.greetingMessage || input.name
            ? {
                first_message:
                  input.greetingMessage || `Hello, this is ${name}. How can I help you?`,
              }
            : {}),
          ...(input.language ? { language: input.language } : {}),
        },
        ...(input.voiceId ? { tts: { voice_id: input.voiceId } } : {}),
      },
      ...(input.name ? { name: input.name } : {}),
      platform_settings: {},
    };
  }

  private toMaskedAgentView(
    deploymentId: string,
    maskedAgentRef: string | null,
    raw: RawAgentResponse,
  ): MaskedElevenLabsAgentView {
    return {
      deploymentId,
      maskedAgentRef,
      name: raw.name,
      status: raw.status,
    };
  }

  private toMaskedPhoneView(
    organizationId: string,
    raw: RawPhoneNumberResponse,
    phoneNumberId?: string,
  ): MaskedElevenLabsPhoneNumberView {
    return {
      phoneNumberId: phoneNumberId ?? `${organizationId}:masked`,
      maskedPhoneRef: maskExternalId(raw.phone_number_id, 'phone'),
      maskedE164: raw.phone_number ? maskExternalId(raw.phone_number, 'e164') : null,
      maskedAssignedAgentRef: raw.agent_id ? maskExternalId(raw.agent_id, 'agent') : null,
    };
  }

  private assertRegionConfiguration(): void {
    const requiredRegion = this.http.getRequiredRegion();
    if (!requiredRegion) {
      return;
    }

    const baseUrl = this.http.getBaseUrl().toLowerCase();
    const regionToken = requiredRegion.toLowerCase();
    if (!baseUrl.includes(regionToken) && !baseUrl.includes('residency')) {
      throw new ElevenLabsRegionMismatchError(
        `ElevenLabs base URL does not match configured region ${requiredRegion}.`,
      );
    }
  }
}
