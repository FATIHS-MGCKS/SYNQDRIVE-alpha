import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  DiditCreateSessionRequest,
  DiditCreateSessionResponse,
} from './didit.types';

@Injectable()
export class DiditClient {
  private readonly logger = new Logger(DiditClient.name);

  constructor(private readonly configService: ConfigService) {}

  async createSession(
    body: DiditCreateSessionRequest,
  ): Promise<DiditCreateSessionResponse> {
    const apiKey = this.configService.get<string>('didit.apiKey', '');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Didit integration is not configured (missing API key)',
      );
    }

    const baseUrl = this.configService
      .get<string>('didit.baseUrl', 'https://verification.didit.me')
      .replace(/\/$/, '');

    const url = `${baseUrl}/v3/session/`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      this.logger.error(
        `Didit session request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadGatewayException('Failed to reach Didit verification API');
    }

    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      this.logger.error(
        `Didit returned non-JSON response (HTTP ${response.status}): ${text.slice(0, 500)}`,
      );
      throw new BadGatewayException('Invalid response from Didit verification API');
    }

    if (!response.ok) {
      this.logger.warn(
        `Didit session creation failed (HTTP ${response.status}): ${text.slice(0, 500)}`,
      );
      throw new BadGatewayException('Didit session creation failed');
    }

    const data = payload as Partial<DiditCreateSessionResponse>;
    if (!data.session_id || !data.url || !data.workflow_id) {
      this.logger.error(
        `Didit session response missing required fields: ${text.slice(0, 500)}`,
      );
      throw new BadGatewayException('Incomplete response from Didit verification API');
    }

    return data as DiditCreateSessionResponse;
  }
}
