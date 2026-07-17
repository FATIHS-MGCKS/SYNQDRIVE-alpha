import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { VoiceMcpProtocolService } from './voice-mcp-protocol.service';
import { VoiceMcpTokenService } from './voice-mcp-token.service';
import { isVoiceMcpError } from './voice-mcp-errors';
import { isVoiceMcpGatewayEnabled } from './voice-mcp-gateway.config';
import {
  VOICE_MCP_CORRELATION_ID_HEADER,
  VOICE_MCP_REQUEST_ID_HEADER,
} from './voice-mcp-gateway.constants';

@Controller('mcp/voice')
export class VoiceMcpGatewayController {
  constructor(
    private readonly protocolService: VoiceMcpProtocolService,
    private readonly tokenService: VoiceMcpTokenService,
  ) {}

  @Post(':orgId')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 240 } })
  async handleMcpRequest(
    @Param('orgId') orgId: string,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() request: Request,
  ) {
    if (!isVoiceMcpGatewayEnabled()) {
      return {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32004,
          message: 'The SynqDrive voice MCP gateway is not enabled.',
        },
      };
    }

    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing MCP bearer token.');
    }

    const { requestId, correlationId } = this.protocolService.resolveRequestIds(headers);

    try {
      const claims = await this.tokenService.verify(token, orgId);
      const response = await this.protocolService.handle(
        {
          ...claims,
          requestId,
          correlationId,
          callerPhoneE164: this.readOptionalHeader(headers, 'x-caller-phone'),
        },
        body,
      );
      return response;
    } catch (error) {
      if (isVoiceMcpError(error)) {
        return {
          jsonrpc: '2.0',
          id: this.extractRequestId(body),
          error: {
            code: -32001,
            message: error.message,
            data: { code: error.code, ...(error.details ?? {}) },
          },
        };
      }
      throw error;
    }
  }

  private extractBearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return null;
    }
    return header.slice('Bearer '.length).trim() || null;
  }

  private readOptionalHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string | null {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }
    return value ?? null;
  }

  private extractRequestId(body: unknown): string | number | null {
    if (!body || typeof body !== 'object') {
      return null;
    }
    if (Array.isArray(body)) {
      const first = body[0];
      return first && typeof first === 'object' && 'id' in first
        ? ((first as { id?: string | number | null }).id ?? null)
        : null;
    }
    return 'id' in body ? ((body as { id?: string | number | null }).id ?? null) : null;
  }
}

export const VOICE_MCP_PUBLIC_HEADERS = [VOICE_MCP_REQUEST_ID_HEADER, VOICE_MCP_CORRELATION_ID_HEADER];
