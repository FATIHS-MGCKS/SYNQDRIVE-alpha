import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { resolveVoiceMcpToolTimeoutMs } from './voice-mcp-gateway.config';
import {
  VOICE_MCP_CORRELATION_ID_HEADER,
  VOICE_MCP_PROTOCOL_VERSION,
  VOICE_MCP_REQUEST_ID_HEADER,
  VOICE_MCP_SERVER_NAME,
  VOICE_MCP_SERVER_VERSION,
  type VoiceMcpReadOnlyToolName,
} from './voice-mcp-gateway.constants';
import { VoiceMcpError, isVoiceMcpError, toMcpToolErrorPayload } from './voice-mcp-errors';
import type { VoiceMcpRequestContext } from './voice-mcp-context.types';
import { VOICE_MCP_TOOL_REGISTRY } from './voice-mcp-tools.registry';
import {
  VoiceMcpAuditService,
  VoiceMcpGatewayMiddlewareService,
  VoiceMcpToolsService,
} from './voice-mcp-tools.service';
import { VoiceMcpNonceStore } from './voice-mcp-nonce.store';
import { VoiceMcpRateLimitService } from './voice-mcp-rate-limit.service';

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: Record<string, unknown>;
  };
};

@Injectable()
export class VoiceMcpProtocolService {
  constructor(
    private readonly middleware: VoiceMcpGatewayMiddlewareService,
    private readonly toolsService: VoiceMcpToolsService,
    private readonly auditService: VoiceMcpAuditService,
    private readonly nonceStore: VoiceMcpNonceStore,
    private readonly rateLimitService: VoiceMcpRateLimitService,
  ) {}

  resolveRequestIds(headers: Record<string, string | string[] | undefined>): {
    requestId: string;
    correlationId: string;
  } {
    const requestId = this.readHeader(headers, VOICE_MCP_REQUEST_ID_HEADER) ?? randomUUID();
    const correlationId =
      this.readHeader(headers, VOICE_MCP_CORRELATION_ID_HEADER) ?? requestId;
    return { requestId, correlationId };
  }

  async handle(
    context: VoiceMcpRequestContext,
    body: unknown,
  ): Promise<JsonRpcResponse | JsonRpcResponse[]> {
    await this.middleware.assertGatewayReady(context.organizationId);
    await this.rateLimitService.assertWithinLimit(context.organizationId);

    const requestIdFresh = await this.nonceStore.assertFreshRequestId(context.requestId);
    if (!requestIdFresh) {
      throw new VoiceMcpError('RateLimited', 'Duplicate MCP request detected.');
    }

    await this.middleware.assertTenantBindings(context);

    if (Array.isArray(body)) {
      const responses = await Promise.all(
        body.map((entry) => this.dispatch(context, entry as JsonRpcRequest)),
      );
      return responses.filter((response): response is JsonRpcResponse => response !== null);
    }

    const single = await this.dispatch(context, body as JsonRpcRequest);
    return single ?? { jsonrpc: '2.0', id: null, result: {} };
  }

  private async dispatch(
    context: VoiceMcpRequestContext,
    request: JsonRpcRequest,
  ): Promise<JsonRpcResponse | null> {
    const id = request.id ?? null;
    if (request.method === 'notifications/initialized') {
      return null;
    }

    try {
      const result = await this.routeMethod(context, request);
      return { jsonrpc: '2.0', id, result };
    } catch (error) {
      if (isVoiceMcpError(error)) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: this.mapErrorCode(error.code),
            message: error.message,
            data: {
              code: error.code,
              ...(error.details ?? {}),
            },
          },
        };
      }
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: 'The MCP gateway could not complete the request.',
        },
      };
    }
  }

  private async routeMethod(context: VoiceMcpRequestContext, request: JsonRpcRequest): Promise<unknown> {
    switch (request.method) {
      case 'initialize':
        return {
          protocolVersion: VOICE_MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: {
            name: VOICE_MCP_SERVER_NAME,
            version: VOICE_MCP_SERVER_VERSION,
          },
        };
      case 'tools/list':
        return {
          tools: VOICE_MCP_TOOL_REGISTRY.filter((tool) => context.allowedTools.includes(tool.name)).map(
            (tool) => ({
              name: tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
            }),
          ),
        };
      case 'tools/call':
        return this.handleToolCall(context, request.params ?? {});
      case 'ping':
        return {};
      default:
        throw new VoiceMcpError('DataUnavailable', `Unsupported MCP method: ${request.method ?? 'unknown'}`);
    }
  }

  private async handleToolCall(
    context: VoiceMcpRequestContext,
    params: Record<string, unknown>,
  ): Promise<{ content: Array<{ type: 'text'; text: string }>; isError: boolean }> {
    const name = String(params.name ?? '') as VoiceMcpReadOnlyToolName;
    const args =
      params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments)
        ? (params.arguments as Record<string, unknown>)
        : {};

    await this.middleware.assertToolAllowed(context, name);

    try {
      const result = await this.withTimeout(this.toolsService.execute(context, { name, arguments: args }));
      await this.auditService.recordToolInvocation(context, name, args, 'SUCCEEDED');
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        isError: false,
      };
    } catch (error) {
      await this.auditService.recordToolInvocation(context, name, args, 'FAILED');
      const payload = toMcpToolErrorPayload(error);
      return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        isError: true,
      };
    }
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    const timeoutMs = resolveVoiceMcpToolTimeoutMs();
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => {
            reject(new VoiceMcpError('Timeout', 'The tool execution timed out.'));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private mapErrorCode(code: string): number {
    switch (code) {
      case 'InvalidToken':
      case 'TenantMismatch':
      case 'PermissionDenied':
      case 'ToolNotAllowed':
        return -32001;
      case 'RateLimited':
        return -32002;
      case 'Timeout':
        return -32003;
      default:
        return -32000;
    }
  }

  private readHeader(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string | undefined {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }
}
