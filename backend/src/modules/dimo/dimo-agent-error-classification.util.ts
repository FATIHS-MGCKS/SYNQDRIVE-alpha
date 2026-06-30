import { sanitizeDimoAgentError, sanitizeDimoAgentErrorMessage } from './dimo-agent-error-sanitize.util';

export type DimoAgentErrorKind =
  | 'DNS_ERROR'
  | 'NETWORK_ERROR'
  | 'DIMO_HTTP_ERROR'
  | 'PARSER_ERROR'
  | 'CONFIG_ERROR';

export interface DimoAgentClassifiedError {
  kind: DimoAgentErrorKind;
  errorCode?: string;
  message: string;
  userMessage: string;
  failedBeforeHttp: boolean;
  statusCode?: number;
}

export interface ClassifyDimoAgentErrorInput {
  err?: unknown;
  errorMessage?: string;
  statusCode?: number;
  configFailure?: boolean;
  parserFailure?: boolean;
  hostname?: string;
}

const DNS_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN']);
const NETWORK_CODES = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH']);

export function extractNodeErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const code = (err as { code?: unknown }).code;
  if (typeof code === 'string' && code.trim()) return code.trim();
  const message = err instanceof Error ? err.message : String(err);
  const fromMessage = message.match(/\b(ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|ECONNRESET|EHOSTUNREACH|ENETUNREACH)\b/);
  return fromMessage?.[1];
}

export function classifyDimoAgentError(input: ClassifyDimoAgentErrorInput): DimoAgentClassifiedError {
  const rawMessage = sanitizeDimoAgentErrorMessage(
    input.errorMessage ?? (input.err != null ? sanitizeDimoAgentError(input.err) : 'Unknown error'),
  );
  const errorCode = extractNodeErrorCode(input.err) ?? extractNodeErrorCode({ message: rawMessage });
  const hostname = input.hostname?.trim() || 'agents.dimo.zone';

  if (input.configFailure) {
    return {
      kind: 'CONFIG_ERROR',
      errorCode,
      message: rawMessage,
      userMessage: rawMessage || 'DIMO Agent API is not configured.',
      failedBeforeHttp: true,
    };
  }

  if (input.parserFailure) {
    return {
      kind: 'PARSER_ERROR',
      errorCode,
      message: rawMessage,
      userMessage: rawMessage,
      failedBeforeHttp: false,
      statusCode: input.statusCode,
    };
  }

  if (typeof input.statusCode === 'number' && input.statusCode >= 400) {
    return {
      kind: 'DIMO_HTTP_ERROR',
      errorCode: errorCode ?? `HTTP_${input.statusCode}`,
      message: rawMessage || `HTTP ${input.statusCode}`,
      userMessage: `DIMO Agents returned an error (HTTP ${input.statusCode}). Please try again later.`,
      failedBeforeHttp: false,
      statusCode: input.statusCode,
    };
  }

  if (errorCode && DNS_CODES.has(errorCode)) {
    return {
      kind: 'DNS_ERROR',
      errorCode,
      message: rawMessage,
      userMessage: `DIMO Agents host could not be resolved from this runtime (${hostname}). Check Docker/VPS DNS or network access.`,
      failedBeforeHttp: true,
    };
  }

  if (errorCode && NETWORK_CODES.has(errorCode)) {
    return {
      kind: 'NETWORK_ERROR',
      errorCode,
      message: rawMessage,
      userMessage: `Could not reach DIMO Agents (${hostname}). Connection refused or timed out — check network access from this server.`,
      failedBeforeHttp: true,
    };
  }

  if (/getaddrinfo\s+ENOTFOUND/i.test(rawMessage) || /ENOTFOUND\s+agents\./i.test(rawMessage)) {
    return {
      kind: 'DNS_ERROR',
      errorCode: errorCode ?? 'ENOTFOUND',
      message: rawMessage,
      userMessage: `DIMO Agents host could not be resolved from this runtime (${hostname}). Check Docker/VPS DNS or network access.`,
      failedBeforeHttp: true,
    };
  }

  if (/ECONNREFUSED|ETIMEDOUT|ECONNRESET/i.test(rawMessage)) {
    return {
      kind: 'NETWORK_ERROR',
      errorCode: errorCode ?? 'NETWORK',
      message: rawMessage,
      userMessage: `Could not reach DIMO Agents (${hostname}). Connection refused or timed out — check network access from this server.`,
      failedBeforeHttp: true,
    };
  }

  return {
    kind: 'NETWORK_ERROR',
    errorCode,
    message: rawMessage,
    userMessage: rawMessage || 'DIMO Agents request failed. Please try again later.',
    failedBeforeHttp: true,
  };
}

export interface DimoAgentErrorResultShape {
  success: false;
  error?: string;
  errorKind?: DimoAgentErrorKind;
  errorCode?: string;
  failedBeforeHttp?: boolean;
  statusCode?: number;
  configFailure?: boolean;
}

export function applyDimoAgentClassifiedError<T extends DimoAgentErrorResultShape>(
  result: T,
  classified: DimoAgentClassifiedError,
): T {
  return {
    ...result,
    error: classified.userMessage,
    errorKind: classified.kind,
    errorCode: classified.errorCode,
    failedBeforeHttp: classified.failedBeforeHttp,
    statusCode: classified.statusCode ?? result.statusCode,
  };
}

export function formatDimoAgentChatError(result: {
  error?: string;
  errorKind?: DimoAgentErrorKind;
}): string {
  const detail = result.error || 'Please try again later.';
  if (result.errorKind === 'DNS_ERROR') {
    return `I'm sorry, the AI assistant cannot reach DIMO Agents right now. ${detail}`;
  }
  if (result.errorKind === 'NETWORK_ERROR') {
    return `I'm sorry, the AI assistant could not connect to DIMO Agents. ${detail}`;
  }
  if (result.errorKind === 'CONFIG_ERROR') {
    return `I'm sorry, the AI assistant is not configured on this server. ${detail}`;
  }
  return `I'm sorry, I couldn't process your request right now. ${detail}`;
}
