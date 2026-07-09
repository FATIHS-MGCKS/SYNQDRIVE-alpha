import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ResendApiErrorBody,
  ResendDomainResponse,
  ResendSendRequest,
  ResendSendResponse,
} from './resend-api.types';

export class ResendApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly body?: ResendApiErrorBody,
  ) {
    super(message);
    this.name = 'ResendApiError';
  }
}

@Injectable()
export class ResendApiClient {
  private readonly logger = new Logger(ResendApiClient.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('email.resendApiKey', '') ?? '';
    this.baseUrl =
      this.config.get<string>('email.resendApiBaseUrl', 'https://api.resend.com') ??
      'https://api.resend.com';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey.trim());
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    if (!this.isConfigured()) {
      throw new ResendApiError('Resend API key is not configured', 401);
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { message: text };
      }
    }

    if (!res.ok) {
      const errBody = (parsed ?? {}) as ResendApiErrorBody;
      const message = errBody.message || `Resend API ${method} ${path} failed (${res.status})`;
      this.logger.warn(
        JSON.stringify({
          event: 'resend_api_error',
          method,
          path,
          status: res.status,
          message: errBody.message,
          name: errBody.name,
        }),
      );
      throw new ResendApiError(message, res.status, errBody);
    }

    return parsed as T;
  }

  async createDomain(name: string): Promise<ResendDomainResponse> {
    return this.request<ResendDomainResponse>('POST', '/domains', { name });
  }

  async getDomain(domainId: string): Promise<ResendDomainResponse> {
    return this.request<ResendDomainResponse>('GET', `/domains/${domainId}`);
  }

  async verifyDomain(domainId: string): Promise<{ id: string }> {
    return this.request<{ id: string }>('POST', `/domains/${domainId}/verify`, {});
  }

  async sendEmail(payload: ResendSendRequest): Promise<ResendSendResponse> {
    return this.request<ResendSendResponse>('POST', '/emails', payload);
  }
}
