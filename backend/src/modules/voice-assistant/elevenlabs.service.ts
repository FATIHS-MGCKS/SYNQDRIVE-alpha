import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
  labels?: Record<string, string>;
  preview_url?: string;
}

interface ElevenLabsAgent {
  agent_id: string;
  name?: string;
}

interface ElevenLabsConversation {
  conversation_id: string;
  agent_id: string;
  status: string;
  start_time_unix_secs?: number;
  end_time_unix_secs?: number;
  transcript?: string;
  metadata?: Record<string, any>;
}

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

  private headers(): Record<string, string> {
    return {
      'xi-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };
  }

  async listVoices(): Promise<ElevenLabsVoice[]> {
    if (!this.apiKey) return [];
    try {
      const res = await fetch(`${this.baseUrl}/voices`, { headers: this.headers() });
      if (!res.ok) { this.logger.warn(`listVoices failed: ${res.status}`); return []; }
      const data = await res.json();
      return (data.voices ?? []).map((v: any) => ({
        voice_id: v.voice_id,
        name: v.name,
        category: v.category,
        labels: v.labels,
        preview_url: v.preview_url,
      }));
    } catch (err: any) {
      this.logger.error(`listVoices error: ${err.message}`);
      return [];
    }
  }

  async createAgent(params: {
    name: string;
    systemPrompt: string;
    greetingMessage?: string;
    voiceId?: string;
    language?: string;
  }): Promise<{ agentId: string } | null> {
    if (!this.apiKey) return null;
    try {
      const body: any = {
        conversation_config: {
          agent: {
            prompt: {
              prompt: params.systemPrompt,
            },
            first_message: params.greetingMessage || `Hello, this is ${params.name}. How can I help you?`,
            language: params.language || 'en',
          },
          tts: params.voiceId ? { voice_id: params.voiceId } : undefined,
        },
        name: params.name,
        platform_settings: {},
      };

      const res = await fetch(`${this.baseUrl}/convai/agents/create`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        this.logger.warn(`createAgent failed: ${res.status} ${text}`);
        return null;
      }
      const data = await res.json();
      return { agentId: data.agent_id };
    } catch (err: any) {
      this.logger.error(`createAgent error: ${err.message}`);
      return null;
    }
  }

  async updateAgent(agentId: string, params: {
    name?: string;
    systemPrompt?: string;
    greetingMessage?: string;
    voiceId?: string;
    language?: string;
  }): Promise<boolean> {
    if (!this.apiKey || !agentId) return false;
    try {
      const body: any = {
        conversation_config: {
          agent: {
            prompt: params.systemPrompt ? { prompt: params.systemPrompt } : undefined,
            first_message: params.greetingMessage,
            language: params.language,
          },
          tts: params.voiceId ? { voice_id: params.voiceId } : undefined,
        },
        name: params.name,
      };

      const res = await fetch(`${this.baseUrl}/convai/agents/${agentId}`, {
        method: 'PATCH',
        headers: this.headers(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        this.logger.warn(`updateAgent failed: ${res.status}`);
        return false;
      }
      return true;
    } catch (err: any) {
      this.logger.error(`updateAgent error: ${err.message}`);
      return false;
    }
  }

  async deleteAgent(agentId: string): Promise<boolean> {
    if (!this.apiKey || !agentId) return false;
    try {
      const res = await fetch(`${this.baseUrl}/convai/agents/${agentId}`, {
        method: 'DELETE',
        headers: this.headers(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async getAgent(agentId: string): Promise<ElevenLabsAgent | null> {
    if (!this.apiKey || !agentId) return null;
    try {
      const res = await fetch(`${this.baseUrl}/convai/agents/${agentId}`, {
        headers: this.headers(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async listConversations(agentId: string): Promise<ElevenLabsConversation[]> {
    if (!this.apiKey || !agentId) return [];
    try {
      const res = await fetch(`${this.baseUrl}/convai/conversations?agent_id=${agentId}`, {
        headers: this.headers(),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.conversations ?? [];
    } catch {
      return [];
    }
  }

  async getConversation(conversationId: string): Promise<ElevenLabsConversation | null> {
    if (!this.apiKey || !conversationId) return null;
    try {
      const res = await fetch(`${this.baseUrl}/convai/conversations/${conversationId}`, {
        headers: this.headers(),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async getSignedUrl(agentId: string): Promise<string | null> {
    if (!this.apiKey || !agentId) return null;
    try {
      const res = await fetch(`${this.baseUrl}/convai/conversation/get_signed_url?agent_id=${agentId}`, {
        headers: this.headers(),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.signed_url ?? null;
    } catch {
      return null;
    }
  }

  async getPhoneNumbers(): Promise<any[]> {
    if (!this.apiKey) return [];
    try {
      const res = await fetch(`${this.baseUrl}/convai/phone-numbers`, {
        headers: this.headers(),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return data.phone_numbers ?? data ?? [];
    } catch {
      return [];
    }
  }

  async assignPhoneToAgent(agentId: string, phoneNumberId: string): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      const res = await fetch(`${this.baseUrl}/convai/phone-numbers/${phoneNumberId}/agent`, {
        method: 'PATCH',
        headers: this.headers(),
        body: JSON.stringify({ agent_id: agentId }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
