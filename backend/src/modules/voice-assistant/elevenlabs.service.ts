import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  BadGatewayException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  preview_url?: string;
}

export interface ElevenLabsAgent {
  agent_id: string;
  name?: string;
}

export interface ElevenLabsConversation {
  conversation_id: string;
  agent_id: string;
  status: string;
  start_time_unix_secs?: number;
  end_time_unix_secs?: number;
  transcript?: string | unknown;
  metadata?: Record<string, unknown>;
}

export interface ElevenLabsPhoneNumber {
  phone_number_id: string;
  phone_number?: string;
  agent_id?: string | null;
}

const REQUEST_TIMEOUT_MS = 30_000;

@Injectable()
export class ElevenLabsService {
  private readonly logger = new Logger(ElevenLabsService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.elevenlabs.io/v1';

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('ELEVENLABS_API_KEY', '');
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  getConnectionStatus(): 'NOT_CONFIGURED' | 'CONNECTED' | 'DEGRADED' {
    return this.isConfigured() ? 'CONNECTED' : 'NOT_CONFIGURED';
  }

  private headers(): Record<string, string> {
    return {
      'xi-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  private ensureConfigured(): void {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'ElevenLabs is not configured. Set ELEVENLABS_API_KEY on the server.',
      );
    }
  }

  private async request<T>(
    path: string,
    init?: RequestInit,
    options?: { allowDegraded?: boolean },
  ): Promise<T> {
    this.ensureConfigured();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...this.headers(), ...(init?.headers ?? {}) },
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(`ElevenLabs ${init?.method ?? 'GET'} ${path} failed: ${res.status}`);
        throw new BadGatewayException(
          `ElevenLabs API error (${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`,
        );
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (err: unknown) {
      if (err instanceof BadGatewayException || err instanceof ServiceUnavailableException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Unknown ElevenLabs error';
      this.logger.error(`ElevenLabs request error on ${path}: ${message}`);
      if (options?.allowDegraded) {
        throw new ServiceUnavailableException(`ElevenLabs unavailable: ${message}`);
      }
      throw new BadGatewayException(`ElevenLabs request failed: ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  async listVoices(): Promise<ElevenLabsVoice[]> {
    if (!this.isConfigured()) return [];
    try {
      const data = await this.request<{ voices?: unknown[] }>('/voices');
      return (data.voices ?? []).map((v: Record<string, unknown>) => ({
        voice_id: String(v.voice_id),
        name: String(v.name),
        category: v.category ? String(v.category) : undefined,
        labels: v.labels as Record<string, string> | undefined,
        preview_url: v.preview_url ? String(v.preview_url) : undefined,
      }));
    } catch (err: unknown) {
      if (err instanceof ServiceUnavailableException) return [];
      throw err;
    }
  }

  async createOrUpdateAgent(
    agentId: string | null,
    params: {
      name: string;
      systemPrompt: string;
      greetingMessage?: string;
      voiceId?: string;
      language?: string;
    },
  ): Promise<{ agentId: string }> {
    const body = {
      conversation_config: {
        agent: {
          prompt: { prompt: params.systemPrompt },
          first_message:
            params.greetingMessage || `Hello, this is ${params.name}. How can I help you?`,
          language: params.language || 'en',
        },
        tts: params.voiceId ? { voice_id: params.voiceId } : undefined,
      },
      name: params.name,
      platform_settings: {},
    };

    if (agentId) {
      await this.request(`/convai/agents/${agentId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      return { agentId };
    }

    const data = await this.request<{ agent_id: string }>('/convai/agents/create', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return { agentId: data.agent_id };
  }

  async getAgent(agentId: string): Promise<ElevenLabsAgent | null> {
    if (!this.isConfigured() || !agentId) return null;
    try {
      return await this.request<ElevenLabsAgent>(`/convai/agents/${agentId}`);
    } catch {
      return null;
    }
  }

  async listConversations(agentId: string): Promise<ElevenLabsConversation[]> {
    if (!this.isConfigured() || !agentId) return [];
    const data = await this.request<{ conversations?: ElevenLabsConversation[] }>(
      `/convai/conversations?agent_id=${encodeURIComponent(agentId)}`,
    );
    return data.conversations ?? [];
  }

  async getConversation(conversationId: string): Promise<ElevenLabsConversation | null> {
    if (!this.isConfigured() || !conversationId) return null;
    try {
      return await this.request<ElevenLabsConversation>(
        `/convai/conversations/${encodeURIComponent(conversationId)}`,
      );
    } catch {
      return null;
    }
  }

  async getSignedTestUrl(
    agentId: string,
  ): Promise<{ signedUrl: string; expiresAt: string | null }> {
    const data = await this.request<{
      signed_url?: string;
      expires_at?: string;
      expiration_time_unix_secs?: number;
    }>(`/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(agentId)}`);
    if (!data.signed_url) {
      throw new BadGatewayException('ElevenLabs did not return a signed test URL');
    }
    let expiresAt: string | null = null;
    if (data.expires_at) {
      expiresAt = data.expires_at;
    } else if (data.expiration_time_unix_secs) {
      expiresAt = new Date(data.expiration_time_unix_secs * 1000).toISOString();
    }
    return { signedUrl: data.signed_url, expiresAt };
  }

  async listPhoneNumbers(): Promise<ElevenLabsPhoneNumber[]> {
    if (!this.isConfigured()) return [];
    try {
      const data = await this.request<{ phone_numbers?: ElevenLabsPhoneNumber[] } | ElevenLabsPhoneNumber[]>(
        '/convai/phone-numbers',
      );
      if (Array.isArray(data)) return data;
      return data.phone_numbers ?? [];
    } catch (err: unknown) {
      if (err instanceof ServiceUnavailableException) return [];
      throw err;
    }
  }

  async assignPhoneNumberToAgent(agentId: string, phoneNumberId: string): Promise<void> {
    await this.request(`/convai/phone-numbers/${encodeURIComponent(phoneNumberId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ agent_id: agentId }),
    });
  }

  async unassignPhoneNumberFromAgent(phoneNumberId: string): Promise<void> {
    await this.request(`/convai/phone-numbers/${encodeURIComponent(phoneNumberId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ agent_id: null }),
    });
  }
}
